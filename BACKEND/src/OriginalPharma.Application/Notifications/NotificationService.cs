using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Bulk;
using OriginalPharma.Domain.Notifications;

namespace OriginalPharma.Application.Notifications;

/// <param name="Data">Values the text is built from (order number, reason or note, names). Shape depends on <paramref name="Type"/>.</param>
public sealed record NotificationDto(
    Guid Id,
    NotificationType Type,
    Guid? EntityId,
    JsonElement Data,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ReadAt);

public sealed record NotificationCountDto(int Unread);

public sealed record NotificationQuery(bool UnreadOnly = false, int Limit = 50);

/// <summary>Live delivery of a new notification to the recipient's open apps (SignalR in the API).</summary>
public interface INotificationPublisher
{
    Task PublishAsync(Guid userId, NotificationDto notification, CancellationToken cancellationToken = default);
}

/// <summary>
/// In-app notifications. Every read and change is limited to the caller's own rows, filtered on the
/// server. Other services queue notifications in the same unit of work as the change they announce
/// (<see cref="Queue"/>) and publish them after saving (<see cref="PublishQueuedAsync"/>).
/// Push to phones (FCM) stays off: the push sender is still a stub.
/// </summary>
public sealed class NotificationService(
    IAppDbContext db,
    ICurrentUser currentUser,
    INotificationPublisher publisher,
    TimeProvider time,
    ILogger<NotificationService> logger)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly List<Notification> _queued = [];

    public const int MaxListRows = 200;

    public void Queue(Guid recipientId, NotificationType type, Guid? entityId, object data)
    {
        var notification = new Notification
        {
            UserId = recipientId,
            Type = type,
            EntityId = entityId,
            Data = JsonSerializer.Serialize(data, Json),
            CreatedAt = time.GetUtcNow(),
        };
        db.Notifications.Add(notification);
        _queued.Add(notification);
    }

    /// <summary>Sends the queued notifications to connected apps. A failure here never undoes the change.</summary>
    public async Task PublishQueuedAsync(CancellationToken cancellationToken = default)
    {
        var batch = _queued.ToList();
        _queued.Clear();
        foreach (var notification in batch)
        {
            try
            {
                await publisher.PublishAsync(notification.UserId, ToDto(notification), cancellationToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Could not publish notification {NotificationId}", notification.Id);
            }
        }
    }

    public async Task<IReadOnlyList<NotificationDto>> ListAsync(NotificationQuery query, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var rows = await db.Notifications.AsNoTracking()
            .Where(n => n.UserId == me && (!query.UnreadOnly || n.ReadAt == null))
            .OrderByDescending(n => n.CreatedAt).ThenByDescending(n => n.Id)
            .Take(Math.Clamp(query.Limit, 1, MaxListRows))
            .ToListAsync(cancellationToken);
        return rows.Select(ToDto).ToList();
    }

    public async Task<NotificationCountDto> CountUnreadAsync(CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        return new NotificationCountDto(await db.Notifications.CountAsync(n => n.UserId == me && n.ReadAt == null, cancellationToken));
    }

    /// <summary>Marks the caller's notifications as read; ids of other users count as not found.</summary>
    public async Task<BulkResult> MarkReadAsync(BulkIdsRequest request, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var ids = request.Ids.Distinct().ToArray();
        var rows = await db.Notifications.Where(n => n.UserId == me && ids.Contains(n.Id)).ToDictionaryAsync(n => n.Id, cancellationToken);
        var now = time.GetUtcNow();
        foreach (var row in rows.Values)
        {
            row.ReadAt ??= now;
        }

        await db.SaveChangesAsync(cancellationToken);
        return BulkResult.From(
            ids.Select(id => rows.ContainsKey(id) ? new BulkItemResult(id, BulkOutcome.Updated) : new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.NotFound)).ToList(),
            false);
    }

    public async Task<int> MarkAllReadAsync(CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var now = time.GetUtcNow();
        return await db.Notifications.Where(n => n.UserId == me && n.ReadAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.ReadAt, now), cancellationToken);
    }

    /// <summary>Deletes the caller's own notifications (nothing else depends on them).</summary>
    public async Task<BulkResult> DeleteManyAsync(BulkDeleteRequest request, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var ids = request.Ids.Distinct().ToArray();
        var rows = await db.Notifications.Where(n => n.UserId == me && ids.Contains(n.Id)).ToDictionaryAsync(n => n.Id, cancellationToken);
        if (!request.DryRun && rows.Count > 0)
        {
            db.Notifications.RemoveRange(rows.Values);
            await db.SaveChangesAsync(cancellationToken);
        }

        return BulkResult.From(
            ids.Select(id => rows.ContainsKey(id) ? new BulkItemResult(id, BulkOutcome.Deleted) : new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.NotFound)).ToList(),
            request.DryRun);
    }

    /// <summary>Marks the caller's notifications about one order or visit as read (opening it counts as reading them).</summary>
    public Task MarkEntityReadAsync(Guid userId, Guid entityId, CancellationToken cancellationToken = default)
    {
        var now = time.GetUtcNow();
        return db.Notifications.Where(n => n.UserId == userId && n.EntityId == entityId && n.ReadAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.ReadAt, now), cancellationToken);
    }

    private static NotificationDto ToDto(Notification n) =>
        new(n.Id, n.Type, n.EntityId, JsonDocument.Parse(n.Data).RootElement.Clone(), n.CreatedAt, n.ReadAt);
}
