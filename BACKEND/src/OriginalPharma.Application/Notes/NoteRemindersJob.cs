using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Notifications;
using OriginalPharma.Application.Tracking;
using OriginalPharma.Domain.Notifications;

namespace OriginalPharma.Application.Notes;

/// <summary>
/// Every minute: fires the note reminders that are due. One UPDATE claims them (sets notified_at) and
/// returns them; rows another run holds are skipped and every row is checked again under its lock, so a
/// reminder fires once even when two runs overlap. The in-app notifications are saved in the same
/// transaction as the claim: if saving fails, nothing is claimed and the next run tries again.
/// </summary>
public sealed class NoteRemindersJob(
    IAppDbContext db,
    NotificationService notifications,
    IPushNotificationSender push,
    TimeProvider time,
    ILogger<NoteRemindersJob> logger)
{
    public const int BatchSize = 500;

    /// <summary>Characters of the note shown in the notification.</summary>
    public const int ExcerptLength = 120;

    private sealed record ClaimedNote(Guid Id, Guid UserId, string? Title, string Body, DateTimeOffset? RemindAt);

    /// <returns>How many reminders fired.</returns>
    public async Task<int> RunAsync(CancellationToken cancellationToken = default)
    {
        var now = time.GetUtcNow();
        IReadOnlyList<ClaimedNote> claimed;
        await using (var transaction = await db.BeginTransactionAsync(cancellationToken))
        {
            claimed = await db.QuerySqlAsync<ClaimedNote>(
                $"""
                UPDATE rep_notes AS n
                SET notified_at = {now}
                WHERE n.id IN (
                        SELECT d.id FROM rep_notes AS d
                        WHERE d.notify_at <= {now} AND d.notified_at IS NULL AND d.done_at IS NULL
                        ORDER BY d.notify_at
                        LIMIT {BatchSize}
                        FOR UPDATE SKIP LOCKED)
                  AND n.notified_at IS NULL AND n.done_at IS NULL
                RETURNING n.id, n.user_id, n.title, n.body, n.remind_at
                """,
                cancellationToken);
            if (claimed.Count == 0)
            {
                return 0;
            }

            foreach (var note in claimed)
            {
                notifications.Queue(note.UserId, NotificationType.NoteReminder, note.Id, new
                {
                    title = note.Title,
                    excerpt = Excerpt(note.Body),
                    remindAt = note.RemindAt,
                });
            }

            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }

        await notifications.PublishQueuedAsync(cancellationToken);
        await PushAsync(claimed, cancellationToken);
        logger.LogInformation("Note reminders: {Count} fired", claimed.Count);
        return claimed.Count;
    }

    /// <summary>The start of the note, cut at <see cref="ExcerptLength"/> characters without splitting a surrogate pair.</summary>
    public static string Excerpt(string body)
    {
        var text = body.Trim();
        if (text.Length <= ExcerptLength)
        {
            return text;
        }

        var cut = char.IsHighSurrogate(text[ExcerptLength - 1]) ? ExcerptLength - 1 : ExcerptLength;
        return text[..cut].TrimEnd();
    }

    /// <summary>Phones of the owners get a data message too (the sender is a stub until FCM is set up).</summary>
    private async Task PushAsync(IReadOnlyList<ClaimedNote> claimed, CancellationToken cancellationToken)
    {
        try
        {
            var users = claimed.Select(n => n.UserId).Distinct().ToArray();
            var tokens = await db.Devices.AsNoTracking()
                .Where(d => users.Contains(d.UserId) && d.PushToken != null)
                .Select(d => new { d.UserId, Token = d.PushToken! })
                .ToListAsync(cancellationToken);
            foreach (var note in claimed)
            {
                var mine = tokens.Where(t => t.UserId == note.UserId).Select(t => t.Token).ToList();
                if (mine.Count == 0)
                {
                    continue;
                }

                await push.SendDataAsync(mine, new Dictionary<string, string>
                {
                    ["type"] = PushMessageTypes.NoteReminder,
                    ["noteId"] = note.Id.ToString(),
                }, cancellationToken);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Could not push note reminders");
        }
    }
}
