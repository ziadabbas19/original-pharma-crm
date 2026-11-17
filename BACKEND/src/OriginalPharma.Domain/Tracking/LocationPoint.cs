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
    public List<string> AnomalyCodes { get; set; } = [];
}
