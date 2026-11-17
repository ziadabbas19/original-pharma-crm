using FluentValidation;
using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Images;
using OriginalPharma.Application.Identity;
using OriginalPharma.Domain.Catalog;

namespace OriginalPharma.Application.Catalog;

public sealed record ProductLineDto(Guid Id, string NameAr, string NameEn, string? Description, bool IsActive, int ProductCount);

public sealed record SaveProductLineRequest(string NameAr, string NameEn, string? Description, bool IsActive = true);

/// <param name="Price">Unit price in EGP.</param>
/// <param name="ImageUrl">Display size (about 1024 px).</param>
/// <param name="ThumbnailUrl">List size (about 320 px).</param>
public sealed record ProductDto(
    Guid Id,
    Guid ProductLineId,
    string LineNameAr,
    string LineNameEn,
    string NameAr,
    string NameEn,
    string? Description,
    decimal Price,
    int StockQuantity,
    string? ImageUrl,
    string? ThumbnailUrl,
    bool IsActive,
    DateTimeOffset? UpdatedAt);

public sealed record SaveProductRequest(
    Guid ProductLineId,
    string NameAr,
    string NameEn,
    string? Description,
    decimal Price,
    int StockQuantity,
    bool IsActive = true);

public static class CatalogErrorCodes
{
    public const string NameTaken = "catalog_name_taken";
    public const string LineInactive = "product_line_inactive";
}

/// <summary>
/// Which product lines a user may see and order from. Users holding orders:manage or
/// products:manage see every line; everyone else only the lines assigned to them.
/// </summary>
public sealed class ProductAccess(IAppDbContext db, IPermissionService permissions)
{
    public static bool SeesAllLines(EffectivePermissions effective) =>
        effective.Has(Permissions.Orders.Manage) || effective.Has(Permissions.Products.Manage);

    /// <summary>Visible line ids, or null when every line is visible.</summary>
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
        return ids.ToHashSet();
    }
}

