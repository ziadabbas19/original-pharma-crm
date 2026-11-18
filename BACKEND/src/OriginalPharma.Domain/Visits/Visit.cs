using NetTopologySuite.Geometries;
using OriginalPharma.Domain.Common;
using OriginalPharma.Domain.Crm;

namespace OriginalPharma.Domain.Visits;

public enum VisitStatus
{
    InProgress = 1,
    Completed = 2,
    Cancelled = 3,
}

/// <summary>How the rep sums up a visit (optional).</summary>
public enum VisitFeedbackCategory
{
    Positive = 1,
    NeedsFollowUp = 2,
    Complaint = 3,
    Request = 4,
}

/// <summary>
/// A rep's visit to a doctor or pharmacy, verified by geofence at check-in and
/// check-out, optional photos and an optional QR scan. The rep adds feedback and the
/// products discussed; the reporting line reads and answers the feedback.
/// TODO: samples handed out, notes templates.
/// </summary>
public class Visit : Entity, IScopedEntity, IArchivable
{
    public Guid UserId { get; set; }
    public Guid? TerritoryId { get; set; }
    public Guid CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public Guid? ShiftId { get; set; }
    public string DeviceId { get; set; } = string.Empty;

    public VisitStatus Status { get; set; } = VisitStatus.InProgress;

    public DateTimeOffset CheckInAt { get; set; }
    public DateTimeOffset CheckInReceivedAt { get; set; }
    public Point CheckInLocation { get; set; } = null!;
    public double CheckInAccuracy { get; set; }
    public double CheckInDistanceMeters { get; set; }
    public bool CheckInWithinGeofence { get; set; }
    public bool CheckInIsMock { get; set; }

    public DateTimeOffset? CheckOutAt { get; set; }
    public DateTimeOffset? CheckOutReceivedAt { get; set; }
    public Point? CheckOutLocation { get; set; }
    public double? CheckOutAccuracy { get; set; }
    public double? CheckOutDistanceMeters { get; set; }
    public bool? CheckOutWithinGeofence { get; set; }
    public bool? CheckOutIsMock { get; set; }

    public bool QrVerified { get; set; }
    public string? Notes { get; set; }

    /// <summary>True when something about the visit needs a supervisor's eye.</summary>
    public bool NeedsReview { get; set; }

    /// <summary>
    /// Device time of the last feedback / products update that was applied. An update queued offline
    /// earlier than this is ignored, so a late retry never overwrites newer content.
    /// </summary>
    public DateTimeOffset? ContentUpdatedAt { get; set; }

    public DateTimeOffset? ArchivedAt { get; set; }
    public Guid? ArchivedById { get; set; }

    public ICollection<VisitPhoto> Photos { get; set; } = new List<VisitPhoto>();
    public VisitFeedback? Feedback { get; set; }
    public ICollection<VisitProduct> Products { get; set; } = new List<VisitProduct>();
    public ICollection<VisitFeedbackReply> Replies { get; set; } = new List<VisitFeedbackReply>();
}

/// <summary>The rep's feedback on a visit (at most one per visit).</summary>
public class VisitFeedback
{
    public const int TextMaxLength = 2000;

    public Guid VisitId { get; set; }
    public string Text { get; set; } = string.Empty;
    public VisitFeedbackCategory? Category { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public ICollection<VisitFeedbackSeen> SeenBy { get; set; } = new List<VisitFeedbackSeen>();
}

/// <summary>Someone in the reporting line marked the feedback as seen. Cleared when the rep changes it.</summary>
public class VisitFeedbackSeen
{
    public Guid VisitId { get; set; }
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public DateTimeOffset SeenAt { get; set; }
}

/// <summary>A short answer from a supervisor or manager, shown to the rep.</summary>
public class VisitFeedbackReply : Entity
{
    public const int TextMaxLength = 500;

    public Guid VisitId { get; set; }
    public Guid AuthorId { get; set; }

    /// <summary>Author's name at the time of the reply.</summary>
    public string AuthorName { get; set; } = string.Empty;

    public string Text { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>A product discussed during a visit, with an optional short note.</summary>
public class VisitProduct
{
    public const int NoteMaxLength = 300;

    public Guid VisitId { get; set; }
    public Guid ProductId { get; set; }
    public string? Note { get; set; }
    public int SortOrder { get; set; }
}

public class VisitPhoto : Entity
{
    public Guid VisitId { get; set; }
    public string StoragePath { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public DateTimeOffset UploadedAt { get; set; }
}
