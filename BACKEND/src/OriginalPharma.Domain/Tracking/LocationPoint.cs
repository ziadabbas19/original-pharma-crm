using NetTopologySuite.Geometries;
using OriginalPharma.Domain.Common;

namespace OriginalPharma.Domain.Tracking;

/// <summary>
/// One GPS fix from a rep's device. High volume table; uses a bigint key.
/// TODO: partition by month (or move to TimescaleDB) once volume grows.
/// </summary>
public class LocationPoint : IScopedEntity
{
    public long Id { get; set; }

    public Guid UserId { get; set; }
    public Guid? TerritoryId { get; set; }
    public Guid? ShiftId { get; set; }
    public string DeviceId { get; set; } = string.Empty;
    public LocationSource Source { get; set; }

    public Point Location { get; set; } = null!;
    public double Accuracy { get; set; }
    public double? Speed { get; set; }
    public double? Heading { get; set; }
    public double? BatteryLevel { get; set; }
    public bool IsMock { get; set; }
    public bool? IsMoving { get; set; }

    /// <summary>Device clock time of the fix (UTC).</summary>
    public DateTimeOffset RecordedAt { get; set; }

    /// <summary>Server clock time the batch was received.</summary>
    public DateTimeOffset ReceivedAt { get; set; }

    /// <summary>0-100. Higher means more suspicious.</summary>
    public int AnomalyScore { get; set; }

    /// <summary>Every plausibility check that fired for this point (reason codes).</summary>
    public List<string> AnomalyCodes { get; set; } = [];

    /// <summary>Result of the plausibility checks. Older rows default to trusted.</summary>
    public LocationTrustStatus TrustStatus { get; set; } = LocationTrustStatus.Trusted;

    /// <summary>The reason code that decided <see cref="TrustStatus"/> (the most severe one); null when trusted.</summary>
    public string? TrustReason { get; set; }

    /// <summary>
    /// Device wall clock when the app recorded the fix (null from older apps). Differs from
    /// <see cref="RecordedAt"/> (the fix time) when the phone's clock is set by hand.
    /// </summary>
    public DateTimeOffset? DeviceTime { get; set; }

    /// <summary>Metres above sea level as reported by the device (null when not sent).</summary>
    public double? Altitude { get; set; }

    /// <summary>Motion activity the phone detected (still, on_foot, in_vehicle, ...), when sent.</summary>
    public string? ActivityType { get; set; }

    public int? ActivityConfidence { get; set; }

    /// <summary>
    /// Device signals sent with the batch (JSON, see DeviceSignalsDto), kept for review and cleared
    /// after the retention period set in the location trust settings.
    /// </summary>
    public string? DeviceSignals { get; set; }

    /// <summary>
    /// Visit-only visibility: recorded outside every known visit window when it arrived. Never shown to anyone;
    /// deleted after a grace period unless a visit queued offline arrives and covers it.
    /// </summary>
    public bool OutsideVisitWindow { get; set; }
}
