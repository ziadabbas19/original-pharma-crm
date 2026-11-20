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

/// <summary>What happened to the clinic location at check-in.</summary>
public enum ClinicLocationOutcome
{
    /// <summary>The customer had a saved location and the check-in was measured against it.</summary>
    Compared = 1,

    /// <summary>The customer had no location; this check-in's fix became it.</summary>
    SavedAsClinic = 2,

    /// <summary>The customer had no location and the fix was not good enough to keep (the next visit tries again).</summary>
    NotSaved = 3,
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

    /// <summary>The device timestamp exactly as sent (<see cref="CheckInAt"/> is the same, but never ahead of the server).</summary>
    public DateTimeOffset? CheckInDeviceTime { get; set; }

    /// <summary>Device signal codes at check-in (mock app selected, emulator, root, ...).</summary>
    public List<string> CheckInSignalCodes { get; set; } = [];

    /// <summary>
    /// The check-in fix is good enough to serve as a reference for later visits: no mock flag, no
    /// spoofing or emulator signals, and accuracy within the weak-fix setting of that moment.
    /// </summary>
    public bool CheckInGoodFix { get; set; }

    public ClinicLocationOutcome ClinicLocationOutcome { get; set; } = ClinicLocationOutcome.Compared;

    /// <summary>Distance from the saved clinic location at check-in (null when there was none to compare with).</summary>
    public double? ClinicDistanceMeters { get; set; }

    /// <summary>The latest earlier visit to the same customer with a good fix (any rep).</summary>
    public Guid? PreviousVisitId { get; set; }

    public double? PreviousVisitDistanceMeters { get; set; }

    /// <summary>Time between the previous visit's check-in and this one.</summary>
    public double? SincePreviousVisitSeconds { get; set; }

    /// <summary>Distance from the median position of the earlier good visits (only with at least two of them).</summary>
    public double? MedianDistanceMeters { get; set; }

    /// <summary>Distance to the closest earlier good visit.</summary>
    public double? NearestVisitDistanceMeters { get; set; }

    /// <summary>How many earlier good visits the comparison used.</summary>
    public int ReferenceVisitCount { get; set; }

    /// <summary>The check-in is further than the drift settings allow from the clinic or the earlier visits.</summary>
    public bool LocationDrift { get; set; }

    /// <summary>Which comparisons exceeded the drift settings: clinic, median, previous.</summary>
    public List<string> DriftSources { get; set; } = [];

    public DateTimeOffset? CheckOutAt { get; set; }
    public DateTimeOffset? CheckOutReceivedAt { get; set; }
    public Point? CheckOutLocation { get; set; }
    public double? CheckOutAccuracy { get; set; }
    public double? CheckOutDistanceMeters { get; set; }
    public bool? CheckOutWithinGeofence { get; set; }
    public bool? CheckOutIsMock { get; set; }

    public DateTimeOffset? CheckOutDeviceTime { get; set; }

    /// <summary>Device signal codes at check-out.</summary>
    public List<string> CheckOutSignalCodes { get; set; } = [];

    /// <summary>Idempotency key of the check-out, so a retry from the app's outbox is answered instead of refused.</summary>
    public Guid? CheckOutClientRequestId { get; set; }

    public bool QrVerified { get; set; }
    public string? Notes { get; set; }

    /// <summary>True when something about the visit needs a supervisor's eye.</summary>
    public bool NeedsReview { get; set; }

    /// <summary>
    /// Location trust reasons decided at check-in or check-out with the settings of that moment
    /// (far-from-doctor, low-trust). The geofence, mock and missing-location reasons come from the
    /// columns above.
    /// </summary>
    public List<string> TrustReasons { get; set; } = [];

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
