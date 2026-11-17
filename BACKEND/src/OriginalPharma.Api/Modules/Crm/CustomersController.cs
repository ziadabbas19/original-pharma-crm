using Microsoft.AspNetCore.Mvc;
using OriginalPharma.Application.Crm;
using OriginalPharma.Application.Identity;
using OriginalPharma.Domain.Crm;
using OriginalPharma.Infrastructure.Identity;

namespace OriginalPharma.Api.Modules.Crm;

/// <summary>Doctors and pharmacies. Read-only for now.</summary>
[ApiController]
[Route("api/customers")]
[Tags("Customers")]
public sealed class CustomersController(CustomerService customers) : ControllerBase
{
    /// <summary>Customers in the caller's territory scope, by name (at most 1000 rows).</summary>
    [HttpGet]
    [HasPermission(Permissions.Customers.Read)]
    public Task<IReadOnlyList<CustomerDto>> List(
        [FromQuery] CustomerType? type,
        [FromQuery] string? search,
        CancellationToken cancellationToken) =>
        customers.ListAsync(type, search, cancellationToken);
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

    /// <summary>Copy or move doctors to a rep's list. Both reps must be in your customers:assign scope.</summary>
    [HttpPost("assign")]
    [HasPermission(Permissions.Customers.Assign)]
    public Task<AssignDoctorsResult> Assign(AssignDoctorsRequest request, CancellationToken cancellationToken) =>
        doctors.AssignAsync(request, cancellationToken);
}