/// <summary>Product lines and products: browsing (products:read) and management (products:manage).</summary>
public sealed class CatalogService(
    IAppDbContext db,
    ICurrentUser currentUser,
    IPermissionService permissions,
    ProductAccess access,
    ImageService images,
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
                l.Products.Count(p => includeInactive || p.IsActive)))
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
            CreatedAt = time.GetUtcNow(),
        };
        db.ProductLines.Add(line);
        await db.SaveChangesAsync(cancellationToken);
        return new ProductLineDto(line.Id, line.NameAr, line.NameEn, line.Description, line.IsActive, 0);
    }

    public async Task<ProductLineDto> UpdateLineAsync(Guid id, SaveProductLineRequest request, CancellationToken cancellationToken = default)
    {
        var line = await db.ProductLines.SingleOrDefaultAsync(l => l.Id == id, cancellationToken)
                   ?? throw new NotFoundException("ProductLine", id);
        var (ar, en) = (request.NameAr.Trim(), request.NameEn.Trim());
        await EnsureLineNamesFreeAsync(ar, en, id, cancellationToken);
        line.NameAr = ar;
        line.NameEn = en;
        line.Description = Clean(request.Description);
        line.IsActive = request.IsActive;
        await db.SaveChangesAsync(cancellationToken);
        var count = await db.Products.CountAsync(p => p.ProductLineId == id, cancellationToken);
        return new ProductLineDto(line.Id, line.NameAr, line.NameEn, line.Description, line.IsActive, count);
    }

    /// <summary>
    /// Products the caller can see, by name. Users restricted to their lines only get active
    /// products of active lines; catalog managers can include inactive ones.
    /// </summary>
    public async Task<IReadOnlyList<ProductDto>> ListProductsAsync(
        Guid? lineId,
        string? search,
        bool includeInactive,
        CancellationToken cancellationToken = default)
    {
        var userId = currentUser.RequireUserId();
        var visible = await access.VisibleLineIdsAsync(userId, cancellationToken);
        includeInactive &= await CanManageAsync(userId, cancellationToken);

        var query = db.Products.AsNoTracking();
        if (!includeInactive)
        {
            query = query.Where(p => p.IsActive && p.ProductLine!.IsActive);
        }

        if (visible is not null)
        {
            query = query.Where(p => visible.Contains(p.ProductLineId));
        }

        if (lineId is not null)
        {
            query = query.Where(p => p.ProductLineId == lineId);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(p => p.NameEn.ToLower().Contains(term) || p.NameAr.Contains(term));
        }

        var rows = await query
            .OrderBy(p => p.NameEn)
            .Select(p => new
            {
                p.Id,
                p.ProductLineId,
                LineNameAr = p.ProductLine!.NameAr,
                LineNameEn = p.ProductLine.NameEn,
                p.NameAr,
                p.NameEn,
                p.Description,
                p.Price,
                p.StockQuantity,
                p.ImageKey,
                p.IsActive,
                p.UpdatedAt,
            })
            .ToListAsync(cancellationToken);

        return rows
            .Select(p => new ProductDto(
                p.Id, p.ProductLineId, p.LineNameAr, p.LineNameEn, p.NameAr, p.NameEn, p.Description, p.Price,
                p.StockQuantity, ImageService.Url(p.ImageKey), ImageService.Url(p.ImageKey, ImageService.Thumbnail),
                p.IsActive, p.UpdatedAt))
            .ToList();
    }

    public async Task<ProductDto> CreateProductAsync(SaveProductRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureLineExistsAsync(request.ProductLineId, cancellationToken);
        var product = new Product { CreatedAt = time.GetUtcNow() };
        Apply(product, request);
        db.Products.Add(product);
        await db.SaveChangesAsync(cancellationToken);
        return await GetProductAsync(product.Id, cancellationToken);
    }

    public async Task<ProductDto> UpdateProductAsync(Guid id, SaveProductRequest request, CancellationToken cancellationToken = default)
    {
        var product = await FindProductAsync(id, cancellationToken);
        if (request.ProductLineId != product.ProductLineId)
        {
            await EnsureLineExistsAsync(request.ProductLineId, cancellationToken);
        }

        Apply(product, request);
        product.UpdatedAt = time.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);
        return await GetProductAsync(product.Id, cancellationToken);
    }

    /// <summary>Replaces the product picture (validated and re-encoded by <see cref="ImageService"/>).</summary>
    public async Task<ProductDto> SetImageAsync(Guid id, Stream content, CancellationToken cancellationToken = default)
    {
        var product = await FindProductAsync(id, cancellationToken);
        var key = await images.StoreAsync(content, ImagePurpose.Product, cancellationToken);
        var previous = product.ImageKey;
        product.ImageKey = key;
        product.UpdatedAt = time.GetUtcNow();
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
        await db.SaveChangesAsync(cancellationToken);
        await images.DeleteAsync(previous, cancellationToken);
        return await GetProductAsync(id, cancellationToken);
    }

    private async Task<ProductDto> GetProductAsync(Guid id, CancellationToken cancellationToken)
    {
        var p = await db.Products.AsNoTracking().Include(x => x.ProductLine).SingleAsync(x => x.Id == id, cancellationToken);
        return new ProductDto(
            p.Id, p.ProductLineId, p.ProductLine!.NameAr, p.ProductLine.NameEn, p.NameAr, p.NameEn, p.Description, p.Price,
            p.StockQuantity, ImageService.Url(p.ImageKey), ImageService.Url(p.ImageKey, ImageService.Thumbnail), p.IsActive, p.UpdatedAt);
    }

    private async Task<Product> FindProductAsync(Guid id, CancellationToken cancellationToken) =>
        await db.Products.SingleOrDefaultAsync(p => p.Id == id, cancellationToken) ?? throw new NotFoundException("Product", id);

    private async Task EnsureLineExistsAsync(Guid lineId, CancellationToken cancellationToken)
    {
        if (!await db.ProductLines.AnyAsync(l => l.Id == lineId, cancellationToken))
        {
            throw new NotFoundException("ProductLine", lineId);
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
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

public sealed class SaveProductLineRequestValidator : AbstractValidator<SaveProductLineRequest>
{
    public SaveProductLineRequestValidator()
    {
        RuleFor(x => x.NameAr).Must(n => !string.IsNullOrWhiteSpace(n)).WithMessage("Name is required.").MaximumLength(ProductLine.NameMaxLength);
        RuleFor(x => x.NameEn).Must(n => !string.IsNullOrWhiteSpace(n)).WithMessage("Name is required.").MaximumLength(ProductLine.NameMaxLength);
        RuleFor(x => x.Description).MaximumLength(ProductLine.DescriptionMaxLength);
    }
}

public sealed class SaveProductRequestValidator : AbstractValidator<SaveProductRequest>
{
    public SaveProductRequestValidator()
    {
        RuleFor(x => x.ProductLineId).NotEmpty();
        RuleFor(x => x.NameAr).Must(n => !string.IsNullOrWhiteSpace(n)).WithMessage("Name is required.").MaximumLength(Product.NameMaxLength);
        RuleFor(x => x.NameEn).Must(n => !string.IsNullOrWhiteSpace(n)).WithMessage("Name is required.").MaximumLength(Product.NameMaxLength);
        RuleFor(x => x.Description).MaximumLength(Product.DescriptionMaxLength);
        RuleFor(x => x.Price).GreaterThanOrEqualTo(0).LessThan(10_000_000m)
            .Must(p => decimal.Round(p, 2) == p).WithMessage("Price can have at most 2 decimals.");
        RuleFor(x => x.StockQuantity).InclusiveBetween(0, 100_000_000);
    }
}
