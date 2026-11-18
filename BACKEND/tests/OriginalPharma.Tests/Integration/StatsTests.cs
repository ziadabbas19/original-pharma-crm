using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Orders;
using OriginalPharma.Application.Stats;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Domain.Orders;

namespace OriginalPharma.Tests.Integration;

[Collection(PostgresCollection.Name)]
public sealed class StatsTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static Task<T> AsAsync<T>(TestDatabase db, Guid actor, Func<StatsService, Task<T>> action) =>
        db.As<StatsService, T>(actor, action);

    [Fact]
    public async Task Every_seeded_role_sees_exactly_its_scope()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);

        // A rep in Giza reporting to the sales manager, with one order: outside the area manager's territory.
        var giza = await DemoPeople.TerritoryAsync(db, "A-GIZ");
        var pediatric = await DemoPeople.LineAsync(db, "Pediatric line");
        var outsider = (await db.UsersAsync(p.Admin, s => s.CreateAsync(new CreateUserRequest(
            "rep.giza@test.local", "Giza Rep", PostgresFixture.Password, [DefaultRoles.Rep], p.Sales, giza, ProductLineIds: [pediatric]), Ct))).User.Id;
        var kidofen = await DemoPeople.ProductAsync(db, "Kidofen syrup 100 ml");
        var cash = await DemoPeople.MethodAsync(db, "Cash");
        await db.As<OrderService, OrderDto>(outsider, s => s.CreateAsync(new CreateOrderRequest(Guid.NewGuid(),
            DateOnly.FromDateTime(DateTime.UtcNow), PlaceType.Pharmacy, "Giza pharmacy", [new OrderLineInput(kidofen, 2)], CollectionMethodId: cash), Ct));

        async Task<HashSet<Guid>> RepsInOrders(Guid actor) =>
            (await AsAsync(db, actor, s => s.OrdersAsync(new StatsQuery(), Ct))).ByRep.Select(r => Guid.Parse(r.Key)).ToHashSet();
        async Task<HashSet<Guid>> RepsRanked(Guid actor) =>
            (await AsAsync(db, actor, s => s.RepsAsync(new StatsQuery(), Ct))).Reps.Select(r => r.RepId).ToHashSet();

        Assert.Equal([p.Rep], await RepsInOrders(p.Rep));
        Assert.Equal([p.RepEast], await RepsInOrders(p.RepEast));
        Assert.Equal(new HashSet<Guid> { p.Rep, p.RepEast }, await RepsInOrders(p.Supervisor));
        Assert.Equal(new HashSet<Guid> { p.Rep, p.RepEast }, await RepsInOrders(p.Area));
        Assert.Equal(new HashSet<Guid> { p.Rep, p.RepEast, outsider }, await RepsInOrders(p.Sales));
        Assert.Equal(new HashSet<Guid> { p.Rep, p.RepEast, outsider }, await RepsInOrders(p.Admin));

        Assert.Equal([p.Rep], await RepsRanked(p.Rep));
        Assert.DoesNotContain(outsider, await RepsRanked(p.Area));
        Assert.Contains(outsider, await RepsRanked(p.Sales));

        // Scope is reported with the numbers.
        Assert.Equal(PermissionScope.Own, (await AsAsync(db, p.Rep, s => s.VisitsAsync(new StatsQuery(), Ct))).Range.Scope);
        Assert.Equal(PermissionScope.Team, (await AsAsync(db, p.Supervisor, s => s.VisitsAsync(new StatsQuery(), Ct))).Range.Scope);
        Assert.Equal(PermissionScope.Territory, (await AsAsync(db, p.Area, s => s.VisitsAsync(new StatsQuery(), Ct))).Range.Scope);

        // A rep filtering on someone else gets nothing, not their numbers.
        var peek = await AsAsync(db, p.Rep, s => s.OrdersAsync(new StatsQuery(RepId: p.RepEast), Ct));
        Assert.Equal(0, peek.OrderCount);
    }

    [Fact]
    public async Task Numbers_match_the_rows_they_summarise()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var orders = await AsAsync(db, p.Supervisor, s => s.OrdersAsync(new StatsQuery(), Ct));

        var rows = await db.DbAsync(c => c.Orders.Where(o => (o.UserId == p.Rep || o.UserId == p.RepEast) && o.ArchivedAt == null).ToListAsync(Ct));
        var valid = rows.Where(o => o.Status is OrderStatus.Submitted or OrderStatus.Approved).ToList();
        Assert.Equal(rows.Count, orders.OrderCount);
        Assert.Equal(valid.Sum(o => o.Total), orders.OrderValue);
        Assert.Equal(valid.Sum(o => o.DiscountTotal), orders.DiscountTotal);
        Assert.Equal(rows.Count(o => o.Delivery == DeliveryStatus.Delivered), orders.Delivered);
        Assert.Equal(rows.Count(o => o.Status == OrderStatus.Approved && o.Delivery != DeliveryStatus.Delivered), orders.NotDelivered);
        Assert.Equal(rows.Count, orders.ByStatus.Sum(s => s.Count));
        Assert.Equal(30, orders.Trend.Count);
        Assert.Equal(valid.Sum(o => o.Total), orders.Trend.Sum(t => t.Value));
        Assert.Equal(valid.Sum(o => o.Total), orders.ByRep.Sum(r => r.Value));

        var visits = await AsAsync(db, p.Supervisor, s => s.VisitsAsync(new StatsQuery(), Ct));
        Assert.Equal(8, visits.VisitCount); // demo visits of both reps
        Assert.Equal(visits.VisitCount, visits.PerRepPerDay.Sum(r => r.Count));
        Assert.Equal(visits.VisitCount, visits.Trend.Sum(t => t.Count));
        Assert.Equal(visits.VisitCount, visits.Verified + visits.Unverified);
        Assert.Equal(6, visits.FeedbackByCategory.Sum(f => f.Count) - visits.FeedbackByCategory.Single(f => f.Key == "none").Count);
        Assert.True(visits.ProductsDiscussed.Count > 0);
        Assert.True(visits.DoctorsCovered > 0 && visits.DoctorsCovered <= visits.DoctorsOnList);

        var doctors = await AsAsync(db, p.Rep, s => s.DoctorsAsync(new StatsQuery(), Ct));
        Assert.Equal(6, doctors.OnLists);
        Assert.Equal(doctors.OnLists, doctors.Covered + doctors.NotCovered);
        Assert.Equal(doctors.NotCovered, doctors.NotVisited.Count);

        var reps = await AsAsync(db, p.Supervisor, s => s.RepsAsync(new StatsQuery(), Ct));
        Assert.All(reps.Reps, r => Assert.True(r.TrackingHours > 0 && r.ActiveDays > 0));

        // Filtering by a product line keeps only orders with that line.
        var derma = await DemoPeople.LineAsync(db, "Derma line");
        var dermaOrders = await AsAsync(db, p.Supervisor, s => s.OrdersAsync(new StatsQuery(LineId: derma), Ct));
        Assert.True(dermaOrders.OrderCount < orders.OrderCount);
        Assert.All(dermaOrders.TopLines, l => Assert.Equal(derma.ToString(), l.Key));

        var catalog = await AsAsync(db, p.Rep, s => s.CatalogAsync(new StatsQuery(), Ct));
        Assert.Equal(8, catalog.ProductsPerLine.Sum(l => l.Count)); // cardio and pediatric products
        Assert.Contains(catalog.LowStock, x => x.Name == "Probiokid sachets, 10");

        // Every table exports.
        foreach (var (section, tables) in StatsCsv.Tables)
        {
            object data = section switch
            {
                StatsSection.Orders => orders,
                StatsSection.Visits => visits,
                StatsSection.Doctors => doctors,
                StatsSection.Reps => reps,
                _ => catalog,
            };
            foreach (var table in tables)
            {
                Assert.NotEmpty(StatsCsv.Build(data, table, "ar"));
            }
        }
    }
}
