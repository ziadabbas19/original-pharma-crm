using NetTopologySuite.Geometries;
using OriginalPharma.Domain.Common;

namespace OriginalPharma.Domain.Tracking;

/// <summary>
/// A working day between "Start my day" and "End my day". Tracking only runs
/// (and points are only accepted) inside a shift.
/// </summary>
public class Shift : Entity, IScopedEntity
{
    public Guid UserId { get; set; }
    public Guid? TerritoryId { get; set; }
    public string DeviceId { get; set; } = string.Empty;
    public LocationSource Source { get; set; }

    public ShiftStatus Status { get; set; } = ShiftStatus.Active;
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? EndedAt { get; set; }
    public Point? StartLocation { get; set; }
    public Point? EndLocation { get; set; }

    /// <summary>Server receive time of the most recent accepted point.</summary>
    public DateTimeOffset? LastPointAt { get; set; }

    /// <summary>Set by the monitor job when no points arrived inside the configured window.</summary>
    public DateTimeOffset? TrackingLostAt { get; set; }

    /// <summary>Result of device attestation at shift start (Play Integrity on Android).</summary>
    public bool? IntegrityPassed { get; set; }
    public string? IntegrityVerdict { get; set; }
}
