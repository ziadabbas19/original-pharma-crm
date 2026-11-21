namespace OriginalPharma.Domain.Notifications;

public enum NotificationType
{
    OrderApproved = 1,
    OrderRejected = 2,
    OrderCancelled = 3,
    OrderDelivered = 4,

    /// <summary>A rep in the recipient's reporting line wrote or changed visit feedback.</summary>
    VisitFeedback = 5,

    /// <summary>A supervisor or manager answered the recipient's visit feedback.</summary>
    VisitFeedbackReply = 6,

    /// <summary>
    /// A rep the recipient supervises was flagged for a suspicious location. <see cref="Notification.EntityId"/>
    /// is the rep, so repeats can be throttled per rep.
    /// </summary>
    SuspiciousLocation = 7,

    /// <summary>A rep the recipient may review sent their weekly plan. <see cref="Notification.EntityId"/> is the plan.</summary>
    PlanSubmitted = 8,

    /// <summary>A reviewer approved the recipient's weekly plan (with an optional note).</summary>
    PlanApproved = 9,

    /// <summary>A reviewer returned (or reopened) the recipient's weekly plan with a note.</summary>
    PlanReturned = 10,
}

/// <summary>
/// In-app notification for one user. The text is built by the apps from <see cref="Type"/> and
/// <see cref="Data"/>, so it follows the reader's language.
/// </summary>
public class Notification
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    /// <summary>The recipient. Every query filters on it; nobody reads another user's notifications.</summary>
    public Guid UserId { get; set; }

    public NotificationType Type { get; set; }

    /// <summary>The order, visit, weekly plan or (for suspicious locations) rep the notification is about.</summary>
    public Guid? EntityId { get; set; }

    /// <summary>JSON object with the values the text needs (order number, reason, names).</summary>
    public string Data { get; set; } = "{}";

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ReadAt { get; set; }
}
