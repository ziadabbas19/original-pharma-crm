using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Settings;
using OriginalPharma.Application.Tracking.Integrity;
using OriginalPharma.Infrastructure.Identity;

namespace OriginalPharma.Api.Modules.Settings;

/// <summary>Settings edited from the dashboard and stored in the database.</summary>
[ApiController]
[Route("api/settings")]
[Tags("Settings")]
[HasPermission(Permissions.Settings.Manage)]
public sealed class SettingsController(LocationTrustSettingsService locationTrust) : ControllerBase
{
    /// <summary>Location trust thresholds and the mock location policy.</summary>
    [HttpGet("location-trust")]
    public Task<LocationTrustSettingsDto> GetLocationTrust(CancellationToken cancellationToken) =>
        locationTrust.GetDtoAsync(cancellationToken);

    [HttpPut("location-trust")]
    public Task<LocationTrustSettingsDto> UpdateLocationTrust(UpdateLocationTrustSettingsRequest request, CancellationToken cancellationToken) =>
        locationTrust.UpdateAsync(request, cancellationToken);
}

/// <summary>
/// Which blocks the rep app shows on its Home screen, in which order. Every signed-in user reads it (the app
/// loads it on open); changing it needs settings:manage.
/// </summary>
[ApiController]
[Route("api/settings/rep-home")]
[Tags("Settings")]
public sealed class RepHomeSettingsController(RepHomeSettingsService repHome) : ControllerBase
{
    [HttpGet]
    [Authorize]
    public Task<RepHomeSettingsDto> GetRepHome(CancellationToken cancellationToken) =>
        repHome.GetAsync(cancellationToken);

    [HttpPut]
    [HasPermission(Permissions.Settings.Manage)]
    public Task<RepHomeSettingsDto> UpdateRepHome(UpdateRepHomeSettingsRequest request, CancellationToken cancellationToken) =>
        repHome.UpdateAsync(request, cancellationToken);
}
