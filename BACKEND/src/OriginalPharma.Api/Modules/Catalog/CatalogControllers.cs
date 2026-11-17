using Microsoft.AspNetCore.Mvc;
using OriginalPharma.Api.Common;
using OriginalPharma.Application.Catalog;
using OriginalPharma.Application.Identity;
using OriginalPharma.Infrastructure.Identity;

namespace OriginalPharma.Api.Modules.Catalog;

/// <summary>
/// Product lines. Users without orders:manage or products:manage only see the lines assigned to them.
/// </summary>
[ApiController]
[Route("api/product-lines")]
[Tags("ProductLines")]
public sealed class ProductLinesController(CatalogService catalog) : ControllerBase
{
    /// <param name="includeInactive">Only honoured for products:manage.</param>
    [HttpGet]
    [HasPermission(Permissions.Products.Read)]
    public Task<IReadOnlyList<ProductLineDto>> List([FromQuery] bool includeInactive, CancellationToken cancellationToken) =>
        catalog.ListLinesAsync(includeInactive, cancellationToken);

    [HttpPost]
    [HasPermission(Permissions.Products.Manage)]
    public Task<ProductLineDto> Create(SaveProductLineRequest request, CancellationToken cancellationToken) =>
        catalog.CreateLineAsync(request, cancellationToken);

    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.Products.Manage)]
    public Task<ProductLineDto> Update(Guid id, SaveProductLineRequest request, CancellationToken cancellationToken) =>
        catalog.UpdateLineAsync(id, request, cancellationToken);
}

/// <summary>Products with price (EGP), stock and picture. Same line restriction as product lines.</summary>
[ApiController]
[Route("api/products")]
[Tags("Products")]
public sealed class ProductsController(CatalogService catalog) : ControllerBase
{
    /// <param name="includeInactive">Only honoured for products:manage.</param>
    [HttpGet]
    [HasPermission(Permissions.Products.Read)]
    public Task<IReadOnlyList<ProductDto>> List(
        [FromQuery] Guid? lineId,
        [FromQuery] string? search,
        [FromQuery] bool includeInactive,
        CancellationToken cancellationToken) =>
        catalog.ListProductsAsync(lineId, search, includeInactive, cancellationToken);

    [HttpPost]
    [HasPermission(Permissions.Products.Manage)]
    public Task<ProductDto> Create(SaveProductRequest request, CancellationToken cancellationToken) =>
        catalog.CreateProductAsync(request, cancellationToken);

    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.Products.Manage)]
    public Task<ProductDto> Update(Guid id, SaveProductRequest request, CancellationToken cancellationToken) =>
        catalog.UpdateProductAsync(id, request, cancellationToken);

    /// <summary>Upload the product picture (JPEG, PNG or WebP, max 5 MB). Stored as WebP in two sizes.</summary>
    [HttpPut("{id:guid}/image")]
    [HasPermission(Permissions.Products.Manage)]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(ApiSetup.MaxImageRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = ApiSetup.MaxImageRequestBytes)]
    public async Task<ProductDto> SetImage(Guid id, IFormFile file, CancellationToken cancellationToken)
    {
        await using var stream = file.OpenReadStream();
        return await catalog.SetImageAsync(id, stream, cancellationToken);
    }

    [HttpDelete("{id:guid}/image")]
    [HasPermission(Permissions.Products.Manage)]
    public Task<ProductDto> RemoveImage(Guid id, CancellationToken cancellationToken) =>
        catalog.RemoveImageAsync(id, cancellationToken);
}
