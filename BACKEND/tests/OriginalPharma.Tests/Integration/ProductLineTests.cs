using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Catalog;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Bulk;
using OriginalPharma.Application.Orders;
using OriginalPharma.Domain.Audit;
using OriginalPharma.Domain.Orders;

namespace OriginalPharma.Tests.Integration;

[Collection(PostgresCollection.Name)]
public sealed class ProductLineTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static Task<IReadOnlyList<ProductDto>> ProductsAsync(TestDatabase db, Guid actor, ProductQuery? query = null) =>
        db.As<CatalogService, IReadOnlyList<ProductDto>>(actor, s => s.ListProductsAsync(query ?? new ProductQuery(), Ct));

    [Fact]
    public async Task Deleting_a_line_keeps_every_product_unassigned_and_hidden_from_reps()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var cardio = await DemoPeople.LineAsync(db, "Cardio line");
        var cardioProducts = await db.DbAsync(c => c.Products.Where(x => x.ProductLineId == cardio).Select(x => x.Id).ToListAsync(Ct));
        var productCount = await db.DbAsync(c => c.Products.CountAsync(Ct));
        Assert.Equal(4, cardioProducts.Count);

        var preview = await db.As<CatalogService, BulkResult>(p.Admin, s => s.DeleteLinesAsync(new BulkDeleteRequest([cardio], DryRun: true), Ct));
        Assert.Equal(4, preview.Items.Single().UsageCount);

        var result = await db.As<CatalogService, BulkResult>(p.Admin, s => s.DeleteLinesAsync(new BulkDeleteRequest([cardio]), Ct));
        Assert.Equal(1, result.Deleted);

        // Nothing deleted or hidden: same products, now without a line; the reps lost the line.
        Assert.Equal(productCount, await db.DbAsync(c => c.Products.CountAsync(Ct)));
        Assert.All(await db.DbAsync(c => c.Products.Where(x => cardioProducts.Contains(x.Id)).ToListAsync(Ct)), x =>
        {
            Assert.Null(x.ProductLineId);
            Assert.Null(x.ArchivedAt);
            Assert.True(x.IsActive);
        });
        Assert.False(await db.DbAsync(c => c.UserProductLines.AnyAsync(l => l.ProductLineId == cardio, Ct)));

        // Managers see them as unassigned; reps do not see them at all.
        var unassigned = await ProductsAsync(db, p.Sales, new ProductQuery(Unassigned: true));
        Assert.Equal(cardioProducts.Order(), unassigned.Select(x => x.Id).Order());
        Assert.All(unassigned, x => Assert.Null(x.ProductLineId));
        Assert.Contains(await ProductsAsync(db, p.Supervisor), x => cardioProducts.Contains(x.Id)); // orders:manage
        Assert.DoesNotContain(await ProductsAsync(db, p.Rep), x => cardioProducts.Contains(x.Id));
        Assert.Empty(await ProductsAsync(db, p.Rep, new ProductQuery(Unassigned: true)));

        // Reps cannot order them; an order that already had one keeps working with its price snapshot.
        var cash = await DemoPeople.MethodAsync(db, "Cash");
        var refused = await Assert.ThrowsAsync<BusinessRuleException>(() => db.As<OrderService, OrderDto>(p.Rep, s => s.CreateAsync(
            new CreateOrderRequest(Guid.NewGuid(), new DateOnly(2026, 11, 18), PlaceType.Pharmacy, "X", [new OrderLineInput(cardioProducts[0], 1)],
                CollectionMethodId: cash), Ct)));
        Assert.Equal(OrderErrorCodes.ProductUnavailable, refused.Code);
        var existing = await db.DbAsync(c => c.Orders.Where(o => o.UserId == p.Rep && o.Status == OrderStatus.Submitted)
            .OrderByDescending(o => o.CreatedAt).Select(o => o.Id).FirstAsync(Ct));
        var order = await db.As<OrderService, OrderDto>(p.Rep, s => s.GetAsync(existing, Ct));
        Assert.Contains(order.Lines, l => cardioProducts.Contains(l.ProductId));
        var edited = await db.As<OrderService, OrderDto>(p.Rep, s => s.UpdateAsync(existing, new UpdateOrderRequest(
            order.OrderDate, order.PlaceType, order.PlaceName,
            order.Lines.Select(l => new OrderLineInput(l.ProductId, l.Quantity + 1, l.DiscountPercent)).ToList(),
            order.CustomerId, order.CollectionMethodId, order.CollectionMethodOther, order.Notes), Ct));
        Assert.Equal(order.Lines.Select(l => l.UnitPrice), edited.Lines.Select(l => l.UnitPrice));

        var audit = await db.DbAsync(c => c.AuditEntries.SingleAsync(e => e.EntityType == "product_line" && e.EntityId == cardio, Ct));
        Assert.Equal(AuditAction.Deleted, audit.Action);
        Assert.Equal(4, System.Text.Json.JsonDocument.Parse(audit.Details).RootElement.GetProperty("productsUnassigned").GetInt32());
    }

    [Fact]
    public async Task Products_move_to_a_line_one_at_a_time_or_in_bulk()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var derma = await DemoPeople.LineAsync(db, "Derma line");
        var pediatric = await DemoPeople.LineAsync(db, "Pediatric line");
        var dermaProducts = await db.DbAsync(c => c.Products.Where(x => x.ProductLineId == derma).Select(x => x.Id).ToListAsync(Ct));
        await db.As<CatalogService, BulkResult>(p.Admin, s => s.DeleteLinesAsync(new BulkDeleteRequest([derma]), Ct));

        // One product through the form (line chosen again), the rest with the bulk action.
        var one = await db.As<CatalogService, ProductDto>(p.Sales, async s =>
        {
            var current = (await s.ListProductsAsync(new ProductQuery(Unassigned: true), Ct)).First();
            return await s.UpdateProductAsync(current.Id, new SaveProductRequest(pediatric, current.NameAr, current.NameEn, current.Description,
                current.Price, current.StockQuantity, current.IsActive), Ct);
        });
        Assert.Equal(pediatric, one.ProductLineId);

        var rest = dermaProducts.Where(id => id != one.Id).ToList();
        var moved = await db.As<CatalogService, BulkResult>(p.Sales, s => s.MoveProductsAsync(new MoveProductsRequest(rest, pediatric), Ct));
        Assert.Equal(rest.Count, moved.Updated);
        Assert.Empty(await ProductsAsync(db, p.Sales, new ProductQuery(Unassigned: true)));

        // The rep sells the pediatric line, so the moved products are back for them.
        var repProducts = await ProductsAsync(db, p.Rep);
        Assert.All(dermaProducts, id => Assert.Contains(repProducts, x => x.Id == id));

        // Taking products out of their line is the same action with no line.
        var outOfLine = await db.As<CatalogService, BulkResult>(p.Sales, s => s.MoveProductsAsync(new MoveProductsRequest([one.Id], null), Ct));
        Assert.Equal(1, outOfLine.Updated);
        Assert.Contains(await db.DbAsync(c => c.AuditEntries.Where(e => e.Action == AuditAction.Moved).ToListAsync(Ct)), e => e.EntityId == one.Id);
    }

    [Fact]
    public async Task Products_on_past_orders_are_archived_and_unused_ones_removed()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var sold = await DemoPeople.ProductAsync(db, "Cardiolin 5 mg, 30 tablets");
        var unused = (await db.As<CatalogService, ProductDto>(p.Admin, s => s.CreateProductAsync(
            new SaveProductRequest(null, "منتج تجريبي", "Trial product", null, 10m, 5), Ct))).Id;

        var result = await db.As<CatalogService, BulkResult>(p.Admin, s => s.DeleteProductsAsync(new BulkDeleteRequest([sold, unused]), Ct));
        Assert.Equal(BulkOutcome.Archived, result.Items.Single(i => i.Id == sold).Outcome);
        Assert.Equal(BulkOutcome.Deleted, result.Items.Single(i => i.Id == unused).Outcome);
        Assert.DoesNotContain(await ProductsAsync(db, p.Sales), x => x.Id == sold);
        Assert.Contains(await ProductsAsync(db, p.Sales, new ProductQuery(Archived: true)), x => x.Id == sold);
        Assert.Empty(await ProductsAsync(db, p.Rep, new ProductQuery(Archived: true)));

        // Old orders still show it by its snapshot name.
        var lines = await db.DbAsync(c => c.OrderLines.Where(l => l.ProductId == sold).Select(l => l.ProductNameEn).ToListAsync(Ct));
        Assert.All(lines, name => Assert.Equal("Cardiolin 5 mg, 30 tablets", name));

        var restored = await db.As<CatalogService, BulkResult>(p.Admin, s => s.RestoreProductsAsync(new BulkIdsRequest([sold]), Ct));
        Assert.Equal(1, restored.Restored);
        Assert.Contains(await ProductsAsync(db, p.Rep), x => x.Id == sold);
    }
}
