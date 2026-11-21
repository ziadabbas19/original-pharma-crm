using OriginalPharma.Domain.Common;

namespace OriginalPharma.Domain.Identity;

/// <summary>
/// One signed-in device: everything issued from one login. <see cref="Entity.Id"/> is the refresh-token
/// family id and the <c>sid</c> claim of its access tokens. Each refresh slides <see cref="ExpiresAt"/>
/// forward; <see cref="AbsoluteExpiresAt"/> never moves, so a password login is needed at least that
/// often. Revoking a session ends that device only.
/// </summary>
public class UserSession : Entity
{
    public const int DeviceNameMaxLength = 100;
    public const int UserAgentMaxLength = 512;

    public Guid UserId { get; set; }
    public User? User { get; set; }

    public ClientKind Client { get; set; }
    public string? DeviceId { get; set; }

    /// <summary>What the app says the device is ("Samsung SM-A546E", "Chrome on Windows").</summary>
    public string? DeviceName { get; set; }

    public string? UserAgent { get; set; }

    /// <summary>The native background location uploader's own session on the device.</summary>
    public bool IsBackground { get; set; }

    /// <summary>The password login (or background hand-over) that started the session.</summary>
    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset LastUsedAt { get; set; }

    /// <summary>End of the sliding window: the session ends if the device is not used before this.</summary>
    public DateTimeOffset ExpiresAt { get; set; }

    /// <summary>Hard limit from <see cref="CreatedAt"/>, whatever the use.</summary>
    public DateTimeOffset AbsoluteExpiresAt { get; set; }

    public string? CreatedByIp { get; set; }
    public string? LastIp { get; set; }

    public DateTimeOffset? RevokedAt { get; set; }

    /// <summary>logout, password-changed, password-reset, user-archived, reuse-detected, revoked, max-age, ...</summary>
    public string? RevokedReason { get; set; }

    public bool IsActive(DateTimeOffset now) => RevokedAt is null && ExpiresAt > now && AbsoluteExpiresAt > now;
}
