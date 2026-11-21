using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Options;
using OriginalPharma.Application.Common;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Application.Identity;

/// <summary>
/// How long people stay signed in. Section <c>Auth</c> (environment: <c>Auth__SessionDays</c>, ...).
/// </summary>
public sealed class AuthSessionOptions
{
    public const string SectionName = "Auth";

    /// <summary>A device that is used at least this often stays signed in: every refresh extends the session by this much.</summary>
    public int SessionDays { get; set; } = 30;

    /// <summary>Hard limit from the password login, however often the device is used.</summary>
    public int SessionMaxDays { get; set; } = 90;

    /// <summary>
    /// A refresh token that was just replaced is still accepted for this long, so two refreshes sent at
    /// the same moment from one device (the app waking up with several requests in flight) do not look
    /// like a stolen token. Older reuse revokes the session.
    /// </summary>
    public int RefreshReuseGraceSeconds { get; set; } = 10;

    public TimeSpan Sliding => TimeSpan.FromDays(SessionDays);
    public TimeSpan Maximum => TimeSpan.FromDays(Math.Max(SessionMaxDays, SessionDays));
    public TimeSpan ReuseGrace => TimeSpan.FromSeconds(Math.Clamp(RefreshReuseGraceSeconds, 0, 120));
}

/// <summary>
/// Sessions revoked recently, so access tokens already issued for them stop working at once instead
/// of at their expiry. Kept in the distributed cache (Redis) for longer than an access token lives.
/// </summary>
public interface ISessionRevocationList
{
    Task AddAsync(IEnumerable<Guid> sessionIds, CancellationToken cancellationToken = default);
    Task<bool> ContainsAsync(Guid sessionId, CancellationToken cancellationToken = default);
}

internal sealed class SessionRevocationList(IDistributedCache cache) : ISessionRevocationList
{
    /// <summary>Access tokens live minutes (Jwt:AccessTokenMinutes); this comfortably outlasts them.</summary>
    private static readonly DistributedCacheEntryOptions Retention = new() { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(6) };

    private static string Key(Guid sessionId) => $"session-revoked:{sessionId:N}";

    public async Task AddAsync(IEnumerable<Guid> sessionIds, CancellationToken cancellationToken = default)
    {
        foreach (var id in sessionIds.Distinct())
        {
            await cache.SetAsync(Key(id), [1], Retention, cancellationToken);
        }
    }

    public async Task<bool> ContainsAsync(Guid sessionId, CancellationToken cancellationToken = default) =>
        await cache.GetAsync(Key(sessionId), cancellationToken) is not null;
}

/// <param name="Id">Session id (the <c>sid</c> claim of its access tokens).</param>
/// <param name="IsCurrent">The session the request was made with.</param>
/// <param name="IsBackground">The background location uploader of a phone (ends with the phone's session).</param>
public sealed record UserSessionDto(
    Guid Id,
    ClientKind Client,
    string? DeviceId,
    string? DeviceName,
    bool IsBackground,
    DateTimeOffset CreatedAt,
    DateTimeOffset LastUsedAt,
    DateTimeOffset ExpiresAt,
    DateTimeOffset AbsoluteExpiresAt,
    bool IsCurrent);

public static class SessionRevokeReasons
{
    public const string Logout = "logout";
    public const string Revoked = "revoked";
    public const string PasswordChanged = "password-changed";
    public const string PasswordReset = "password-reset";
    public const string UserArchived = "user-archived";
    public const string UserDeleted = "user-deleted";
    public const string UserInactive = "user-inactive";
    public const string ReuseDetected = "reuse-detected";
    public const string MaxAge = "max-age";
}

