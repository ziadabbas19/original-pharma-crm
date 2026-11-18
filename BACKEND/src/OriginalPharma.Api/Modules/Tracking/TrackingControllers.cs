using Microsoft.AspNetCore.Mvc;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Bulk;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Tracking;
using OriginalPharma.Domain.Tracking;
using OriginalPharma.Infrastructure.Identity;

namespace OriginalPharma.Api.Modules.Tracking;

public sealed record CurrentShiftResponse(ShiftDto? Shift);

/// <summary>Endpoints the rep's device calls.</summary>
[ApiController]
[Route("api/tracking")]
[Tags("Tracking")]
[HasPermission(Permissions.Tracking.Report)]
public sealed class TrackingController(
    TrackingIngestService ingest,
    TrackingConfigService configService,
    ShiftService shifts,
    DeviceHealthService deviceHealth,
    ConsentService consent,
    ICurrentUser currentUser) : ControllerBase
{
    /// <summary>
    /// Batch upload of location points. Called natively by the Android background
    /// plugin and by the PWA uploader.
    /// </summary>
    [HttpPost("locations")]
    [RequestSizeLimit(2_000_000)]
    public Task<LocationBatchResult> PostLocations(LocationBatchRequest request, CancellationToken cancellationToken) =>
        ingest.IngestAsync(request, cancellationToken);

    /// <summary>Setup wizard check: one fix, evaluated but not stored. Works outside a shift.</summary>
    [HttpPost("test-point")]
    public Task<TestPointResult> PostTestPoint(TestPointRequest request, CancellationToken cancellationToken) =>
        ingest.TestPointAsync(request, cancellationToken);

    /// <summary>Current reporting profile (normal or live). Devices fetch it after a push.</summary>
    [HttpGet("config")]
    public Task<TrackingConfigDto> GetConfig(CancellationToken cancellationToken) =>
        configService.GetConfigAsync(currentUser.RequireUserId(), cancellationToken);

    [HttpGet("shifts/current")]
    public async Task<CurrentShiftResponse> GetCurrentShift(CancellationToken cancellationToken) =>
        new(await shifts.GetCurrentAsync(cancellationToken));

    [HttpPost("shifts/start")]
    public Task<StartShiftResponse> StartShift(StartShiftRequest request, CancellationToken cancellationToken) =>
        shifts.StartAsync(request, cancellationToken);

    [HttpPost("shifts/end")]
    public Task<ShiftDto> EndShift(EndShiftRequest request, CancellationToken cancellationToken) =>
        shifts.EndAsync(request, cancellationToken);

    [HttpPost("device-health")]
    public Task<DeviceHealthResult> ReportDeviceHealth(DeviceHealthReportRequest request, CancellationToken cancellationToken) =>
        deviceHealth.ReportAsync(request, cancellationToken);

    [HttpGet("consent")]
    public Task<ConsentStatusDto> GetConsent(CancellationToken cancellationToken) =>
        consent.GetStatusAsync(cancellationToken);

    [HttpPost("consent")]
    public Task<ConsentStatusDto> RecordConsent(RecordConsentRequest request, CancellationToken cancellationToken) =>
        consent.RecordAsync(request, cancellationToken);
}

/// <summary>Endpoints the supervisor dashboard calls.</summary>
[ApiController]
[Route("api/tracking/monitor")]
[Tags("TrackingMonitor")]
public sealed class TrackingMonitorController(TrackingQueryService queries, LiveViewService liveView) : ControllerBase
{
    [HttpGet("presence")]
    [HasPermission(Permissions.Tracking.ViewLive)]
    public Task<IReadOnlyList<RepPresenceDto>> GetPresence(CancellationToken cancellationToken) =>
        queries.GetPresenceAsync(cancellationToken);

    /// <summary>Start or renew live view of a rep. Call every ~60 s while the view is open.</summary>
    [HttpPost("live-view/{repId:guid}")]
    [HasPermission(Permissions.Tracking.ViewLive)]
    public Task<LiveViewResponse> StartLiveView(Guid repId, CancellationToken cancellationToken) =>
        liveView.StartAsync(repId, cancellationToken);

    [HttpDelete("live-view/{repId:guid}")]
    [HasPermission(Permissions.Tracking.ViewLive)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> StopLiveView(Guid repId, CancellationToken cancellationToken)
    {
        await liveView.StopAsync(repId, cancellationToken);
        return NoContent();
    }

    [HttpGet("flags")]
    [HasPermission(Permissions.Tracking.ReviewFlags)]
    public Task<IReadOnlyList<TrackingFlagDto>> GetFlags([FromQuery] TrackingFlagStatus? status, CancellationToken cancellationToken) =>
        queries.GetFlagsAsync(status, cancellationToken);

    [HttpPost("flags/{flagId:guid}/review")]
    [HasPermission(Permissions.Tracking.ReviewFlags)]
    public Task<TrackingFlagDto> ReviewFlag(Guid flagId, ReviewFlagRequest request, CancellationToken cancellationToken) =>
        queries.ReviewFlagAsync(flagId, request, cancellationToken);

    /// <summary>Rep devices with their latest health report.</summary>
    [HttpGet("devices")]
    [HasPermission(Permissions.Devices.Read)]
    public Task<IReadOnlyList<DeviceDto>> GetDevices([FromQuery] bool? healthy, CancellationToken cancellationToken) =>
        queries.GetDevicesAsync(healthy, cancellationToken);

    /// <summary>Remove device records (lost or replaced phones) with their health history.</summary>
    [HttpPost("devices/bulk-delete")]
    [HasPermission(Permissions.Devices.Delete)]
    public Task<BulkResult> DeleteDevices(BulkDeleteRequest request, CancellationToken cancellationToken) =>
        queries.DeleteDevicesAsync(request, cancellationToken);

    [HttpGet("history/{userId:guid}")]
    [HasPermission(Permissions.Tracking.History)]
    public Task<IReadOnlyList<HistoryPointDto>> GetHistory(
        Guid userId,
        [FromQuery] DateTimeOffset from,
        [FromQuery] DateTimeOffset to,
        CancellationToken cancellationToken) =>
        queries.GetHistoryAsync(userId, from, to, cancellationToken);
}
