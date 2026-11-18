using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using OriginalPharma.Application.Catalog;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Organization;
using OriginalPharma.Application.Common.Scoping;
using OriginalPharma.Application.Identity;
using OriginalPharma.Domain.Crm;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Domain.Orders;
using OriginalPharma.Domain.Visits;

namespace OriginalPharma.Application.Stats;

/// <summary>
/// Statistics for every role from one code path: every number is aggregated in the database inside
/// the caller's stats:read scope (own, team, territory, all), so a rep sees their own numbers, a
/// supervisor their team, a manager their territory and an admin everything. Archived (deleted)
/// orders and visits are left out. Results are cached briefly per user, permissions version and filters.
/// </summary>
public sealed class StatsService(
    IAppDbContext db,
    ICurrentUser currentUser,
    IDataScopeResolver scopes,
    IPermissionService permissions,
    ProductAccess productAccess,
    IMemoryCache cache,
    IOptions<StatsOptions> options,
    TimeProvider time)
{
    private const int TopRows = 10;
    private const int MaxNotVisited = 100;

    public Task<OrderStatsDto> OrdersAsync(StatsQuery query, CancellationToken cancellationToken = default) =>
        CachedAsync(StatsSection.Orders, query, ComputeOrdersAsync, cancellationToken);

    public Task<VisitStatsDto> VisitsAsync(StatsQuery query, CancellationToken cancellationToken = default) =>
        CachedAsync(StatsSection.Visits, query, ComputeVisitsAsync, cancellationToken);

    public Task<DoctorStatsDto> DoctorsAsync(StatsQuery query, CancellationToken cancellationToken = default) =>
        CachedAsync(StatsSection.Doctors, query, ComputeDoctorsAsync, cancellationToken);

    public Task<RepStatsDto> RepsAsync(StatsQuery query, CancellationToken cancellationToken = default) =>
        CachedAsync(StatsSection.Reps, query, ComputeRepsAsync, cancellationToken);

    public Task<CatalogStatsDto> CatalogAsync(StatsQuery query, CancellationToken cancellationToken = default) =>
        CachedAsync(StatsSection.Catalog, query, ComputeCatalogAsync, cancellationToken);

    /// <summary>
    /// Cache key: user, permissions version (a scope change shows immediately) and filters. Safe to
    /// cache because nothing in the key is shared between users.
    /// </summary>
    private async Task<T> CachedAsync<T>(StatsSection section, StatsQuery query, Func<Context, CancellationToken, Task<T>> compute, CancellationToken cancellationToken)
        where T : class
    {
        var me = currentUser.RequireUserId();
        var version = await permissions.GetVersionAsync(me, cancellationToken);
        var context = await ContextAsync(query, cancellationToken);
        var key = $"stats:{section}:{me:N}:{version}:{context.From:yyyyMMdd}:{context.To:yyyyMMdd}:{query.RepId}:{query.AreaId}:{query.LineId}:{query.ProductId}";
        if (cache.TryGetValue(key, out T? cached) && cached is not null)
        {
            return cached;
        }

        var result = await compute(context, cancellationToken);
        cache.Set(key, result, TimeSpan.FromSeconds(Math.Max(0, options.Value.CacheSeconds)));
        return result;
    }

    private async Task<OrderStatsDto> ComputeOrdersAsync(Context c, CancellationToken cancellationToken)
    {
        var orders = Orders(c);
        var valid = orders.Where(o => o.Status == OrderStatus.Submitted || o.Status == OrderStatus.Approved);

        var byStatus = await orders.GroupBy(o => o.Status)
            .Select(g => new { g.Key, Count = g.Count(), Value = g.Sum(o => o.Total), Discount = g.Sum(o => o.DiscountTotal) })
            .ToListAsync(cancellationToken);
        var delivery = await orders.Where(o => o.Status == OrderStatus.Approved)
            .GroupBy(o => o.Delivery)
            .Select(g => new { g.Key, Count = g.Count(), Value = g.Sum(o => o.Total) })
            .ToListAsync(cancellationToken);
        var trend = await valid.GroupBy(o => o.OrderDate)
            .Select(g => new { g.Key, Count = g.Count(), Value = g.Sum(o => o.Total) })
            .ToListAsync(cancellationToken);
        var byRep = await valid.GroupBy(o => o.UserId)
            .Select(g => new { g.Key, Count = g.Count(), Value = g.Sum(o => o.Total) })
            .OrderByDescending(x => x.Value).ToListAsync(cancellationToken);
        var byArea = await valid.GroupBy(o => o.TerritoryId)
            .Select(g => new { g.Key, Count = g.Count(), Value = g.Sum(o => o.Total) })
            .OrderByDescending(x => x.Value).ToListAsync(cancellationToken);
        var byPlace = await valid.GroupBy(o => o.PlaceType)
            .Select(g => new { g.Key, Count = g.Count(), Value = g.Sum(o => o.Total) })
            .OrderByDescending(x => x.Value).ToListAsync(cancellationToken);
        var byMethod = await valid.GroupBy(o => o.CollectionMethodId)
            .Select(g => new { g.Key, Count = g.Count(), Value = g.Sum(o => o.Total) })
            .OrderByDescending(x => x.Value).ToListAsync(cancellationToken);

        var lines = db.OrderLines.AsNoTracking().Where(l => valid.Select(o => o.Id).Contains(l.OrderId));
        if (c.ProductIds is { } productIds)
        {
            lines = lines.Where(l => productIds.Contains(l.ProductId));
        }

        var topProducts = await lines.GroupBy(l => l.ProductId)
            .Select(g => new { g.Key, Count = g.Count(), Value = g.Sum(l => l.LineTotal), Quantity = g.Sum(l => l.Quantity), NameEn = g.Max(l => l.ProductNameEn), NameAr = g.Max(l => l.ProductNameAr) })
            .OrderByDescending(x => x.Value).Take(TopRows).ToListAsync(cancellationToken);
        var topLines = await lines.Join(db.Products, l => l.ProductId, p => p.Id, (l, p) => new { l.LineTotal, l.Quantity, p.ProductLineId })
            .GroupBy(x => x.ProductLineId)
            .Select(g => new { g.Key, Count = g.Count(), Value = g.Sum(x => x.LineTotal), Quantity = g.Sum(x => x.Quantity) })
            .OrderByDescending(x => x.Value).Take(TopRows).ToListAsync(cancellationToken);

        var userNames = await UserNamesAsync(byRep.Select(r => r.Key), cancellationToken);
        var territories = await TerritoryNamesAsync(byArea.Where(a => a.Key != null).Select(a => a.Key!.Value), cancellationToken);
        var methodIds = byMethod.Where(m => m.Key != null).Select(m => m.Key!.Value).ToArray();
        var methods = await db.CollectionMethods.AsNoTracking().Where(m => methodIds.Contains(m.Id))
            .ToDictionaryAsync(m => m.Id, m => (m.NameEn, m.NameAr), cancellationToken);
        var lineIds = topLines.Where(l => l.Key != null).Select(l => l.Key!.Value).ToArray();
        var lineNames = await db.ProductLines.AsNoTracking().Where(l => lineIds.Contains(l.Id))
            .ToDictionaryAsync(l => l.Id, l => (l.NameEn, l.NameAr), cancellationToken);

        var validRows = byStatus.Where(s => s.Key is OrderStatus.Submitted or OrderStatus.Approved).ToList();
        var validCount = validRows.Sum(s => s.Count);
        var value = validRows.Sum(s => s.Value);

        return new OrderStatsDto(
            c.Range,
            byStatus.Sum(s => s.Count),
            value,
            validCount == 0 ? 0 : decimal.Round(value / validCount, 2, MidpointRounding.AwayFromZero),
            validRows.Sum(s => s.Discount),
            delivery.Where(d => d.Key == DeliveryStatus.Delivered).Sum(d => d.Count),
            delivery.Where(d => d.Key != DeliveryStatus.Delivered).Sum(d => d.Count),
            delivery.Where(d => d.Key == DeliveryStatus.Delivered).Sum(d => d.Value),
            Enum.GetValues<OrderStatus>()
                .Select(status => byStatus.FirstOrDefault(s => s.Key == status) is { } row
                    ? new StatRow(Key(status), Labels.Status[status].En, Labels.Status[status].Ar, row.Count, row.Value)
                    : new StatRow(Key(status), Labels.Status[status].En, Labels.Status[status].Ar, 0))
                .ToList(),
            FillDays(c, trend.ToDictionary(t => t.Key, t => (t.Count, t.Value))),
            topProducts.Select(p => new StatRow(p.Key.ToString(), p.NameEn ?? string.Empty, p.NameAr, p.Count, p.Value, p.Quantity)).ToList(),
            topLines.Select(l => l.Key is { } id && lineNames.TryGetValue(id, out var n)
                    ? new StatRow(id.ToString(), n.NameEn, n.NameAr, l.Count, l.Value, l.Quantity)
                    : new StatRow("unassigned", Labels.Unassigned.En, Labels.Unassigned.Ar, l.Count, l.Value, l.Quantity))
                .ToList(),
            byRep.Select(r => new StatRow(r.Key.ToString(), userNames.GetValueOrDefault(r.Key, string.Empty), null, r.Count, r.Value)).ToList(),
            byArea.Select(a => a.Key is { } id && territories.TryGetValue(id, out var t)
                    ? new StatRow(id.ToString(), t.Name, t.NameAr, a.Count, a.Value)
                    : new StatRow("none", Labels.NoArea.En, Labels.NoArea.Ar, a.Count, a.Value))
                .ToList(),
            byPlace.Select(p => new StatRow(Key(p.Key), Labels.Place[p.Key].En, Labels.Place[p.Key].Ar, p.Count, p.Value)).ToList(),
            byMethod.Select(m => m.Key is { } id && methods.TryGetValue(id, out var n)
                    ? new StatRow(id.ToString(), n.NameEn, n.NameAr, m.Count, m.Value)
                    : new StatRow("other", Labels.OtherMethod.En, Labels.OtherMethod.Ar, m.Count, m.Value))
                .ToList());
    }

    private async Task<VisitStatsDto> ComputeVisitsAsync(Context c, CancellationToken cancellationToken)
    {
        var visits = Visits(c);
        var counts = await visits
            .GroupBy(v => !v.NeedsReview && v.CheckInWithinGeofence)
            .Select(g => new { Verified = g.Key, Count = g.Count(), Completed = g.Count(v => v.Status == VisitStatus.Completed) })
            .ToListAsync(cancellationToken);

        // Grouped in SQL by rep and UTC hour, then placed on local days here (correct for whole-hour time zones).
        var buckets = await visits
            .GroupBy(v => new { v.UserId, v.CheckInAt.Year, v.CheckInAt.Month, v.CheckInAt.Day, v.CheckInAt.Hour })
            .Select(g => new { g.Key.UserId, g.Key.Year, g.Key.Month, g.Key.Day, g.Key.Hour, Count = g.Count() })
            .ToListAsync(cancellationToken);
        var perRepDay = buckets
            .GroupBy(b => (b.UserId, Day: LocalDay(c, new DateTimeOffset(b.Year, b.Month, b.Day, b.Hour, 0, 0, TimeSpan.Zero))))
            .Select(g => (g.Key.UserId, g.Key.Day, Count: g.Sum(b => b.Count)))
            .ToList();

        var byRep = await visits.GroupBy(v => v.UserId)
            .Select(g => new { g.Key, Count = g.Count(), Verified = g.Count(v => !v.NeedsReview && v.CheckInWithinGeofence) })
            .OrderByDescending(x => x.Count).ToListAsync(cancellationToken);

        var discussed = db.VisitProducts.AsNoTracking().Where(p => visits.Select(v => v.Id).Contains(p.VisitId));
        if (c.ProductIds is { } productIds)
        {
            discussed = discussed.Where(p => productIds.Contains(p.ProductId));
        }

        var products = await discussed.GroupBy(p => p.ProductId)
            .Select(g => new { g.Key, Count = g.Count() })
            .OrderByDescending(x => x.Count).Take(TopRows).ToListAsync(cancellationToken);
        var productIdsShown = products.Select(p => p.Key).ToArray();
        var productNames = await db.Products.AsNoTracking().Where(p => productIdsShown.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => (p.NameEn, p.NameAr), cancellationToken);

        var feedback = await db.VisitFeedback.AsNoTracking()
            .Where(f => visits.Select(v => v.Id).Contains(f.VisitId))
            .GroupBy(f => f.Category)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);

        var (onList, covered) = await CoverageTotalsAsync(c, cancellationToken);
        var names = await UserNamesAsync(byRep.Select(r => r.Key).Union(perRepDay.Select(r => r.UserId)), cancellationToken);
        var total = counts.Sum(x => x.Count);

        return new VisitStatsDto(
            c.Range,
            total,
            counts.Where(x => x.Verified).Sum(x => x.Count),
            counts.Where(x => !x.Verified).Sum(x => x.Count),
            counts.Sum(x => x.Completed),
            perRepDay.Count == 0 ? 0 : decimal.Round((decimal)total / perRepDay.Count, 1, MidpointRounding.AwayFromZero),
            onList,
            covered,
            FillDays(c, perRepDay.GroupBy(r => r.Day).ToDictionary(g => g.Key, g => (g.Sum(r => r.Count), 0m))),
            perRepDay.OrderBy(r => r.Day).ThenBy(r => names.GetValueOrDefault(r.UserId))
                .Select(r => new RepDayRow(r.UserId, names.GetValueOrDefault(r.UserId, string.Empty), r.Day, r.Count)).ToList(),
            byRep.Select(r => new StatRow(r.Key.ToString(), names.GetValueOrDefault(r.Key, string.Empty), null, r.Count, 0, r.Verified)).ToList(),
            products.Select(p => productNames.TryGetValue(p.Key, out var n)
                ? new StatRow(p.Key.ToString(), n.NameEn, n.NameAr, p.Count)
                : new StatRow(p.Key.ToString(), string.Empty, null, p.Count)).ToList(),
            Enum.GetValues<VisitFeedbackCategory>().Select(category => (VisitFeedbackCategory?)category).Append(null)
                .Select(category =>
                {
                    var label = category is { } cat ? Labels.Feedback[cat] : Labels.NoCategory;
                    return new StatRow(category is { } k ? Key(k) : "none", label.En, label.Ar, feedback.FirstOrDefault(f => f.Key == category)?.Count ?? 0);
                })
                .ToList());
    }

    private async Task<DoctorStatsDto> ComputeDoctorsAsync(Context c, CancellationToken cancellationToken)
    {
        var visited = Visits(c);
        var assignments = Assignments(c)
            .Select(a => new
            {
                a.UserId,
                a.CustomerId,
                a.Customer!.TerritoryId,
                a.Customer.SpecialtyId,
                Covered = visited.Any(v => v.CustomerId == a.CustomerId),
                CoveredByRep = visited.Any(v => v.CustomerId == a.CustomerId && v.UserId == a.UserId),
            });

        var byRep = await assignments.GroupBy(a => a.UserId)
            .Select(g => new { g.Key, Count = g.Count(), Covered = g.Count(a => a.CoveredByRep) })
            .OrderByDescending(x => x.Count).ToListAsync(cancellationToken);
        var doctors = assignments.Select(a => new { a.CustomerId, a.TerritoryId, a.SpecialtyId, a.Covered }).Distinct();
        var byTown = await doctors.GroupBy(d => d.TerritoryId)
            .Select(g => new { g.Key, Count = g.Count(), Covered = g.Count(d => d.Covered) })
            .OrderByDescending(x => x.Count).ToListAsync(cancellationToken);
        var bySpecialty = await doctors.GroupBy(d => d.SpecialtyId)
            .Select(g => new { g.Key, Count = g.Count(), Covered = g.Count(d => d.Covered) })
            .OrderByDescending(x => x.Count).ToListAsync(cancellationToken);
        var notVisitedIds = doctors.Where(d => !d.Covered).Select(d => d.CustomerId);
        var notVisited = await db.Customers.AsNoTracking()
            .Where(d => notVisitedIds.Contains(d.Id))
            .OrderBy(d => d.Name)
            .Take(MaxNotVisited)
            .Select(d => new { d.Id, d.Name, d.NameAr })
            .ToListAsync(cancellationToken);

        var names = await UserNamesAsync(byRep.Select(r => r.Key), cancellationToken);
        var towns = await TerritoryNamesAsync(byTown.Where(t => t.Key != null).Select(t => t.Key!.Value), cancellationToken);
        var specialtyIds = bySpecialty.Where(s => s.Key != null).Select(s => s.Key!.Value).ToArray();
        var specialties = await db.Specialties.AsNoTracking().Where(s => specialtyIds.Contains(s.Id))
            .ToDictionaryAsync(s => s.Id, s => (s.NameEn, s.NameAr), cancellationToken);
        var onLists = byTown.Sum(t => t.Count);
        var covered = byTown.Sum(t => t.Covered);

        return new DoctorStatsDto(
            c.Range,
            onLists,
            covered,
            onLists - covered,
            byRep.Select(r => new StatRow(r.Key.ToString(), names.GetValueOrDefault(r.Key, string.Empty), null, r.Count, 0, r.Covered)).ToList(),
            byTown.Select(t => t.Key is { } id && towns.TryGetValue(id, out var n)
                    ? new StatRow(id.ToString(), n.Name, n.NameAr, t.Count, 0, t.Covered)
                    : new StatRow("none", Labels.NoArea.En, Labels.NoArea.Ar, t.Count, 0, t.Covered))
                .ToList(),
            bySpecialty.Select(s => s.Key is { } id && specialties.TryGetValue(id, out var n)
                    ? new StatRow(id.ToString(), n.NameEn, n.NameAr, s.Count, 0, s.Covered)
                    : new StatRow("none", Labels.NoSpecialty.En, Labels.NoSpecialty.Ar, s.Count, 0, s.Covered))
                .ToList(),
            notVisited.Select(d => new StatRow(d.Id.ToString(), d.Name, d.NameAr, 0)).ToList());
    }

    private async Task<RepStatsDto> ComputeRepsAsync(Context c, CancellationToken cancellationToken)
    {
        var orders = await Orders(c).Where(o => o.Status == OrderStatus.Submitted || o.Status == OrderStatus.Approved)
            .GroupBy(o => o.UserId)
            .Select(g => new { g.Key, Count = g.Count(), Value = g.Sum(o => o.Total) })
            .ToDictionaryAsync(x => x.Key, cancellationToken);
        var visits = await Visits(c).GroupBy(v => v.UserId)
            .Select(g => new { g.Key, Count = g.Count(), Doctors = g.Select(v => v.CustomerId).Distinct().Count() })
            .ToDictionaryAsync(x => x.Key, cancellationToken);

        // One shift per rep per working day: few rows, summed here because durations do not translate to SQL portably.
        var shifts = await Shifts(c)
            .Select(s => new { s.UserId, s.StartedAt, s.EndedAt })
            .ToListAsync(cancellationToken);
        var now = time.GetUtcNow();
        var hours = shifts.GroupBy(s => s.UserId).ToDictionary(g => g.Key, g => (
            Hours: g.Sum(s =>
            {
                var start = s.StartedAt < c.FromUtc ? c.FromUtc : s.StartedAt;
                var end = s.EndedAt ?? now;
                end = end > c.ToUtc ? c.ToUtc : end;
                return end > start ? (end - start).TotalHours : 0;
            }),
            Days: g.Select(s => LocalDay(c, s.StartedAt)).Distinct().Count()));

        var listed = await Assignments(c).Select(a => a.UserId).Distinct().ToListAsync(cancellationToken);
        var repIds = orders.Keys.Union(visits.Keys).Union(hours.Keys).Union(listed).ToHashSet();
        var names = await UserNamesAsync(repIds, cancellationToken);

        return new RepStatsDto(c.Range, repIds
            .Select(id => new RepRankRow(
                id,
                names.GetValueOrDefault(id, string.Empty),
                orders.TryGetValue(id, out var o) ? o.Count : 0,
                o?.Value ?? 0,
                visits.TryGetValue(id, out var v) ? v.Count : 0,
                v?.Doctors ?? 0,
                hours.TryGetValue(id, out var h) ? decimal.Round((decimal)h.Hours, 1, MidpointRounding.AwayFromZero) : 0,
                h.Days))
            .OrderByDescending(r => r.OrderValue).ThenByDescending(r => r.Visits).ThenBy(r => r.Name)
            .ToList());
    }

    private async Task<CatalogStatsDto> ComputeCatalogAsync(Context c, CancellationToken cancellationToken)
    {
        var me = currentUser.RequireUserId();
        var visibleLines = await productAccess.VisibleLineIdsAsync(me, cancellationToken);
        var products = ProductAccess.WhereVisible(db.Products.AsNoTracking().Where(p => p.ArchivedAt == null), visibleLines);
        if (c.ProductIds is { } productIds)
        {
            products = products.Where(p => productIds.Contains(p.Id));
        }

        var perLine = await products.GroupBy(p => p.ProductLineId)
            .Select(g => new { g.Key, Count = g.Count(), Active = g.Count(p => p.IsActive), Stock = g.Sum(p => p.StockQuantity) })
            .ToListAsync(cancellationToken);
        var lineIds = perLine.Where(l => l.Key != null).Select(l => l.Key!.Value).ToArray();
        var lines = await db.ProductLines.AsNoTracking().Where(l => lineIds.Contains(l.Id))
            .ToDictionaryAsync(l => l.Id, l => (l.NameEn, l.NameAr), cancellationToken);

        var threshold = options.Value.LowStockThreshold;
        var lowStock = await products.Where(p => p.IsActive && p.StockQuantity <= threshold)
            .OrderBy(p => p.StockQuantity).ThenBy(p => p.NameEn)
            .Take(50)
            .Select(p => new StatRow(p.Id.ToString(), p.NameEn, p.NameAr, p.StockQuantity, p.Price, 0))
            .ToListAsync(cancellationToken);

        var users = db.Users.AsNoTracking().WhereUsersInScope(c.Scope).Where(u => u.IsActive && u.ArchivedAt == null);
        if (c.Query.RepId is { } repId)
        {
            users = users.Where(u => u.Id == repId);
        }

        if (c.AreaTerritories is { } area)
        {
            users = users.Where(u => area.Contains(u.TerritoryId));
        }

        var byRole = await db.UserRoles.AsNoTracking()
            .Where(ur => users.Select(u => u.Id).Contains(ur.UserId))
            .Join(db.Roles, ur => ur.RoleId, r => r.Id, (ur, r) => new { r.Id, r.NameEn, r.NameAr, r.Level })
            .GroupBy(r => new { r.Id, r.NameEn, r.NameAr, r.Level })
            .Select(g => new { g.Key.Id, g.Key.NameEn, g.Key.NameAr, g.Key.Level, Count = g.Count() })
            .OrderBy(r => r.Level)
            .ToListAsync(cancellationToken);

        return new CatalogStatsDto(
            c.Range,
            threshold,
            perLine.OrderByDescending(l => l.Count)
                .Select(l => l.Key is { } id && lines.TryGetValue(id, out var n)
                    ? new StatRow(id.ToString(), n.NameEn, n.NameAr, l.Count, 0, l.Stock)
                    : new StatRow("unassigned", Labels.Unassigned.En, Labels.Unassigned.Ar, l.Count, 0, l.Stock))
                .ToList(),
            lowStock,
            byRole.Select(r => new StatRow(r.Id.ToString(), r.NameEn, r.NameAr, r.Count)).ToList());
    }

    private IQueryable<Order> Orders(Context c)
    {
        var orders = db.Orders.AsNoTracking().WhereInScope(c.Scope)
            .Where(o => o.ArchivedAt == null && o.OrderDate >= c.From && o.OrderDate <= c.To);
        if (c.Query.RepId is { } repId)
        {
            orders = orders.Where(o => o.UserId == repId);
        }

        if (c.AreaTerritories is { } area)
        {
            orders = orders.Where(o => area.Contains(o.TerritoryId));
        }

        if (c.ProductIds is { } productIds)
        {
            orders = orders.Where(o => o.Lines.Any(l => productIds.Contains(l.ProductId)));
        }

        return orders;
    }

    private IQueryable<Visit> Visits(Context c)
    {
        var visits = db.Visits.AsNoTracking().WhereInScope(c.Scope)
            .Where(v => v.ArchivedAt == null && v.Status != VisitStatus.Cancelled && v.CheckInAt >= c.FromUtc && v.CheckInAt < c.ToUtc);
        if (c.Query.RepId is { } repId)
        {
            visits = visits.Where(v => v.UserId == repId);
        }

        if (c.AreaTerritories is { } area)
        {
            visits = visits.Where(v => area.Contains(v.TerritoryId));
        }

        if (c.ProductIds is { } productIds)
        {
            visits = visits.Where(v => v.Products.Any(p => productIds.Contains(p.ProductId)));
        }

        return visits;
    }

    private IQueryable<Domain.Tracking.Shift> Shifts(Context c)
    {
        var shifts = db.Shifts.AsNoTracking().WhereInScope(c.Scope)
            .Where(s => s.StartedAt < c.ToUtc && (s.EndedAt == null || s.EndedAt > c.FromUtc));
        if (c.Query.RepId is { } repId)
        {
            shifts = shifts.Where(s => s.UserId == repId);
        }

        if (c.AreaTerritories is { } area)
        {
            shifts = shifts.Where(s => area.Contains(s.TerritoryId));
        }

        return shifts;
    }

    /// <summary>Doctor list entries of the reps in scope (active doctors that are not archived).</summary>
    private IQueryable<RepDoctor> Assignments(Context c)
    {
        var reps = db.Users.AsNoTracking().WhereUsersInScope(c.Scope).Where(u => u.ArchivedAt == null);
        if (c.Query.RepId is { } repId)
        {
            reps = reps.Where(u => u.Id == repId);
        }

        if (c.AreaTerritories is { } area)
        {
            reps = reps.Where(u => area.Contains(u.TerritoryId));
        }

        var repIds = reps.Select(u => u.Id);
        return db.RepDoctors.AsNoTracking()
            .Where(a => repIds.Contains(a.UserId) && a.Customer!.Type == CustomerType.Doctor && a.Customer.IsActive && a.Customer.ArchivedAt == null);
    }

    private async Task<(int OnList, int Covered)> CoverageTotalsAsync(Context c, CancellationToken cancellationToken)
    {
        var visited = Visits(c);
        var doctors = Assignments(c).Select(a => a.CustomerId).Distinct();
        var onList = await doctors.CountAsync(cancellationToken);
        var covered = await doctors.CountAsync(id => visited.Any(v => v.CustomerId == id), cancellationToken);
        return (onList, covered);
    }

    private async Task<Context> ContextAsync(StatsQuery query, CancellationToken cancellationToken)
    {
        var settings = options.Value;
        var zone = Zone(settings.TimeZone);
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(time.GetUtcNow(), zone).DateTime);
        var to = query.To ?? today;
        var from = query.From ?? to.AddDays(-29);
        if (to.DayNumber - from.DayNumber + 1 > settings.MaxRangeDays)
        {
            throw new BusinessRuleException("invalid-range", $"Choose at most {settings.MaxRangeDays} days.");
        }

        if (to < from)
        {
            throw new BusinessRuleException("invalid-range", "The start must be on or before the end.");
        }

        var scope = await scopes.ResolveAsync(Permissions.Stats.Read, cancellationToken);
        Guid?[]? area = null;
        if (query.AreaId is { } areaId)
        {
            var tree = await TerritoryTree.LoadAsync(db, cancellationToken);
            area = tree.SelfAndDescendants(areaId).Select(id => (Guid?)id).ToArray();
        }

        Guid[]? productIds = null;
        if (query.ProductId is { } productId)
        {
            productIds = [productId];
        }

        if (query.LineId is { } lineId)
        {
            var inLine = await db.Products.AsNoTracking().Where(p => p.ProductLineId == lineId).Select(p => p.Id).ToListAsync(cancellationToken);
            productIds = productIds is null ? inLine.ToArray() : productIds.Intersect(inLine).ToArray();
        }

        return new Context(
            scope, query, from, to,
            StartOfDay(from, zone), StartOfDay(to.AddDays(1), zone),
            zone, area, productIds,
            new StatsRange(from, to, scope.Level ?? PermissionScope.Own));
    }

    private static List<TrendPoint> FillDays(Context c, IReadOnlyDictionary<DateOnly, (int Count, decimal Value)> values)
    {
        var days = new List<TrendPoint>();
        for (var day = c.From; day <= c.To; day = day.AddDays(1))
        {
            var (count, value) = values.GetValueOrDefault(day);
            days.Add(new TrendPoint(day, count, value));
        }

        return days;
    }

    private async Task<Dictionary<Guid, string>> UserNamesAsync(IEnumerable<Guid> ids, CancellationToken cancellationToken)
    {
        var wanted = ids.Distinct().ToArray();
        return await db.Users.AsNoTracking().Where(u => wanted.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.FullName, cancellationToken);
    }

    private async Task<Dictionary<Guid, (string Name, string? NameAr)>> TerritoryNamesAsync(IEnumerable<Guid> ids, CancellationToken cancellationToken)
    {
        var wanted = ids.Distinct().ToArray();
        return await db.Territories.AsNoTracking().Where(t => wanted.Contains(t.Id))
            .ToDictionaryAsync(t => t.Id, t => (t.Name, t.NameAr), cancellationToken);
    }

    private static DateOnly LocalDay(Context c, DateTimeOffset at) => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(at, c.Zone).DateTime);

    private static DateTimeOffset StartOfDay(DateOnly day, TimeZoneInfo zone)
    {
        var local = day.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified);
        return new DateTimeOffset(local, zone.GetUtcOffset(local)).ToUniversalTime();
    }

    private static TimeZoneInfo Zone(string id)
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(id);
        }
        catch (Exception ex) when (ex is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            return TimeZoneInfo.Utc;
        }
    }

    private static string Key<TEnum>(TEnum value) where TEnum : struct, Enum =>
        System.Text.Json.JsonNamingPolicy.CamelCase.ConvertName(value.ToString());

    private sealed record Context(
        DataScope Scope,
        StatsQuery Query,
        DateOnly From,
        DateOnly To,
        DateTimeOffset FromUtc,
        DateTimeOffset ToUtc,
        TimeZoneInfo Zone,
        Guid?[]? AreaTerritories,
        Guid[]? ProductIds,
        StatsRange Range);
}

