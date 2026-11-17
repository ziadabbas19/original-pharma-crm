using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Lookups;
using OriginalPharma.Infrastructure.Identity;

namespace OriginalPharma.Api.Modules.Lookups;

/// <summary>Doctor specialties and order collection methods. Anyone signed in can read; lookups:manage edits.</summary>
[ApiController]
[Route("api/lookups")]
[Tags("Lookups")]
public sealed class LookupsController(LookupService lookups) : ControllerBase
{
    /// <summary>Towns with their area (doctor forms and filters).</summary>
    [HttpGet("towns")]
    [Authorize]
    public Task<List<TownDto>> ListTowns(CancellationToken cancellationToken) =>
        lookups.ListTownsAsync(cancellationToken);

    [HttpGet("specialties")]
    [Authorize]
    public Task<List<LookupDto>> ListSpecialties([FromQuery] bool includeInactive, CancellationToken cancellationToken) =>
        lookups.ListSpecialtiesAsync(includeInactive, cancellationToken);

    [HttpPost("specialties")]
    [HasPermission(Permissions.Lookups.Manage)]
    public Task<LookupDto> CreateSpecialty(SaveLookupRequest request, CancellationToken cancellationToken) =>
        lookups.CreateSpecialtyAsync(request, cancellationToken);

    [HttpPut("specialties/{id:guid}")]
    [HasPermission(Permissions.Lookups.Manage)]
    public Task<LookupDto> UpdateSpecialty(Guid id, SaveLookupRequest request, CancellationToken cancellationToken) =>
        lookups.UpdateSpecialtyAsync(id, request, cancellationToken);

    [HttpGet("collection-methods")]
    [Authorize]
    public Task<List<LookupDto>> ListCollectionMethods([FromQuery] bool includeInactive, CancellationToken cancellationToken) =>
        lookups.ListCollectionMethodsAsync(includeInactive, cancellationToken);

    [HttpPost("collection-methods")]
    [HasPermission(Permissions.Lookups.Manage)]
    public Task<LookupDto> CreateCollectionMethod(SaveLookupRequest request, CancellationToken cancellationToken) =>
        lookups.CreateCollectionMethodAsync(request, cancellationToken);

    [HttpPut("collection-methods/{id:guid}")]
    [HasPermission(Permissions.Lookups.Manage)]
    public Task<LookupDto> UpdateCollectionMethod(Guid id, SaveLookupRequest request, CancellationToken cancellationToken) =>
        lookups.UpdateCollectionMethodAsync(id, request, cancellationToken);
}
