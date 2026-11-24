using FluentValidation;
using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Organization;
using OriginalPharma.Application.Common.Scoping;
using OriginalPharma.Application.Crm;
using OriginalPharma.Application.Identity;
using OriginalPharma.Domain.Crm;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Domain.Plans;
using OriginalPharma.Domain.Visits;

namespace OriginalPharma.Application.Visits;

/// <summary>An AM place on today's morning list.</summary>
/// <param name="PlannedTime">"HH:mm" when the rep means to be there (optional).</param>
public sealed record RepAmPlaceDto(
    Guid CustomerId,
    string Name,
    string? NameAr,
    Guid? TownId,
    string? TownName,
    string? TownNameAr,
    int Position,
    string? PlannedTime);

/// <summary>The rep's choices for today (Egypt day): where the doctor visits are, their order, and the AM list.</summary>
/// <param name="AreaId">The rep's own area (the "whole area" choice).</param>
/// <param name="TerritoryId">Town (or area) of today's doctor visits; null means the rep's whole area.</param>
/// <param name="AreaChosen">The rep confirmed or changed it; otherwise it is the weekly plan's suggestion.</param>
/// <param name="PlanCityId">The city of today's entry in the rep's weekly plan, when there is one.</param>
/// <param name="DoctorOrder">The order the rep put the upcoming doctors in, first to last. Doctors not in it go after them.</param>
/// <param name="AmPlaces">Today's AM places in the rep's order. Never filtered by <paramref name="TerritoryId"/>.</param>
public sealed record RepTodayDto(
    DateOnly Day,
    Guid? AreaId,
    Guid? TerritoryId,
    bool AreaChosen,
    Guid? PlanCityId,
    IReadOnlyList<Guid> DoctorOrder,
    IReadOnlyList<RepAmPlaceDto> AmPlaces);

/// <param name="TerritoryId">A town of the rep's area, the area itself, or null for the whole area.</param>
public sealed record SetRepDayAreaRequest(Guid? TerritoryId);

/// <param name="CustomerIds">The upcoming doctors in the rep's order (replaces today's order).</param>
public sealed record SetRepVisitOrderRequest(IReadOnlyList<Guid> CustomerIds);

/// <param name="PlannedTime">"HH:mm", optional.</param>
public sealed record RepAmPlaceInput(Guid CustomerId, string? PlannedTime = null);

/// <param name="Places">Today's whole AM list in order (replaces the saved one).</param>
public sealed record SetRepAmPlacesRequest(IReadOnlyList<RepAmPlaceInput> Places);

public static class RepDayErrorCodes
{
    /// <summary>The area or town is not part of the rep's area.</summary>
    public const string AreaInvalid = "rep_day_area_invalid";

    /// <summary>An AM place is not one the rep can see (or is not an AM place).</summary>
    public const string PlaceInvalid = "rep_day_place_invalid";
}

