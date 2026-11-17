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
