using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Identity;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Infrastructure.Persistence;

namespace OriginalPharma.Infrastructure.Identity;

/// <summary>Password login, rotating refresh tokens and the "me" payload.</summary>
internal sealed class AuthService(
    AppDbContext db,
    UserManager<User> userManager,
    TokenService tokens,
    IPermissionService permissions,
    ICurrentUser currentUser,
    IOptions<JwtOptions> options,
    TimeProvider time,
    ILogger<AuthService> logger) : IAuthService
{
    /// <summary>
    /// Two tabs (or the app and its background uploader) may refresh with the same
    /// token at once. A just-rotated token is accepted for this long instead of
    /// being treated as stolen.
    /// </summary>
    private static readonly TimeSpan RotationGrace = TimeSpan.FromSeconds(30);

    public async Task<AuthTokens> LoginAsync(LoginRequest request, CancellationToken cancellationToken = default)
    {
        var user = await userManager.FindByEmailAsync(request.Email);
        if (user is null || !user.IsActive)
        {
            throw InvalidCredentials();
        }

        if (await userManager.IsLockedOutAsync(user))
        {
            throw new UnauthorizedException("locked-out", "Too many failed attempts. Try again later.");
        }

        if (!await userManager.CheckPasswordAsync(user, request.Password))
        {
            await userManager.AccessFailedAsync(user);
            throw InvalidCredentials();
        }

        await userManager.ResetAccessFailedCountAsync(user);
        return await IssueAsync(user, request.Client, request.DeviceId, Guid.CreateVersion7(), cancellationToken);
    }

    public async Task<AuthTokens> RefreshAsync(string refreshToken, ClientKind client, string? deviceId, CancellationToken cancellationToken = default)
    {
        var now = time.GetUtcNow();
        var hash = TokenService.Hash(refreshToken);
        var stored = await db.RefreshTokens.SingleOrDefaultAsync(t => t.TokenHash == hash, cancellationToken)
                     ?? throw new UnauthorizedException("invalid-refresh-token", "Session expired. Please sign in again.");

        if (stored.RevokedAt is not null)
        {
            var withinGrace = stored.RevokedReason == "rotated" && now - stored.RevokedAt < RotationGrace;
            if (!withinGrace)
            {
                if (stored.ReplacedByTokenId is not null)
                {
                    logger.LogWarning("Refresh token reuse detected for user {UserId}; revoking token family {FamilyId}", stored.UserId, stored.FamilyId);
                    await RevokeFamilyAsync(stored.FamilyId, "reuse-detected", cancellationToken);
                }

                throw new UnauthorizedException("invalid-refresh-token", "Session expired. Please sign in again.");
            }
        }
        else if (stored.ExpiresAt <= now)
        {
            throw new UnauthorizedException("invalid-refresh-token", "Session expired. Please sign in again.");
        }

        var user = await userManager.FindByIdAsync(stored.UserId.ToString());
        if (user is null || !user.IsActive)
        {
            await RevokeFamilyAsync(stored.FamilyId, "user-inactive", cancellationToken);
            throw new UnauthorizedException("invalid-refresh-token", "Session expired. Please sign in again.");
        }

        var issued = await IssueAsync(user, stored.Client, deviceId ?? stored.DeviceId, stored.FamilyId, cancellationToken, stored);
        return issued;
    }

    public async Task LogoutAsync(string? refreshToken, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
        {
            return;
        }

        var hash = TokenService.Hash(refreshToken);
        var stored = await db.RefreshTokens.SingleOrDefaultAsync(t => t.TokenHash == hash, cancellationToken);
        if (stored is not null)
        {
            await RevokeFamilyAsync(stored.FamilyId, "logout", cancellationToken);
        }
    }

    public async Task<AuthTokens> CreateSessionAsync(Guid userId, ClientKind client, string? deviceId, CancellationToken cancellationToken = default)
    {
        var user = await userManager.FindByIdAsync(userId.ToString());
        if (user is null || !user.IsActive)
        {
            throw new UnauthorizedException("unauthenticated", "Sign in required.");
        }

        return await IssueAsync(user, client, deviceId, Guid.CreateVersion7(), cancellationToken);
    }

    public async Task<MeResponse> GetMeAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var user = await userManager.FindByIdAsync(userId.ToString()) ?? throw new NotFoundException("User", userId);
        var roles = await db.GetRoleSummariesAsync(userId, cancellationToken);
        var effective = await permissions.GetEffectivePermissionsAsync(userId, cancellationToken);

        return new MeResponse(
            ToProfile(user, roles),
            effective.Scopes.Select(kv => new PermissionGrantDto(kv.Key, kv.Value)).OrderBy(p => p.Key).ToList(),
            effective.Version);
    }

    private async Task<AuthTokens> IssueAsync(
        User user,
        ClientKind client,
        string? deviceId,
        Guid familyId,
        CancellationToken cancellationToken,
        RefreshToken? rotatedFrom = null)
    {
        var now = time.GetUtcNow();
        var roles = await db.GetRoleSummariesAsync(user.Id, cancellationToken);
        var version = await permissions.GetVersionAsync(user.Id, cancellationToken);
        // Role claims carry the stable keys, never display names.
        var (accessToken, accessExpiresAt) = tokens.CreateAccessToken(user, roles.Select(r => r.Key), version);

        var rawRefresh = TokenService.NewRefreshToken();
        var refresh = new RefreshToken
        {
            UserId = user.Id,
            TokenHash = TokenService.Hash(rawRefresh),
            FamilyId = familyId,
            Client = client,
            DeviceId = deviceId,
            CreatedAt = now,
            ExpiresAt = now.AddDays(options.Value.RefreshTokenDays),
            CreatedByIp = currentUser.IpAddress,
        };
        db.RefreshTokens.Add(refresh);

        if (rotatedFrom is not null && rotatedFrom.RevokedAt is null)
        {
            rotatedFrom.RevokedAt = now;
            rotatedFrom.RevokedReason = "rotated";
            rotatedFrom.ReplacedByTokenId = refresh.Id;
        }

        await db.SaveChangesAsync(cancellationToken);
        return new AuthTokens(accessToken, accessExpiresAt, rawRefresh, refresh.ExpiresAt, ToProfile(user, roles));
    }

    private async Task RevokeFamilyAsync(Guid familyId, string reason, CancellationToken cancellationToken)
    {
        var now = time.GetUtcNow();
        await db.RefreshTokens
            .Where(t => t.FamilyId == familyId && t.RevokedAt == null)
            .ExecuteUpdateAsync(s => s
                .SetProperty(t => t.RevokedAt, now)
                .SetProperty(t => t.RevokedReason, reason), cancellationToken);
    }

    private static UserProfileDto ToProfile(User user, IReadOnlyList<RoleSummaryDto> roles) =>
        new(user.Id, user.Email ?? string.Empty, user.FullName, user.PreferredLanguage, roles, user.ManagerId, user.TerritoryId);

    private static UnauthorizedException InvalidCredentials() =>
        new("invalid-credentials", "Email or password is incorrect.");
}
