using OriginalPharma.Domain.Common;

namespace OriginalPharma.Domain.Identity;

public enum ClientKind
{
    /// <summary>Browser dashboard / PWA. Refresh token lives in an httpOnly cookie.</summary>
    Web = 1,

    /// <summary>Capacitor app. Refresh token is returned in the body and kept in secure storage.</summary>
    Native = 2,
}

/// <summary>
/// Rotating refresh token. Only a SHA-256 hash of the token is stored.
/// All tokens issued from one login share a <see cref="FamilyId"/>; reuse of a
/// rotated token revokes the whole family.
/// </summary>
public class RefreshToken : Entity
{
    public Guid UserId { get; set; }
    public User? User { get; set; }

    public string TokenHash { get; set; } = string.Empty;
    public Guid FamilyId { get; set; }
    public ClientKind Client { get; set; }
    public string? DeviceId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public string? RevokedReason { get; set; }
    public Guid? ReplacedByTokenId { get; set; }
    public string? CreatedByIp { get; set; }

    public bool IsActive(DateTimeOffset now) => RevokedAt is null && ExpiresAt > now;
}
