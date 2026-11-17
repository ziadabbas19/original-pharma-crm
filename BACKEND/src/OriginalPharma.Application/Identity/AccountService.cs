using System.Security.Cryptography;
using System.Text.Json;
using FluentValidation;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Images;
using OriginalPharma.Application.Common.Scoping;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Application.Identity;

public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);

/// <param name="NewPassword">Temporary password to set; leave empty to have one generated.</param>
public sealed record ResetPasswordRequest(string? NewPassword = null);

/// <summary>Returned once; the server keeps only the hash.</summary>
public sealed record TemporaryPasswordDto(string TemporaryPassword);

public sealed record AvatarDto(string? AvatarUrl, string? AvatarThumbnailUrl);

public sealed record UserAuditEntryDto(Guid Id, UserAuditAction Action, string ActorName, JsonElement Details, DateTimeOffset CreatedAt);

public static class AccountErrorCodes
{
    public const string CurrentPasswordIncorrect = "current_password_incorrect";
    public const string PasswordUnchanged = "password_unchanged";

    /// <summary>The new password breaks the password policy; <c>errors</c> lists the policy codes.</summary>
    public const string PasswordPolicy = "password_policy";
}

/// <summary>
/// Self-service account actions (own password, own profile picture) and password resets by
/// someone higher in the hierarchy. Every password event is written to the user audit trail.
/// </summary>
public sealed class AccountService(
    IAppDbContext db,
    UserManager<User> userManager,
    ICurrentUser currentUser,
    HierarchyGuard guard,
    IDataScopeResolver scopeResolver,
    ImageService images,
    TimeProvider time)
{
    /// <summary>
    /// Changes the caller's password (current password required, password policy applies), clears
    /// <see cref="User.MustChangePassword"/> and signs out every other session.
    /// </summary>
    public async Task ChangePasswordAsync(ChangePasswordRequest request, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var user = await userManager.FindByIdAsync(me.ToString()) ?? throw new NotFoundException("User", me);

        if (!await userManager.CheckPasswordAsync(user, request.CurrentPassword))
        {
            // Counts toward the login lockout, so the form cannot be used to guess the password.
            await userManager.AccessFailedAsync(user);
            throw new BusinessRuleException(AccountErrorCodes.CurrentPasswordIncorrect, "The current password is incorrect.");
        }

        if (request.CurrentPassword == request.NewPassword)
        {
            throw new BusinessRuleException(AccountErrorCodes.PasswordUnchanged, "Choose a password different from the current one.");
        }

        var result = await userManager.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword);
        ThrowIfFailed(result);

        user.MustChangePassword = false;
        await userManager.ResetAccessFailedCountAsync(user);
        await userManager.UpdateAsync(user);

        var revoked = await RevokeSessionsAsync(me, currentUser.SessionId, "password-changed", cancellationToken);
        await AuditAsync(me, me, UserAuditAction.PasswordChanged, new { revokedSessions = revoked }, cancellationToken);
    }

    /// <summary>
    /// Sets a temporary password for another user (users:reset-password; the target must be in
    /// scope and below the caller). The user must change it on next sign-in; all their sessions end.
    /// </summary>
    public async Task<TemporaryPasswordDto> ResetPasswordAsync(Guid userId, ResetPasswordRequest request, CancellationToken cancellationToken = default)
    {
        var actor = await guard.GetActorAsync(cancellationToken);
        var user = await guard.GetManageableUserAsync(actor, userId, Permissions.Users.ResetPassword, cancellationToken);

        var password = string.IsNullOrWhiteSpace(request.NewPassword) ? GeneratePassword() : request.NewPassword;
        await SetPasswordAsync(user, password);
        user.MustChangePassword = true;
        user.LockoutEnd = null;
        user.AccessFailedCount = 0;
        await userManager.UpdateAsync(user);

        var revoked = await RevokeSessionsAsync(user.Id, null, "password-reset", cancellationToken);
        await AuditAsync(user.Id, actor.Id, UserAuditAction.PasswordReset,
            new { generated = string.IsNullOrWhiteSpace(request.NewPassword), revokedSessions = revoked }, cancellationToken);
        return new TemporaryPasswordDto(password);
    }

    public async Task<AvatarDto> SetAvatarAsync(Stream content, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var user = await db.Users.SingleAsync(u => u.Id == me, cancellationToken);
        var key = await images.StoreAsync(content, ImagePurpose.Avatar, cancellationToken);
        var previous = user.AvatarKey;
        user.AvatarKey = key;
        await db.SaveChangesAsync(cancellationToken);
        await images.DeleteAsync(previous, cancellationToken);
        return new AvatarDto(ImageService.Url(key), ImageService.Url(key, ImageService.Thumbnail));
    }

    public async Task RemoveAvatarAsync(CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var user = await db.Users.SingleAsync(u => u.Id == me, cancellationToken);
        var previous = user.AvatarKey;
        user.AvatarKey = null;
        await db.SaveChangesAsync(cancellationToken);
        await images.DeleteAsync(previous, cancellationToken);
    }

    /// <summary>Account events of a user in the caller's users:read scope, newest first.</summary>
    public async Task<IReadOnlyList<UserAuditEntryDto>> GetAuditAsync(Guid userId, int limit, CancellationToken cancellationToken = default)
    {
        var user = await db.Users.AsNoTracking().Where(u => u.Id == userId).Select(u => new { u.Id, u.TerritoryId })
                       .SingleOrDefaultAsync(cancellationToken)
                   ?? throw new NotFoundException("User", userId);
        var scope = await scopeResolver.ResolveAsync(Permissions.Users.Read, cancellationToken);
        if (!scope.Includes(user.Id, user.TerritoryId))
        {
            throw new ForbiddenException();
        }

        var entries = await db.UserAuditEntries.AsNoTracking()
            .Where(e => e.UserId == userId)
            .OrderByDescending(e => e.CreatedAt).ThenByDescending(e => e.Id)
            .Take(Math.Clamp(limit, 1, 100))
            .ToListAsync(cancellationToken);
        return entries
            .Select(e => new UserAuditEntryDto(e.Id, e.Action, e.ActorName, JsonDocument.Parse(e.Details).RootElement.Clone(), e.CreatedAt))
            .ToList();
    }

    /// <summary>
    /// 14 characters from an alphabet without look-alikes (no 0/O, 1/l/I), always with upper case,
    /// lower case and a digit so it meets the password policy.
    /// </summary>
    public static string GeneratePassword()
    {
        const string upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        const string lower = "abcdefghijkmnpqrstuvwxyz";
        const string digits = "23456789";
        var chars = new List<char>
        {
            upper[RandomNumberGenerator.GetInt32(upper.Length)],
            lower[RandomNumberGenerator.GetInt32(lower.Length)],
            digits[RandomNumberGenerator.GetInt32(digits.Length)],
        };
        chars.AddRange(RandomNumberGenerator.GetString(upper + lower + digits, 11));
        RandomNumberGenerator.Shuffle(System.Runtime.InteropServices.CollectionsMarshal.AsSpan(chars));
        return new string([.. chars]);
    }

    /// <summary>Validates against the password policy, then stores the new hash (no reset token needed).</summary>
    internal async Task SetPasswordAsync(User user, string password)
    {
        var errors = new List<IdentityError>();
        foreach (var validator in userManager.PasswordValidators)
        {
            var check = await validator.ValidateAsync(userManager, user, password);
            if (!check.Succeeded)
            {
                errors.AddRange(check.Errors);
            }
        }

        ThrowIfFailed(errors.Count == 0 ? IdentityResult.Success : IdentityResult.Failed([.. errors]));
        user.PasswordHash = userManager.PasswordHasher.HashPassword(user, password);
        await userManager.UpdateSecurityStampAsync(user);
    }

    /// <summary>Revokes the user's refresh-token families except <paramref name="keepFamilyId"/>.</summary>
    internal async Task<int> RevokeSessionsAsync(Guid userId, Guid? keepFamilyId, string reason, CancellationToken cancellationToken)
    {
        var now = time.GetUtcNow();
        var families = await db.RefreshTokens
            .Where(t => t.UserId == userId && t.RevokedAt == null && t.FamilyId != keepFamilyId)
            .Select(t => t.FamilyId)
            .Distinct()
            .CountAsync(cancellationToken);
        await db.RefreshTokens
            .Where(t => t.UserId == userId && t.RevokedAt == null && t.FamilyId != keepFamilyId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(t => t.RevokedAt, now)
                .SetProperty(t => t.RevokedReason, reason), cancellationToken);
        return families;
    }

    internal async Task AuditAsync(Guid userId, Guid actorId, UserAuditAction action, object details, CancellationToken cancellationToken)
    {
        var actorName = await db.Users.AsNoTracking().Where(u => u.Id == actorId).Select(u => u.FullName).SingleOrDefaultAsync(cancellationToken);
        db.UserAuditEntries.Add(UserAudit.Entry(userId, actorId, actorName ?? string.Empty, action, details, currentUser.IpAddress, time.GetUtcNow()));
        await db.SaveChangesAsync(cancellationToken);
    }

    private static void ThrowIfFailed(IdentityResult result)
    {
        if (result.Succeeded)
        {
            return;
        }

        throw new BusinessRuleException(AccountErrorCodes.PasswordPolicy, string.Join(" ", result.Errors.Select(e => e.Description)))
        {
            Details = new Dictionary<string, object?> { ["errors"] = result.Errors.Select(e => e.Code).ToArray() },
        };
    }
}

internal static class UserAudit
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static UserAuditEntry Entry(Guid userId, Guid actorId, string actorName, UserAuditAction action, object details, string? ip, DateTimeOffset at) =>
        new()
        {
            UserId = userId,
            ActorId = actorId,
            ActorName = actorName,
            Action = action,
            Details = JsonSerializer.Serialize(details, Json),
            IpAddress = ip,
            CreatedAt = at,
        };
}

public sealed class ChangePasswordRequestValidator : AbstractValidator<ChangePasswordRequest>
{
    public ChangePasswordRequestValidator()
    {
        RuleFor(x => x.CurrentPassword).NotEmpty().MaximumLength(256);
        RuleFor(x => x.NewPassword).NotEmpty().MinimumLength(8).MaximumLength(128);
    }
}

public sealed class ResetPasswordRequestValidator : AbstractValidator<ResetPasswordRequest>
{
    public ResetPasswordRequestValidator()
    {
        RuleFor(x => x.NewPassword).MinimumLength(8).MaximumLength(128).When(x => !string.IsNullOrEmpty(x.NewPassword));
    }
}
