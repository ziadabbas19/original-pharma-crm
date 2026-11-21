using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Images;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Orders;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Infrastructure.Persistence;

namespace OriginalPharma.Infrastructure.Identity;

/// <summary>
/// Password login, rotating refresh tokens and the "me" payload. Each login is a session (one device):
/// every refresh slides it forward by Auth:SessionDays, up to Auth:SessionMaxDays from the login.
/// </summary>
internal sealed class AuthService(
    AppDbContext db,
    UserManager<User> userManager,
    TokenService tokens,
    IPermissionService permissions,
    ICurrentUser currentUser,
    SessionService sessions,
    TimeProvider time,
    ILogger<AuthService> logger) : IAuthService
{
    private const string Rotated = "rotated";

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
        var session = sessions.Start(user.Id, request.Client, request.DeviceId, request.DeviceName, isBackground: false);
        return await IssueAsync(user, session, null, cancellationToken);
    }

    public async Task<AuthTokens> RefreshAsync(
        string refreshToken,
        ClientKind client,
        string? deviceId,
        string? deviceName = null,
        CancellationToken cancellationToken = default)
    {
        var now = time.GetUtcNow();
        var hash = TokenService.Hash(refreshToken);
        var stored = await db.RefreshTokens.SingleOrDefaultAsync(t => t.TokenHash == hash, cancellationToken)
                     ?? throw InvalidRefreshToken();

        var session = await db.UserSessions.SingleOrDefaultAsync(s => s.Id == stored.FamilyId, cancellationToken);
        if (session is null)
        {
            // Issued before sessions were recorded: only a token that is still good gets one.
            if (!stored.IsActive(now))
            {
                throw InvalidRefreshToken();
            }

            session = await sessions.AdoptFamilyAsync(stored, cancellationToken);
        }

        if (stored.RevokedAt is not null)
        {
            // Two refreshes sent at once with the same token: the second is accepted for a few seconds.
            var withinGrace = stored.RevokedReason == Rotated && session.RevokedAt is null &&
                              now - stored.RevokedAt < sessions.Options.ReuseGrace;
            if (!withinGrace)
            {
                if (stored.ReplacedByTokenId is not null && session.RevokedAt is null)
                {
                    logger.LogWarning("Refresh token reuse detected for user {UserId}; revoking session {SessionId}", stored.UserId, session.Id);
                    await sessions.RevokeAsync([session.Id], SessionRevokeReasons.ReuseDetected, cancellationToken);
                }

                throw InvalidRefreshToken();
            }
        }
        else if (stored.ExpiresAt <= now)
        {
            throw InvalidRefreshToken();
        }

        if (session.RevokedAt is not null || session.ExpiresAt <= now)
        {
            throw InvalidRefreshToken();
        }

        if (session.AbsoluteExpiresAt <= now)
        {
            await sessions.RevokeAsync([session.Id], SessionRevokeReasons.MaxAge, cancellationToken);
            throw InvalidRefreshToken();
        }

        var user = await userManager.FindByIdAsync(stored.UserId.ToString());
        if (user is null || !user.IsActive)
        {
            await sessions.RevokeAsync([session.Id], SessionRevokeReasons.UserInactive, cancellationToken);
            throw InvalidRefreshToken();
        }

        session.DeviceId ??= Clip(deviceId, 128);
        if (Clip(deviceName, UserSession.DeviceNameMaxLength) is { } name)
        {
            session.DeviceName = name;
        }

        session.LastIp = Clip(currentUser.IpAddress, 64);
        return await IssueAsync(user, session, stored, cancellationToken);
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
            // This device only (and its background uploader); other devices stay signed in.
            await sessions.RevokeAsync([stored.FamilyId], SessionRevokeReasons.Logout, cancellationToken);
        }
    }

    public async Task<AuthTokens> CreateSessionAsync(
        Guid userId,
        ClientKind client,
        string? deviceId,
        string? deviceName = null,
        CancellationToken cancellationToken = default)
    {
        var user = await userManager.FindByIdAsync(userId.ToString());
        if (user is null || !user.IsActive)
        {
            throw new UnauthorizedException("unauthenticated", "Sign in required.");
        }

        // The uploader's session never outlives the session of the app that asked for it.
        DateTimeOffset? notAfter = currentUser.SessionId is { } parentId
            ? await db.UserSessions.Where(s => s.Id == parentId).Select(s => (DateTimeOffset?)s.AbsoluteExpiresAt).SingleOrDefaultAsync(cancellationToken)
            : null;
        var session = sessions.Start(user.Id, client, deviceId, deviceName, isBackground: true, notAfter);
        return await IssueAsync(user, session, null, cancellationToken);
    }

    public async Task<MeResponse> GetMeAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var user = await userManager.FindByIdAsync(userId.ToString()) ?? throw new NotFoundException("User", userId);
        var roles = await db.GetRoleSummariesAsync(userId, cancellationToken);
        var effective = await permissions.GetEffectivePermissionsAsync(userId, cancellationToken);

        var caps = await db.UserRoles.AsNoTracking()
            .Where(ur => ur.UserId == userId)
            .Join(db.Roles, ur => ur.RoleId, r => r.Id, (_, r) => r.MaxDiscountPercent)
            .ToListAsync(cancellationToken);

        return new MeResponse(
            ToProfile(user, roles),
            effective.Scopes.Select(kv => new PermissionGrantDto(kv.Key, kv.Value)).OrderBy(p => p.Key).ToList(),
            effective.Version,
            OrderPricing.EffectiveDiscountCap(caps));
    }

    private async Task<AuthTokens> IssueAsync(User user, UserSession session, RefreshToken? rotatedFrom, CancellationToken cancellationToken)
    {
        var now = time.GetUtcNow();
        var roles = await db.GetRoleSummariesAsync(user.Id, cancellationToken);
        var version = await permissions.GetVersionAsync(user.Id, cancellationToken);
        // Role claims carry the stable keys, never display names.
        var (accessToken, accessExpiresAt) = tokens.CreateAccessToken(user, roles.Select(r => r.Key), version, session.Id);

        var expiresAt = sessions.SlideFrom(session, now);
        var rawRefresh = TokenService.NewRefreshToken();
        var refresh = new RefreshToken
        {
            UserId = user.Id,
            TokenHash = TokenService.Hash(rawRefresh),
            FamilyId = session.Id,
            Client = session.Client,
            DeviceId = session.DeviceId,
            CreatedAt = now,
            ExpiresAt = expiresAt,
            CreatedByIp = currentUser.IpAddress,
        };
        db.RefreshTokens.Add(refresh);
        session.LastUsedAt = now;
        session.ExpiresAt = expiresAt;

        if (rotatedFrom is not null && rotatedFrom.RevokedAt is null)
        {
            rotatedFrom.RevokedAt = now;
            rotatedFrom.RevokedReason = Rotated;
            rotatedFrom.ReplacedByTokenId = refresh.Id;
        }

        await db.SaveChangesAsync(cancellationToken);
        return new AuthTokens(accessToken, accessExpiresAt, rawRefresh, refresh.ExpiresAt, ToProfile(user, roles));
    }

    private static UserProfileDto ToProfile(User user, IReadOnlyList<RoleSummaryDto> roles) =>
        new(user.Id, user.Email ?? string.Empty, user.FullName, user.PreferredLanguage, roles, user.ManagerId, user.TerritoryId,
            user.MustChangePassword, ImageService.Url(user.AvatarKey), ImageService.Url(user.AvatarKey, ImageService.Thumbnail));

    private static UnauthorizedException InvalidCredentials() =>
        new("invalid-credentials", "Email or password is incorrect.");

    private static UnauthorizedException InvalidRefreshToken() =>
        new("invalid-refresh-token", "Session expired. Please sign in again.");

    private static string? Clip(string? value, int max)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed.Length <= max ? trimmed : trimmed[..max];
    }
}
