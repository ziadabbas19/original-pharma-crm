using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Auditing;
using OriginalPharma.Application.Common.Organization;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Plans;
using OriginalPharma.Domain.Audit;
using OriginalPharma.Domain.Common;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Domain.Notifications;
using OriginalPharma.Domain.Plans;
using OriginalPharma.Domain.Visits;

namespace OriginalPharma.Tests.Integration;

/// <summary>
/// Weekly plans: the rep's draft, submit, approve, return and reopen, who may review whom, the history,
/// notifications and activity log, planned against done on a seeded week, and week boundaries at Egypt
/// midnight. Plan weeks start on Saturday (the default).
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class PlanTests(PostgresFixture postgres)
{
    /// <summary>Thursday 11 February 2027, noon in Cairo (winter time, UTC+2). No demo visits fall in its week.</summary>
    private static readonly DateTimeOffset Thursday = new(2027, 2, 11, 10, 0, 0, TimeSpan.Zero);

    /// <summary>Saturday, the first day of <see cref="Thursday"/>'s week.</summary>
    private static readonly DateOnly WeekStart = new(2027, 2, 6);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    // ---------------------------------------------------------------------------------------------
    // Workflow
    // ---------------------------------------------------------------------------------------------

    [Fact]
    public async Task A_plan_goes_from_draft_to_approved_with_history_notifications_and_activity_log()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        db.Clock.SetNow(Thursday);
        var p = await DemoPeople.LoadAsync(db);
        var nasr = await DemoPeople.TerritoryAsync(db, "T-NSR");
        var heliopolis = await DemoPeople.TerritoryAsync(db, "T-HLP");
        var ahmed = await DemoPeople.DoctorAsync(db, "Dr. Ahmed Fathy");
        var pharmacy = await DemoPeople.DoctorAsync(db, "Demo Pharmacy");

        var empty = await MineAsync(db, p.Rep);
        Assert.Null(empty.Id);
        Assert.Equal(WeekStart, empty.WeekStart);
        Assert.Equal(WeekStart.AddDays(6), empty.WeekEnd);
        Assert.True(empty.CanEdit);
        Assert.False(empty.CanSubmit);
        Assert.Equal("Demo Supervisor", empty.ReviewerName);

        var draft = await SaveAsync(db, p.Rep,
            Day(WeekStart, nasr, 6, "Clinics first", ahmed, pharmacy),
            Day(WeekStart.AddDays(1), heliopolis, 4));
        Assert.NotNull(draft.Id);
        Assert.Equal(WeeklyPlanStatus.Draft, draft.Status);
        Assert.Equal(2, draft.Days.Count);
        Assert.Equal(new[] { ahmed, pharmacy }, draft.Days[0].Customers.Select(c => c.CustomerId));
        Assert.Equal(10, draft.Progress.Planned);
        Assert.True(draft.CanSubmit);

        // A manager does not hear about a draft.
        Assert.Equal(0, await db.DbAsync(c => c.Notifications.CountAsync(n => n.EntityId == draft.Id, Ct)));

        var submitted = await db.As<PlanService, WeeklyPlanDto>(p.Rep, s => s.SubmitAsync(draft.Id!.Value, new SubmitWeeklyPlanRequest(draft.Version), Ct));
        Assert.Equal(WeeklyPlanStatus.Submitted, submitted.Status);
        Assert.False(submitted.CanEdit);
        var toSupervisor = await db.DbAsync(c => c.Notifications.SingleAsync(n => n.EntityId == draft.Id, Ct));
        Assert.Equal(p.Supervisor, toSupervisor.UserId);
        Assert.Equal(NotificationType.PlanSubmitted, toSupervisor.Type);
        Assert.Contains(db.Published.Sent, s => s.UserId == p.Supervisor && s.Notification.Type == NotificationType.PlanSubmitted);

        // The supervisor finds it waiting and approves it with a note.
        Assert.Equal(1, (await db.As<PlanService, WeeklyPlanPendingDto>(p.Supervisor, s => s.PendingAsync(Ct))).Count);
        var pending = await ListAsync(db, p.Supervisor, new WeeklyPlanQuery(Status: WeeklyPlanStatus.Submitted));
        var item = Assert.Single(pending.Items);
        Assert.Equal((p.Rep, 2, 10), (item.UserId, item.DaysPlanned, item.Planned));
        var view = await db.As<PlanService, WeeklyPlanDto>(p.Supervisor, s => s.GetAsync(draft.Id!.Value, Ct));
        Assert.True(view.CanReview);
        Assert.False(view.CanEdit);

        var approved = await db.As<PlanService, WeeklyPlanDto>(p.Supervisor, s =>
            s.ApproveAsync(draft.Id!.Value, new ReviewWeeklyPlanRequest("Good week", view.Version), Ct));
        Assert.Equal(WeeklyPlanStatus.Approved, approved.Status);
        Assert.Equal("Good week", approved.ReviewNote);
        Assert.Equal("Demo Supervisor", approved.ReviewedByName);
        Assert.True(approved.CanReopen);
        Assert.Equal(0, (await db.As<PlanService, WeeklyPlanPendingDto>(p.Supervisor, s => s.PendingAsync(Ct))).Count);

        var toRep = await db.DbAsync(c => c.Notifications.SingleAsync(n => n.UserId == p.Rep && n.EntityId == draft.Id, Ct));
        Assert.Equal(NotificationType.PlanApproved, toRep.Type);
        Assert.Contains("Good week", toRep.Data);

        // Both sides see the same history: created, submitted, approved.
        var mine = await MineAsync(db, p.Rep);
        Assert.Equal(
            new (WeeklyPlanStatus?, WeeklyPlanStatus)[]
            {
                (null, WeeklyPlanStatus.Draft), (WeeklyPlanStatus.Draft, WeeklyPlanStatus.Submitted), (WeeklyPlanStatus.Submitted, WeeklyPlanStatus.Approved),
            },
            mine.History.Select(h => (h.FromStatus, h.ToStatus)));
        Assert.Equal(new[] { "Demo Rep", "Demo Rep", "Demo Supervisor" }, mine.History.Select(h => h.ActorName));
        Assert.Equal("Good week", mine.History[^1].Note);
        Assert.Equal(mine.History.Select(h => h.Id), approved.History.Select(h => h.Id));

        var entries = await db.DbAsync(c => c.AuditEntries
            .Where(e => e.EntityType == AuditEntities.WeeklyPlan && e.EntityId == draft.Id)
            .OrderBy(e => e.CreatedAt).ThenBy(e => e.Id)
            .ToListAsync(Ct));
        Assert.Equal(new[] { AuditAction.Created, AuditAction.Updated, AuditAction.Updated }, entries.Select(e => e.Action));
        // Stored as jsonb, which spaces the text its own way.
        Assert.Contains("\"before\":{\"status\":\"draft\"}", Compact(entries[1].Details));
        Assert.Contains("\"after\":{\"status\":\"submitted\"}", Compact(entries[1].Details));
        Assert.Contains("\"after\":{\"status\":\"approved\"}", Compact(entries[2].Details));
        Assert.Equal(p.Supervisor, entries[2].ActorId);
    }

    [Fact]
    public async Task An_approved_plan_is_locked_until_a_reviewer_reopens_it()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        db.Clock.SetNow(Thursday);
        var p = await DemoPeople.LoadAsync(db);
        var nasr = await DemoPeople.TerritoryAsync(db, "T-NSR");
        var plan = await SubmitAsync(db, p.Rep, Day(WeekStart.AddDays(2), nasr, 5));
        var id = plan.Id!.Value;

        // Submitted: the rep can no longer change it.
        var editing = await Assert.ThrowsAsync<ConflictException>(() => SaveAsync(db, p.Rep, Day(WeekStart.AddDays(2), nasr, 7)));
        Assert.Equal(PlanErrorCodes.StatusInvalid, editing.Code);

        // A return needs a note; with one, the rep can edit again and sees it.
        var noNote = await Assert.ThrowsAsync<BusinessRuleException>(() =>
            db.As<PlanService, WeeklyPlanDto>(p.Supervisor, s => s.ReturnAsync(id, new ReviewWeeklyPlanRequest("  "), Ct)));
        Assert.Equal(PlanErrorCodes.NoteRequired, noNote.Code);
        await Assert.ThrowsAsync<ValidationException>(() =>
            db.As<PlanService, WeeklyPlanDto>(p.Supervisor, s => s.ReturnAsync(id, new ReviewWeeklyPlanRequest(new string('x', 501)), Ct)));
        await db.As<PlanService, WeeklyPlanDto>(p.Supervisor, s => s.ReturnAsync(id, new ReviewWeeklyPlanRequest("Add a day in Heliopolis"), Ct));
        var returned = await MineAsync(db, p.Rep);
        Assert.Equal(WeeklyPlanStatus.Returned, returned.Status);
        Assert.Equal("Add a day in Heliopolis", returned.ReviewNote);
        Assert.True(returned.CanEdit);
        var told = await db.DbAsync(c => c.Notifications.SingleAsync(n => n.UserId == p.Rep && n.Type == NotificationType.PlanReturned, Ct));
        Assert.Contains("Add a day in Heliopolis", told.Data);

        var changed = await SaveAsync(db, p.Rep, Day(WeekStart.AddDays(2), nasr, 7));
        Assert.Equal(WeeklyPlanStatus.Returned, changed.Status);
        await db.As<PlanService, WeeklyPlanDto>(p.Rep, s => s.SubmitAsync(id, new SubmitWeeklyPlanRequest(), Ct));
        var approved = await db.As<PlanService, WeeklyPlanDto>(p.Area, s => s.ApproveAsync(id, new ReviewWeeklyPlanRequest(), Ct));
        Assert.Equal(WeeklyPlanStatus.Approved, approved.Status);
        Assert.Null(approved.ReviewNote);

        // Approved: locked for the rep, and approving or returning again is refused.
        Assert.False((await MineAsync(db, p.Rep)).CanEdit);
        Assert.Equal(PlanErrorCodes.StatusInvalid,
            (await Assert.ThrowsAsync<ConflictException>(() => SaveAsync(db, p.Rep, Day(WeekStart.AddDays(2), nasr, 9)))).Code);
        Assert.Equal(PlanErrorCodes.StatusInvalid, (await Assert.ThrowsAsync<ConflictException>(() =>
            db.As<PlanService, WeeklyPlanDto>(p.Rep, s => s.SubmitAsync(id, new SubmitWeeklyPlanRequest(), Ct)))).Code);
        Assert.Equal(PlanErrorCodes.StatusInvalid, (await Assert.ThrowsAsync<ConflictException>(() =>
            db.As<PlanService, WeeklyPlanDto>(p.Supervisor, s => s.ReturnAsync(id, new ReviewWeeklyPlanRequest("Again"), Ct)))).Code);
        // Only a reviewer reopens it; a draft or submitted plan cannot be reopened.
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            db.As<PlanService, WeeklyPlanDto>(p.Rep, s => s.ReopenAsync(id, new ReviewWeeklyPlanRequest(), Ct)));

        var reopened = await db.As<PlanService, WeeklyPlanDto>(p.Supervisor, s => s.ReopenAsync(id, new ReviewWeeklyPlanRequest("Thursday changed"), Ct));
        Assert.Equal(WeeklyPlanStatus.Returned, reopened.Status);
        var reopenedNotice = await db.DbAsync(c => c.Notifications
            .Where(n => n.UserId == p.Rep && n.Type == NotificationType.PlanReturned)
            .OrderByDescending(n => n.CreatedAt).FirstAsync(Ct));
        Assert.Contains("\"reopened\":true", Compact(reopenedNotice.Data));
        var edited = await SaveAsync(db, p.Rep, Day(WeekStart.AddDays(2), nasr, 3));
        Assert.Equal(3, edited.Days.Single().TargetVisits);
        Assert.Equal(
            new[]
            {
                WeeklyPlanStatus.Draft, WeeklyPlanStatus.Submitted, WeeklyPlanStatus.Returned,
                WeeklyPlanStatus.Submitted, WeeklyPlanStatus.Approved, WeeklyPlanStatus.Returned,
            },
            edited.History.Select(h => h.ToStatus));

        // The activity log keeps the days before and after a draft change.
        var dayChange = (await db.DbAsync(c => c.AuditEntries
                .Where(e => e.EntityId == id && e.Action == AuditAction.Updated)
                .OrderByDescending(e => e.CreatedAt).ToListAsync(Ct)))
            .First(e => e.Details.Contains("\"days\""));
        Assert.Contains("\"target\":7", Compact(dayChange.Details));
        Assert.Contains("\"target\":3", Compact(dayChange.Details));
    }

    [Fact]
    public async Task Stale_versions_and_wrong_input_are_refused_with_clear_codes()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        db.Clock.SetNow(Thursday);
        var p = await DemoPeople.LoadAsync(db);
        var nasr = await DemoPeople.TerritoryAsync(db, "T-NSR");
        var area = await DemoPeople.TerritoryAsync(db, "A-CAI-E");
        var ahmed = await DemoPeople.DoctorAsync(db, "Dr. Ahmed Fathy");
        var karim = await DemoPeople.DoctorAsync(db, "Dr. Karim Adel"); // Heliopolis
        var rania = await DemoPeople.DoctorAsync(db, "Dr. Rania Hassan"); // the other rep's list

        var first = await SaveAsync(db, p.Rep, Day(WeekStart, nasr, 2));
        var second = await SaveAsync(db, p.Rep, first.Version, Day(WeekStart, nasr, 3));
        Assert.Equal(first.Version + 1, second.Version);
        Assert.Equal(PlanErrorCodes.Changed,
            (await Assert.ThrowsAsync<ConflictException>(() => SaveAsync(db, p.Rep, first.Version, Day(WeekStart, nasr, 4)))).Code);
        // Saving the same days again changes nothing.
        Assert.Equal(second.Version, (await SaveAsync(db, p.Rep, second.Version, Day(WeekStart, nasr, 3))).Version);

        async Task<string> Refused(params WeeklyPlanDayInput[] days) =>
            (await Assert.ThrowsAsync<BusinessRuleException>(() => SaveAsync(db, p.Rep, days))).Code;

        Assert.Equal(PlanErrorCodes.CustomerInvalid, await Refused(Day(WeekStart, nasr, 2, null, rania)));
        Assert.Equal(PlanErrorCodes.CustomerCity, await Refused(Day(WeekStart, nasr, 2, null, karim)));
        Assert.Equal(PlanErrorCodes.CityInvalid, await Refused(Day(WeekStart, area, 2)));
        Assert.Equal(PlanErrorCodes.DayInvalid, await Refused(Day(WeekStart.AddDays(7), nasr, 2)));
        Assert.Equal(PlanErrorCodes.DayInvalid, await Refused(Day(WeekStart, nasr, 2), Day(WeekStart, nasr, 3)));
        await Assert.ThrowsAsync<ValidationException>(() => SaveAsync(db, p.Rep, Day(WeekStart, nasr, 101)));
        await Assert.ThrowsAsync<ValidationException>(() => SaveAsync(db, p.Rep, Day(WeekStart, nasr, -1)));
        await Assert.ThrowsAsync<ValidationException>(() => SaveAsync(db, p.Rep, Day(WeekStart, Guid.Empty, 2)));
        await Assert.ThrowsAsync<ValidationException>(() => SaveAsync(db, p.Rep, Day(WeekStart, nasr, 2, new string('n', 501))));

        // Weeks that already ended are closed; later weeks are open.
        Assert.Equal(PlanErrorCodes.WeekPast, (await Assert.ThrowsAsync<BusinessRuleException>(() =>
            db.As<PlanService, WeeklyPlanDto>(p.Rep, s => s.SaveDraftAsync(new SaveWeeklyPlanRequest(WeekStart.AddDays(-1), [Day(WeekStart.AddDays(-1), nasr, 2)]), Ct)))).Code);
        var next = await db.As<PlanService, WeeklyPlanDto>(p.Rep, s =>
            s.SaveDraftAsync(new SaveWeeklyPlanRequest(WeekStart.AddDays(10), [Day(WeekStart.AddDays(9), nasr, 2, null, ahmed)]), Ct));
        Assert.Equal(WeekStart.AddDays(7), next.WeekStart);

        // An empty plan cannot be submitted; reps cannot review, nobody reviews their own plan.
        var empty = await db.As<PlanService, WeeklyPlanDto>(p.Rep, s => s.SaveDraftAsync(new SaveWeeklyPlanRequest(WeekStart.AddDays(14), []), Ct));
        Assert.Equal(PlanErrorCodes.Empty, (await Assert.ThrowsAsync<BusinessRuleException>(() =>
            db.As<PlanService, WeeklyPlanDto>(p.Rep, s => s.SubmitAsync(empty.Id!.Value, new SubmitWeeklyPlanRequest(), Ct)))).Code);
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            db.As<PlanService, WeeklyPlanDto>(p.Supervisor, s => s.SaveDraftAsync(new SaveWeeklyPlanRequest(WeekStart, []), Ct)));
    }

    // ---------------------------------------------------------------------------------------------
    // Who reviews whom
    // ---------------------------------------------------------------------------------------------

    [Fact]
    public async Task Reviewers_are_the_reps_reporting_line_within_their_scope_and_never_themselves()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        db.Clock.SetNow(Thursday);
        var p = await DemoPeople.LoadAsync(db);
        var nasr = await DemoPeople.TerritoryAsync(db, "T-NSR");
        var giza = await DemoPeople.TerritoryAsync(db, "A-GIZ");
        var plan = await SubmitAsync(db, p.Rep, Day(WeekStart, nasr, 5));
        var id = plan.Id!.Value;

        var gizaSupervisor = (await db.UsersAsync(p.Admin, s => s.CreateAsync(new CreateUserRequest(
            "giza.supervisor@demo.local", "Giza Supervisor", PostgresFixture.Password, [DefaultRoles.Supervisor], p.Sales, giza), Ct))).User.Id;
        var gizaArea = (await db.UsersAsync(p.Admin, s => s.CreateAsync(new CreateUserRequest(
            "giza.area@demo.local", "Giza Area", PostgresFixture.Password, [DefaultRoles.AreaManager], p.Sales, giza), Ct))).User.Id;

        // Outside the scope: not found, not listed, not counted.
        foreach (var outsider in new[] { p.RepEast, gizaSupervisor, gizaArea })
        {
            await Assert.ThrowsAsync<NotFoundException>(() => db.As<PlanService, WeeklyPlanDto>(outsider, s => s.GetAsync(id, Ct)));
            await Assert.ThrowsAsync<NotFoundException>(() =>
                db.As<PlanService, WeeklyPlanDto>(outsider, s => s.ApproveAsync(id, new ReviewWeeklyPlanRequest(), Ct)));
        }

        Assert.Empty((await ListAsync(db, gizaArea, new WeeklyPlanQuery())).Items);
        Assert.Equal(0, (await db.As<PlanService, WeeklyPlanPendingDto>(gizaSupervisor, s => s.PendingAsync(Ct))).Count);
        await Assert.ThrowsAsync<ForbiddenException>(() => ListAsync(db, p.RepEast, new WeeklyPlanQuery()));

        // Team, territory and all scopes above the rep see it.
        foreach (var manager in new[] { p.Supervisor, p.Area, p.Sales, p.Admin })
        {
            Assert.True((await db.As<PlanService, WeeklyPlanDto>(manager, s => s.GetAsync(id, Ct))).CanReview);
            Assert.Single((await ListAsync(db, manager, new WeeklyPlanQuery(UserId: p.Rep))).Items);
        }

        // A manager who also plans goes to the next reviewer up and cannot approve their own plan.
        await db.GrantAsync(p.Admin, DefaultRoles.Supervisor,
            (Permissions.Plans.ReadOwn, PermissionScope.Own), (Permissions.Plans.WriteOwn, PermissionScope.Own));
        var own = await SubmitAsync(db, p.Supervisor, Day(WeekStart, nasr, 3));
        Assert.Equal(p.Area, (await db.DbAsync(c => c.Notifications.SingleAsync(n => n.EntityId == own.Id, Ct))).UserId);
        var self = await Assert.ThrowsAsync<ForbiddenException>(() =>
            db.As<PlanService, WeeklyPlanDto>(p.Supervisor, s => s.ApproveAsync(own.Id!.Value, new ReviewWeeklyPlanRequest(), Ct)));
        Assert.Equal(PlanErrorCodes.OwnPlan, self.Code);
        Assert.False((await db.As<PlanService, WeeklyPlanDto>(p.Supervisor, s => s.GetAsync(own.Id!.Value, Ct))).CanReview);
        Assert.Equal(1, (await db.As<PlanService, WeeklyPlanPendingDto>(p.Supervisor, s => s.PendingAsync(Ct))).Count);

        // Reading a rep's plans without plans:review allows no review.
        var supervisor = await db.RoleAsync(DefaultRoles.Supervisor);
        await db.RolesAsync(p.Admin, s => s.SetPermissionsAsync(supervisor.Id, new SetRolePermissionsRequest(
            supervisor.Permissions.Where(g => g.Key != Permissions.Plans.Review).ToList()), Ct));
        Assert.False((await db.As<PlanService, WeeklyPlanDto>(p.Supervisor, s => s.GetAsync(id, Ct))).CanReview);
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            db.As<PlanService, WeeklyPlanDto>(p.Supervisor, s => s.ApproveAsync(id, new ReviewWeeklyPlanRequest(), Ct)));

        // Submitting now skips the supervisor: the area manager is the nearest reviewer.
        var east = await SubmitAsync(db, p.RepEast, Day(WeekStart, nasr, 2));
        Assert.Equal(p.Area, (await db.DbAsync(c => c.Notifications.SingleAsync(n => n.EntityId == east.Id, Ct))).UserId);
    }

    [Fact]
    public async Task A_rep_with_nobody_to_review_their_plan_cannot_submit_it()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        db.Clock.SetNow(Thursday);
        var p = await DemoPeople.LoadAsync(db);
        var nasr = await DemoPeople.TerritoryAsync(db, "T-NSR");
        await db.DbAsync(c => c.Users.Where(u => u.Id == p.RepEast).ExecuteUpdateAsync(s => s.SetProperty(u => u.ManagerId, (Guid?)null), Ct));
        await db.AsAsync(p.Admin, sp =>
        {
            sp.GetRequiredService<IOrgHierarchy>().Invalidate();
            return Task.CompletedTask;
        });

        var draft = await SaveAsync(db, p.RepEast, Day(WeekStart, nasr, 4));
        Assert.Null(draft.ReviewerName);
        var refused = await Assert.ThrowsAsync<BusinessRuleException>(() =>
            db.As<PlanService, WeeklyPlanDto>(p.RepEast, s => s.SubmitAsync(draft.Id!.Value, new SubmitWeeklyPlanRequest(), Ct)));
        Assert.Equal(PlanErrorCodes.NoReviewer, refused.Code);
        Assert.Equal(WeeklyPlanStatus.Draft, (await MineAsync(db, p.RepEast)).Status);
    }

    // ---------------------------------------------------------------------------------------------
    // Planned against done
    // ---------------------------------------------------------------------------------------------

    [Fact]
    public async Task Planned_against_done_counts_completed_visits_per_Egypt_day()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        db.Clock.SetNow(Thursday);
        var p = await DemoPeople.LoadAsync(db);
        var nasr = await DemoPeople.TerritoryAsync(db, "T-NSR");
        var newCairo = await DemoPeople.TerritoryAsync(db, "T-NCR");
        var ahmed = await DemoPeople.DoctorAsync(db, "Dr. Ahmed Fathy"); // Nasr City
        var mona = await DemoPeople.DoctorAsync(db, "Dr. Mona Saeed"); // Nasr City
        var karim = await DemoPeople.DoctorAsync(db, "Dr. Karim Adel"); // Heliopolis
        var tamer = await DemoPeople.DoctorAsync(db, "Dr. Tamer Nabil"); // New Cairo

        var saturday = WeekStart;
        var sunday = WeekStart.AddDays(1);
        var monday = WeekStart.AddDays(2);
        await SaveAsync(db, p.Rep,
            Day(saturday, nasr, 3, null, ahmed, mona),
            Day(sunday, newCairo, 2, null, tamer),
            Day(monday, nasr, 5));

        // Saturday: Ahmed and an extra Nasr City visit count, Heliopolis is outside the plan; the cancelled
        // and the deleted visits never count.
        await VisitAsync(db, p.Rep, ahmed, At(saturday, 9));
        await VisitAsync(db, p.Rep, ahmed, At(saturday, 11));
        await VisitAsync(db, p.Rep, karim, At(saturday, 13));
        await VisitAsync(db, p.Rep, mona, At(saturday, 14), VisitStatus.Cancelled);
        await VisitAsync(db, p.Rep, mona, At(saturday, 15), archived: true);
        // Sunday: nothing done. Wednesday is a day off: its visit is outside the plan.
        await VisitAsync(db, p.Rep, tamer, At(WeekStart.AddDays(4), 10));
        // Another rep's visit and a visit in the next week do not count either.
        await VisitAsync(db, p.RepEast, ahmed, At(saturday, 10));
        await VisitAsync(db, p.Rep, ahmed, At(WeekStart.AddDays(7), 10));

        var plan = await MineAsync(db, p.Rep);
        var days = plan.Progress.Days.ToDictionary(d => d.Day);
        Assert.Equal(7, plan.Progress.Days.Count);
        Assert.Equal((3, 2, 1, 2, 1), (days[saturday].Target, days[saturday].Done, days[saturday].Unplanned, days[saturday].PlannedCustomers, days[saturday].PlannedCustomersVisited));
        Assert.Equal((2, 0, 0), (days[sunday].Target, days[sunday].Done, days[sunday].Unplanned));
        Assert.Equal((0, 0, 1), (days[WeekStart.AddDays(4)].Target, days[WeekStart.AddDays(4)].Done, days[WeekStart.AddDays(4)].Unplanned));
        Assert.Equal((10, 2, 2, 20), (plan.Progress.Planned, plan.Progress.Done, plan.Progress.Unplanned, plan.Progress.Percent));

        var saturdayPlan = plan.Days.Single(d => d.Day == saturday);
        Assert.True(saturdayPlan.Customers.Single(c => c.CustomerId == ahmed).Visited);
        Assert.False(saturdayPlan.Customers.Single(c => c.CustomerId == mona).Visited);
        Assert.All(plan.Days.Single(d => d.Day == sunday).Customers, c => Assert.False(c.Visited));

        // The manager sees the same numbers.
        var managerView = await db.As<PlanService, WeeklyPlanDto>(p.Supervisor, s => s.GetAsync(plan.Id!.Value, Ct));
        Assert.Equal(plan.Progress, managerView.Progress with { Days = plan.Progress.Days });
        Assert.Equal(plan.Progress.Days, managerView.Progress.Days);
    }

    [Fact]
    public async Task Weeks_and_days_turn_over_at_Egypt_midnight()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var nasr = await DemoPeople.TerritoryAsync(db, "T-NSR");
        var ahmed = await DemoPeople.DoctorAsync(db, "Dr. Ahmed Fathy");
        var nextWeek = WeekStart.AddDays(7); // Saturday 13 February
        var midnight = new DateTimeOffset(2027, 2, 12, 22, 0, 0, TimeSpan.Zero); // 00:00 Saturday in Cairo

        // Friday 23:59:59 in Cairo is still the old week: its plan can be written, the next one too.
        db.Clock.SetNow(midnight.AddSeconds(-1));
        Assert.Equal(WeekStart, (await MineAsync(db, p.Rep)).WeekStart);
        await SaveAsync(db, p.Rep, Day(WeekStart.AddDays(6), nasr, 2));
        await db.As<PlanService, WeeklyPlanDto>(p.Rep, s =>
            s.SaveDraftAsync(new SaveWeeklyPlanRequest(nextWeek, [Day(nextWeek, nasr, 4, null, ahmed)]), Ct));

        // A visit one second before midnight belongs to Friday, one at midnight to Saturday of the next week.
        await VisitAsync(db, p.Rep, ahmed, midnight.AddSeconds(-1));
        await VisitAsync(db, p.Rep, ahmed, midnight);

        db.Clock.SetNow(midnight);
        var current = await MineAsync(db, p.Rep);
        Assert.Equal(nextWeek, current.WeekStart);
        Assert.Equal(nextWeek, current.CurrentWeekStart);
        Assert.Equal(nextWeek, current.Today);
        var saturday = current.Progress.Days[0];
        Assert.Equal((nextWeek, 1), (saturday.Day, saturday.Done));
        Assert.True(current.Days.Single().Customers.Single().Visited);

        var old = await db.As<PlanService, WeeklyPlanDto>(p.Rep, s => s.GetMineAsync(WeekStart.AddDays(3), Ct));
        Assert.Equal(1, old.Progress.Days[6].Done);
        Assert.False(old.CanEdit);
        Assert.Equal(PlanErrorCodes.WeekPast, (await Assert.ThrowsAsync<BusinessRuleException>(() =>
            db.As<PlanService, WeeklyPlanDto>(p.Rep, s =>
                s.SaveDraftAsync(new SaveWeeklyPlanRequest(WeekStart, [Day(WeekStart.AddDays(6), nasr, 3)], old.Version), Ct)))).Code);
    }

    [Fact]
    public async Task Plan_permissions_reach_the_existing_roles_once_when_they_first_appear()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var custom = await db.RolesAsync(p.Admin, s => s.CreateRoleAsync(new CreateRoleRequest("منسق", "Coordinator", Level: 35), Ct));

        // As in a database from before plans existed: the keys are not in the catalog yet.
        string[] keys = [Permissions.Plans.ReadOwn, Permissions.Plans.WriteOwn, Permissions.Plans.Read, Permissions.Plans.Review];
        await db.DbAsync(c => c.Permissions.Where(x => keys.Contains(x.Key)).ExecuteDeleteAsync(Ct));
        await db.SeedAgainAsync();

        Assert.Contains((await db.RoleAsync(DefaultRoles.Rep)).Permissions, g => g is { Key: Permissions.Plans.ReadOwn, Scope: PermissionScope.Own });
        Assert.Contains((await db.RoleAsync(DefaultRoles.Rep)).Permissions, g => g is { Key: Permissions.Plans.WriteOwn, Scope: PermissionScope.Own });
        Assert.DoesNotContain((await db.RoleAsync(DefaultRoles.Rep)).Permissions, g => g.Key is Permissions.Plans.Read or Permissions.Plans.Review);
        foreach (var (role, scope) in new[]
                 {
                     (DefaultRoles.Supervisor, PermissionScope.Team),
                     (DefaultRoles.AreaManager, PermissionScope.Territory),
                     (DefaultRoles.SalesManager, PermissionScope.All),
                     (DefaultRoles.Admin, PermissionScope.All),
                 })
        {
            var grants = (await db.RoleAsync(role)).Permissions;
            Assert.Contains(grants, g => g.Key == Permissions.Plans.Read && g.Scope == scope);
            Assert.Contains(grants, g => g.Key == Permissions.Plans.Review && g.Scope == scope);
        }

        Assert.DoesNotContain((await db.RoleAsync(custom.Key)).Permissions, g => keys.Contains(g.Key));

        // Taken away afterwards: a later start does not give it back.
        var rep = await db.RoleAsync(DefaultRoles.Rep);
        await db.RolesAsync(p.Admin, s => s.SetPermissionsAsync(rep.Id, new SetRolePermissionsRequest(
            rep.Permissions.Where(g => g.Key != Permissions.Plans.WriteOwn).ToList()), Ct));
        await db.SeedAgainAsync();
        Assert.DoesNotContain((await db.RoleAsync(DefaultRoles.Rep)).Permissions, g => g.Key == Permissions.Plans.WriteOwn);
    }

    // ---------------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------------

    private static string Compact(string json) => json.Replace(" ", string.Empty);

    private static WeeklyPlanDayInput Day(DateOnly day, Guid city, int target, string? note = null, params Guid[] customers) =>
        new(day, city, target, note, customers);

    private static Task<WeeklyPlanDto> MineAsync(TestDatabase db, Guid rep) =>
        db.As<PlanService, WeeklyPlanDto>(rep, s => s.GetMineAsync(null, Ct));

    /// <summary>Saves the draft of the current week.</summary>
    private static Task<WeeklyPlanDto> SaveAsync(TestDatabase db, Guid rep, params WeeklyPlanDayInput[] days) =>
        SaveAsync(db, rep, null, days);

    private static async Task<WeeklyPlanDto> SaveAsync(TestDatabase db, Guid rep, int? version, params WeeklyPlanDayInput[] days)
    {
        var week = (await MineAsync(db, rep)).WeekStart;
        return await db.As<PlanService, WeeklyPlanDto>(rep, s => s.SaveDraftAsync(new SaveWeeklyPlanRequest(week, days, version), Ct));
    }

    private static async Task<WeeklyPlanDto> SubmitAsync(TestDatabase db, Guid rep, params WeeklyPlanDayInput[] days)
    {
        var draft = await SaveAsync(db, rep, days);
        return await db.As<PlanService, WeeklyPlanDto>(rep, s => s.SubmitAsync(draft.Id!.Value, new SubmitWeeklyPlanRequest(draft.Version), Ct));
    }

    private static Task<WeeklyPlanPageDto> ListAsync(TestDatabase db, Guid actor, WeeklyPlanQuery query) =>
        db.As<PlanService, WeeklyPlanPageDto>(actor, s => s.ListAsync(query, Ct));

    /// <summary><paramref name="hour"/> o'clock on <paramref name="day"/> in Cairo (winter time).</summary>
    private static DateTimeOffset At(DateOnly day, int hour) =>
        new DateTimeOffset(day.ToDateTime(new TimeOnly(hour, 0)), TimeSpan.FromHours(2)).ToUniversalTime();

    /// <summary>A visit stored as the visit flow would have stored it.</summary>
    private static Task VisitAsync(
        TestDatabase db,
        Guid rep,
        Guid customer,
        DateTimeOffset at,
        VisitStatus status = VisitStatus.Completed,
        bool archived = false) =>
        db.DbAsync(async c =>
        {
            var area = await c.Users.Where(u => u.Id == rep).Select(u => u.TerritoryId).SingleAsync(Ct);
            var point = GeoFactory.Point(30.05, 31.33);
            c.Visits.Add(new Visit
            {
                UserId = rep,
                TerritoryId = area,
                CustomerId = customer,
                DeviceId = "test-device",
                Status = status,
                CheckInAt = at,
                CheckInReceivedAt = at,
                CheckInLocation = point,
                CheckInAccuracy = 10,
                CheckInWithinGeofence = true,
                CheckOutAt = status == VisitStatus.Completed ? at.AddMinutes(20) : null,
                CheckOutReceivedAt = status == VisitStatus.Completed ? at.AddMinutes(20) : null,
                CheckOutLocation = status == VisitStatus.Completed ? point : null,
                ArchivedAt = archived ? at.AddHours(1) : null,
            });
            return await c.SaveChangesAsync(Ct);
        });
}