/// <summary>Names of the fixed values in both languages (the CSV export and charts use them).</summary>
internal static class Labels
{
    public static readonly Dictionary<OrderStatus, (string En, string Ar)> Status = new()
    {
        [OrderStatus.Submitted] = ("Waiting for review", "بانتظار المراجعة"),
        [OrderStatus.Approved] = ("Approved", "معتمدة"),
        [OrderStatus.Rejected] = ("Rejected", "مرفوضة"),
        [OrderStatus.Cancelled] = ("Cancelled", "ملغاة"),
    };

    public static readonly Dictionary<PlaceType, (string En, string Ar)> Place = new()
    {
        [PlaceType.Pharmacy] = ("Pharmacy", "صيدلية"),
        [PlaceType.Warehouse] = ("Warehouse", "مخزن"),
        [PlaceType.Shop] = ("Shop", "محل"),
        [PlaceType.Other] = ("Other", "أخرى"),
    };

    public static readonly Dictionary<VisitFeedbackCategory, (string En, string Ar)> Feedback = new()
    {
        [VisitFeedbackCategory.Positive] = ("Positive", "إيجابي"),
        [VisitFeedbackCategory.NeedsFollowUp] = ("Needs follow-up", "يحتاج متابعة"),
        [VisitFeedbackCategory.Complaint] = ("Complaint", "شكوى"),
        [VisitFeedbackCategory.Request] = ("Request", "طلب"),
    };

    public static readonly (string En, string Ar) NoCategory = ("No category", "بدون تصنيف");
    public static readonly (string En, string Ar) Unassigned = ("Unassigned", "بدون خط");
    public static readonly (string En, string Ar) NoArea = ("No area", "بدون منطقة");
    public static readonly (string En, string Ar) NoSpecialty = ("No specialty", "بدون تخصص");
    public static readonly (string En, string Ar) OtherMethod = ("Other (typed)", "أخرى (مكتوبة)");
}