/// <summary>
/// The rep's working day on the Home screen. The first read of an Egypt day creates the day, with the
/// city of that day in the rep's weekly plan as today's area and the plan's AM places as today's AM
/// list. The rep then changes the area, orders the upcoming doctors and edits the AM list. Visits are
/// created and counted as before; this only decides what the Home lists and in which order.
/// </summary>
public sealed class RepDayService(
    IAppDbContext db,
    ICurrentUser currentUser,
    CustomerService customers,
    LocalCalendar calendar,
    TimeProvider time,
    IDataScopeResolver scopeResolver)
{
    public const int MaxOrder = 500;
    public const int MaxAmPlaces = 20;

    public async Task<RepTodayDto> GetTodayAsync(CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var day = await EnsureDayAsync(me, calendar.Today(), cancellationToken);
        return await BuildAsync(me, day, cancellationToken);
    }

    /// <summary>Saves the area or town of today's doctor visits.</summary>
    public async Task<RepTodayDto> SetAreaAsync(SetRepDayAreaRequest request, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        if (request.TerritoryId is { } territoryId)
        {
            var area = await db.Users.AsNoTracking().Where(u => u.Id == me).Select(u => u.TerritoryId).SingleAsync(cancellationToken);
            var exists = await db.Territories.AnyAsync(
                t => t.Id == territoryId && t.ArchivedAt == null && (t.Level == TerritoryLevel.Town || t.Level == TerritoryLevel.Area),
                cancellationToken);
            var tree = await TerritoryTree.LoadAsync(db, cancellationToken);
            if (!exists || (area is { } areaId && !tree.SelfAndDescendants(areaId).Contains(territoryId)))
            {
                throw new BusinessRuleException(RepDayErrorCodes.AreaInvalid, "Choose a town of your area.");
            }
        }

        var day = await EnsureDayAsync(me, calendar.Today(), cancellationToken);
        var tracked = await db.RepDays.SingleAsync(d => d.UserId == me && d.Day == day.Day, cancellationToken);
        tracked.TerritoryId = request.TerritoryId;
        tracked.AreaChosen = true;
        tracked.UpdatedAt = time.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);
        return await BuildAsync(me, tracked, cancellationToken);
    }

    /// <summary>
    /// Saves the order of today's upcoming doctors. Ids that are not on the rep's list are left out; a rep
    /// with an empty list plans from the doctors in their customers:read scope instead, so those count.
    /// </summary>
    public async Task<RepTodayDto> SetDoctorOrderAsync(SetRepVisitOrderRequest request, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var day = await EnsureDayAsync(me, calendar.Today(), cancellationToken);
        var ids = request.CustomerIds.Distinct().ToArray();
        var mine = (await db.RepDoctors.AsNoTracking()
                .Where(a => a.UserId == me && ids.Contains(a.CustomerId))
                .Select(a => a.CustomerId)
                .ToListAsync(cancellationToken))
            .ToHashSet();
        if (mine.Count == 0 && ids.Length > 0 && !await db.RepDoctors.AnyAsync(a => a.UserId == me, cancellationToken))
        {
            var scope = await scopeResolver.ResolveAsync(Permissions.Customers.Read, cancellationToken);
            var visibleReps = scope.Level == PermissionScope.All
                ? null
                : (await db.Users.AsNoTracking().VisibleUserIds(scope).ToListAsync(cancellationToken)).ToHashSet();
            var candidates = db.Customers.AsNoTracking()
                .Where(c => ids.Contains(c.Id) && c.Type == CustomerType.Doctor && c.IsActive && c.ArchivedAt == null);
            mine = (await DoctorService.WhereVisible(candidates, scope, visibleReps).Select(c => c.Id).ToListAsync(cancellationToken)).ToHashSet();
        }

        await db.RepVisitOrder.Where(o => o.UserId == me && o.Day == day.Day).ExecuteDeleteAsync(cancellationToken);
        var position = 0;
        foreach (var id in ids.Where(mine.Contains))
        {
            db.RepVisitOrder.Add(new RepVisitOrder { UserId = me, Day = day.Day, CustomerId = id, Position = position++ });
        }

        await db.SaveChangesAsync(cancellationToken);
        return await BuildAsync(me, day, cancellationToken);
    }

    /// <summary>
    /// Replaces today's AM list. Every place must be an active AM place the rep can see (any town of
    /// their territory, or put on their list), whatever today's area is.
    /// </summary>
    public async Task<RepTodayDto> SetAmPlacesAsync(SetRepAmPlacesRequest request, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var day = await EnsureDayAsync(me, calendar.Today(), cancellationToken);
        var places = request.Places.DistinctBy(p => p.CustomerId).ToList();
        var visible = await VisibleAmPlacesAsync(cancellationToken);
        var rows = new List<RepAmVisit>(places.Count);
        foreach (var place in places)
        {
            if (!visible.Contains(place.CustomerId))
            {
                throw new BusinessRuleException(RepDayErrorCodes.PlaceInvalid, "This place is not one of your AM places.")
                {
                    Details = new Dictionary<string, object?> { ["customerId"] = place.CustomerId },
                };
            }

            rows.Add(new RepAmVisit
            {
                UserId = me,
                Day = day.Day,
                CustomerId = place.CustomerId,
                Position = rows.Count,
                PlannedTime = DoctorAvailabilityRules.ParseTime(place.PlannedTime),
            });
        }

        await db.RepAmVisits.Where(a => a.UserId == me && a.Day == day.Day).ExecuteDeleteAsync(cancellationToken);
        db.RepAmVisits.AddRange(rows);
        await db.SaveChangesAsync(cancellationToken);
        return await BuildAsync(me, day, cancellationToken);
    }

    /// <summary>Active AM places in the caller's customers:read scope (a rep: every town of their area, and places on their list).</summary>
    private async Task<HashSet<Guid>> VisibleAmPlacesAsync(CancellationToken cancellationToken) =>
        (await customers.ListAsync(CustomerType.Hospital, null, cancellationToken: cancellationToken))
        .Where(c => c.IsActive)
        .Select(c => c.Id)
        .ToHashSet();

    /// <summary>
    /// Today's row, created on first use from the weekly plan: the plan's city for that day (any status,
    /// an approved plan first) and its AM places, which may be in other towns than that city.
    /// </summary>
    private async Task<RepDay> EnsureDayAsync(Guid me, DateOnly today, CancellationToken cancellationToken)
    {
        var existing = await db.RepDays.AsNoTracking().SingleOrDefaultAsync(d => d.UserId == me && d.Day == today, cancellationToken);
        if (existing is not null)
        {
            return existing;
        }

        var planned = await PlanDayAsync(me, today, cancellationToken);
        var now = time.GetUtcNow();
        var day = new RepDay { UserId = me, Day = today, TerritoryId = planned?.CityId, CreatedAt = now, UpdatedAt = now };
        db.RepDays.Add(day);
        if (planned is not null)
        {
            var amPlaces = await db.WeeklyPlanCustomers.AsNoTracking()
                .Where(c => c.PlanDayId == planned.Id)
                .Join(db.Customers.Where(x => x.Type == CustomerType.Hospital && x.IsActive && x.ArchivedAt == null),
                    c => c.CustomerId, x => x.Id, (c, x) => new { c.CustomerId, c.SortOrder })
                .OrderBy(c => c.SortOrder)
                .Select(c => c.CustomerId)
                .ToListAsync(cancellationToken);
            var position = 0;
            foreach (var id in amPlaces)
            {
                db.RepAmVisits.Add(new RepAmVisit { UserId = me, Day = today, CustomerId = id, Position = position++ });
            }
        }

        try
        {
            await db.SaveChangesAsync(cancellationToken);
            return day;
        }
        catch (DbUpdateException)
        {
            // Two first reads of the day at the same moment: the other one created it.
            if (db is DbContext context)
            {
                context.ChangeTracker.Clear();
            }

            return await db.RepDays.AsNoTracking().SingleAsync(d => d.UserId == me && d.Day == today, cancellationToken);
        }
    }

    /// <summary>Today's entry in the rep's weekly plan (an approved plan first), or null.</summary>
    private Task<WeeklyPlanDay?> PlanDayAsync(Guid me, DateOnly today, CancellationToken cancellationToken) =>
        db.WeeklyPlanDays.AsNoTracking()
            .Where(d => d.Day == today)
            .Join(db.WeeklyPlans.Where(p => p.UserId == me), d => d.PlanId, p => p.Id, (d, p) => new { Day = d, p.Status })
            .OrderBy(x => x.Status == WeeklyPlanStatus.Approved ? 0 : 1)
            .Select(x => x.Day)
            .FirstOrDefaultAsync(cancellationToken);

    private async Task<RepTodayDto> BuildAsync(Guid me, RepDay day, CancellationToken cancellationToken)
    {
        var area = await db.Users.AsNoTracking().Where(u => u.Id == me).Select(u => u.TerritoryId).SingleAsync(cancellationToken);
        var planned = await PlanDayAsync(me, day.Day, cancellationToken);
        var order = await db.RepVisitOrder.AsNoTracking()
            .Where(o => o.UserId == me && o.Day == day.Day)
            .OrderBy(o => o.Position)
            .Select(o => o.CustomerId)
            .ToListAsync(cancellationToken);
        var am = await db.RepAmVisits.AsNoTracking()
            .Where(a => a.UserId == me && a.Day == day.Day)
            .Join(db.Customers, a => a.CustomerId, c => c.Id, (a, c) => new
            {
                a.CustomerId,
                c.Name,
                c.NameAr,
                c.TerritoryId,
                TownName = db.Territories.Where(t => t.Id == c.TerritoryId).Select(t => t.Name).FirstOrDefault(),
                TownNameAr = db.Territories.Where(t => t.Id == c.TerritoryId).Select(t => t.NameAr).FirstOrDefault(),
                a.Position,
                a.PlannedTime,
            })
            .OrderBy(a => a.Position)
            .ToListAsync(cancellationToken);

        return new RepTodayDto(
            day.Day,
            area,
            day.TerritoryId,
            day.AreaChosen,
            planned?.CityId,
            order,
            am.Select(a => new RepAmPlaceDto(
                    a.CustomerId, a.Name, a.NameAr, a.TerritoryId, a.TownName, a.TownNameAr, a.Position,
                    a.PlannedTime is { } at ? DoctorAvailabilityRules.Format(at) : null))
                .ToList());
    }
}

public sealed class SetRepVisitOrderRequestValidator : AbstractValidator<SetRepVisitOrderRequest>
{
    public SetRepVisitOrderRequestValidator()
    {
        RuleFor(x => x.CustomerIds).NotNull().Must(ids => ids is null || ids.Count <= RepDayService.MaxOrder)
            .WithMessage($"At most {RepDayService.MaxOrder} doctors.");
    }
}

public sealed class SetRepAmPlacesRequestValidator : AbstractValidator<SetRepAmPlacesRequest>
{
    public SetRepAmPlacesRequestValidator()
    {
        RuleFor(x => x.Places).NotNull().Must(p => p is null || p.Count <= RepDayService.MaxAmPlaces)
            .WithMessage($"At most {RepDayService.MaxAmPlaces} AM places a day.");
        RuleForEach(x => x.Places).ChildRules(place =>
        {
            place.RuleFor(p => p.CustomerId).NotEmpty();
            place.RuleFor(p => p.PlannedTime).Matches("^([01]?[0-9]|2[0-3]):[0-5][0-9]$").When(p => !string.IsNullOrEmpty(p.PlannedTime))
                .WithMessage("Use the time format HH:mm.");
        });
    }
}
