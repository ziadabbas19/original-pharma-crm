using Microsoft.AspNetCore.Mvc;
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
    [HttpGet]
    [HasPermission(Permissions.Visits.Read)]
    public Task<IReadOnlyList<VisitListItemDto>> List(
        [FromQuery] DateTimeOffset? from,
        [FromQuery] DateTimeOffset? to,
        [FromQuery] Guid? userId,
        [FromQuery] VisitStatus? status,
        [FromQuery] bool? needsReview,
        CancellationToken cancellationToken) =>
        visits.ListAsync(from, to, userId, status, needsReview, cancellationToken);

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

    [HttpGet("{visitId:guid}")]
    [HasPermission(Permissions.Visits.Read)]
    public Task<VisitDto> Get(Guid visitId, CancellationToken cancellationToken) =>
        visits.GetAsync(visitId, cancellationToken);
}
