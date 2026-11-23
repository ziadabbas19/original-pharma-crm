using Microsoft.AspNetCore.Mvc;
using OriginalPharma.Api.Common;
using OriginalPharma.Application.Catalog;
using OriginalPharma.Application.Common.Bulk;
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

    /// <summary>
    /// Delete product lines. Their products are never deleted: they stay in the catalog without a line
    /// (<c>usageCount</c> = products that become unassigned). Reps lose the line from their assignments.
    /// </summary>
    [HttpPost("bulk-delete")]
    [HasPermission(Permissions.Products.Delete)]
    public Task<BulkResult> BulkDelete(BulkDeleteRequest request, CancellationToken cancellationToken) =>
        catalog.DeleteLinesAsync(request, cancellationToken);
}

/// <summary>Products with price (EGP), stock and picture. Same line restriction as product lines.</summary>
[ApiController]
[Route("api/products")]
[Tags("Products")]
public sealed class ProductsController(CatalogService catalog) : ControllerBase
{
    /// <param name="includeInactive">Only honoured for products:manage.</param>
    /// <param name="unassigned">Only products without a line (visible to products:manage and orders:manage only).</param>
    /// <param name="archived">Only archived products (products:manage only).</param>
    [HttpGet]
    [HasPermission(Permissions.Products.Read)]
    public Task<IReadOnlyList<ProductDto>> List(
        [FromQuery] Guid? lineId,
        [FromQuery] string? search,
        [FromQuery] bool includeInactive,
        CancellationToken cancellationToken,
        [FromQuery] bool unassigned = false,
        [FromQuery] bool archived = false) =>
        catalog.ListProductsAsync(new ProductQuery(lineId, search, includeInactive, unassigned, archived), cancellationToken);

    /// <summary>Put products in a line, or (no line) take them out of their line.</summary>
    [HttpPost("move-to-line")]
    [HasPermission(Permissions.Products.Manage)]
    public Task<BulkResult> MoveToLine(MoveProductsRequest request, CancellationToken cancellationToken) =>
        catalog.MoveProductsAsync(request, cancellationToken);

    /// <summary>Delete products: those on past orders or visits are archived, unused ones removed.</summary>
    [HttpPost("bulk-delete")]
    [HasPermission(Permissions.Products.Delete)]
    public Task<BulkResult> BulkDelete(BulkDeleteRequest request, CancellationToken cancellationToken) =>
        catalog.DeleteProductsAsync(request, cancellationToken);

    [HttpPost("bulk-restore")]
    [HasPermission(Permissions.Products.Restore)]
    public Task<BulkResult> BulkRestore(BulkIdsRequest request, CancellationToken cancellationToken) =>
        catalog.RestoreProductsAsync(request, cancellationToken);

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

    /// <summary>
    /// Add a brochure page (at most five per product). Compress it before upload: JPEG, WebP or PNG,
    /// at most 1.5 MB. 422 <c>product_images_limit</c>, <c>product_image_too_large</c> or <c>product_image_type</c>.
    /// </summary>
    [HttpPost("{id:guid}/images")]
    [HasPermission(Permissions.Products.Manage)]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(ApiSetup.MaxImageRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = ApiSetup.MaxImageRequestBytes)]
    public async Task<ProductDto> AddBrochureImage(Guid id, IFormFile file, CancellationToken cancellationToken)
    {
        await using var stream = file.OpenReadStream();
        return await catalog.AddBrochureImageAsync(id, stream, cancellationToken);
    }

    /// <summary>A brochure page, for anyone who can read the product. Pages never change: a new upload gets a new id.</summary>
    [HttpGet("{id:guid}/images/{imageId:guid}")]
    [HasPermission(Permissions.Products.Read)]
    [ProducesResponseType(typeof(Stream), StatusCodes.Status200OK, "image/jpeg", "image/webp", "image/png")]
    public async Task<IActionResult> GetBrochureImage(Guid id, Guid imageId, CancellationToken cancellationToken)
    {
        var image = await catalog.OpenBrochureImageAsync(id, imageId, cancellationToken);
        Response.Headers.CacheControl = "private, max-age=31536000, immutable";
        Response.Headers.XContentTypeOptions = "nosniff";
        return File(image.Bytes, image.ContentType);
    }

    [HttpDelete("{id:guid}/images/{imageId:guid}")]
    [HasPermission(Permissions.Products.Manage)]
    public Task<ProductDto> RemoveBrochureImage(Guid id, Guid imageId, CancellationToken cancellationToken) =>
        catalog.RemoveBrochureImageAsync(id, imageId, cancellationToken);

    /// <summary>Put the brochure pages in a new order (send every page id once).</summary>
    [HttpPut("{id:guid}/images/order")]
    [HasPermission(Permissions.Products.Manage)]
    public Task<ProductDto> ReorderBrochureImages(Guid id, ReorderProductImagesRequest request, CancellationToken cancellationToken) =>
        catalog.ReorderBrochureImagesAsync(id, request, cancellationToken);
}
