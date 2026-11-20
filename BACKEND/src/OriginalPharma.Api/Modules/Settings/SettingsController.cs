using Microsoft.AspNetCore.Mvc;
using OriginalPharma.Application.Identity;
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