/// <summary>
/// Signed-in devices: starting a session, ending one or all of a user's, and the list a user (or
/// someone allowed to manage them) sees. Every revocation also revokes the session's refresh tokens
/// and lands on <see cref="ISessionRevocationList"/>, so the device is signed out right away.
/// Ending a phone's session also ends the background uploader session of the same phone.
/// </summary>
public sealed class SessionService(
    IAppDbContext db,
    ICurrentUser currentUser,
    HierarchyGuard guard,
    ISessionRevocationList revocations,
    IOptions<AuthSessionOptions> options,
    TimeProvider time)
{
    public AuthSessionOptions Options => options.Value;

    /// <summary>A new session for a password login (or the background uploader). Added to the context, not saved.</summary>
    public UserSession Start(Guid userId, ClientKind client, string? deviceId, string? deviceName, bool isBackground, DateTimeOffset? notAfter = null)
    {
        var now = time.GetUtcNow();
        var absolute = now + Options.Maximum;
        if (notAfter is { } limit && limit < absolute)
        {
            absolute = limit;
        }

        var session = new UserSession
        {
            UserId = userId,
            Client = client,
            DeviceId = Clip(deviceId, 128),
            DeviceName = Clip(deviceName, UserSession.DeviceNameMaxLength),
            UserAgent = Clip(currentUser.UserAgent, UserSession.UserAgentMaxLength),
            IsBackground = isBackground,
            CreatedAt = now,
            LastUsedAt = now,
            ExpiresAt = Min(now + Options.Sliding, absolute),
            AbsoluteExpiresAt = absolute,
            CreatedByIp = Clip(currentUser.IpAddress, 64),
            LastIp = Clip(currentUser.IpAddress, 64),
        };
        db.UserSessions.Add(session);
        return session;
    }

    /// <summary>The end of the sliding window if the session is used now.</summary>
    public DateTimeOffset SlideFrom(UserSession session, DateTimeOffset now) => Min(now + Options.Sliding, session.AbsoluteExpiresAt);

    /// <summary>
    /// A session for a refresh-token family issued before sessions were recorded, started when the
    /// family's first token was issued.
    /// </summary>
    public async Task<UserSession> AdoptFamilyAsync(RefreshToken token, CancellationToken cancellationToken)
    {
        var started = await db.RefreshTokens.Where(t => t.FamilyId == token.FamilyId).MinAsync(t => t.CreatedAt, cancellationToken);
        var session = new UserSession
        {
            Id = token.FamilyId,
            UserId = token.UserId,
            Client = token.Client,
            DeviceId = token.DeviceId,
            CreatedAt = started,
            LastUsedAt = token.CreatedAt,
            ExpiresAt = token.ExpiresAt,
            AbsoluteExpiresAt = started + Options.Maximum,
            CreatedByIp = token.CreatedByIp,
            LastIp = token.CreatedByIp,
        };
        db.UserSessions.Add(session);
        return session;
    }

    /// <summary>
    /// Ends the given sessions (plus the background uploader sessions on the same phones) and their
    /// refresh tokens. Returns the ids that were ended.
    /// </summary>
    public async Task<IReadOnlyList<Guid>> RevokeAsync(IReadOnlyCollection<Guid> sessionIds, string reason, CancellationToken cancellationToken = default)
    {
        if (sessionIds.Count == 0)
        {
            return [];
        }

        var now = time.GetUtcNow();
        var phones = await db.UserSessions
            .Where(s => sessionIds.Contains(s.Id) && !s.IsBackground && s.DeviceId != null)
            .Select(s => new { s.UserId, s.DeviceId })
            .ToListAsync(cancellationToken);
        var userIds = phones.Select(p => p.UserId).Distinct().ToList();
        var deviceIds = phones.Select(p => p.DeviceId!).Distinct().ToList();
        var background = phones.Count == 0
            ? []
            : await db.UserSessions
                .Where(s => s.IsBackground && s.RevokedAt == null && userIds.Contains(s.UserId) && s.DeviceId != null && deviceIds.Contains(s.DeviceId))
                .Select(s => new { s.Id, s.UserId, s.DeviceId })
                .ToListAsync(cancellationToken);

        var ids = sessionIds
            .Concat(background.Where(b => phones.Any(p => p.UserId == b.UserId && p.DeviceId == b.DeviceId)).Select(b => b.Id))
            .Distinct()
            .ToList();

        await db.UserSessions
            .Where(s => ids.Contains(s.Id) && s.RevokedAt == null)
            .ExecuteUpdateAsync(u => u.SetProperty(s => s.RevokedAt, now).SetProperty(s => s.RevokedReason, reason), cancellationToken);
        await db.RefreshTokens
            .Where(t => ids.Contains(t.FamilyId) && t.RevokedAt == null)
            .ExecuteUpdateAsync(u => u.SetProperty(t => t.RevokedAt, now).SetProperty(t => t.RevokedReason, reason), cancellationToken);
        await revocations.AddAsync(ids, cancellationToken);
        return ids;
    }

    /// <summary>Ends every session of the user except <paramref name="keepSessionId"/>. Returns how many were active.</summary>
    public async Task<int> RevokeAllAsync(Guid userId, Guid? keepSessionId, string reason, CancellationToken cancellationToken = default)
    {
        var sessions = await db.UserSessions
            .Where(s => s.UserId == userId && s.RevokedAt == null && s.Id != keepSessionId)
            .Select(s => s.Id)
            .ToListAsync(cancellationToken);
        // Token families without a session row (issued before sessions were recorded).
        var families = await db.RefreshTokens
            .Where(t => t.UserId == userId && t.RevokedAt == null && t.FamilyId != keepSessionId && !sessions.Contains(t.FamilyId))
            .Select(t => t.FamilyId)
            .Distinct()
            .ToListAsync(cancellationToken);

        var all = sessions.Concat(families).ToList();
        if (keepSessionId is { } keep)
        {
            // Changing your own password keeps this device signed in, including its background uploader.
            var keepDevice = await db.UserSessions.Where(s => s.Id == keep).Select(s => s.DeviceId).SingleOrDefaultAsync(cancellationToken);
            if (keepDevice is not null)
            {
                var uploader = await db.UserSessions
                    .Where(s => s.UserId == userId && s.IsBackground && s.DeviceId == keepDevice)
                    .Select(s => s.Id)
                    .ToListAsync(cancellationToken);
                all.RemoveAll(uploader.Contains);
            }
        }

        await RevokeOnlyAsync(all, reason, cancellationToken);
        return all.Count;
    }

    /// <summary>Revokes exactly these sessions and families (no background expansion).</summary>
    private async Task RevokeOnlyAsync(IReadOnlyCollection<Guid> ids, string reason, CancellationToken cancellationToken)
    {
        if (ids.Count == 0)
        {
            return;
        }

        var now = time.GetUtcNow();
        await db.UserSessions
            .Where(s => ids.Contains(s.Id) && s.RevokedAt == null)
            .ExecuteUpdateAsync(u => u.SetProperty(s => s.RevokedAt, now).SetProperty(s => s.RevokedReason, reason), cancellationToken);
        await db.RefreshTokens
            .Where(t => ids.Contains(t.FamilyId) && t.RevokedAt == null)
            .ExecuteUpdateAsync(u => u.SetProperty(t => t.RevokedAt, now).SetProperty(t => t.RevokedReason, reason), cancellationToken);
        await revocations.AddAsync(ids, cancellationToken);
    }

    /// <summary>The caller's signed-in devices, most recently used first.</summary>
    public Task<IReadOnlyList<UserSessionDto>> ListMineAsync(CancellationToken cancellationToken = default) =>
        ListAsync(currentUser.RequireUserId(), cancellationToken);

    /// <summary>Signs one of the caller's own devices out (a lost phone, or this device).</summary>
    public async Task RevokeMineAsync(Guid sessionId, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        await EnsureSessionOfAsync(me, sessionId, cancellationToken);
        var ended = await RevokeAsync([sessionId], SessionRevokeReasons.Revoked, cancellationToken);
        await AuditAsync(me, me, sessionId, ended.Count, cancellationToken);
    }

    /// <summary>
    /// Devices of a user the caller may reset the password of (users:reset-password, in scope and below
    /// the caller): the people who can lock a lost phone out by other means anyway.
    /// </summary>
    public async Task<IReadOnlyList<UserSessionDto>> ListForUserAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var actor = await guard.GetActorAsync(cancellationToken);
        await guard.GetManageableUserAsync(actor, userId, Permissions.Users.ResetPassword, cancellationToken);
        return await ListAsync(userId, cancellationToken);
    }

    /// <summary>Signs one device of a managed user out, for example a lost or stolen phone. Other devices stay signed in.</summary>
    public async Task RevokeForUserAsync(Guid userId, Guid sessionId, CancellationToken cancellationToken = default)
    {
        var actor = await guard.GetActorAsync(cancellationToken);
        await guard.GetManageableUserAsync(actor, userId, Permissions.Users.ResetPassword, cancellationToken);
        await EnsureSessionOfAsync(userId, sessionId, cancellationToken);
        var ended = await RevokeAsync([sessionId], SessionRevokeReasons.Revoked, cancellationToken);
        await AuditAsync(userId, actor.Id, sessionId, ended.Count, cancellationToken);
    }

    private async Task<IReadOnlyList<UserSessionDto>> ListAsync(Guid userId, CancellationToken cancellationToken)
    {
        var now = time.GetUtcNow();
        var current = currentUser.SessionId;
        var rows = await db.UserSessions.AsNoTracking()
            .Where(s => s.UserId == userId && s.RevokedAt == null && s.ExpiresAt > now && s.AbsoluteExpiresAt > now)
            .OrderByDescending(s => s.LastUsedAt)
            .ToListAsync(cancellationToken);
        return rows
            .Select(s => new UserSessionDto(
                s.Id, s.Client, s.DeviceId, s.DeviceName, s.IsBackground, s.CreatedAt, s.LastUsedAt, s.ExpiresAt, s.AbsoluteExpiresAt,
                s.Id == current))
            .ToList();
    }

    private async Task EnsureSessionOfAsync(Guid userId, Guid sessionId, CancellationToken cancellationToken)
    {
        if (!await db.UserSessions.AnyAsync(s => s.Id == sessionId && s.UserId == userId, cancellationToken))
        {
            throw new NotFoundException("Session", sessionId);
        }
    }

    private async Task AuditAsync(Guid userId, Guid actorId, Guid sessionId, int ended, CancellationToken cancellationToken)
    {
        var actorName = await db.Users.AsNoTracking().Where(u => u.Id == actorId).Select(u => u.FullName).SingleOrDefaultAsync(cancellationToken);
        var device = await db.UserSessions.AsNoTracking().Where(s => s.Id == sessionId)
            .Select(s => new { s.Client, s.DeviceName, s.DeviceId }).SingleAsync(cancellationToken);
        db.UserAuditEntries.Add(UserAudit.Entry(userId, actorId, actorName ?? string.Empty, UserAuditAction.SessionRevoked,
            new { sessionId, device.Client, device.DeviceName, device.DeviceId, endedSessions = ended }, currentUser.IpAddress, time.GetUtcNow()));
        await db.SaveChangesAsync(cancellationToken);
    }

    private static DateTimeOffset Min(DateTimeOffset a, DateTimeOffset b) => a < b ? a : b;

    private static string? Clip(string? value, int max)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed.Length <= max ? trimmed : trimmed[..max];
    }
}
