using FluentValidation;
using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Auditing;
using OriginalPharma.Application.Common.Bulk;
using OriginalPharma.Application.Common.Images;
using OriginalPharma.Application.Identity;
using OriginalPharma.Domain.Audit;
using OriginalPharma.Domain.Catalog;

namespace OriginalPharma.Application.Catalog;

/// <param name="DefaultDiscountPercent">Filled in on new order lines for the line's products (a product's own default wins).</param>
/// <param name="MaxDiscountPercent">Upper limit for the line's products (the product limit and the role cap also apply).</param>
public sealed record ProductLineDto(
    Guid Id,
    string NameAr,
    string NameEn,
    string? Description,
    bool IsActive,
    int ProductCount,
    decimal? DefaultDiscountPercent = null,
    decimal? MaxDiscountPercent = null,
    int RepCount = 0);

public sealed record SaveProductLineRequest(
    string NameAr,
    string NameEn,
    string? Description,
    bool IsActive = true,
    decimal? DefaultDiscountPercent = null,
    decimal? MaxDiscountPercent = null);

/// <summary>A brochure page of a product. <paramref name="Url"/> needs a signed-in user who can read the product.</summary>
public sealed record ProductImageDto(Guid Id, int Position, string ContentType, int SizeBytes, string Url);

/// <param name="ProductLineId">Null for an unassigned product (seen only by users not limited to specific lines).</param>
/// <param name="Price">Unit price in EGP.</param>
/// <param name="ImageUrl">Display size (about 1024 px).</param>
/// <param name="ThumbnailUrl">List size (about 320 px).</param>
/// <param name="EffectiveDefaultDiscountPercent">The product's default, else the line's default.</param>
/// <param name="EffectiveMaxDiscountPercent">The lower of the product and line limits (the role cap is applied on top).</param>
/// <param name="UsageCount">Order lines and visits that mention the product (it is archived instead of deleted).</param>
/// <param name="Images">Brochure pages in order (at most five).</param>
public sealed record ProductDto(
    Guid Id,
    Guid? ProductLineId,
    string? LineNameAr,
    string? LineNameEn,
    string NameAr,
    string NameEn,
    string? Description,
    decimal Price,
    int StockQuantity,
    string? ImageUrl,
    string? ThumbnailUrl,
    bool IsActive,
    DateTimeOffset? UpdatedAt,
    decimal? DefaultDiscountPercent = null,
    decimal? MaxDiscountPercent = null,
    decimal? LineDefaultDiscountPercent = null,
    decimal? LineMaxDiscountPercent = null,
    decimal? EffectiveDefaultDiscountPercent = null,
    decimal? EffectiveMaxDiscountPercent = null,
    int UsageCount = 0,
    DateTimeOffset? ArchivedAt = null,
    string? Indications = null,
    string? Ingredients = null,
    IReadOnlyList<ProductImageDto>? Images = null);

/// <param name="ProductLineId">Leave empty to keep the product unassigned.</param>
public sealed record SaveProductRequest(
    Guid? ProductLineId,
    string NameAr,
    string NameEn,
    string? Description,
    decimal Price,
    int StockQuantity,
    bool IsActive = true,
    decimal? DefaultDiscountPercent = null,
    decimal? MaxDiscountPercent = null,
    string? Indications = null,
    string? Ingredients = null);

/// <param name="ImageIds">Every brochure page of the product, in the new order.</param>
public sealed record ReorderProductImagesRequest(IReadOnlyList<Guid> ImageIds);

/// <summary>A stored brochure page, opened for reading.</summary>
public sealed record ProductImageFile(byte[] Bytes, string ContentType);

/// <param name="ProductLineId">Target line; null takes the products out of their line (unassigned).</param>
public sealed record MoveProductsRequest(IReadOnlyList<Guid> ProductIds, Guid? ProductLineId);

/// <param name="LineId">Only this line.</param>
/// <param name="Unassigned">Only products without a line (catalog and order managers).</param>
/// <param name="IncludeInactive">Also inactive products and lines (products:manage only).</param>
/// <param name="Archived">Only archived products (products:manage only).</param>
public sealed record ProductQuery(
    Guid? LineId = null,
    string? Search = null,
    bool IncludeInactive = false,
    bool Unassigned = false,
    bool Archived = false);

public static class CatalogErrorCodes
{
    public const string NameTaken = "catalog_name_taken";
    public const string LineInactive = "product_line_inactive";

    /// <summary>The default discount is above the product's or the line's maximum.</summary>
    public const string DefaultAboveMax = "discount_default_above_max";

    /// <summary>The product already has the most brochure pages allowed; the response carries <c>max</c>.</summary>
    public const string ImagesLimit = "product_images_limit";

    /// <summary>The brochure page is larger than allowed after compression; the response carries <c>maxBytes</c>.</summary>
    public const string ImageTooLarge = "product_image_too_large";

    /// <summary>The file is not a JPEG, WebP or PNG picture.</summary>
    public const string ImageType = "product_image_type";

    /// <summary>The new order does not name every brochure page of the product exactly once.</summary>
    public const string ImagesOrder = "product_images_order";
}

