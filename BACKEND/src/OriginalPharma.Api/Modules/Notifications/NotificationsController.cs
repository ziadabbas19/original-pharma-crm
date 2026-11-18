using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OriginalPharma.Application.Common.Bulk;
using OriginalPharma.Application.Notifications;

namespace OriginalPharma.Api.Modules.Notifications;

/// <summary>The caller's own in-app notifications (order decisions, deliveries, visit feedback and replies).</summary>
[ApiController]
[Route("api/notifications")]
[Tags("Notifications")]
[Authorize]
public sealed class NotificationsController(NotificationService notifications) : ControllerBase
{
    /// <summary>Newest first (at most 200).</summary>
    [HttpGet]
    public Task<IReadOnlyList<NotificationDto>> List([FromQuery] bool unreadOnly, CancellationToken cancellationToken, [FromQuery] int limit = 50) =>
        notifications.ListAsync(new NotificationQuery(unreadOnly, limit), cancellationToken);

    [HttpGet("unread-count")]
    public Task<NotificationCountDto> UnreadCount(CancellationToken cancellationToken) =>
        notifications.CountUnreadAsync(cancellationToken);

    [HttpPost("read")]
    public Task<BulkResult> MarkRead(BulkIdsRequest request, CancellationToken cancellationToken) =>
        notifications.MarkReadAsync(request, cancellationToken);

    [HttpPost("read-all")]
    public async Task<NotificationCountDto> MarkAllRead(CancellationToken cancellationToken)
    {
        await notifications.MarkAllReadAsync(cancellationToken);
        return await notifications.CountUnreadAsync(cancellationToken);
    }

    [HttpPost("bulk-delete")]
    public Task<BulkResult> BulkDelete(BulkDeleteRequest request, CancellationToken cancellationToken) =>
        notifications.DeleteManyAsync(request, cancellationToken);
}
