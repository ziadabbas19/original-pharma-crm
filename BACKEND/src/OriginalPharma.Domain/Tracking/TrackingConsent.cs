using OriginalPharma.Domain.Common;

namespace OriginalPharma.Domain.Tracking;

/// <summary>Append-only log of a rep agreeing to location tracking.</summary>
public class TrackingConsent : Entity, IScopedEntity
{
    public Guid UserId { get; set; }
    public Guid? TerritoryId { get; set; }

    /// <summary>Version of the consent text the rep saw.</summary>
    public string ConsentVersion { get; set; } = string.Empty;

    public string DeviceId { get; set; } = string.Empty;
    public DevicePlatform Platform { get; set; }
    public string Locale { get; set; } = "ar";

    /// <summary>Server time the consent was recorded.</summary>
    public DateTimeOffset AcceptedAt { get; set; }

    /// <summary>Device clock time the rep tapped "I agree".</summary>
    public DateTimeOffset? ClientAcceptedAt { get; set; }

    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
}
