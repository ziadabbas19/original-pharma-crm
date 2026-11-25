using OriginalPharma.Domain.Common;

namespace OriginalPharma.Domain.Notes;

/// <summary>
/// A private note of one user, with an optional reminder. Only its owner reads or changes it. The reminder
/// fires once at <see cref="NotifyAt"/> (the reminder time minus how long before it the owner wants to
/// hear about it); <see cref="NotifiedAt"/> records that it fired, and changing the reminder, snoozing or
/// reopening clears it so the reminder can fire again. Done notes never fire.
/// </summary>
public class RepNote : Entity
{
    public const int TitleMaxLength = 120;
    public const int BodyMaxLength = 4000;

    /// <summary>One week: the longest "notify me before" the app offers (custom minutes included).</summary>
    public const int MaxRemindBeforeMinutes = 10_080;

    public Guid UserId { get; set; }

    /// <summary>Chosen by the phone when the note is written (offline too): sending it again returns the same note.</summary>
    public Guid ClientRequestId { get; set; }

    public string? Title { get; set; }
    public string Body { get; set; } = string.Empty;

    /// <summary>The time the reminder is about.</summary>
    public DateTimeOffset? RemindAt { get; set; }

    /// <summary>How many minutes before <see cref="RemindAt"/> the owner is notified (0 = at the time).</summary>
    public int? RemindBeforeMinutes { get; set; }

    /// <summary><see cref="RemindAt"/> minus <see cref="RemindBeforeMinutes"/>; null without a reminder.</summary>
    public DateTimeOffset? NotifyAt { get; set; }

    public DateTimeOffset? NotifiedAt { get; set; }
    public DateTimeOffset? DoneAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public static DateTimeOffset? ComputeNotifyAt(DateTimeOffset? remindAt, int? beforeMinutes) =>
        remindAt?.AddMinutes(-Math.Max(0, beforeMinutes ?? 0));

    /// <summary>Sets (or removes) the reminder, to the whole second. A changed reminder may fire again.</summary>
    public void SetReminder(DateTimeOffset? remindAt, int? beforeMinutes)
    {
        remindAt = WholeSeconds(remindAt);
        var before = remindAt is null ? null : (int?)Math.Max(0, beforeMinutes ?? 0);
        var notifyAt = ComputeNotifyAt(remindAt, before);
        if (remindAt == RemindAt && before == RemindBeforeMinutes && notifyAt == NotifyAt)
        {
            return;
        }

        RemindAt = remindAt;
        RemindBeforeMinutes = before;
        NotifyAt = notifyAt;
        NotifiedAt = null;
    }

    private static DateTimeOffset? WholeSeconds(DateTimeOffset? value) =>
        value is { } v ? new DateTimeOffset(v.UtcTicks - (v.UtcTicks % TimeSpan.TicksPerSecond), TimeSpan.Zero) : null;
}
