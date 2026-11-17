using Microsoft.AspNetCore.Mvc;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Orders;
using OriginalPharma.Infrastructure.Identity;

namespace OriginalPharma.Api.Modules.Orders;

/// <summary>
/// Sales orders. Totals are computed on the server; a client-generated <c>clientRequestId</c>
/// makes creation idempotent so the offline outbox can retry safely.
/// </summary>
[ApiController]
[Route("api/orders")]
[Tags("Orders")]
public sealed class OrdersController(OrderService orders) : ControllerBase
{
    /// <summary>Orders in the caller's orders:read scope, newest first (at most 1000).</summary>
    [HttpGet]
    [HasPermission(Permissions.Orders.Read)]
    public Task<IReadOnlyList<OrderListItemDto>> List([FromQuery] OrderQuery query, CancellationToken cancellationToken) =>
        orders.ListAsync(query, cancellationToken);

    /// <summary>The same filters as the list, as a CSV file (UTF-8). <c>lang</c> = ar or en for headers and labels.</summary>
    [HttpGet("export")]
    [HasPermission(Permissions.Orders.Read)]
    [Produces("text/csv")]
    [ProducesResponseType(typeof(Stream), StatusCodes.Status200OK, "text/csv")]
    public async Task<IActionResult> Export([FromQuery] OrderQuery query, [FromQuery] string? lang, CancellationToken cancellationToken)
    {
        var csv = await orders.ExportCsvAsync(query, lang ?? "en", cancellationToken);
        return File(csv, "text/csv; charset=utf-8", $"orders-{DateTime.UtcNow:yyyyMMdd-HHmm}.csv");
    }

    /// <summary>Place names for the order form: used before in visible orders, plus known pharmacies.</summary>
    [HttpGet("places")]
    [HasPermission(Permissions.Orders.Create)]
    public Task<IReadOnlyList<PlaceSuggestionDto>> Places([FromQuery] string? search, CancellationToken cancellationToken) =>
        orders.SuggestPlacesAsync(search, cancellationToken);

    [HttpGet("{id:guid}")]
    [HasPermission(Permissions.Orders.Read)]
    public Task<OrderDto> Get(Guid id, CancellationToken cancellationToken) =>
        orders.GetAsync(id, cancellationToken);

    /// <summary>
    /// Take an order. Sending the same <c>clientRequestId</c> again returns the existing order.
    /// 422 <c>discount_above_cap</c> (with <c>maxDiscountPercent</c>) or <c>product_unavailable</c>.
    /// Quantities above stock are accepted and reported in <c>stockWarnings</c>.
    /// </summary>
    [HttpPost]
    [HasPermission(Permissions.Orders.Create)]
    public Task<OrderDto> Create(CreateOrderRequest request, CancellationToken cancellationToken) =>
        orders.CreateAsync(request, cancellationToken);

    /// <summary>Edit a submitted order: your own (orders:create) or one in your orders:manage scope.</summary>
    [HttpPut("{id:guid}")]
    [Microsoft.AspNetCore.Authorization.Authorize]
    public Task<OrderDto> Update(Guid id, UpdateOrderRequest request, CancellationToken cancellationToken) =>
        orders.UpdateAsync(id, request, cancellationToken);

    [HttpPost("{id:guid}/approve")]
    [HasPermission(Permissions.Orders.Manage)]
    public Task<OrderDto> Approve(Guid id, OrderStatusRequest request, CancellationToken cancellationToken) =>
        orders.ApproveAsync(id, request, cancellationToken);

    /// <summary>Reject a submitted order; a reason is required.</summary>
    [HttpPost("{id:guid}/reject")]
    [HasPermission(Permissions.Orders.Manage)]
    public Task<OrderDto> Reject(Guid id, OrderStatusRequest request, CancellationToken cancellationToken) =>
        orders.RejectAsync(id, request, cancellationToken);

    /// <summary>Cancel: your own submitted order, or (orders:manage) a submitted or approved one in scope.</summary>
    [HttpPost("{id:guid}/cancel")]
    [Microsoft.AspNetCore.Authorization.Authorize]
    public Task<OrderDto> Cancel(Guid id, OrderStatusRequest request, CancellationToken cancellationToken) =>
        orders.CancelAsync(id, request, cancellationToken);
}
