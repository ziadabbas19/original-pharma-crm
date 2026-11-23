using System.Linq.Expressions;
using System.Text.Json;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Auditing;
using OriginalPharma.Application.Common.Organization;
using OriginalPharma.Application.Common.Scoping;
using OriginalPharma.Application.Notifications;
using OriginalPharma.Domain.Audit;
using OriginalPharma.Domain.Crm;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Domain.Notifications;
using OriginalPharma.Domain.Plans;
using OriginalPharma.Domain.Visits;

namespace OriginalPharma.Application.Plans;

/// <summary>
/// Weekly plans. A rep writes a plan for this week or a later one (plans:write-own), submits it to the
/// nearest manager in their reporting line who may review it, and sees the manager's note. Reviewers
/// (plans:review within scope, never their own plan) approve, return with a note, or reopen an approved
/// plan. Managers read the plans in their plans:read scope, as for expenses. Every status change is kept
/// in the plan's history and in the activity log, and announced in-app.
/// </summary>
public sealed class PlanService(
    IAppDbContext db,
    ICurrentUser currentUser,
    IDataScopeResolver scopes,
    IOrgHierarchy hierarchy,
    AuditTrail audit,
    NotificationService notifications,
    LocalCalendar calendar,
    IOptions<PlanOptions> options,
    IValidator<SaveWeeklyPlanRequest> saveValidator,
    IValidator<ReviewWeeklyPlanRequest> reviewValidator,
    TimeProvider time)
{
    public const int MaxPageSize = 100;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <param name="Own">The plan is the caller's.</param>
    /// <param name="CanRead">Own plan with plans:read-own or write-own, or a rep in the caller's plans:read or plans:review scope.</param>
    /// <param name="WriteOwn">The caller holds plans:write-own and the plan is theirs.</param>
    /// <param name="Review">The caller holds plans:review over this rep (never for their own plan).</param>
    private sealed record Access(bool Own, bool CanRead, bool WriteOwn, bool Review);

    private sealed record DaySummary(DateOnly Day, Guid CityId, int Target, string? Note, Guid[] Customers);

    /// <summary>The first day of the week <paramref name="day"/> belongs to (Plans:WeekStartsOn).</summary>
    public DateOnly WeekOf(DateOnly day) => LocalCalendar.WeekStart(day, options.Value.WeekStartsOn);

    // ---------------------------------------------------------------------------------------------
    // The rep's own plan
    // ---------------------------------------------------------------------------------------------

    /// <summary>The caller's plan for the week of <paramref name="week"/> (this week by default), or an empty draft.</summary>
    public async Task<WeeklyPlanDto> GetMineAsync(DateOnly? week, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var weekStart = WeekOf(week ?? calendar.Today());
        var access = await AccessAsync(me, null, cancellationToken);
        if (!access.CanRead)
        {
            throw new ForbiddenException();
        }

        var plan = await LoadAsync(p => p.UserId == me && p.WeekStart == weekStart, tracking: false, cancellationToken);
        if (plan is not null)
        {
            await notifications.MarkEntityReadAsync(me, plan.Id, cancellationToken);
        }

        return await BuildAsync(me, weekStart, plan, access, cancellationToken);
    }

    /// <summary>
    /// Saves the caller's draft for a week: the days sent replace the saved ones (a day left out is a day
    /// off). Only this week and later weeks, and only while the plan is a draft or was returned.
    /// </summary>
    public async Task<WeeklyPlanDto> SaveDraftAsync(SaveWeeklyPlanRequest request, CancellationToken cancellationToken = default)
    {
        await saveValidator.ValidateAndThrowAsync(request, cancellationToken);
        var me = currentUser.RequireUserId();
        var access = await AccessAsync(me, null, cancellationToken);
        if (!access.WriteOwn)
        {
            throw new ForbiddenException("You cannot write weekly plans.");
        }

        var weekStart = WeekOf(request.Week);
        EnsureWeekOpen(weekStart);

        var plan = await LoadAsync(p => p.UserId == me && p.WeekStart == weekStart, tracking: true, cancellationToken);
        if (plan is not null)
        {
            EnsureEditable(plan);
            EnsureVersion(plan, request.Version);
        }

        var days = await BuildDaysAsync(me, weekStart, request.Days, plan, cancellationToken);
        var now = time.GetUtcNow();
        var created = plan is null;
        if (plan is null)
        {
            var area = await db.Users.Where(u => u.Id == me).Select(u => u.TerritoryId).SingleAsync(cancellationToken);
            plan = new WeeklyPlan
            {
                UserId = me,
                TerritoryId = area,
                WeekStart = weekStart,
                Status = WeeklyPlanStatus.Draft,
                CreatedAt = now,
                UpdatedAt = now,
            };
            foreach (var day in days)
            {
                day.PlanId = plan.Id;
                plan.Days.Add(day);
            }

            plan.Events.Add(new WeeklyPlanEvent
            {
                PlanId = plan.Id,
                FromStatus = null,
                ToStatus = WeeklyPlanStatus.Draft,
                ActorId = me,
                ActorName = await NameOfAsync(me, cancellationToken),
                CreatedAt = now,
            });
            db.WeeklyPlans.Add(plan);
            await audit.AddAsync(AuditEntities.WeeklyPlan, plan.Id, AuditAction.Created,
                new { userId = me, weekStart, status = StatusName(plan.Status), days = Summary(plan.Days) },
                cancellationToken: cancellationToken);
        }
        else
        {
            var before = Summary(plan.Days);
            var after = Summary(days);
            if (JsonSerializer.Serialize(before, Json) == JsonSerializer.Serialize(after, Json))
            {
                return await BuildAsync(me, weekStart, plan, access, cancellationToken);
            }

            db.WeeklyPlanDays.RemoveRange(plan.Days);
            plan.Days.Clear();
            foreach (var day in days)
            {
                day.PlanId = plan.Id;
            }

            db.WeeklyPlanDays.AddRange(days);
            plan.UpdatedAt = now;
            plan.Version++;
            await audit.AddAsync(AuditEntities.WeeklyPlan, plan.Id, AuditAction.Updated,
                new { userId = me, weekStart, status = StatusName(plan.Status), before = new { days = before }, after = new { days = after } },
                cancellationToken: cancellationToken);
        }

        await SaveAsync(created, cancellationToken);
        return await GetAsync(plan.Id, cancellationToken);
    }

    /// <summary>Sends the caller's draft (or returned plan) to the nearest manager who may review it.</summary>
    public async Task<WeeklyPlanDto> SubmitAsync(Guid id, SubmitWeeklyPlanRequest request, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var plan = await LoadAsync(p => p.Id == id, tracking: true, cancellationToken) ?? throw new NotFoundException("Weekly plan", id);
        var access = await AccessAsync(plan.UserId, plan.TerritoryId, cancellationToken);
        if (!access.CanRead)
        {
            throw new NotFoundException("Weekly plan", id);
        }

        if (!access.Own || !access.WriteOwn)
        {
            throw new ForbiddenException("Only the rep can submit their plan.");
        }

        EnsureEditable(plan);
        EnsureVersion(plan, request.Version);
        EnsureWeekOpen(plan.WeekStart);
        if (plan.Days.Count == 0)
        {
            throw new BusinessRuleException(PlanErrorCodes.Empty, "Plan at least one day before submitting.");
        }

        var reviewer = await ReviewerOfAsync(plan.UserId, plan.TerritoryId, cancellationToken)
                       ?? throw new BusinessRuleException(PlanErrorCodes.NoReviewer,
                           "Nobody in your reporting line can review plans. Ask your administrator to set your manager.");

        var now = time.GetUtcNow();
        var name = await NameOfAsync(me, cancellationToken);
        await TransitionAsync(plan, WeeklyPlanStatus.Submitted, me, name, null, now, cancellationToken);
        plan.SubmittedAt = now;
        plan.ReviewNote = null;
        plan.ReviewedById = null;
        plan.ReviewedAt = null;
        notifications.Queue(reviewer.Id, NotificationType.PlanSubmitted, plan.Id, new
        {
            planId = plan.Id,
            repName = name,
            weekStart = plan.WeekStart,
            weekEnd = plan.WeekStart.AddDays(6),
        });

        await SaveAsync(false, cancellationToken);
        await notifications.PublishQueuedAsync(cancellationToken);
        return await GetAsync(plan.Id, cancellationToken);
    }

    // ---------------------------------------------------------------------------------------------
    // Managers
    // ---------------------------------------------------------------------------------------------

    /// <summary>One plan with its days, planned against done, and history (own plan, or a rep in scope).</summary>
    public async Task<WeeklyPlanDto> GetAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var plan = await LoadAsync(p => p.Id == id, tracking: false, cancellationToken) ?? throw new NotFoundException("Weekly plan", id);
        var access = await AccessAsync(plan.UserId, plan.TerritoryId, cancellationToken);
        if (!access.CanRead)
        {
            throw new NotFoundException("Weekly plan", id);
        }

        await notifications.MarkEntityReadAsync(me, plan.Id, cancellationToken);
        return await BuildAsync(plan.UserId, plan.WeekStart, plan, access, cancellationToken);
    }

    /// <summary>
    /// Plans of the reps in the caller's plans:read scope. Submitted plans come oldest first (the order
    /// they wait in); otherwise the latest weeks first.
    /// </summary>
    public async Task<WeeklyPlanPageDto> ListAsync(WeeklyPlanQuery query, CancellationToken cancellationToken = default)
    {
        var scope = await scopes.ResolveAsync(Identity.Permissions.Plans.Read, cancellationToken);
        if (scope.Level is null)
        {
            throw new ForbiddenException();
        }

        var plans = db.WeeklyPlans.AsNoTracking().WhereInScope(scope);
        if (query.Status is { } status)
        {
            plans = plans.Where(p => p.Status == status);
        }

        if (query.UserId is { } rep)
        {
            plans = plans.Where(p => p.UserId == rep);
        }

        if (query.Week is { } week)
        {
            var weekStart = WeekOf(week);
            plans = plans.Where(p => p.WeekStart == weekStart);
        }

        var total = await plans.CountAsync(cancellationToken);
        var page = Math.Max(1, query.Page);
        var size = Math.Clamp(query.PageSize, 1, MaxPageSize);
        var ordered = query.Status == WeeklyPlanStatus.Submitted
            ? plans.OrderBy(p => p.SubmittedAt).ThenBy(p => p.Id)
            : plans.OrderByDescending(p => p.WeekStart).ThenByDescending(p => p.UpdatedAt).ThenBy(p => p.Id);
        var rows = await ordered
            .Skip((page - 1) * size)
            .Take(size)
            .Select(p => new WeeklyPlanListItemDto(
                p.Id,
                p.UserId,
                db.Users.Where(u => u.Id == p.UserId).Select(u => u.FullName).FirstOrDefault() ?? string.Empty,
                p.WeekStart,
                p.WeekStart.AddDays(6),
                p.Status,
                p.Days.Count,
                p.Days.Sum(d => (int?)d.TargetVisits) ?? 0,
                p.SubmittedAt,
                p.ReviewedAt,
                db.Users.Where(u => u.Id == p.ReviewedById).Select(u => u.FullName).FirstOrDefault(),
                p.UpdatedAt))
            .ToListAsync(cancellationToken);

        return new WeeklyPlanPageDto(rows, total, page, size);
    }

    /// <summary>Submitted plans the caller may review now (their own excluded).</summary>
    public async Task<WeeklyPlanPendingDto> PendingAsync(CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var scope = await scopes.ResolveAsync(Identity.Permissions.Plans.Review, cancellationToken);
        if (scope.Level is null)
        {
            return new WeeklyPlanPendingDto(0);
        }

        var count = await db.WeeklyPlans.AsNoTracking().WhereInScope(scope)
            .CountAsync(p => p.Status == WeeklyPlanStatus.Submitted && p.UserId != me, cancellationToken);
        return new WeeklyPlanPendingDto(count);
    }

    public Task<WeeklyPlanDto> ApproveAsync(Guid id, ReviewWeeklyPlanRequest request, CancellationToken cancellationToken = default) =>
        ReviewAsync(id, request, WeeklyPlanStatus.Submitted, WeeklyPlanStatus.Approved, noteRequired: false, cancellationToken);

    /// <summary>Back to the rep to change and submit again. The note says what to change.</summary>
    public Task<WeeklyPlanDto> ReturnAsync(Guid id, ReviewWeeklyPlanRequest request, CancellationToken cancellationToken = default) =>
        ReviewAsync(id, request, WeeklyPlanStatus.Submitted, WeeklyPlanStatus.Returned, noteRequired: true, cancellationToken);

    /// <summary>Unlocks an approved plan for the rep (it becomes returned), with an optional note.</summary>
    public Task<WeeklyPlanDto> ReopenAsync(Guid id, ReviewWeeklyPlanRequest request, CancellationToken cancellationToken = default) =>
        ReviewAsync(id, request, WeeklyPlanStatus.Approved, WeeklyPlanStatus.Returned, noteRequired: false, cancellationToken);

    private async Task<WeeklyPlanDto> ReviewAsync(
        Guid id,
        ReviewWeeklyPlanRequest request,
        WeeklyPlanStatus from,
        WeeklyPlanStatus to,
        bool noteRequired,
        CancellationToken cancellationToken)
    {
        await reviewValidator.ValidateAndThrowAsync(request, cancellationToken);
        var me = currentUser.RequireUserId();
        var plan = await LoadAsync(p => p.Id == id, tracking: true, cancellationToken) ?? throw new NotFoundException("Weekly plan", id);
        var access = await AccessAsync(plan.UserId, plan.TerritoryId, cancellationToken);
        if (!access.CanRead)
        {
            throw new NotFoundException("Weekly plan", id);
        }

        if (access.Own)
        {
            throw new ForbiddenException(PlanErrorCodes.OwnPlan, "You cannot review your own plan.");
        }

        if (!access.Review)
        {
            throw new ForbiddenException("You cannot review this plan.");
        }

        if (plan.Status != from)
        {
            throw StatusInvalid(plan.Status);
        }

        EnsureVersion(plan, request.Version);
        var note = Clean(request.Note);
        if (noteRequired && note is null)
        {
            throw new BusinessRuleException(PlanErrorCodes.NoteRequired, "Write a note telling the rep what to change.");
        }

        var now = time.GetUtcNow();
        var name = await NameOfAsync(me, cancellationToken);
        await TransitionAsync(plan, to, me, name, note, now, cancellationToken);
        plan.ReviewNote = note;
        plan.ReviewedById = me;
        plan.ReviewedAt = now;
        notifications.Queue(plan.UserId, to == WeeklyPlanStatus.Approved ? NotificationType.PlanApproved : NotificationType.PlanReturned, plan.Id, new
        {
            planId = plan.Id,
            reviewerName = name,
            weekStart = plan.WeekStart,
            weekEnd = plan.WeekStart.AddDays(6),
            note,
            reopened = from == WeeklyPlanStatus.Approved,
        });

        await SaveAsync(false, cancellationToken);
        await notifications.PublishQueuedAsync(cancellationToken);
        return await GetAsync(plan.Id, cancellationToken);
    }

    // ---------------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------------

    private async Task<WeeklyPlan?> LoadAsync(Expression<Func<WeeklyPlan, bool>> predicate, bool tracking, CancellationToken cancellationToken)
    {
        var query = db.WeeklyPlans
            .Include(p => p.Days).ThenInclude(d => d.Customers);
        return await (tracking ? query : query.AsNoTracking()).SingleOrDefaultAsync(predicate, cancellationToken);
    }

    /// <summary>What the caller may do with the plans of <paramref name="ownerId"/>.</summary>
    private async Task<Access> AccessAsync(Guid ownerId, Guid? territoryId, CancellationToken cancellationToken)
    {
        var me = currentUser.RequireUserId();
        var own = ownerId == me;
        var readOwn = own && (await scopes.ResolveAsync(Identity.Permissions.Plans.ReadOwn, cancellationToken)).Level is not null;
        var writeOwn = own && (await scopes.ResolveAsync(Identity.Permissions.Plans.WriteOwn, cancellationToken)).Level is not null;
        var read = (await scopes.ResolveAsync(Identity.Permissions.Plans.Read, cancellationToken)).Includes(ownerId, territoryId);
        var review = !own && (await scopes.ResolveAsync(Identity.Permissions.Plans.Review, cancellationToken)).Includes(ownerId, territoryId);
        return new Access(own, readOwn || writeOwn || read || review, writeOwn, review);
    }

    /// <summary>
    /// The nearest manager above the rep who is active and holds plans:review with a scope that covers
    /// the rep (the same scope rules as every other permission). Null when there is none.
    /// </summary>
    private async Task<(Guid Id, string Name)?> ReviewerOfAsync(Guid repId, Guid? territoryId, CancellationToken cancellationToken)
    {
        var chain = await hierarchy.GetManagerChainAsync(repId, cancellationToken);
        if (chain.Count == 0)
        {
            return null;
        }

        var active = await db.Users.AsNoTracking()
            .Where(u => chain.Contains(u.Id) && u.IsActive && u.ArchivedAt == null)
            .Select(u => new { u.Id, u.FullName })
            .ToDictionaryAsync(u => u.Id, u => u.FullName, cancellationToken);
        foreach (var manager in chain)
        {
            if (active.TryGetValue(manager, out var name) &&
                (await scopes.ResolveForAsync(manager, Identity.Permissions.Plans.Review, cancellationToken)).Includes(repId, territoryId))
            {
                return (manager, name);
            }
        }

        return null;
    }

    /// <summary>Checks the days against the week, the towns and the rep's customers, and builds them.</summary>
    private async Task<List<WeeklyPlanDay>> BuildDaysAsync(
        Guid repId,
        DateOnly weekStart,
        IReadOnlyList<WeeklyPlanDayInput> inputs,
        WeeklyPlan? current,
        CancellationToken cancellationToken)
    {
        var weekEnd = weekStart.AddDays(6);
        if (inputs.Any(d => d.Day < weekStart || d.Day > weekEnd) || inputs.Select(d => d.Day).Distinct().Count() != inputs.Count)
        {
            throw new BusinessRuleException(PlanErrorCodes.DayInvalid, "Each day must belong to the plan's week and be planned once.");
        }

        var cityIds = inputs.Select(d => d.CityId).Distinct().ToArray();
        var towns = await db.Territories.AsNoTracking()
            .Where(t => cityIds.Contains(t.Id) && t.Level == TerritoryLevel.Town && t.ArchivedAt == null)
            .Select(t => t.Id)
            .ToListAsync(cancellationToken);
        var missing = cityIds.Where(id => !towns.Contains(id)).ToList();
        if (missing.Count > 0)
        {
            throw new BusinessRuleException(PlanErrorCodes.CityInvalid, "Choose a city from the list.")
            {
                Details = new Dictionary<string, object?> { ["cityId"] = missing[0] },
            };
        }

        var customerIds = inputs.SelectMany(d => d.CustomerIds ?? []).Distinct().ToArray();
        var allowed = customerIds.Length == 0
            ? new Dictionary<Guid, Guid?>()
            : await AllowedCustomersAsync(repId, customerIds, current, cancellationToken);
        var amPlaceIds = inputs.SelectMany(d => d.AmPlaceIds ?? []).Distinct().ToArray();
        var allowedAm = amPlaceIds.Length == 0 ? [] : await AllowedAmPlacesAsync(repId, amPlaceIds, current, cancellationToken);

        var days = new List<WeeklyPlanDay>(inputs.Count);
        foreach (var input in inputs.OrderBy(d => d.Day))
        {
            var day = new WeeklyPlanDay
            {
                Day = input.Day,
                CityId = input.CityId,
                TargetVisits = Math.Clamp(input.TargetVisits, 0, WeeklyPlanDay.MaxTargetVisits),
                Note = Clean(input.Note, WeeklyPlanDay.NoteMaxLength),
            };
            var sort = 0;
            foreach (var customerId in (input.CustomerIds ?? []).Distinct())
            {
                if (!allowed.TryGetValue(customerId, out var town))
                {
                    throw new BusinessRuleException(PlanErrorCodes.CustomerInvalid, "One of the customers is not on your list.")
                    {
                        Details = new Dictionary<string, object?> { ["customerId"] = customerId, ["day"] = input.Day },
                    };
                }

                if (town != input.CityId)
                {
                    throw new BusinessRuleException(PlanErrorCodes.CustomerCity, "A customer is not in the city chosen for that day.")
                    {
                        Details = new Dictionary<string, object?> { ["customerId"] = customerId, ["day"] = input.Day },
                    };
                }

                day.Customers.Add(new WeeklyPlanCustomer { PlanDayId = day.Id, CustomerId = customerId, SortOrder = sort++ });
            }

            foreach (var placeId in (input.AmPlaceIds ?? []).Distinct().Where(id => day.Customers.All(c => c.CustomerId != id)))
            {
                if (!allowedAm.Contains(placeId))
                {
                    throw new BusinessRuleException(PlanErrorCodes.AmPlaceInvalid, "One of the AM places is not in your area.")
                    {
                        Details = new Dictionary<string, object?> { ["customerId"] = placeId, ["day"] = input.Day },
                    };
                }

                day.Customers.Add(new WeeklyPlanCustomer { PlanDayId = day.Id, CustomerId = placeId, SortOrder = sort++ });
            }

            days.Add(day);
        }

        return days;
    }

    /// <summary>
    /// The customers the rep may plan, with their town: active doctors on the rep's list, active
    /// pharmacies in the rep's area (the same lists the rep app offers for visits), and anyone already
    /// on the saved plan (kept even if they left the rep's list since).
    /// </summary>
    private async Task<Dictionary<Guid, Guid?>> AllowedCustomersAsync(Guid repId, Guid[] ids, WeeklyPlan? current, CancellationToken cancellationToken)
    {
        var area = await db.Users.AsNoTracking().Where(u => u.Id == repId).Select(u => u.TerritoryId).SingleAsync(cancellationToken);
        var areaTowns = Array.Empty<Guid>();
        if (area is { } areaId)
        {
            var tree = await TerritoryTree.LoadAsync(db, cancellationToken);
            areaTowns = tree.SelfAndDescendants(areaId).ToArray();
        }

        var kept = current?.Days.SelectMany(d => d.Customers).Select(c => c.CustomerId).ToHashSet() ?? [];
        return await db.Customers.AsNoTracking()
            .Where(c => ids.Contains(c.Id) &&
                        (kept.Contains(c.Id) ||
                         (c.IsActive && c.ArchivedAt == null &&
                          ((c.Type == CustomerType.Doctor && c.Reps.Any(r => r.UserId == repId)) ||
                           (c.Type == CustomerType.Pharmacy && c.TerritoryId != null && areaTowns.Contains(c.TerritoryId.Value))))))
            .Select(c => new { c.Id, c.TerritoryId })
            .ToDictionaryAsync(c => c.Id, c => c.TerritoryId, cancellationToken);
    }

    /// <summary>
    /// AM places the rep may plan for a morning: active places in any town of the rep's area or on the
    /// rep's list, and places already on the saved plan. The day's city does not limit them.
    /// </summary>
    private async Task<HashSet<Guid>> AllowedAmPlacesAsync(Guid repId, Guid[] ids, WeeklyPlan? current, CancellationToken cancellationToken)
    {
        var area = await db.Users.AsNoTracking().Where(u => u.Id == repId).Select(u => u.TerritoryId).SingleAsync(cancellationToken);
        var areaTowns = Array.Empty<Guid>();
        if (area is { } areaId)
        {
            var tree = await TerritoryTree.LoadAsync(db, cancellationToken);
            areaTowns = tree.SelfAndDescendants(areaId).ToArray();
        }

        var kept = current?.Days.SelectMany(d => d.Customers).Select(c => c.CustomerId).ToHashSet() ?? [];
        return (await db.Customers.AsNoTracking()
                .Where(c => ids.Contains(c.Id) && c.Type == CustomerType.Hospital &&
                            (kept.Contains(c.Id) ||
                             (c.IsActive && c.ArchivedAt == null &&
                              ((c.TerritoryId != null && areaTowns.Contains(c.TerritoryId.Value)) || c.Reps.Any(r => r.UserId == repId)))))
                .Select(c => c.Id)
                .ToListAsync(cancellationToken))
            .ToHashSet();
    }

    private async Task<WeeklyPlanDto> BuildAsync(Guid userId, DateOnly weekStart, WeeklyPlan? plan, Access access, CancellationToken cancellationToken)
    {
        var person = await db.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new { u.FullName, u.TerritoryId })
            .SingleAsync(cancellationToken);
        var days = plan?.Days.OrderBy(d => d.Day).ToList() ?? [];

        var cityIds = days.Select(d => d.CityId).Distinct().ToArray();
        var cities = await db.Territories.AsNoTracking()
            .Where(t => cityIds.Contains(t.Id))
            .Select(t => new { t.Id, t.Name, t.NameAr })
            .ToDictionaryAsync(t => t.Id, cancellationToken);
        var customerIds = days.SelectMany(d => d.Customers).Select(c => c.CustomerId).Distinct().ToArray();
        var customers = await db.Customers.AsNoTracking()
            .Where(c => customerIds.Contains(c.Id))
            .Select(c => new { c.Id, c.Type, c.Name, c.NameAr, c.TerritoryId })
            .ToDictionaryAsync(c => c.Id, cancellationToken);

        // AM visits (morning places) are kept apart from the planned doctor and pharmacy visits.
        bool IsAm(Guid customerId) => customers.TryGetValue(customerId, out var c) && c.Type == CustomerType.Hospital;
        var (amVisits, visits) = await VisitsAsync(userId, weekStart, cancellationToken);
        var progress = PlanProgress.Compute(
            weekStart,
            days.Select(d => new PlannedDay(d.Day, d.CityId, d.TargetVisits,
                d.Customers.Where(c => !IsAm(c.CustomerId)).Select(c => c.CustomerId).ToList())).ToList(),
            visits);
        var visited = visits.Concat(amVisits).GroupBy(v => v.Day).ToDictionary(g => g.Key, g => g.Select(v => v.CustomerId).ToHashSet());

        List<WeeklyPlanCustomerDto> CustomersOf(WeeklyPlanDay d, bool am) =>
            d.Customers.OrderBy(c => c.SortOrder)
                .Where(c => customers.ContainsKey(c.CustomerId) && IsAm(c.CustomerId) == am)
                .Select(c =>
                {
                    var customer = customers[c.CustomerId];
                    return new WeeklyPlanCustomerDto(
                        customer.Id, customer.Type, customer.Name, customer.NameAr, customer.TerritoryId,
                        visited.TryGetValue(d.Day, out var ids) && ids.Contains(customer.Id));
                })
                .ToList();

        var dayDtos = days.Select(d => new WeeklyPlanDayDto(
                d.Day,
                d.CityId,
                cities.TryGetValue(d.CityId, out var city) ? city.Name : string.Empty,
                city?.NameAr,
                d.TargetVisits,
                d.Note,
                CustomersOf(d, am: false),
                CustomersOf(d, am: true)))
            .ToList();

        var history = plan is null
            ? []
            : await db.WeeklyPlanEvents.AsNoTracking()
                .Where(e => e.PlanId == plan.Id)
                .OrderBy(e => e.CreatedAt).ThenBy(e => e.Id)
                .Select(e => new WeeklyPlanEventDto(e.Id, e.FromStatus, e.ToStatus, e.ActorName, e.Note, e.CreatedAt))
                .ToListAsync(cancellationToken);
        var reviewedBy = plan?.ReviewedById is { } reviewerId
            ? await db.Users.AsNoTracking().Where(u => u.Id == reviewerId).Select(u => u.FullName).SingleOrDefaultAsync(cancellationToken)
            : null;

        var today = calendar.Today();
        var currentWeek = WeekOf(today);
        var canEdit = access.Own && access.WriteOwn && weekStart >= currentWeek && (plan is null || plan.IsEditable);
        var reviewer = access.Own && (plan is null || plan.IsEditable || plan.Status == WeeklyPlanStatus.Submitted)
            ? await ReviewerOfAsync(userId, plan?.TerritoryId ?? person.TerritoryId, cancellationToken)
            : null;

        return new WeeklyPlanDto(
            plan?.Id,
            userId,
            person.FullName,
            weekStart,
            weekStart.AddDays(6),
            plan?.Status ?? WeeklyPlanStatus.Draft,
            plan?.Version ?? 0,
            plan?.ReviewNote,
            reviewedBy,
            plan?.ReviewedAt,
            plan?.SubmittedAt,
            plan?.UpdatedAt,
            dayDtos,
            progress,
            history,
            canEdit,
            canEdit && plan is not null && plan.Days.Count > 0,
            access.Review && plan?.Status == WeeklyPlanStatus.Submitted,
            access.Review && plan?.Status == WeeklyPlanStatus.Approved,
            reviewer?.Name,
            today,
            currentWeek);
    }

    /// <summary>
    /// The rep's completed visits of the week, each on its Egypt day, with the customer's town: AM visits
    /// (morning places) apart from the others, which are the ones the plan's target counts.
    /// </summary>
    private async Task<(List<PlanVisit> Am, List<PlanVisit> Others)> VisitsAsync(Guid userId, DateOnly weekStart, CancellationToken cancellationToken)
    {
        var start = calendar.StartOf(weekStart);
        var end = calendar.StartOf(weekStart.AddDays(7));
        var rows = await db.Visits.AsNoTracking()
            .Where(v => v.UserId == userId && v.Status == VisitStatus.Completed && v.ArchivedAt == null &&
                        v.CheckInAt >= start && v.CheckInAt < end)
            .Select(v => new { v.CheckInAt, v.CustomerId, Town = v.Customer!.TerritoryId, Am = v.Customer.Type == CustomerType.Hospital })
            .ToListAsync(cancellationToken);
        return (
            rows.Where(v => v.Am).Select(v => new PlanVisit(calendar.DayOf(v.CheckInAt), v.CustomerId, v.Town)).ToList(),
            rows.Where(v => !v.Am).Select(v => new PlanVisit(calendar.DayOf(v.CheckInAt), v.CustomerId, v.Town)).ToList());
    }

    private async Task TransitionAsync(
        WeeklyPlan plan,
        WeeklyPlanStatus to,
        Guid actorId,
        string actorName,
        string? note,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var from = plan.Status;
        plan.Status = to;
        plan.UpdatedAt = now;
        plan.Version++;
        db.WeeklyPlanEvents.Add(new WeeklyPlanEvent
        {
            PlanId = plan.Id,
            FromStatus = from,
            ToStatus = to,
            ActorId = actorId,
            ActorName = actorName,
            Note = note,
            CreatedAt = now,
        });
        await audit.AddAsync(AuditEntities.WeeklyPlan, plan.Id, AuditAction.Updated, new
        {
            userId = plan.UserId,
            weekStart = plan.WeekStart,
            before = new { status = StatusName(from) },
            after = new { status = StatusName(to) },
            note,
        }, cancellationToken: cancellationToken);
    }

    /// <summary>Saves; a plan changed by someone else meanwhile (or created twice at once) is a 409.</summary>
    private async Task SaveAsync(bool created, CancellationToken cancellationToken)
    {
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw Changed();
        }
        catch (DbUpdateException) when (created)
        {
            // The same rep and week arrived twice at the same moment; the unique index kept the first.
            throw Changed();
        }
    }

    private void EnsureWeekOpen(DateOnly weekStart)
    {
        if (weekStart < WeekOf(calendar.Today()))
        {
            throw new BusinessRuleException(PlanErrorCodes.WeekPast, "This week has ended. Plans are written for this week and later weeks.");
        }
    }

    private static void EnsureEditable(WeeklyPlan plan)
    {
        if (!plan.IsEditable)
        {
            throw StatusInvalid(plan.Status);
        }
    }

    private static void EnsureVersion(WeeklyPlan plan, int? version)
    {
        if (version is { } expected && expected != plan.Version)
        {
            throw Changed();
        }
    }

    private static ConflictException StatusInvalid(WeeklyPlanStatus status) =>
        new(PlanErrorCodes.StatusInvalid, $"This plan is {StatusName(status)} and cannot be changed now.")
        {
            Details = new Dictionary<string, object?> { ["status"] = StatusName(status) },
        };

    private static ConflictException Changed() =>
        new(PlanErrorCodes.Changed, "The plan was changed meanwhile. Reload it and try again.");

    private static string StatusName(WeeklyPlanStatus status) => status.ToString().ToLowerInvariant();

    private static List<DaySummary> Summary(IEnumerable<WeeklyPlanDay> days) =>
        days.OrderBy(d => d.Day)
            .Select(d => new DaySummary(d.Day, d.CityId, d.TargetVisits, d.Note,
                d.Customers.OrderBy(c => c.SortOrder).Select(c => c.CustomerId).ToArray()))
            .ToList();

    private async Task<string> NameOfAsync(Guid userId, CancellationToken cancellationToken) =>
        await db.Users.AsNoTracking().Where(u => u.Id == userId).Select(u => u.FullName).SingleOrDefaultAsync(cancellationToken) ?? string.Empty;

    private static string? Clean(string? value, int max = WeeklyPlan.NoteMaxLength)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed.Length <= max ? trimmed : trimmed[..max];
    }
}
