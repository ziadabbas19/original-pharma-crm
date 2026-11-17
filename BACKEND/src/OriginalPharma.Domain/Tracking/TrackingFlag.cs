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

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ReviewedAt { get; set; }
    public Guid? ReviewedById { get; set; }
    public string? ReviewNote { get; set; }
}
