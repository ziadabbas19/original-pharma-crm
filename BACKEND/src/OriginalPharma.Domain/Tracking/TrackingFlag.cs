using OriginalPharma.Domain.Common;

namespace OriginalPharma.Domain.Tracking;

/// <summary>
/// Something a supervisor should look at. Flags never block the rep; a human
/// decides whether it is real.
/// </summary>
public class TrackingFlag : Entity, IScopedEntity
{
    public Guid UserId { get; set; }
    public Guid? TerritoryId { get; set; }
    public Guid? ShiftId { get; set; }

    public TrackingFlagType Type { get; set; }
    public TrackingFlagStatus Status { get; set; } = TrackingFlagStatus.Open;

    public int Score { get; set; }
    public List<string> Signals { get; set; } = [];

    /// <summary>Free-form details (human readable).</summary>
    public string? Details { get; set; }

    /// <summary>The location point that raised the flag (most suspicious point of the batch), if any.</summary>
    public long? LocationPointId { get; set; }

    /// <summary>The visit the flag is about, if any.</summary>
    public Guid? VisitId { get; set; }

    /// <summary>
    /// How many times the same problem was seen while the flag stayed open (same rep, type and day).
    /// Repeats update the open flag instead of adding new ones.
    /// </summary>
    public int Occurrences { get; set; } = 1;

    /// <summary>When the problem was last seen (null = only once, at <see cref="CreatedAt"/>).</summary>
    public DateTimeOffset? LastSeenAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ReviewedAt { get; set; }
    public Guid? ReviewedById { get; set; }
    public string? ReviewNote { get; set; }
}