/// <summary>Discount rules shared by the catalog screens and order pricing.</summary>
public static class DiscountRules
{
    /// <summary>The product's own default wins over the line's.</summary>
    public static decimal? EffectiveDefault(decimal? productDefault, decimal? lineDefault) => productDefault ?? lineDefault;

    /// <summary>The lowest of the limits that are set (null when none is).</summary>
    public static decimal? LowestCap(params decimal?[] caps)
    {
        decimal? lowest = null;
        foreach (var cap in caps)
        {
            if (cap is { } value && (lowest is null || value < lowest))
            {
                lowest = value;
            }
        }

        return lowest;
    }
}

/// <summary>
/// Which product lines a user may see and order from. This is the one place the rule lives:
/// product lists, brochure pages, orders, visit products and the catalog stats all ask here.
/// Users holding orders:manage or products:manage, and users with no line assigned, see every
/// line and the unassigned products; a user limited to one or more lines sees only those.
/// </summary>
public sealed class ProductAccess(IAppDbContext db, IPermissionService permissions)
{
    public static bool SeesAllLines(EffectivePermissions effective) =>
        effective.Has(Permissions.Orders.Manage) || effective.Has(Permissions.Products.Manage);

    /// <summary>Visible line ids, or null when every line (and the unassigned products) is visible.</summary>
    public async Task<HashSet<Guid>?> VisibleLineIdsAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var effective = await permissions.GetEffectivePermissionsAsync(userId, cancellationToken);
        if (SeesAllLines(effective))
        {
            return null;
        }

        var ids = await db.UserProductLines.AsNoTracking()
            .Where(l => l.UserId == userId)
            .Select(l => l.ProductLineId)
            .ToListAsync(cancellationToken);

        // No line assigned means no limit: the user sees and orders every product.
        return ids.Count == 0 ? null : ids.ToHashSet();
    }

    /// <summary>Products a restricted user can see: active, not archived, in one of their active lines.</summary>
    public static IQueryable<Product> WhereVisible(IQueryable<Product> products, HashSet<Guid>? visibleLines)
    {
        if (visibleLines is null)
        {
            return products;
        }

        var lineIds = visibleLines.ToArray();
        return products.Where(p => p.ProductLineId != null && lineIds.Contains(p.ProductLineId.Value));
    }
}

