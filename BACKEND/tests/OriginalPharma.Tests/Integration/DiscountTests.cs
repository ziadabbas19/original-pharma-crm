using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Catalog;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Orders;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Domain.Orders;

namespace OriginalPharma.Tests.Integration;

[Collection(PostgresCollection.Name)]
public sealed class DiscountTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static CreateOrderRequest Order(Guid method, Guid product, decimal discount) =>
        new(Guid.NewGuid(), new DateOnly(2026, 11, 18), PlaceType.Pharmacy, "Discount pharmacy", [new OrderLineInput(product, 1, discount)], CollectionMethodId: method);

    [Fact]
    public async Task Defaults_come_from_the_product_first_then_the_line()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var products = await db.As<CatalogService, IReadOnlyList<ProductDto>>(p.Rep, s => s.ListProductsAsync(new ProductQuery(), Ct));

        // Demo data: Cardio line default 5 / max 15; Lipostat default 7.5 / max 12; Pediatric max 10.
        var lipostat = products.Single(x => x.NameEn == "Lipostat 20 mg, 28 tablets");
        Assert.Equal((7.5m, 12m), (lipostat.EffectiveDefaultDiscountPercent!.Value, lipostat.EffectiveMaxDiscountPercent!.Value));
        var cardiolin = products.Single(x => x.NameEn == "Cardiolin 5 mg, 30 tablets");
        Assert.Equal((5m, 15m), (cardiolin.EffectiveDefaultDiscountPercent!.Value, cardiolin.EffectiveMaxDiscountPercent!.Value));
        var vitakid = products.Single(x => x.NameEn == "Vitakid drops 15 ml");
        Assert.Null(vitakid.EffectiveDefaultDiscountPercent);
        Assert.Equal(10m, vitakid.EffectiveMaxDiscountPercent);

        // A default above the product or line maximum is refused when saving the product.
        var error = await Assert.ThrowsAsync<BusinessRuleException>(() => db.As<CatalogService, ProductDto>(p.Admin, s => s.UpdateProductAsync(
            vitakid.Id, new SaveProductRequest(vitakid.ProductLineId, vitakid.NameAr, vitakid.NameEn, vitakid.Description, vitakid.Price,
                vitakid.StockQuantity, true, DefaultDiscountPercent: 11m), Ct)));
        Assert.Equal(CatalogErrorCodes.DefaultAboveMax, error.Code);
    }

    [Fact]
    public async Task The_lowest_of_product_line_and_role_limits_applies()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var cash = await DemoPeople.MethodAsync(db, "Cash");
        var lipostat = await DemoPeople.ProductAsync(db, "Lipostat 20 mg, 28 tablets"); // product 12, line 15
        var cardiolin = await DemoPeople.ProductAsync(db, "Cardiolin 5 mg, 30 tablets"); // line 15 only

        async Task<BusinessRuleException> RefusedAsync(Guid product, decimal discount) =>
            await Assert.ThrowsAsync<BusinessRuleException>(() => db.As<OrderService, OrderDto>(p.Rep, s => s.CreateAsync(Order(cash, product, discount), Ct)));

        var product = await RefusedAsync(lipostat, 12.5m);
        Assert.Equal((OrderErrorCodes.DiscountAboveCap, 12m, "product"), (product.Code, product.Details!["maxDiscountPercent"], product.Details["limit"]));
        await db.As<OrderService, OrderDto>(p.Rep, s => s.CreateAsync(Order(cash, lipostat, 12m), Ct));

        var line = await RefusedAsync(cardiolin, 16m);
        Assert.Equal((15m, "line"), (line.Details!["maxDiscountPercent"], line.Details["limit"]));

        // A product limit above the line limit does not lift it: the lowest wins.
        await db.DbAsync(c => c.Products.Where(x => x.Id == cardiolin).ExecuteUpdateAsync(s => s.SetProperty(x => x.MaxDiscountPercent, 30m), Ct));
        Assert.Equal("line", (await RefusedAsync(cardiolin, 16m)).Details!["limit"]);

        // The role cap applies on top of both.
        var role = await db.RoleAsync(DefaultRoles.Rep);
        await db.RolesAsync(p.Admin, s => s.UpdateRoleAsync(role.Id, new UpdateRoleRequest(role.NameAr, role.NameEn, role.Description, role.Level, 8m), Ct));
        var capped = await RefusedAsync(lipostat, 10m);
        Assert.Equal((8m, "role"), (capped.Details!["maxDiscountPercent"], capped.Details["limit"]));
        var ok = await db.As<OrderService, OrderDto>(p.Rep, s => s.CreateAsync(Order(cash, lipostat, 8m), Ct));
        Assert.Equal(8m, ok.Lines.Single().DiscountPercent);
        Assert.True(ok.DiscountTotal > 0);

        // The list shows the discount total too.
        var listed = await db.As<OrderService, IReadOnlyList<OrderListItemDto>>(p.Rep, s => s.ListAsync(new OrderQuery(Mine: true), Ct));
        Assert.Equal(ok.DiscountTotal, listed.Single(o => o.Id == ok.Id).DiscountTotal);
    }
}
