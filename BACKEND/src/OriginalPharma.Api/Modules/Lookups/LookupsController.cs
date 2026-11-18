using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OriginalPharma.Application.Common.Bulk;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Lookups;
using OriginalPharma.Infrastructure.Identity;

namespace OriginalPharma.Api.Modules.Lookups;

/// <summary>
/// Doctor specialties and order collection methods. Anyone signed in can read; lookups:manage edits,
/// lookups:delete deletes (archived while in use), lookups:restore brings archived entries back.
/// </summary>
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

    /// <param name="archived">Only archived entries (true), otherwise only entries that are not archived.</param>
    [HttpGet("specialties")]
    [Authorize]
    public Task<List<LookupDto>> ListSpecialties([FromQuery] bool includeInactive, CancellationToken cancellationToken, [FromQuery] bool archived = false) =>
        lookups.ListSpecialtiesAsync(includeInactive, archived, cancellationToken);

    [HttpPost("specialties")]
    [HasPermission(Permissions.Lookups.Manage)]
    public Task<LookupDto> CreateSpecialty(SaveLookupRequest request, CancellationToken cancellationToken) =>
        lookups.CreateSpecialtyAsync(request, cancellationToken);

    [HttpPut("specialties/{id:guid}")]
    [HasPermission(Permissions.Lookups.Manage)]
    public Task<LookupDto> UpdateSpecialty(Guid id, SaveLookupRequest request, CancellationToken cancellationToken) =>
        lookups.UpdateSpecialtyAsync(id, request, cancellationToken);

    /// <summary>Delete specialties: unused ones are removed, those doctors use are archived. <c>dryRun</c> only reports.</summary>
    [HttpPost("specialties/bulk-delete")]
    [HasPermission(Permissions.Lookups.Delete)]
    public Task<BulkResult> DeleteSpecialties(BulkDeleteRequest request, CancellationToken cancellationToken) =>
        lookups.DeleteSpecialtiesAsync(request, cancellationToken);

    [HttpPost("specialties/bulk-restore")]
    [HasPermission(Permissions.Lookups.Restore)]
    public Task<BulkResult> RestoreSpecialties(BulkIdsRequest request, CancellationToken cancellationToken) =>
        lookups.RestoreSpecialtiesAsync(request, cancellationToken);

    /// <param name="archived">Only archived entries (true), otherwise only entries that are not archived.</param>
    [HttpGet("collection-methods")]
    [Authorize]
    public Task<List<LookupDto>> ListCollectionMethods([FromQuery] bool includeInactive, CancellationToken cancellationToken, [FromQuery] bool archived = false) =>
        lookups.ListCollectionMethodsAsync(includeInactive, archived, cancellationToken);

    /// <summary>Delete collection methods: unused ones are removed, those past orders use are archived.</summary>
    [HttpPost("collection-methods/bulk-delete")]
    [HasPermission(Permissions.Lookups.Delete)]
    public Task<BulkResult> DeleteCollectionMethods(BulkDeleteRequest request, CancellationToken cancellationToken) =>
        lookups.DeleteCollectionMethodsAsync(request, cancellationToken);

    [HttpPost("collection-methods/bulk-restore")]
    [HasPermission(Permissions.Lookups.Restore)]
    public Task<BulkResult> RestoreCollectionMethods(BulkIdsRequest request, CancellationToken cancellationToken) =>
        lookups.RestoreCollectionMethodsAsync(request, cancellationToken);

    [HttpPost("collection-methods")]
    [HasPermission(Permissions.Lookups.Manage)]
    public Task<LookupDto> CreateCollectionMethod(SaveLookupRequest request, CancellationToken cancellationToken) =>
        lookups.CreateCollectionMethodAsync(request, cancellationToken);

    [HttpPut("collection-methods/{id:guid}")]
    [HasPermission(Permissions.Lookups.Manage)]
    public Task<LookupDto> UpdateCollectionMethod(Guid id, SaveLookupRequest request, CancellationToken cancellationToken) =>
        lookups.UpdateCollectionMethodAsync(id, request, cancellationToken);
}
