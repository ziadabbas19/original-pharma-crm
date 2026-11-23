using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Catalog;
using OriginalPharma.Application.Common;
using OriginalPharma.Domain.Catalog;

namespace OriginalPharma.Tests.Integration;

/// <summary>
/// Product indications, ingredients and brochure pages: at most five pages, checked for type and size,
/// reordered and removed by catalog managers, readable by whoever can see the product.
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class ProductImageTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>Bytes that start like a JPEG file (the server checks the type from the first bytes).</summary>
    private static MemoryStream Jpeg(int size = 2048, byte fill = 7)
    {
        var bytes = Enumerable.Repeat(fill, size).ToArray();
        bytes[0] = 0xFF;
        bytes[1] = 0xD8;
        bytes[2] = 0xFF;
        return new MemoryStream(bytes);
    }

    [Fact]
    public async Task Brochure_pages_are_limited_checked_ordered_and_readable_by_product_readers()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var product = await db.DbAsync(c => c.Products.Where(x => x.ProductLine!.NameEn.Contains("Cardio")).Select(x => x.Id).FirstAsync(Ct));
        var derma = await db.DbAsync(c => c.Products.Where(x => x.ProductLine!.NameEn.Contains("Derma")).Select(x => x.Id).FirstAsync(Ct));

        Task<ProductDto> Add(Guid id, Stream file) => db.As<CatalogService, ProductDto>(p.Admin, s => s.AddBrochureImageAsync(id, file, Ct));

        ProductDto dto = null!;
        for (var i = 0; i < ProductImage.MaxPerProduct; i++)
        {
            dto = await Add(product, Jpeg(fill: (byte)i));
        }

        Assert.Equal([0, 1, 2, 3, 4], dto.Images!.Select(x => x.Position));
        Assert.All(dto.Images!, x => Assert.Equal(("image/jpeg", $"/api/products/{product}/images/{x.Id}"), (x.ContentType, x.Url)));
        var limit = await Assert.ThrowsAsync<BusinessRuleException>(() => Add(product, Jpeg()));
        Assert.Equal((CatalogErrorCodes.ImagesLimit, 5), (limit.Code, (int)limit.Details!["max"]!));

        // Too large after compression, or not a picture.
        Assert.Equal(CatalogErrorCodes.ImageTooLarge, (await Assert.ThrowsAsync<BusinessRuleException>(() => Add(derma, Jpeg(ProductImage.MaxBytes + 1)))).Code);
        Assert.Equal(CatalogErrorCodes.ImageType, (await Assert.ThrowsAsync<BusinessRuleException>(() => Add(derma, new MemoryStream("not a picture"u8.ToArray())))).Code);
        var webp = new byte[64];
        "RIFF"u8.CopyTo(webp);
        "WEBP"u8.CopyTo(webp.AsSpan(8));
        Assert.Equal("image/webp", (await Add(derma, new MemoryStream(webp))).Images!.Single().ContentType);

        // Reorder (every page once), then remove one: the others close the gap.
        var ids = dto.Images!.Select(x => x.Id).ToArray();
        var reversed = await db.As<CatalogService, ProductDto>(p.Admin, s => s.ReorderBrochureImagesAsync(product, new ReorderProductImagesRequest(ids.Reverse().ToList()), Ct));
        Assert.Equal(ids.Reverse(), reversed.Images!.Select(x => x.Id));
        Assert.Equal(CatalogErrorCodes.ImagesOrder, (await Assert.ThrowsAsync<BusinessRuleException>(() =>
            db.As<CatalogService, ProductDto>(p.Admin, s => s.ReorderBrochureImagesAsync(product, new ReorderProductImagesRequest(ids[..2]), Ct)))).Code);
        var removed = await db.As<CatalogService, ProductDto>(p.Admin, s => s.RemoveBrochureImageAsync(product, ids[4], Ct));
        Assert.Equal([ids[3], ids[2], ids[1], ids[0]], removed.Images!.Select(x => x.Id));
        Assert.Equal([0, 1, 2, 3], removed.Images!.Select(x => x.Position));

        // The rep (cardio line) reads the pages and sees them on the product; another line's pages stay hidden.
        var file = await db.As<CatalogService, ProductImageFile>(p.Rep, s => s.OpenBrochureImageAsync(product, ids[0], Ct));
        Assert.Equal(("image/jpeg", 2048, (byte)0), (file.ContentType, file.Bytes.Length, file.Bytes[3]));
        var listed = await db.As<CatalogService, IReadOnlyList<ProductDto>>(p.Rep, s => s.ListProductsAsync(new ProductQuery(), Ct));
        Assert.Equal(4, listed.Single(x => x.Id == product).Images!.Count);
        var dermaImage = (await db.DbAsync(c => c.ProductImages.Where(x => x.ProductId == derma).Select(x => x.Id).SingleAsync(Ct)));
        await Assert.ThrowsAsync<NotFoundException>(() => db.As<CatalogService, ProductImageFile>(p.Rep, s => s.OpenBrochureImageAsync(derma, dermaImage, Ct)));

        // Deleting an unused product removes its pages with it.
        var unused = await db.As<CatalogService, ProductDto>(p.Admin, s => s.CreateProductAsync(new SaveProductRequest(null, "منتج", "Spare product", null, 10, 1), Ct));
        await Add(unused.Id, Jpeg());
        await db.As<CatalogService, Application.Common.Bulk.BulkResult>(p.Admin, s => s.DeleteProductsAsync(new Application.Common.Bulk.BulkDeleteRequest([unused.Id]), Ct));
        Assert.Equal(0, await db.DbAsync(c => c.ProductImages.CountAsync(x => x.ProductId == unused.Id, Ct)));
    }

    [Fact]
    public async Task Indications_and_ingredients_are_saved_with_the_product()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var created = await db.As<CatalogService, ProductDto>(p.Admin, s => s.CreateProductAsync(new SaveProductRequest(
            null, "كارديو", "Cardio Plus", null, 120, 10, Indications: " Hypertension ", Ingredients: "Amlodipine 5 mg"), Ct));
        Assert.Equal(("Hypertension", "Amlodipine 5 mg"), (created.Indications, created.Ingredients));
        Assert.Empty(created.Images!);

        var cleared = await db.As<CatalogService, ProductDto>(p.Admin, s => s.UpdateProductAsync(created.Id, new SaveProductRequest(
            null, "كارديو", "Cardio Plus", null, 120, 10, Ingredients: "Amlodipine 10 mg"), Ct));
        Assert.Equal((null, "Amlodipine 10 mg"), (cleared.Indications, cleared.Ingredients));
        Assert.False(new SaveProductRequestValidator().Validate(new SaveProductRequest(null, "a", "b", null, 1, 1, Indications: new string('x', 2001))).IsValid);
    }
}
