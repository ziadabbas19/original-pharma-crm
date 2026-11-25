using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Visits;
using OriginalPharma.Domain.Common;
using OriginalPharma.Domain.Visits;

namespace OriginalPharma.Tests.Integration;

/// <summary>"Recently visited" on the rep Home: the caller's own visits, each customer once, latest first.</summary>
[Collection(PostgresCollection.Name)]
public sealed class RecentCustomersTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static Task VisitAsync(TestDatabase db, Guid rep, Guid customer, DateTimeOffset at, bool archived = false) =>
        db.DbAsync(c =>
        {
            var point = GeoFactory.Point(30.05, 31.33);
            c.Visits.Add(new Visit
            {
                UserId = rep,
                CustomerId = customer,
                DeviceId = "test-device",
                Status = VisitStatus.Completed,
                CheckInAt = at,
                CheckInReceivedAt = at,
                CheckInLocation = point,
                CheckInAccuracy = 10,
                CheckInWithinGeofence = true,
                CheckOutAt = at.AddMinutes(20),
                CheckOutReceivedAt = at.AddMinutes(20),
                CheckOutLocation = point,
                ArchivedAt = archived ? at.AddHours(1) : null,
            });
            return c.SaveChangesAsync(Ct);
        });

    private static Task<IReadOnlyList<RecentCustomerDto>> RecentAsync(TestDatabase db, Guid user, int? limit = null) =>
        db.As<RecentCustomersService, IReadOnlyList<RecentCustomerDto>>(user, s => s.ListAsync(limit, Ct));

    [Fact]
    public async Task Only_the_callers_own_visits_each_customer_once_latest_first()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var ids = await db.DbAsync(c => c.Customers.Where(x => x.ArchivedAt == null).OrderBy(x => x.Name).Select(x => x.Id).Take(5).ToListAsync(Ct));
        var (a, b, c, d, e) = (ids[0], ids[1], ids[2], ids[3], ids[4]);
        // Start from a clean slate: the demo data may hold visits of its own.
        await db.DbAsync(x => x.Visits.ExecuteDeleteAsync(Ct));
        var t0 = DateTimeOffset.UtcNow.AddDays(-3);

        await VisitAsync(db, p.Rep, a, t0);
        await VisitAsync(db, p.Rep, b, t0.AddHours(1));
        await VisitAsync(db, p.Rep, a, t0.AddHours(2));             // A again: counted once, at its latest visit
        await VisitAsync(db, p.Rep, c, t0.AddHours(3), archived: true); // deleted visit: not counted
        await VisitAsync(db, p.RepEast, d, t0.AddHours(4));          // another rep's visit: not counted
        await VisitAsync(db, p.Rep, e, t0.AddHours(5));

        var recent = await RecentAsync(db, p.Rep);

        Assert.Equal([e, a, b], recent.Select(r => r.Id));
        Assert.Equal(t0.AddHours(2).ToUnixTimeSeconds(), recent[1].LastVisitAt.ToUnixTimeSeconds());
        Assert.All(recent, r => Assert.False(string.IsNullOrEmpty(r.Name)));

        // The limit keeps the latest ones; the other rep sees only their own.
        Assert.Equal([e], (await RecentAsync(db, p.Rep, 1)).Select(r => r.Id));
        Assert.Equal([d], (await RecentAsync(db, p.RepEast)).Select(r => r.Id));
        Assert.Empty(await RecentAsync(db, p.Supervisor));
    }

    [Fact]
    public async Task Archived_customers_are_left_out()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var ids = await db.DbAsync(c => c.Customers.Where(x => x.ArchivedAt == null).OrderBy(x => x.Name).Select(x => x.Id).Take(2).ToListAsync(Ct));
        await db.DbAsync(x => x.Visits.ExecuteDeleteAsync(Ct));
        await VisitAsync(db, p.Rep, ids[0], DateTimeOffset.UtcNow.AddHours(-2));
        await VisitAsync(db, p.Rep, ids[1], DateTimeOffset.UtcNow.AddHours(-1));
        await db.DbAsync(c => c.Customers.Where(x => x.Id == ids[1]).ExecuteUpdateAsync(s => s.SetProperty(x => x.ArchivedAt, DateTimeOffset.UtcNow), Ct));

        Assert.Equal([ids[0]], (await RecentAsync(db, p.Rep)).Select(r => r.Id));
    }
}
