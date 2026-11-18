using Microsoft.AspNetCore.Mvc;
using OriginalPharma.Application.Common.Bulk;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Visits;
using OriginalPharma.Domain.Visits;
using OriginalPharma.Infrastructure.Identity;

namespace OriginalPharma.Api.Modules.Visits;

/// <summary>Visit verification: geofenced check-in/out, photo proof, optional QR scan.</summary>
[ApiController]
[Route("api/visits")]
[Tags("Visits")]
public sealed class VisitsController(VisitService visits) : ControllerBase
{
    /// <summary>Visits in the caller's scope, newest first (default: last 7 days, at most 31 days).</summary>
    /// <param name="mine">Only the caller's own visits (rep app).</param>
    /// <param name="productId">Only visits where this product was discussed.</param>
    /// <param name="archived">Only archived (deleted) visits.</param>
    [HttpGet]
    [HasPermission(Permissions.Visits.Read)]
    public Task<IReadOnlyList<VisitListItemDto>> List(
        [FromQuery] DateTimeOffset? from,
        [FromQuery] DateTimeOffset? to,
        [FromQuery] Guid? userId,
        [FromQuery] VisitStatus? status,
        [FromQuery] bool? needsReview,
        CancellationToken cancellationToken,
        [FromQuery] bool mine = false,
        [FromQuery] Guid? productId = null,
        [FromQuery] VisitFeedbackCategory? feedbackCategory = null,
        [FromQuery] bool? hasFeedback = null,
        [FromQuery] bool archived = false) =>
        visits.ListAsync(from, to, userId, status, needsReview, cancellationToken, mine, productId, feedbackCategory, hasFeedback, archived);

    [HttpPost("check-in")]
    [HasPermission(Permissions.Visits.Create)]
    public Task<VisitDto> CheckIn(CheckInRequest request, CancellationToken cancellationToken) =>
        visits.CheckInAsync(request, cancellationToken);

    [HttpPost("{visitId:guid}/check-out")]
    [HasPermission(Permissions.Visits.Create)]
    public Task<VisitDto> CheckOut(Guid visitId, CheckOutRequest request, CancellationToken cancellationToken) =>
        visits.CheckOutAsync(visitId, request, cancellationToken);

    [HttpPost("{visitId:guid}/photos")]
    [HasPermission(Permissions.Visits.Create)]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<VisitPhotoDto> UploadPhoto(Guid visitId, IFormFile photo, CancellationToken cancellationToken)
    {
        await using var stream = photo.OpenReadStream();
        return await visits.AddPhotoAsync(visitId, stream, photo.ContentType, photo.Length, cancellationToken);
    }

    /// <summary>A visit with feedback, replies and products. Readable within visits:read scope or by the rep's reporting line.</summary>
    [HttpGet("{visitId:guid}")]
    [Microsoft.AspNetCore.Authorization.Authorize]
    public Task<VisitDetailDto> Get(Guid visitId, CancellationToken cancellationToken) =>
        visits.GetAsync(visitId, cancellationToken);

    /// <summary>
    /// Replace the feedback and products of your own visit while it is open (in progress, or within the
    /// edit window after check-out). Safe to retry: an update older than the last applied one is ignored.
    /// </summary>
    [HttpPut("{visitId:guid}/content")]
    [HasPermission(Permissions.Visits.Feedback)]
    public Task<VisitDetailDto> UpdateContent(Guid visitId, UpdateVisitContentRequest request, CancellationToken cancellationToken) =>
        visits.UpdateContentAsync(visitId, request, cancellationToken);

    /// <summary>Answer the rep's feedback (reporting line, or a visits:read scope wider than own).</summary>
    [HttpPost("{visitId:guid}/feedback/replies")]
    [Microsoft.AspNetCore.Authorization.Authorize]
    public Task<VisitDetailDto> Reply(Guid visitId, VisitReplyRequest request, CancellationToken cancellationToken) =>
        visits.ReplyAsync(visitId, request, cancellationToken);

    /// <summary>Mark the feedback as seen (also marks your notifications about it as read).</summary>
    [HttpPost("{visitId:guid}/feedback/seen")]
    [Microsoft.AspNetCore.Authorization.Authorize]
    public Task<VisitDetailDto> MarkFeedbackSeen(Guid visitId, CancellationToken cancellationToken) =>
        visits.MarkFeedbackSeenAsync(visitId, cancellationToken);

    /// <summary>Delete visits (always archived). Visits still in progress are refused.</summary>
    [HttpPost("bulk-delete")]
    [HasPermission(Permissions.Visits.Delete)]
    public Task<BulkResult> BulkDelete(BulkDeleteRequest request, CancellationToken cancellationToken) =>
        visits.DeleteManyAsync(request, cancellationToken);

    [HttpPost("bulk-restore")]
    [HasPermission(Permissions.Visits.Restore)]
    public Task<BulkResult> BulkRestore(BulkIdsRequest request, CancellationToken cancellationToken) =>
        visits.RestoreManyAsync(request, cancellationToken);
}
