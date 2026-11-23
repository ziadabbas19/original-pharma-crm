using Microsoft.AspNetCore.Mvc;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Visits;
using OriginalPharma.Infrastructure.Identity;

namespace OriginalPharma.Api.Modules.Visits;

/// <summary>
/// The rep's working day on the Home screen: today's area for the doctor visits (prefilled from the
/// weekly plan), the order of the upcoming doctors, and today's AM places. Days are Egypt days.
/// </summary>
[ApiController]
[Route("api/rep-day")]
[Tags("RepDay")]
public sealed class RepDayController(RepDayService days) : ControllerBase
{
    /// <summary>Today, created on first read from the weekly plan (city and AM places of today's entry).</summary>
    [HttpGet("today")]
    [HasPermission(Permissions.Visits.Create)]
    public Task<RepTodayDto> Today(CancellationToken cancellationToken) => days.GetTodayAsync(cancellationToken);

    /// <summary>Choose the town (or the whole area: empty) of today's doctor visits.</summary>
    [HttpPut("today/area")]
    [HasPermission(Permissions.Visits.Create)]
    public Task<RepTodayDto> SetArea(SetRepDayAreaRequest request, CancellationToken cancellationToken) =>
        days.SetAreaAsync(request, cancellationToken);

    /// <summary>Save the order of today's upcoming doctors.</summary>
    [HttpPut("today/doctor-order")]
    [HasPermission(Permissions.Visits.Create)]
    public Task<RepTodayDto> SetDoctorOrder(SetRepVisitOrderRequest request, CancellationToken cancellationToken) =>
        days.SetDoctorOrderAsync(request, cancellationToken);

    /// <summary>Replace today's AM list (places, order and planned times).</summary>
    [HttpPut("today/am-places")]
    [HasPermission(Permissions.Visits.Create)]
    public Task<RepTodayDto> SetAmPlaces(SetRepAmPlacesRequest request, CancellationToken cancellationToken) =>
        days.SetAmPlacesAsync(request, cancellationToken);
}