/// <summary>Product lines and products: browsing (products:read) and management (products:manage).</summary>
public sealed class CatalogService(
    IAppDbContext db,
    ICurrentUser currentUser,
    IPermissionService permissions,
    ProductAccess access,
    ImageService images,
    AuditTrail audit,
    TimeProvider time)
{
    /// <summary>Lines the caller can see. Inactive lines only for catalog managers.</summary>
    public async Task<IReadOnlyList<ProductLineDto>> ListLinesAsync(bool includeInactive, CancellationToken cancellationToken = default)
    {
        var userId = currentUser.RequireUserId();
        var visible = await access.VisibleLineIdsAsync(userId, cancellationToken);
        includeInactive &= await CanManageAsync(userId, cancellationToken);

        var query = db.ProductLines.AsNoTracking().Where(l => includeInactive || l.IsActive);
        if (visible is not null)
        {
            query = query.Where(l => visible.Contains(l.Id));
        }

        return await query
            .OrderBy(l => l.NameEn)
            .Select(l => new ProductLineDto(
                l.Id, l.NameAr, l.NameEn, l.Description, l.IsActive,
                l.Products.Count(p => p.ArchivedAt == null && (includeInactive || p.IsActive)),
                l.DefaultDiscountPercent, l.MaxDiscountPercent,
                db.UserProductLines.Count(u => u.ProductLineId == l.Id)))
            .ToListAsync(cancellationToken);
    }

    public async Task<ProductLineDto> CreateLineAsync(SaveProductLineRequest request, CancellationToken cancellationToken = default)
    {
        var (ar, en) = (request.NameAr.Trim(), request.NameEn.Trim());
        await EnsureLineNamesFreeAsync(ar, en, null, cancellationToken);
        var line = new ProductLine
        {
            NameAr = ar,
            NameEn = en,
            Description = Clean(request.Description),
            IsActive = request.IsActive,
            DefaultDiscountPercent = request.DefaultDiscountPercent,
            MaxDiscountPercent = request.MaxDiscountPercent,
            CreatedAt = time.GetUtcNow(),
        };
        db.ProductLines.Add(line);
        await audit.AddAsync(AuditEntities.ProductLine, line.Id, AuditAction.Created, LineSnapshot(line), cancellationToken: cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return new ProductLineDto(line.Id, line.NameAr, line.NameEn, line.Description, line.IsActive, 0,
            line.DefaultDiscountPercent, line.MaxDiscountPercent);
    }

    public async Task<ProductLineDto> UpdateLineAsync(Guid id, SaveProductLineRequest request, CancellationToken cancellationToken = default)
    {
        var line = await db.ProductLines.SingleOrDefaultAsync(l => l.Id == id, cancellationToken)
                   ?? throw new NotFoundException("ProductLine", id);
        var (ar, en) = (request.NameAr.Trim(), request.NameEn.Trim());
        await EnsureLineNamesFreeAsync(ar, en, id, cancellationToken);
        var before = LineSnapshot(line);
        line.NameAr = ar;
        line.NameEn = en;
        line.Description = Clean(request.Description);
        line.IsActive = request.IsActive;
        line.DefaultDiscountPercent = request.DefaultDiscountPercent;
        line.MaxDiscountPercent = request.MaxDiscountPercent;
        var after = LineSnapshot(line);
        if (before != after)
        {
            line.UpdatedAt = time.GetUtcNow();
            await audit.AddAsync(AuditEntities.ProductLine, id, AuditAction.Updated, new { before, after }, cancellationToken: cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);
        var count = await db.Products.CountAsync(p => p.ProductLineId == id && p.ArchivedAt == null, cancellationToken);
        var reps = await db.UserProductLines.CountAsync(u => u.ProductLineId == id, cancellationToken);
        return new ProductLineDto(line.Id, line.NameAr, line.NameEn, line.Description, line.IsActive, count,
            line.DefaultDiscountPercent, line.MaxDiscountPercent, reps);
    }

    /// <summary>
    /// Deletes product lines (products:delete). Their products are never deleted or hidden: the line is
    /// cleared on them first, so they stay in the catalog as unassigned. Reps lose the line from their
    /// assignments. <see cref="BulkItemResult.UsageCount"/> is the number of products that become unassigned.
    /// </summary>
    public async Task<BulkResult> DeleteLinesAsync(BulkDeleteRequest request, CancellationToken cancellationToken = default)
    {
        var ids = request.Ids.Distinct().ToArray();
        var lines = await db.ProductLines.Where(l => ids.Contains(l.Id)).ToDictionaryAsync(l => l.Id, cancellationToken);
        var products = await db.Products.Where(p => p.ProductLineId != null && ids.Contains(p.ProductLineId.Value)).ToListAsync(cancellationToken);
        var reps = await db.UserProductLines.Where(u => ids.Contains(u.ProductLineId))
            .GroupBy(u => u.ProductLineId).Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken);

        var results = new List<BulkItemResult>();
        var removed = new List<ProductLine>();
        var now = time.GetUtcNow();
        foreach (var id in ids)
        {
            if (!lines.TryGetValue(id, out var line))
            {
                results.Add(new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.NotFound));
                continue;
            }

            var lineProducts = products.Where(p => p.ProductLineId == id).ToList();
            results.Add(new BulkItemResult(id, BulkOutcome.Deleted, null, lineProducts.Count));
            if (request.DryRun)
            {
                continue;
            }

            foreach (var product in lineProducts)
            {
                product.ProductLineId = null;
                product.UpdatedAt = now;
            }

            removed.Add(line);
            await audit.AddAsync(AuditEntities.ProductLine, id, AuditAction.Deleted, new
            {
                line.NameAr,
                line.NameEn,
                productsUnassigned = lineProducts.Count,
                productIds = lineProducts.Select(p => p.Id).ToArray(),
                repsAffected = reps.GetValueOrDefault(id),
            }, cancellationToken: cancellationToken);
        }

        var result = BulkResult.From(results, request.DryRun);
        if (!request.DryRun && result.Done > 0)
        {
            await audit.AddBulkAsync(AuditEntities.ProductLine, AuditAction.BulkDelete, result, cancellationToken);

            // Products first: the line rows go only after nothing points at them any more
            // (the foreign key is restrictive on purpose, so a line can never take products with it).
            await db.SaveChangesAsync(cancellationToken);
            db.ProductLines.RemoveRange(removed);
            await db.SaveChangesAsync(cancellationToken);
        }

        return result;
    }

    /// <summary>Products the caller can see, by name.</summary>
    public async Task<IReadOnlyList<ProductDto>> ListProductsAsync(ProductQuery query, CancellationToken cancellationToken = default)
    {
        var userId = currentUser.RequireUserId();
        var visible = await access.VisibleLineIdsAsync(userId, cancellationToken);
        var canManage = await CanManageAsync(userId, cancellationToken);
        var includeInactive = query.IncludeInactive && canManage;

        var products = db.Products.AsNoTracking();
        if (query.Archived)
        {
            if (!canManage)
            {
                return [];
            }

            products = products.Where(p => p.ArchivedAt != null);
        }
        else
        {
            products = products.Where(p => p.ArchivedAt == null);
        }

        if (!includeInactive)
        {
            products = products.Where(p => p.IsActive && (p.ProductLineId == null || p.ProductLine!.IsActive));
        }

        products = ProductAccess.WhereVisible(products, visible);

        if (query.Unassigned)
        {
            products = products.Where(p => p.ProductLineId == null);
        }
        else if (query.LineId is { } lineId)
        {
            products = products.Where(p => p.ProductLineId == lineId);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim().ToLower();
            products = products.Where(p => p.NameEn.ToLower().Contains(term) || p.NameAr.Contains(term));
        }

        var rows = await Project(products.OrderBy(p => p.NameEn), canManage).ToListAsync(cancellationToken);
        var images = await ImagesOfAsync(rows.Select(r => r.Id).ToArray(), cancellationToken);
        return rows.Select(r => ToDto(r, images)).ToList();
    }

    // ---------------------------------------------------------------------------------------------
    // Brochure pages
    // ---------------------------------------------------------------------------------------------

    /// <summary>
    /// Adds a brochure page (products:manage). The client compresses it first; the server keeps the bytes
    /// as they arrive after checking the type (JPEG, WebP or PNG), the size and the per-product limit.
    /// </summary>
    public async Task<ProductDto> AddBrochureImageAsync(Guid id, Stream content, CancellationToken cancellationToken = default)
    {
        var product = await FindProductAsync(id, cancellationToken);
        var count = await db.ProductImages.CountAsync(i => i.ProductId == id, cancellationToken);
        if (count >= ProductImage.MaxPerProduct)
        {
            throw new BusinessRuleException(CatalogErrorCodes.ImagesLimit, $"A product has at most {ProductImage.MaxPerProduct} brochure pages.")
            {
                Details = new Dictionary<string, object?> { ["max"] = ProductImage.MaxPerProduct },
            };
        }

        using var buffer = new MemoryStream();
        var chunk = new byte[81920];
        int read;
        while ((read = await content.ReadAsync(chunk, cancellationToken)) > 0)
        {
            buffer.Write(chunk, 0, read);
            if (buffer.Length > ProductImage.MaxBytes)
            {
                throw new BusinessRuleException(CatalogErrorCodes.ImageTooLarge, "The picture is too large. Use a smaller one.")
                {
                    Details = new Dictionary<string, object?> { ["maxBytes"] = ProductImage.MaxBytes },
                };
            }
        }

        var bytes = buffer.ToArray();
        var type = SniffImageType(bytes) ?? throw new BusinessRuleException(CatalogErrorCodes.ImageType, "Choose a JPEG, WebP or PNG picture.");
        var position = count == 0 ? 0 : await db.ProductImages.Where(i => i.ProductId == id).MaxAsync(i => i.Position, cancellationToken) + 1;
        var image = new ProductImage
        {
            ProductId = id,
            Position = position,
            ContentType = type,
            Bytes = bytes,
            SizeBytes = bytes.Length,
            CreatedAt = time.GetUtcNow(),
        };
        db.ProductImages.Add(image);
        product.UpdatedAt = time.GetUtcNow();
        await audit.AddAsync(AuditEntities.Product, id, AuditAction.Updated, new { brochure = "added", imageId = image.Id, sizeBytes = bytes.Length },
            cancellationToken: cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return await GetProductAsync(id, cancellationToken);
    }

    public async Task<ProductDto> RemoveBrochureImageAsync(Guid id, Guid imageId, CancellationToken cancellationToken = default)
    {
        var product = await FindProductAsync(id, cancellationToken);
        var images = await db.ProductImages.Where(i => i.ProductId == id).OrderBy(i => i.Position).ToListAsync(cancellationToken);
        var image = images.SingleOrDefault(i => i.Id == imageId) ?? throw new NotFoundException("Product image", imageId);
        db.ProductImages.Remove(image);
        var position = 0;
        foreach (var other in images.Where(i => i.Id != imageId))
        {
            other.Position = position++;
        }

        product.UpdatedAt = time.GetUtcNow();
        await audit.AddAsync(AuditEntities.Product, id, AuditAction.Updated, new { brochure = "removed", imageId }, cancellationToken: cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return await GetProductAsync(id, cancellationToken);
    }

    public async Task<ProductDto> ReorderBrochureImagesAsync(Guid id, ReorderProductImagesRequest request, CancellationToken cancellationToken = default)
    {
        var product = await FindProductAsync(id, cancellationToken);
        var images = await db.ProductImages.Where(i => i.ProductId == id).ToDictionaryAsync(i => i.Id, cancellationToken);
        if (request.ImageIds.Count != images.Count || request.ImageIds.Distinct().Count() != images.Count || request.ImageIds.Any(i => !images.ContainsKey(i)))
        {
            throw new BusinessRuleException(CatalogErrorCodes.ImagesOrder, "Send every brochure page of the product once.");
        }

        for (var i = 0; i < request.ImageIds.Count; i++)
        {
            images[request.ImageIds[i]].Position = i;
        }

        product.UpdatedAt = time.GetUtcNow();
        await audit.AddAsync(AuditEntities.Product, id, AuditAction.Updated, new { brochure = "reordered", order = request.ImageIds }, cancellationToken: cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return await GetProductAsync(id, cancellationToken);
    }

    /// <summary>A brochure page, for anyone who can see the product (products:read and its line).</summary>
    public async Task<ProductImageFile> OpenBrochureImageAsync(Guid id, Guid imageId, CancellationToken cancellationToken = default)
    {
        var userId = currentUser.RequireUserId();
        var visible = await access.VisibleLineIdsAsync(userId, cancellationToken);
        if (!await ProductAccess.WhereVisible(db.Products.AsNoTracking().Where(p => p.Id == id), visible).AnyAsync(cancellationToken))
        {
            throw new NotFoundException("Product image", imageId);
        }

        return await db.ProductImages.AsNoTracking()
                   .Where(i => i.Id == imageId && i.ProductId == id)
                   .Select(i => new ProductImageFile(i.Bytes, i.ContentType))
                   .SingleOrDefaultAsync(cancellationToken)
               ?? throw new NotFoundException("Product image", imageId);
    }

    /// <summary>The picture type from the first bytes: JPEG, PNG or WebP; null for anything else.</summary>
    internal static string? SniffImageType(ReadOnlySpan<byte> bytes)
    {
        if (bytes.Length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF)
        {
            return "image/jpeg";
        }

        if (bytes.Length >= 8 && bytes[..8].SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }))
        {
            return "image/png";
        }

        if (bytes.Length >= 12 && bytes[..4].SequenceEqual("RIFF"u8) && bytes[8..12].SequenceEqual("WEBP"u8))
        {
            return "image/webp";
        }

        return null;
    }

    private async Task<ILookup<Guid, ProductImageDto>> ImagesOfAsync(Guid[] productIds, CancellationToken cancellationToken) =>
        (await db.ProductImages.AsNoTracking()
            .Where(i => productIds.Contains(i.ProductId))
            .OrderBy(i => i.Position)
            .Select(i => new { i.Id, i.ProductId, i.Position, i.ContentType, i.SizeBytes })
            .ToListAsync(cancellationToken))
        .ToLookup(i => i.ProductId, i => new ProductImageDto(i.Id, i.Position, i.ContentType, i.SizeBytes, $"/api/products/{i.ProductId}/images/{i.Id}"));

    public async Task<ProductDto> CreateProductAsync(SaveProductRequest request, CancellationToken cancellationToken = default)
    {
        var line = await LineForAsync(request.ProductLineId, cancellationToken);
        EnsureDiscounts(request.DefaultDiscountPercent, request.MaxDiscountPercent, line);
        var product = new Product { CreatedAt = time.GetUtcNow() };
        Apply(product, request);
        db.Products.Add(product);
        await audit.AddAsync(AuditEntities.Product, product.Id, AuditAction.Created, ProductSnapshot(product), cancellationToken: cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return await GetProductAsync(product.Id, cancellationToken);
    }

    public async Task<ProductDto> UpdateProductAsync(Guid id, SaveProductRequest request, CancellationToken cancellationToken = default)
    {
        var product = await FindProductAsync(id, cancellationToken);
        var line = await LineForAsync(request.ProductLineId, cancellationToken);
        EnsureDiscounts(request.DefaultDiscountPercent, request.MaxDiscountPercent, line);

        var before = ProductSnapshot(product);
        Apply(product, request);
        var after = ProductSnapshot(product);
        if (before != after)
        {
            product.UpdatedAt = time.GetUtcNow();
            await audit.AddAsync(AuditEntities.Product, id, AuditAction.Updated, new { before, after }, cancellationToken: cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);
        return await GetProductAsync(product.Id, cancellationToken);
    }

    /// <summary>Puts products in a line, or takes them out of their line (products:manage).</summary>
    public async Task<BulkResult> MoveProductsAsync(MoveProductsRequest request, CancellationToken cancellationToken = default)
    {
        var line = await LineForAsync(request.ProductLineId, cancellationToken);
        var ids = request.ProductIds.Distinct().ToArray();
        var products = await db.Products.Where(p => ids.Contains(p.Id)).ToDictionaryAsync(p => p.Id, cancellationToken);
        var now = time.GetUtcNow();
        var results = new List<BulkItemResult>();
        foreach (var id in ids)
        {
            if (!products.TryGetValue(id, out var product))
            {
                results.Add(new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.NotFound));
                continue;
            }

            if (line is not null && product.DefaultDiscountPercent > line.MaxDiscountPercent)
            {
                results.Add(new BulkItemResult(id, BulkOutcome.Blocked, CatalogErrorCodes.DefaultAboveMax));
                continue;
            }

            results.Add(new BulkItemResult(id, BulkOutcome.Updated));
            if (product.ProductLineId != request.ProductLineId)
            {
                var from = product.ProductLineId;
                product.ProductLineId = request.ProductLineId;
                product.UpdatedAt = now;
                await audit.AddAsync(AuditEntities.Product, id, AuditAction.Moved,
                    new { product.NameAr, product.NameEn, fromLineId = from, toLineId = request.ProductLineId }, cancellationToken: cancellationToken);
            }
        }

        var result = BulkResult.From(results, false);
        if (result.Done > 0)
        {
            await audit.AddAsync(AuditEntities.Product, null, AuditAction.Moved, new
            {
                toLineId = request.ProductLineId,
                toLine = line?.NameEn,
                ids = results.Where(r => r.Outcome == BulkOutcome.Updated).Select(r => r.Id).ToArray(),
                result.Blocked,
            }, result.Done, cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
        }

        return result;
    }

    /// <summary>
    /// Deletes products (products:delete): a product on past orders or visits is archived (hidden, the
    /// order lines keep their name and price snapshot); an unused one is removed with its picture.
    /// </summary>
    public async Task<BulkResult> DeleteProductsAsync(BulkDeleteRequest request, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var ids = request.Ids.Distinct().ToArray();
        var products = await db.Products.Where(p => ids.Contains(p.Id)).ToDictionaryAsync(p => p.Id, cancellationToken);
        var usage = await UsageAsync(ids, cancellationToken);
        var now = time.GetUtcNow();
        var results = new List<BulkItemResult>();
        var removedImages = new List<string?>();
        foreach (var id in ids)
        {
            if (!products.TryGetValue(id, out var product))
            {
                results.Add(new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.NotFound));
                continue;
            }

            var used = usage.GetValueOrDefault(id);
            var archive = used > 0;
            results.Add(new BulkItemResult(id, archive ? BulkOutcome.Archived : BulkOutcome.Deleted, null, used));
            if (request.DryRun)
            {
                continue;
            }

            if (archive)
            {
                product.ArchivedAt ??= now;
                product.ArchivedById ??= me;
            }
            else
            {
                removedImages.Add(product.ImageKey);
                db.Products.Remove(product);
            }

            await audit.AddAsync(AuditEntities.Product, id, archive ? AuditAction.Archived : AuditAction.Deleted,
                new { product.NameAr, product.NameEn, product.ProductLineId, usageCount = used }, cancellationToken: cancellationToken);
        }

        var result = BulkResult.From(results, request.DryRun);
        if (!request.DryRun && result.Done > 0)
        {
            await audit.AddBulkAsync(AuditEntities.Product, AuditAction.BulkDelete, result, cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
            foreach (var key in removedImages)
            {
                await images.DeleteAsync(key, cancellationToken);
            }
        }

        return result;
    }

    public async Task<BulkResult> RestoreProductsAsync(BulkIdsRequest request, CancellationToken cancellationToken = default)
    {
        var ids = request.Ids.Distinct().ToArray();
        var products = await db.Products.Where(p => ids.Contains(p.Id)).ToDictionaryAsync(p => p.Id, cancellationToken);
        var results = new List<BulkItemResult>();
        foreach (var id in ids)
        {
            if (!products.TryGetValue(id, out var product))
            {
                results.Add(new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.NotFound));
            }
            else if (product.ArchivedAt is null)
            {
                results.Add(new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.NotArchived));
            }
            else
            {
                product.ArchivedAt = null;
                product.ArchivedById = null;
                results.Add(new BulkItemResult(id, BulkOutcome.Restored));
                await audit.AddAsync(AuditEntities.Product, id, AuditAction.Restored, new { product.NameAr, product.NameEn }, cancellationToken: cancellationToken);
            }
        }

        var result = BulkResult.From(results, false);
        if (result.Done > 0)
        {
            await audit.AddBulkAsync(AuditEntities.Product, AuditAction.BulkRestore, result, cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
        }

        return result;
    }

    /// <summary>Replaces the product picture (validated and re-encoded by <see cref="ImageService"/>).</summary>
    public async Task<ProductDto> SetImageAsync(Guid id, Stream content, CancellationToken cancellationToken = default)
    {
        var product = await FindProductAsync(id, cancellationToken);
        var key = await images.StoreAsync(content, ImagePurpose.Product, cancellationToken);
        var previous = product.ImageKey;
        product.ImageKey = key;
        product.UpdatedAt = time.GetUtcNow();
        await audit.AddAsync(AuditEntities.Product, id, AuditAction.Updated, new { picture = "replaced" }, cancellationToken: cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        await images.DeleteAsync(previous, cancellationToken);
        return await GetProductAsync(id, cancellationToken);
    }

    public async Task<ProductDto> RemoveImageAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var product = await FindProductAsync(id, cancellationToken);
        var previous = product.ImageKey;
        product.ImageKey = null;
        product.UpdatedAt = time.GetUtcNow();
        await audit.AddAsync(AuditEntities.Product, id, AuditAction.Updated, new { picture = "removed" }, cancellationToken: cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        await images.DeleteAsync(previous, cancellationToken);
        return await GetProductAsync(id, cancellationToken);
    }

    private async Task<ProductDto> GetProductAsync(Guid id, CancellationToken cancellationToken)
    {
        var row = await Project(db.Products.AsNoTracking().Where(p => p.Id == id), true).SingleAsync(cancellationToken);
        return ToDto(row, await ImagesOfAsync([id], cancellationToken));
    }

    private IQueryable<ProductRow> Project(IQueryable<Product> products, bool withUsage) =>
        products.Select(p => new ProductRow(
            p.Id,
            p.ProductLineId,
            p.ProductLine != null ? p.ProductLine.NameAr : null,
            p.ProductLine != null ? p.ProductLine.NameEn : null,
            p.NameAr,
            p.NameEn,
            p.Description,
            p.Price,
            p.StockQuantity,
            p.ImageKey,
            p.IsActive,
            p.UpdatedAt,
            p.DefaultDiscountPercent,
            p.MaxDiscountPercent,
            p.ProductLine != null ? p.ProductLine.DefaultDiscountPercent : null,
            p.ProductLine != null ? p.ProductLine.MaxDiscountPercent : null,
            withUsage ? db.OrderLines.Count(l => l.ProductId == p.Id) + db.VisitProducts.Count(v => v.ProductId == p.Id) : 0,
            p.ArchivedAt,
            p.Indications,
            p.Ingredients));

    private static ProductDto ToDto(ProductRow p, ILookup<Guid, ProductImageDto> images) => new(
        p.Id, p.ProductLineId, p.LineNameAr, p.LineNameEn, p.NameAr, p.NameEn, p.Description, p.Price, p.StockQuantity,
        ImageService.Url(p.ImageKey), ImageService.Url(p.ImageKey, ImageService.Thumbnail), p.IsActive, p.UpdatedAt,
        p.DefaultDiscountPercent, p.MaxDiscountPercent, p.LineDefaultDiscountPercent, p.LineMaxDiscountPercent,
        DiscountRules.EffectiveDefault(p.DefaultDiscountPercent, p.LineDefaultDiscountPercent),
        DiscountRules.LowestCap(p.MaxDiscountPercent, p.LineMaxDiscountPercent),
        p.UsageCount, p.ArchivedAt, p.Indications, p.Ingredients, images[p.Id].ToList());

    private async Task<Dictionary<Guid, int>> UsageAsync(Guid[] ids, CancellationToken cancellationToken)
    {
        var orders = await db.OrderLines.Where(l => ids.Contains(l.ProductId))
            .GroupBy(l => l.ProductId).Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken);
        var visits = await db.VisitProducts.Where(v => ids.Contains(v.ProductId))
            .GroupBy(v => v.ProductId).Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken);
        return ids.ToDictionary(id => id, id => orders.GetValueOrDefault(id) + visits.GetValueOrDefault(id));
    }

    private async Task<Product> FindProductAsync(Guid id, CancellationToken cancellationToken) =>
        await db.Products.SingleOrDefaultAsync(p => p.Id == id, cancellationToken) ?? throw new NotFoundException("Product", id);

    private async Task<ProductLine?> LineForAsync(Guid? lineId, CancellationToken cancellationToken)
    {
        if (lineId is not { } id)
        {
            return null;
        }

        return await db.ProductLines.AsNoTracking().SingleOrDefaultAsync(l => l.Id == id, cancellationToken)
               ?? throw new NotFoundException("ProductLine", id);
    }

    /// <summary>A default above the product's or the line's limit could never be used on an order.</summary>
    private static void EnsureDiscounts(decimal? defaultPercent, decimal? maxPercent, ProductLine? line)
    {
        var cap = DiscountRules.LowestCap(maxPercent, line?.MaxDiscountPercent);
        if (defaultPercent is { } value && cap is { } limit && value > limit)
        {
            throw new BusinessRuleException(CatalogErrorCodes.DefaultAboveMax, $"The default discount cannot be above the maximum ({limit:0.##}%).")
            {
                Details = new Dictionary<string, object?> { ["maxDiscountPercent"] = limit },
            };
        }
    }

    private async Task<bool> CanManageAsync(Guid userId, CancellationToken cancellationToken) =>
        (await permissions.GetEffectivePermissionsAsync(userId, cancellationToken)).Has(Permissions.Products.Manage);

    private async Task EnsureLineNamesFreeAsync(string ar, string en, Guid? exceptId, CancellationToken cancellationToken)
    {
        var arLower = ar.ToLower();
        var enLower = en.ToLower();
        if (await db.ProductLines.AnyAsync(l => l.Id != exceptId && (l.NameAr.ToLower() == arLower || l.NameEn.ToLower() == enLower), cancellationToken))
        {
            throw new ConflictException(CatalogErrorCodes.NameTaken, "Another product line already uses this name.");
        }
    }

    private static void Apply(Product product, SaveProductRequest request)
    {
        product.ProductLineId = request.ProductLineId;
        product.NameAr = request.NameAr.Trim();
        product.NameEn = request.NameEn.Trim();
        product.Description = Clean(request.Description);
        product.Price = decimal.Round(request.Price, 2, MidpointRounding.AwayFromZero);
        product.StockQuantity = request.StockQuantity;
        product.IsActive = request.IsActive;
        product.DefaultDiscountPercent = request.DefaultDiscountPercent;
        product.MaxDiscountPercent = request.MaxDiscountPercent;
        product.Indications = Clean(request.Indications);
        product.Ingredients = Clean(request.Ingredients);
    }

    private static LineState LineSnapshot(ProductLine l) =>
        new(l.NameAr, l.NameEn, l.Description, l.IsActive, l.DefaultDiscountPercent, l.MaxDiscountPercent);

    private static ProductState ProductSnapshot(Product p) =>
        new(p.ProductLineId, p.NameAr, p.NameEn, p.Description, p.Price, p.StockQuantity, p.IsActive, p.DefaultDiscountPercent, p.MaxDiscountPercent,
            p.Indications, p.Ingredients);

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private sealed record LineState(string NameAr, string NameEn, string? Description, bool IsActive, decimal? DefaultDiscountPercent, decimal? MaxDiscountPercent);

    private sealed record ProductState(
        Guid? ProductLineId, string NameAr, string NameEn, string? Description, decimal Price, int StockQuantity,
        bool IsActive, decimal? DefaultDiscountPercent, decimal? MaxDiscountPercent, string? Indications, string? Ingredients);

    private sealed record ProductRow(
        Guid Id,
        Guid? ProductLineId,
        string? LineNameAr,
        string? LineNameEn,
        string NameAr,
        string NameEn,
        string? Description,
        decimal Price,
        int StockQuantity,
        string? ImageKey,
        bool IsActive,
        DateTimeOffset? UpdatedAt,
        decimal? DefaultDiscountPercent,
        decimal? MaxDiscountPercent,
        decimal? LineDefaultDiscountPercent,
        decimal? LineMaxDiscountPercent,
        int UsageCount,
        DateTimeOffset? ArchivedAt,
        string? Indications,
        string? Ingredients);
}

internal static class DiscountValidation
{
    public static IRuleBuilderOptions<T, decimal?> Percent<T>(this IRuleBuilder<T, decimal?> rule) =>
        rule.InclusiveBetween(0, 100)
            .Must(d => d is null || decimal.Round(d.Value, 2) == d).WithMessage("At most 2 decimals.");
}

public sealed class SaveProductLineRequestValidator : AbstractValidator<SaveProductLineRequest>
{
    public SaveProductLineRequestValidator()
    {
        RuleFor(x => x.NameAr).Must(n => !string.IsNullOrWhiteSpace(n)).WithMessage("Name is required.").MaximumLength(ProductLine.NameMaxLength);
        RuleFor(x => x.NameEn).Must(n => !string.IsNullOrWhiteSpace(n)).WithMessage("Name is required.").MaximumLength(ProductLine.NameMaxLength);
        RuleFor(x => x.Description).MaximumLength(ProductLine.DescriptionMaxLength);
        RuleFor(x => x.DefaultDiscountPercent).Percent();
        RuleFor(x => x.MaxDiscountPercent).Percent();
        RuleFor(x => x.DefaultDiscountPercent)
            .Must((x, d) => d is null || x.MaxDiscountPercent is null || d <= x.MaxDiscountPercent)
            .WithMessage("The default discount cannot be above the maximum.");
    }
}

public sealed class SaveProductRequestValidator : AbstractValidator<SaveProductRequest>
{
    public SaveProductRequestValidator()
    {
        RuleFor(x => x.ProductLineId).NotEqual(Guid.Empty);
        RuleFor(x => x.NameAr).Must(n => !string.IsNullOrWhiteSpace(n)).WithMessage("Name is required.").MaximumLength(Product.NameMaxLength);
        RuleFor(x => x.NameEn).Must(n => !string.IsNullOrWhiteSpace(n)).WithMessage("Name is required.").MaximumLength(Product.NameMaxLength);
        RuleFor(x => x.Description).MaximumLength(Product.DescriptionMaxLength);
        RuleFor(x => x.Indications).MaximumLength(Product.IndicationsMaxLength);
        RuleFor(x => x.Ingredients).MaximumLength(Product.IngredientsMaxLength);
        RuleFor(x => x.Price).GreaterThanOrEqualTo(0).LessThan(10_000_000m)
            .Must(p => decimal.Round(p, 2) == p).WithMessage("Price can have at most 2 decimals.");
        RuleFor(x => x.StockQuantity).InclusiveBetween(0, 100_000_000);
        RuleFor(x => x.DefaultDiscountPercent).Percent();
        RuleFor(x => x.MaxDiscountPercent).Percent();
        RuleFor(x => x.DefaultDiscountPercent)
            .Must((x, d) => d is null || x.MaxDiscountPercent is null || d <= x.MaxDiscountPercent)
            .WithMessage("The default discount cannot be above the maximum.");
    }
}

public sealed class ReorderProductImagesRequestValidator : AbstractValidator<ReorderProductImagesRequest>
{
    public ReorderProductImagesRequestValidator()
    {
        RuleFor(x => x.ImageIds).NotNull().Must(ids => ids is null || ids.Count <= ProductImage.MaxPerProduct)
            .WithMessage($"A product has at most {ProductImage.MaxPerProduct} brochure pages.");
    }
}

public sealed class MoveProductsRequestValidator : AbstractValidator<MoveProductsRequest>
{
    public MoveProductsRequestValidator()
    {
        RuleFor(x => x.ProductIds).NotEmpty().Must(ids => ids is null || ids.Count <= BulkLimits.MaxItems)
            .WithMessage($"At most {BulkLimits.MaxItems} products at a time.");
        RuleForEach(x => x.ProductIds).NotEmpty();
        RuleFor(x => x.ProductLineId).NotEqual(Guid.Empty);
    }
}
