using Microsoft.AspNetCore.Mvc;
using OriginalPharma.Application.Common.Bulk;
using OriginalPharma.Application.Crm;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Lookups;
using OriginalPharma.Domain.Crm;
using OriginalPharma.Infrastructure.Identity;

namespace OriginalPharma.Api.Modules.Crm;

/// <summary>Doctors and pharmacies: list, pharmacy details, delete (archived when used) and restore.</summary>
[ApiController]
[Route("api/customers")]
[Tags("Customers")]
public sealed class CustomersController(CustomerService customers) : ControllerBase
{
    /// <summary>Customers in the caller's territory scope, by name (at most 1000 rows).</summary>
    /// <param name="archived">Only archived customers (true), otherwise only customers that are not archived.</param>
    [HttpGet]
    [HasPermission(Permissions.Customers.Read)]
    public Task<IReadOnlyList<CustomerDto>> List(
        [FromQuery] CustomerType? type,
        [FromQuery] string? search,
        CancellationToken cancellationToken,
        [FromQuery] bool archived = false) =>
        customers.ListAsync(type, search, archived, cancellationToken);

    /// <summary>Towns where you may add a pharmacy (customers:create-pharmacy within its scope).</summary>
    [HttpGet("pharmacy-towns")]
    [HasPermission(Permissions.Customers.CreatePharmacy)]
    public Task<List<TownDto>> PharmacyTowns(CancellationToken cancellationToken) =>
        customers.PharmacyTownsAsync(cancellationToken);

    /// <summary>
    /// Add a pharmacy in a town of your area (customers:create-pharmacy). 409 <c>pharmacy_exists</c> (with
    /// <c>pharmacyId</c>) when the same name exists in that town; 403 <c>pharmacy_town_out_of_scope</c>
    /// for a town outside your scope. The location is saved from the first visit.
    /// </summary>
    [HttpPost("pharmacies")]
    [HasPermission(Permissions.Customers.CreatePharmacy)]
    [ProducesResponseType<CustomerDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict, "application/problem+json")]
    public Task<CustomerDto> CreatePharmacy(CreatePharmacyRequest request, CancellationToken cancellationToken) =>
        customers.CreatePharmacyAsync(request, cancellationToken);

    /// <summary>Edit a pharmacy (doctors are edited through /api/doctors).</summary>
    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.Customers.Manage)]
    public Task<CustomerDto> Update(Guid id, UpdateCustomerRequest request, CancellationToken cancellationToken) =>
        customers.UpdateAsync(id, request, cancellationToken);

    /// <summary>Delete doctors and pharmacies: archived when visits or orders point at them, otherwise removed.</summary>
    [HttpPost("bulk-delete")]
    [HasPermission(Permissions.Customers.Delete)]
    public Task<BulkResult> BulkDelete(BulkDeleteRequest request, CancellationToken cancellationToken) =>
        customers.DeleteManyAsync(request, cancellationToken);

    [HttpPost("bulk-restore")]
    [HasPermission(Permissions.Customers.Restore)]
    public Task<BulkResult> BulkRestore(BulkIdsRequest request, CancellationToken cancellationToken) =>
        customers.RestoreManyAsync(request, cancellationToken);
}

/// <summary>
/// Reps' doctor lists. Reps work on their own list (customers:create); supervisors and managers
/// see the lists in their customers:read scope and move or copy doctors (customers:assign).
/// </summary>
[ApiController]
[Route("api/doctors")]
[Tags("Doctors")]
public sealed class DoctorsController(DoctorService doctors) : ControllerBase
{
    /// <summary>Doctors visible to the caller (at most 1000), by name. <c>mine=true</c> is the caller's own list.</summary>
    [HttpGet]
    [HasPermission(Permissions.Customers.Read)]
    public Task<IReadOnlyList<DoctorDto>> List([FromQuery] DoctorQuery query, CancellationToken cancellationToken) =>
        doctors.ListAsync(query, cancellationToken);

    [HttpGet("{id:guid}")]
    [HasPermission(Permissions.Customers.Read)]
    public Task<DoctorDto> Get(Guid id, CancellationToken cancellationToken) =>
        doctors.GetAsync(id, cancellationToken);

    /// <summary>
    /// The clinic location (with where it came from) and where each visit to the doctor was recorded, with
    /// the distances stored on the visit. Only visits in your visits:read scope are listed.
    /// </summary>
    [HttpGet("{id:guid}/location-history")]
    [HasPermission(Permissions.Customers.Read)]
    public Task<DoctorLocationHistoryDto> LocationHistory(Guid id, CancellationToken cancellationToken) =>
        doctors.LocationHistoryAsync(id, cancellationToken);

    /// <summary>Search every active doctor (name, town, specialty) to add an existing one to your list.</summary>
    [HttpGet("directory")]
    [HasPermission(Permissions.Customers.Create)]
    public Task<IReadOnlyList<DoctorDto>> SearchDirectory(
        [FromQuery] string? search,
        [FromQuery] Guid? townId,
        [FromQuery] Guid? specialtyId,
        CancellationToken cancellationToken) =>
        doctors.SearchDirectoryAsync(search, townId, specialtyId, cancellationToken);

    /// <summary>
    /// Create a doctor and put it on your list (or another rep's with customers:assign).
    /// 409 <c>doctor_exists</c> (with <c>doctorId</c>) when the same name exists in that town.
    /// </summary>
    [HttpPost]
    [HasPermission(Permissions.Customers.Create)]
    public Task<DoctorDto> Create(CreateDoctorRequest request, CancellationToken cancellationToken) =>
        doctors.CreateAsync(request, cancellationToken);

    /// <summary>Edit details: customers:manage within scope, or customers:create for doctors on your own list.</summary>
    [HttpPut("{id:guid}")]
    [Microsoft.AspNetCore.Authorization.Authorize]
    public Task<DoctorDto> Update(Guid id, UpdateDoctorRequest request, CancellationToken cancellationToken) =>
        doctors.UpdateAsync(id, request, cancellationToken);

    [HttpPost("{id:guid}/my-list")]
    [HasPermission(Permissions.Customers.Create)]
    public Task<DoctorDto> AddToMyList(Guid id, CancellationToken cancellationToken) =>
        doctors.AddToMyListAsync(id, cancellationToken);

    [HttpDelete("{id:guid}/my-list")]
    [HasPermission(Permissions.Customers.Create)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> RemoveFromMyList(Guid id, CancellationToken cancellationToken)
    {
        await doctors.RemoveFromMyListAsync(id, cancellationToken);
        return NoContent();
    }

    /// <summary>Take doctors off your own list (they stay in the directory and on other reps' lists).</summary>
    [HttpPost("my-list/bulk-remove")]
    [HasPermission(Permissions.Customers.Create)]
    public Task<BulkResult> RemoveManyFromMyList(BulkIdsRequest request, CancellationToken cancellationToken) =>
        doctors.RemoveManyFromMyListAsync(request, cancellationToken);

    /// <summary>Copy or move doctors to a rep's list. Both reps must be in your customers:assign scope.</summary>
    [HttpPost("assign")]
    [HasPermission(Permissions.Customers.Assign)]
    public Task<AssignDoctorsResult> Assign(AssignDoctorsRequest request, CancellationToken cancellationToken) =>
        doctors.AssignAsync(request, cancellationToken);
}
