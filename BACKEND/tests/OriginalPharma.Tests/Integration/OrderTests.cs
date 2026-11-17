using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Catalog;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Orders;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Domain.Orders;

namespace OriginalPharma.Tests.Integration;

[Collection(PostgresCollection.Name)]
public sealed class OrderTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static OrderLineInput L(Guid productId, int quantity, decimal discountPercent = 0) => new(productId, quantity, discountPercent);

    private static CreateOrderRequest NewOrder(Guid methodId, params OrderLineInput[] lines) =>
        new(Guid.NewGuid(), new DateOnly(2026, 11, 17), PlaceType.Pharmacy, "Al Shifa pharmacy", lines, CollectionMethodId: methodId);

    private static Task<OrderDto> CreateAsync(TestDatabase db, Guid actor, CreateOrderRequest request) =>
        db.As<OrderService, OrderDto>(actor, s => s.CreateAsync(request, Ct));

    private static Task<IReadOnlyList<OrderListItemDto>> ListAsync(TestDatabase db, Guid actor, OrderQuery? query = null) =>
        db.As<OrderService, IReadOnlyList<OrderListItemDto>>(actor, s => s.ListAsync(query ?? new OrderQuery(), Ct));

    [Fact]
    public async Task Totals_are_computed_on_the_server_and_stock_is_only_a_warning()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var cardiolin = await DemoPeople.ProductAsync(db, "Cardiolin 5 mg, 30 tablets"); // 86.50, stock 240
        var pressanorm = await DemoPeople.ProductAsync(db, "Pressanorm 80 mg, 14 capsules"); // 64.25, stock 12
        var cash = await DemoPeople.MethodAsync(db, "Cash");

        var order = await CreateAsync(db, p.Rep, NewOrder(cash, L(cardiolin, 3, 10m), L(pressanorm, 20)));

        Assert.Matches(@"^ORD-\d{4}-\d{6}$", order.Number);
        Assert.Equal(OrderStatus.Submitted, order.Status);
        Assert.Equal(259.50m + 1285.00m, order.Subtotal);
        Assert.Equal(25.95m, order.DiscountTotal);
        Assert.Equal(1518.55m, order.Total);
        Assert.Equal(233.55m, order.Lines.Single(l => l.ProductId == cardiolin).LineTotal);
        Assert.Equal(64.25m, order.Lines.Single(l => l.ProductId == pressanorm).UnitPrice);

        var warning = Assert.Single(order.StockWarnings);
        Assert.Equal((pressanorm, 20, 12), (warning.ProductId, warning.Requested, warning.Available));
        Assert.True(order.Lines.Single(l => l.ProductId == pressanorm).ExceededStock);
        Assert.Equal(12, await db.DbAsync(c => c.Products.Where(x => x.Id == pressanorm).Select(x => x.StockQuantity).SingleAsync(Ct)));

        // A later price change does not touch the lines already taken.
        await db.DbAsync(c => c.Products.Where(x => x.Id == cardiolin).ExecuteUpdateAsync(s => s.SetProperty(x => x.Price, 99m), Ct));
        var edited = await db.As<OrderService, OrderDto>(p.Rep, s => s.UpdateAsync(order.Id, new UpdateOrderRequest(
            order.OrderDate, order.PlaceType, order.PlaceName, [L(cardiolin, 4, 10m)], CollectionMethodId: cash), Ct));
        Assert.Equal(86.50m, edited.Lines.Single().UnitPrice);
        Assert.Equal(311.40m, edited.Total);
        Assert.Contains(edited.History, h => h.Action == OrderHistoryAction.Edited);
    }

    [Fact]
    public async Task A_discount_above_the_role_cap_is_refused()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var product = await DemoPeople.ProductAsync(db, "Cardiolin 5 mg, 30 tablets");
        var cash = await DemoPeople.MethodAsync(db, "Cash");
        var repRole = await db.RoleAsync(DefaultRoles.Rep);

        // No cap by default.
        await CreateAsync(db, p.Rep, NewOrder(cash, L(product, 1, 40m)));

        var updated = await db.RolesAsync(p.Admin, s => s.UpdateRoleAsync(repRole.Id,
            new UpdateRoleRequest(repRole.NameAr, repRole.NameEn, repRole.Description, repRole.Level, 10m), Ct));
        Assert.Equal(10m, updated.MaxDiscountPercent);

        var error = await Assert.ThrowsAsync<BusinessRuleException>(() => CreateAsync(db, p.Rep, NewOrder(cash, L(product, 1, 12.5m))));
        Assert.Equal(OrderErrorCodes.DiscountAboveCap, error.Code);
        Assert.Equal(10m, error.Details!["maxDiscountPercent"]);

        await CreateAsync(db, p.Rep, NewOrder(cash, L(product, 1, 10m)));
    }

    [Fact]
    public async Task Retrying_with_the_same_client_request_id_never_creates_a_duplicate()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var product = await DemoPeople.ProductAsync(db, "Kidofen syrup 100 ml");
        var cash = await DemoPeople.MethodAsync(db, "Cash");
        var request = NewOrder(cash, L(product, 5));

        var first = await CreateAsync(db, p.Rep, request);
        var retry = await CreateAsync(db, p.Rep, request);
        Assert.Equal(first.Id, retry.Id);
        Assert.Equal(first.Number, retry.Number);

        // Two copies of the same queued order arriving at the same time.
        var concurrent = NewOrder(cash, L(product, 2));
        var results = await Task.WhenAll(CreateAsync(db, p.Rep, concurrent), CreateAsync(db, p.Rep, concurrent));
        Assert.Equal(results[0].Id, results[1].Id);

        var counts = await db.DbAsync(c => c.Orders
            .Where(o => o.ClientRequestId == request.ClientRequestId || o.ClientRequestId == concurrent.ClientRequestId)
            .GroupBy(o => o.ClientRequestId)
            .Select(g => g.Count())
            .ToListAsync(Ct));
        Assert.Equal([1, 1], counts);

        // The key belongs to the rep: another rep with the same key gets their own order.
        var other = await CreateAsync(db, p.RepEast, request);
        Assert.NotEqual(first.Id, other.Id);
    }

    [Fact]
    public async Task Reps_only_see_and_order_products_of_their_lines()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var cash = await DemoPeople.MethodAsync(db, "Cash");
        var derma = await DemoPeople.ProductAsync(db, "Dermacalm cream 50 g");

        var repProducts = await db.As<CatalogService, IReadOnlyList<ProductDto>>(p.Rep, s => s.ListProductsAsync(null, null, false, Ct));
        Assert.NotEmpty(repProducts);
        Assert.All(repProducts, x => Assert.Contains(x.LineNameEn, new[] { "Cardio line", "Pediatric line" }));
        var repLines = await db.As<CatalogService, IReadOnlyList<ProductLineDto>>(p.Rep, s => s.ListLinesAsync(false, Ct));
        Assert.Equal(["Cardio line", "Pediatric line"], repLines.Select(l => l.NameEn).Order());

        var eastProducts = await db.As<CatalogService, IReadOnlyList<ProductDto>>(p.RepEast, s => s.ListProductsAsync(null, null, false, Ct));
        Assert.Contains(eastProducts, x => x.Id == derma);
        Assert.DoesNotContain(eastProducts, x => x.LineNameEn == "Cardio line");

        var error = await Assert.ThrowsAsync<BusinessRuleException>(() => CreateAsync(db, p.Rep, NewOrder(cash, L(derma, 1))));
        Assert.Equal(OrderErrorCodes.ProductUnavailable, error.Code);

        // orders:manage sees every line.
        var managerProducts = await db.As<CatalogService, IReadOnlyList<ProductDto>>(p.Sales, s => s.ListProductsAsync(null, null, false, Ct));
        Assert.Contains(managerProducts, x => x.Id == derma);

        // Inactive products disappear for reps.
        await db.DbAsync(c => c.Products.Where(x => x.NameEn == "Kidofen syrup 100 ml").ExecuteUpdateAsync(s => s.SetProperty(x => x.IsActive, false), Ct));
        var afterDeactivate = await db.As<CatalogService, IReadOnlyList<ProductDto>>(p.Rep, s => s.ListProductsAsync(null, null, true, Ct));
        Assert.DoesNotContain(afterDeactivate, x => x.NameEn == "Kidofen syrup 100 ml");
    }

    [Fact]
    public async Task The_collection_method_must_be_exactly_one_of_list_or_other()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var product = await DemoPeople.ProductAsync(db, "Kidofen syrup 100 ml");
        var cash = await DemoPeople.MethodAsync(db, "Cash");

        var both = NewOrder(cash, L(product, 1)) with { CollectionMethodOther = "Cash on delivery" };
        var neither = NewOrder(cash, L(product, 1)) with { CollectionMethodId = null };
        foreach (var request in new[] { both, neither })
        {
            var error = await Assert.ThrowsAsync<BusinessRuleException>(() => CreateAsync(db, p.Rep, request));
            Assert.Equal(OrderErrorCodes.CollectionMethodInvalid, error.Code);
        }

        var other = await CreateAsync(db, p.Rep, NewOrder(cash, L(product, 1)) with { CollectionMethodId = null, CollectionMethodOther = "  Cash on delivery " });
        Assert.Null(other.CollectionMethodId);
        Assert.Equal("Cash on delivery", other.CollectionMethodOther);

        await db.DbAsync(c => c.CollectionMethods.Where(m => m.Id == cash).ExecuteUpdateAsync(s => s.SetProperty(m => m.IsActive, false), Ct));
        var inactive = await Assert.ThrowsAsync<BusinessRuleException>(() => CreateAsync(db, p.Rep, NewOrder(cash, L(product, 1))));
        Assert.Equal(OrderErrorCodes.CollectionMethodInvalid, inactive.Code);
    }

    [Fact]
    public async Task Each_role_sees_exactly_its_scope_of_orders()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var product = await DemoPeople.ProductAsync(db, "Kidofen syrup 100 ml");
        var cash = await DemoPeople.MethodAsync(db, "Cash");
        var giza = await DemoPeople.TerritoryAsync(db, "A-GIZ");

        // A rep in another area, reporting straight to the sales manager.
        var pediatric = await DemoPeople.LineAsync(db, "Pediatric line");
        var outsider = (await db.UsersAsync(p.Admin, s => s.CreateAsync(new CreateUserRequest(
            "rep.giza@test.local", "Giza Rep", PostgresFixture.Password, [DefaultRoles.Rep], p.Sales, giza,
            ProductLineIds: [pediatric]), Ct))).User.Id;

        var repOrder = await CreateAsync(db, p.Rep, NewOrder(cash, L(product, 1)));
        var eastOrder = await CreateAsync(db, p.RepEast, NewOrder(cash, L(product, 2)));
        var gizaOrder = await CreateAsync(db, outsider, NewOrder(cash, L(product, 3)));

        async Task<HashSet<Guid>> OwnersSeenBy(Guid actor) => (await ListAsync(db, actor)).Select(o => o.UserId).ToHashSet();

        Assert.Equal([p.Rep], await OwnersSeenBy(p.Rep));
        Assert.Equal([p.RepEast], await OwnersSeenBy(p.RepEast));
        Assert.Equal(new HashSet<Guid> { p.Rep, p.RepEast }, await OwnersSeenBy(p.Supervisor));
        Assert.Equal(new HashSet<Guid> { p.Rep, p.RepEast }, await OwnersSeenBy(p.Area));
        Assert.Equal(new HashSet<Guid> { p.Rep, p.RepEast, outsider }, await OwnersSeenBy(p.Sales));

        await Assert.ThrowsAsync<NotFoundException>(() => db.As<OrderService, OrderDto>(p.Rep, s => s.GetAsync(eastOrder.Id, Ct)));
        await Assert.ThrowsAsync<NotFoundException>(() => db.As<OrderService, OrderDto>(p.Supervisor, s => s.GetAsync(gizaOrder.Id, Ct)));
        Assert.Equal(repOrder.Id, (await db.As<OrderService, OrderDto>(p.Supervisor, s => s.GetAsync(repOrder.Id, Ct))).Id);

        var inGiza = await ListAsync(db, p.Sales, new OrderQuery(AreaId: giza));
        Assert.Equal([gizaOrder.Id], inGiza.Select(o => o.Id));

        var csv = System.Text.Encoding.UTF8.GetString(await db.As<OrderService, byte[]>(p.Supervisor, s => s.ExportCsvAsync(new OrderQuery(), "en", Ct)));
        Assert.Contains(repOrder.Number, csv);
        Assert.DoesNotContain(gizaOrder.Number, csv);
    }

    [Fact]
    public async Task Status_changes_follow_the_rules_and_are_audited()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var product = await DemoPeople.ProductAsync(db, "Kidofen syrup 100 ml");
        var cash = await DemoPeople.MethodAsync(db, "Cash");
        var order = await CreateAsync(db, p.Rep, NewOrder(cash, L(product, 1)));
        Assert.True(order.CanEdit);
        Assert.False(order.CanReview);

        await Assert.ThrowsAsync<ForbiddenException>(() => db.As<OrderService, OrderDto>(p.Rep, s => s.ApproveAsync(order.Id, new OrderStatusRequest(), Ct)));
        // Another rep does not even see the order.
        await Assert.ThrowsAsync<NotFoundException>(() => db.As<OrderService, OrderDto>(p.RepEast, s => s.CancelAsync(order.Id, new OrderStatusRequest(), Ct)));

        var noReason = await Assert.ThrowsAsync<BusinessRuleException>(() => db.As<OrderService, OrderDto>(p.Supervisor, s => s.RejectAsync(order.Id, new OrderStatusRequest(), Ct)));
        Assert.Equal("reason_required", noReason.Code);

        var approved = await db.As<OrderService, OrderDto>(p.Supervisor, s => s.ApproveAsync(order.Id, new OrderStatusRequest(), Ct));
        Assert.Equal(OrderStatus.Approved, approved.Status);
        Assert.Equal([OrderHistoryAction.Created, OrderHistoryAction.Approved], approved.History.Select(h => h.Action));
        Assert.Equal("Demo Supervisor", approved.History[^1].ActorName);

        var edit = await Assert.ThrowsAsync<ConflictException>(() => db.As<OrderService, OrderDto>(p.Rep, s => s.UpdateAsync(order.Id,
            new UpdateOrderRequest(order.OrderDate, order.PlaceType, order.PlaceName, [L(product, 2)], CollectionMethodId: cash), Ct)));
        Assert.Equal(OrderErrorCodes.StatusInvalid, edit.Code);
        var cancel = await Assert.ThrowsAsync<ConflictException>(() => db.As<OrderService, OrderDto>(p.Rep, s => s.CancelAsync(order.Id, new OrderStatusRequest(), Ct)));
        Assert.Equal(OrderErrorCodes.StatusInvalid, cancel.Code);

        // A manager can still cancel an approved order.
        var cancelled = await db.As<OrderService, OrderDto>(p.Supervisor, s => s.CancelAsync(order.Id, new OrderStatusRequest("Customer closed"), Ct));
        Assert.Equal(OrderStatus.Cancelled, cancelled.Status);
        Assert.Equal("Customer closed", cancelled.StatusReason);
    }
}
