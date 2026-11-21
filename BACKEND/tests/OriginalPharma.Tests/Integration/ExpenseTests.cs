using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Auditing;
using OriginalPharma.Application.Expenses;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Visits;
using OriginalPharma.Domain.Audit;
using OriginalPharma.Domain.Expenses;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Tests.Integration;

/// <summary>
/// Daily expenses per city: the automatic line of the first visit in a city, the rep's changes inside
/// the editable window, managers' changes, notes, scopes, the activity log, and month totals over
/// Egypt local days.
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class ExpenseTests(PostgresFixture postgres)
{
    private const double ClinicLat = 30.0561;
    private const double ClinicLng = 31.3301;

    /// <summary>Noon in Cairo on 21 November 2026 (winter time, UTC+2): "today" for the window rules.</summary>
    private static readonly DateTimeOffset Noon = new(2026, 11, 21, 10, 0, 0, TimeSpan.Zero);

    private static readonly DateOnly Today = new(2026, 11, 21);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    // ---------------------------------------------------------------------------------------------
    // Automatic lines from visits
    // ---------------------------------------------------------------------------------------------

    [Fact]
    public async Task The_first_visit_in_a_city_creates_one_line_for_the_day()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var (clinic, city) = await DoctorAsync(db, "Dr. Demo Clinic");
        await SetCityAmountAsync(db, p.Admin, city, 75m);

        await VisitAsync(db, p.Rep, clinic);
        await VisitAsync(db, p.Rep, clinic);
        await VisitAsync(db, p.Rep, clinic);

        var day = await db.As<ExpenseService, ExpenseDayDto>(p.Rep, s => s.GetDayAsync(TodayInCairo(db), null, Ct));
        var line = Assert.Single(day.Lines);
        Assert.Equal(city, line.CityId);
        Assert.Equal(75m, line.Amount);
        Assert.Equal(75m, line.OriginalAmount);
        Assert.Equal(ExpenseLineKind.Auto, line.Kind);
        Assert.Equal(75m, day.Total);
        Assert.True(await AuditedAsync(db, line.Id, AuditAction.Created));
    }

    [Fact]
    public async Task Visits_in_two_cities_give_two_lines_and_a_city_without_an_amount_gives_none()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var (nasr, nasrCity) = await DoctorAsync(db, "Dr. Demo Clinic");
        var (heliopolis, heliopolisCity) = await DoctorAsync(db, "Dr. Karim Adel");
        var (newCairo, newCairoCity) = await DoctorAsync(db, "Dr. Tamer Nabil");
        await SetCityAmountAsync(db, p.Admin, nasrCity, 60m);
        await SetCityAmountAsync(db, p.Admin, heliopolisCity, 45.5m);
        await SetCityAmountAsync(db, p.Admin, newCairoCity, 0m);

        await VisitAsync(db, p.Rep, nasr);
        await VisitAsync(db, p.Rep, heliopolis);
        await VisitAsync(db, p.Rep, newCairo);

        var day = await db.As<ExpenseService, ExpenseDayDto>(p.Rep, s => s.GetDayAsync(TodayInCairo(db), null, Ct));
        Assert.Equal(new[] { heliopolisCity, nasrCity }.Order(), day.Lines.Select(l => l.CityId).Order());
        Assert.Equal(105.5m, day.Total);
        Assert.DoesNotContain(day.Lines, l => l.CityId == newCairoCity);
    }

    [Fact]
    public async Task A_changed_line_keeps_its_original_amount_and_later_visits_leave_it_alone()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var (clinic, city) = await DoctorAsync(db, "Dr. Demo Clinic");
        await SetCityAmountAsync(db, p.Admin, city, 75m);
        await VisitAsync(db, p.Rep, clinic);
        var today = TodayInCairo(db);
        var line = (await DayAsync(db, p.Rep, p.Rep, today)).Lines.Single();

        var changed = await db.As<ExpenseService, ExpenseLineDto>(p.Rep, s => s.UpdateLineAsync(line.Id, new UpdateExpenseLineRequest(90m, "Taxi both ways"), Ct));
        Assert.Equal(90m, changed.Amount);
        Assert.Equal(75m, changed.OriginalAmount);
        Assert.Equal(ExpenseLineKind.Edited, changed.Kind);

        await VisitAsync(db, p.Rep, clinic);
        var after = Assert.Single((await DayAsync(db, p.Rep, p.Rep, today)).Lines);
        Assert.Equal(90m, after.Amount);
        Assert.Equal("Taxi both ways", after.Note);

        var entry = await db.DbAsync(c => c.AuditEntries.SingleAsync(e => e.EntityId == line.Id && e.Action == AuditAction.Updated, Ct));
        Assert.Contains("\"before\"", entry.Details);
        Assert.Contains("75", entry.Details);
        Assert.Contains("90", entry.Details);
    }

    [Fact]
    public async Task A_removed_automatic_line_does_not_come_back_that_day()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var (clinic, city) = await DoctorAsync(db, "Dr. Demo Clinic");
        await SetCityAmountAsync(db, p.Admin, city, 75m);
        await VisitAsync(db, p.Rep, clinic);
        var today = TodayInCairo(db);
        var line = (await DayAsync(db, p.Rep, p.Rep, today)).Lines.Single();

        await db.As<ExpenseService>(p.Rep, s => s.RemoveLineAsync(line.Id, Ct));
        await VisitAsync(db, p.Rep, clinic);

        Assert.Empty((await DayAsync(db, p.Rep, p.Rep, today)).Lines);
        Assert.True(await AuditedAsync(db, line.Id, AuditAction.Archived));
        // The rep can still put it back by hand.
        await db.As<ExpenseService, ExpenseLineDto>(p.Rep, s => s.CreateLineAsync(new CreateExpenseLineRequest(today, city, 50m), Ct));
        Assert.Equal(50m, (await DayAsync(db, p.Rep, p.Rep, today)).Total);
    }

    [Fact]
    public async Task First_visits_arriving_together_still_make_one_line()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var (_, city) = await DoctorAsync(db, "Dr. Demo Clinic");
        await SetCityAmountAsync(db, p.Admin, city, 75m);
        var area = await db.DbAsync(c => c.Users.Where(u => u.Id == p.Rep).Select(u => u.TerritoryId).SingleAsync(Ct));
        var at = DateTimeOffset.UtcNow;

        await Task.WhenAll(Enumerable.Range(0, 8).Select(_ =>
            db.As<ExpenseService>(p.Rep, s => s.EnsureAutoLineAsync(p.Rep, area, at, city, Ct))));

        Assert.Equal(1, await db.DbAsync(c => c.ExpenseLines.CountAsync(l => l.UserId == p.Rep && l.CityId == city, Ct)));
    }

    [Fact]
    public async Task A_visit_counts_on_the_Egypt_day_around_midnight()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var (clinic, city) = await DoctorAsync(db, "Dr. Demo Clinic");
        await SetCityAmountAsync(db, p.Admin, city, 75m);
        var calendar = await db.AsAsync(p.Rep, sp => Task.FromResult(sp.GetRequiredService<LocalCalendar>()));
        var today = calendar.Today();
        var midnight = calendar.StartOf(today);

        await VisitAsync(db, p.Rep, clinic, midnight.AddSeconds(-1));
        await VisitAsync(db, p.Rep, clinic, midnight);

        Assert.Single((await DayAsync(db, p.Rep, p.Rep, today.AddDays(-1))).Lines);
        Assert.Single((await DayAsync(db, p.Rep, p.Rep, today)).Lines);

        // The visits list by day follows the same boundary.
        var yesterdays = await db.As<VisitService, IReadOnlyList<VisitListItemDto>>(p.Rep, s =>
            s.ListAsync(null, null, null, null, null, Ct, mine: true, day: today.AddDays(-1)));
        Assert.Contains(yesterdays, v => v.CheckInAt == midnight.AddSeconds(-1));
        Assert.DoesNotContain(yesterdays, v => v.CheckInAt == midnight);
        Assert.Equal(city, yesterdays.First(v => v.CheckInAt == midnight.AddSeconds(-1)).CustomerTerritoryId);
    }

    // ---------------------------------------------------------------------------------------------
    // Who may change what
    // ---------------------------------------------------------------------------------------------

    [Fact]
    public async Task Reps_change_their_own_days_inside_the_window_and_managers_any_past_day()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        db.Clock.SetNow(Noon);
        var p = await DemoPeople.LoadAsync(db);
        var (_, city) = await DoctorAsync(db, "Dr. Demo Clinic");

        Task<ExpenseLineDto> Add(Guid actor, DateOnly day, Guid? rep = null) =>
            db.As<ExpenseService, ExpenseLineDto>(actor, s => s.CreateLineAsync(new CreateExpenseLineRequest(day, city, 40m, UserId: rep), Ct));

        await Add(p.Rep, Today.AddDays(-45)); // the oldest day of the window
        Assert.Equal(ExpenseErrorCodes.DayLocked, (await Assert.ThrowsAsync<BusinessRuleException>(() => Add(p.Rep, Today.AddDays(-46)))).Code);
        Assert.Equal(ExpenseErrorCodes.FutureDay, (await Assert.ThrowsAsync<BusinessRuleException>(() => Add(p.Rep, Today.AddDays(1)))).Code);

        // Reading a rep's expenses does not allow changing them.
        await Assert.ThrowsAsync<ForbiddenException>(() => Add(p.Supervisor, Today, p.Rep));

        await db.GrantAsync(p.Admin, DefaultRoles.Supervisor, (Permissions.Expenses.Manage, PermissionScope.Team));
        var old = await Add(p.Supervisor, Today.AddDays(-80), p.Rep);
        Assert.Equal(p.Rep, old.UserId);
        Assert.Equal(ExpenseErrorCodes.FutureDay,
            (await Assert.ThrowsAsync<BusinessRuleException>(() => Add(p.Supervisor, Today.AddDays(1), p.Rep))).Code);

        // A rep sees the old day but cannot change it; the manager can.
        var locked = await DayAsync(db, p.Rep, p.Rep, Today.AddDays(-80));
        Assert.False(locked.CanEdit);
        Assert.Equal(ExpenseErrorCodes.DayLocked, (await Assert.ThrowsAsync<BusinessRuleException>(() =>
            db.As<ExpenseService, ExpenseLineDto>(p.Rep, s => s.UpdateLineAsync(old.Id, new UpdateExpenseLineRequest(10m), Ct)))).Code);
        Assert.True((await DayAsync(db, p.Supervisor, p.Rep, Today.AddDays(-80))).CanEdit);
    }

    [Fact]
    public async Task A_rep_sees_only_their_own_expenses_and_a_city_has_one_line_a_day()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        db.Clock.SetNow(Noon);
        var p = await DemoPeople.LoadAsync(db);
        var (_, city) = await DoctorAsync(db, "Dr. Demo Clinic");
        await db.As<ExpenseService, ExpenseLineDto>(p.Rep, s => s.CreateLineAsync(new CreateExpenseLineRequest(Today, city, 40m), Ct));

        await Assert.ThrowsAsync<ForbiddenException>(() => DayAsync(db, p.RepEast, p.Rep, Today));
        Assert.Equal(40m, (await DayAsync(db, p.Supervisor, p.Rep, Today)).Total);
        Assert.Equal(ExpenseErrorCodes.CityExists, (await Assert.ThrowsAsync<ConflictException>(() =>
            db.As<ExpenseService, ExpenseLineDto>(p.Rep, s => s.CreateLineAsync(new CreateExpenseLineRequest(Today, city, 10m), Ct)))).Code);
    }

    [Fact]
    public async Task A_retried_offline_line_is_created_once_and_the_latest_change_of_each_field_wins()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        db.Clock.SetNow(Noon);
        var p = await DemoPeople.LoadAsync(db);
        var (_, city) = await DoctorAsync(db, "Dr. Demo Clinic");
        var id = Guid.NewGuid();
        var request = new CreateExpenseLineRequest(Today, city, 40m, Id: id, ChangedAt: Noon.AddMinutes(-30));

        await db.As<ExpenseService, ExpenseLineDto>(p.Rep, s => s.CreateLineAsync(request, Ct));
        await db.As<ExpenseService, ExpenseLineDto>(p.Rep, s => s.CreateLineAsync(request, Ct));
        Assert.Equal(1, await db.DbAsync(c => c.ExpenseLines.CountAsync(l => l.Id == id, Ct)));

        // A note written at 11:50 on the phone, then an amount change from 11:40 arriving later.
        await db.As<ExpenseService, ExpenseLineDto>(p.Rep, s => s.UpdateLineAsync(id, new UpdateExpenseLineRequest(Note: "Parking", ChangedAt: Noon.AddMinutes(-10)), Ct));
        await db.As<ExpenseService, ExpenseLineDto>(p.Rep, s => s.UpdateLineAsync(id, new UpdateExpenseLineRequest(55m, ChangedAt: Noon.AddMinutes(-20)), Ct));
        // An older amount change does not undo a newer one.
        await db.As<ExpenseService, ExpenseLineDto>(p.Rep, s => s.UpdateLineAsync(id, new UpdateExpenseLineRequest(30m, ChangedAt: Noon.AddMinutes(-25)), Ct));

        var line = (await DayAsync(db, p.Rep, p.Rep, Today)).Lines.Single();
        Assert.Equal(55m, line.Amount);
        Assert.Equal("Parking", line.Note);
    }

    [Fact]
    public async Task Day_notes_belong_to_the_rep_and_manager_notes_to_managers()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        db.Clock.SetNow(Noon);
        var p = await DemoPeople.LoadAsync(db);

        var day = await db.As<ExpenseService, ExpenseDayDto>(p.Rep, s => s.SetDayNoteAsync(Today, new SetExpenseDayNoteRequest(Note: "Train to Tanta"), Ct));
        Assert.Equal("Train to Tanta", day.Note);
        // A plan for tomorrow is fine.
        await db.As<ExpenseService, ExpenseDayDto>(p.Rep, s => s.SetDayNoteAsync(Today.AddDays(1), new SetExpenseDayNoteRequest(Note: "Kafr El-Zayat"), Ct));

        await Assert.ThrowsAsync<ForbiddenException>(() =>
            db.As<ExpenseService, ExpenseDayDto>(p.Rep, s => s.SetDayNoteAsync(Today, new SetExpenseDayNoteRequest(ManagerNote: "Approved"), Ct)));
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            db.As<ExpenseService, ExpenseDayDto>(p.Supervisor, s => s.SetDayNoteAsync(Today, new SetExpenseDayNoteRequest(UserId: p.Rep, ManagerNote: "Checked"), Ct)));

        await db.GrantAsync(p.Admin, DefaultRoles.Supervisor, (Permissions.Expenses.Manage, PermissionScope.Team));
        var managed = await db.As<ExpenseService, ExpenseDayDto>(p.Supervisor, s =>
            s.SetDayNoteAsync(Today, new SetExpenseDayNoteRequest(UserId: p.Rep, ManagerNote: "Checked"), Ct));
        Assert.Equal("Checked", managed.ManagerNote);
        Assert.Equal("Train to Tanta", managed.Note);
        var notes = await db.DbAsync(c => c.AuditEntries.Where(e => e.EntityType == AuditEntities.ExpenseDay).Select(e => e.Details).ToListAsync(Ct));
        Assert.Equal(2, notes.Count(d => d.Contains("2026-11-21")));
        Assert.Contains(notes, d => d.Contains("Checked") && d.Contains("before"));
    }

    [Fact]
    public async Task Only_expenses_settings_sets_a_city_amount_and_it_is_logged()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var (_, city) = await DoctorAsync(db, "Dr. Demo Clinic");

        var updated = await db.As<TerritoryService, TerritoryDto>(p.Admin, s => s.SetDefaultExpenseAsync(city, 62.555m, Ct));
        Assert.Equal(62.56m, updated.DefaultDailyExpense);
        Assert.True(await AuditedAsync(db, city, AuditAction.Updated));
        Assert.Contains(Permissions.Expenses.Settings, (await db.EffectivePermissionsAsync(p.Admin)).Scopes.Keys);
        Assert.DoesNotContain(Permissions.Expenses.Settings, (await db.EffectivePermissionsAsync(p.Supervisor)).Scopes.Keys);
    }

    [Fact]
    public async Task Default_roles_get_the_expense_permissions_for_their_scope()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);

        var rep = await db.EffectivePermissionsAsync(p.Rep);
        Assert.Equal(PermissionScope.Own, rep.Scopes[Permissions.Expenses.ReadOwn]);
        Assert.Equal(PermissionScope.Own, rep.Scopes[Permissions.Expenses.WriteOwn]);
        Assert.False(rep.Scopes.ContainsKey(Permissions.Expenses.Read));

        Assert.Equal(PermissionScope.Team, (await db.EffectivePermissionsAsync(p.Supervisor)).Scopes[Permissions.Expenses.Read]);
        Assert.Equal(PermissionScope.Territory, (await db.EffectivePermissionsAsync(p.Area)).Scopes[Permissions.Expenses.Read]);
        Assert.Equal(PermissionScope.All, (await db.EffectivePermissionsAsync(p.Sales)).Scopes[Permissions.Expenses.Read]);
        Assert.False((await db.EffectivePermissionsAsync(p.Sales)).Scopes.ContainsKey(Permissions.Expenses.Manage));

        var admin = await db.EffectivePermissionsAsync(p.Admin);
        foreach (var key in new[]
                 {
                     Permissions.Expenses.ReadOwn, Permissions.Expenses.WriteOwn, Permissions.Expenses.Read,
                     Permissions.Expenses.Manage, Permissions.Expenses.Settings,
                 })
        {
            Assert.Equal(PermissionScope.All, admin.Scopes[key]);
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Months
    // ---------------------------------------------------------------------------------------------

    [Theory]
    [InlineData(2026, 2, 28)]
    [InlineData(2024, 2, 29)]
    [InlineData(2026, 4, 30)]
    [InlineData(2026, 1, 31)]
    public async Task A_month_runs_from_its_first_to_its_last_Egypt_day(int year, int month, int days)
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var (_, city) = await DoctorAsync(db, "Dr. Demo Clinic");
        var calendar = await db.AsAsync(p.Admin, sp => Task.FromResult(sp.GetRequiredService<LocalCalendar>()));
        var first = new DateOnly(year, month, 1);
        var last = new DateOnly(year, month, days);
        var next = last.AddDays(1);

        // The last second of the month and the first second of the next one, in Cairo time.
        var start = calendar.StartOf(next);
        Assert.Equal(last, calendar.DayOf(start.AddSeconds(-1)));
        Assert.Equal(next, calendar.DayOf(start));
        Assert.Equal(first, calendar.DayOf(calendar.StartOf(first)));

        foreach (var (day, amount) in new[] { (first.AddDays(-1), 1m), (first, 10m), (last, 20m), (next, 400m) })
        {
            await db.As<ExpenseService, ExpenseLineDto>(p.Admin, s =>
                s.CreateLineAsync(new CreateExpenseLineRequest(day, city, amount, UserId: p.Rep), Ct));
        }

        var statement = await MonthAsync(db, p.Rep, p.Rep, $"{year:0000}-{month:00}");
        Assert.Equal(first, statement.From);
        Assert.Equal(last, statement.To);
        Assert.Equal(30m, statement.Total);
        Assert.Equal(2, statement.DaysWithExpenses);
        Assert.Equal([first, last], statement.ByDay.Select(d => d.Day).ToArray());
    }

    [Fact]
    public async Task A_change_made_in_a_later_month_counts_in_the_month_of_the_day()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        db.Clock.SetNow(new DateTimeOffset(2026, 10, 31, 18, 0, 0, TimeSpan.Zero));
        var p = await DemoPeople.LoadAsync(db);
        var (_, city) = await DoctorAsync(db, "Dr. Demo Clinic");
        var october31 = new DateOnly(2026, 10, 31);
        var line = await db.As<ExpenseService, ExpenseLineDto>(p.Rep, s => s.CreateLineAsync(new CreateExpenseLineRequest(october31, city, 40m), Ct));

        db.Clock.SetNow(Noon); // three weeks later, in November
        await db.As<ExpenseService, ExpenseLineDto>(p.Rep, s => s.UpdateLineAsync(line.Id, new UpdateExpenseLineRequest(65m), Ct));
        await db.As<ExpenseService, ExpenseDayDto>(p.Rep, s => s.SetDayNoteAsync(october31, new SetExpenseDayNoteRequest(Note: "Late receipt"), Ct));

        var october = await MonthAsync(db, p.Rep, p.Rep, "2026-10");
        var november = await MonthAsync(db, p.Rep, p.Rep, "2026-11");
        Assert.Equal(65m, october.Total);
        Assert.Equal(0m, november.Total);
        Assert.True(october.ByDay.Single().HasNote);
        Assert.Equal(65m, (await DayAsync(db, p.Rep, p.Rep, october31)).MonthTotal);
    }

    [Fact]
    public async Task City_totals_add_up_to_the_month_total_and_an_empty_month_is_zero()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        db.Clock.SetNow(Noon);
        var p = await DemoPeople.LoadAsync(db);
        var (_, nasr) = await DoctorAsync(db, "Dr. Demo Clinic");
        var (_, heliopolis) = await DoctorAsync(db, "Dr. Karim Adel");
        foreach (var (day, city, amount) in new[] { (1, nasr, 60m), (1, heliopolis, 45.25m), (3, nasr, 60m), (17, heliopolis, 0m), (20, nasr, 33.33m) })
        {
            await db.As<ExpenseService, ExpenseLineDto>(p.Rep, s => s.CreateLineAsync(new CreateExpenseLineRequest(new DateOnly(2026, 11, day), city, amount), Ct));
        }

        var month = await MonthAsync(db, p.Rep, p.Rep, "2026-11");
        Assert.Equal(198.58m, month.Total);
        Assert.Equal(month.Total, month.ByCity.Sum(c => c.Total));
        Assert.Equal(month.Total, month.ByDay.Sum(d => d.Total));
        Assert.Equal(4, month.DaysWithExpenses);
        Assert.Equal(3, month.ByCity.Single(c => c.CityId == nasr).Days);

        var empty = await MonthAsync(db, p.Rep, p.Rep, "2026-09");
        Assert.Equal(0m, empty.Total);
        Assert.Equal(0, empty.DaysWithExpenses);
        Assert.Empty(empty.ByCity);
        Assert.Empty(empty.Days);
    }

    [Fact]
    public async Task Managers_see_only_their_scope_in_month_totals()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        db.Clock.SetNow(Noon);
        var p = await DemoPeople.LoadAsync(db);
        var (_, city) = await DoctorAsync(db, "Dr. Demo Clinic");
        await db.As<ExpenseService, ExpenseLineDto>(p.Rep, s => s.CreateLineAsync(new CreateExpenseLineRequest(Today, city, 40m), Ct));
        await db.As<ExpenseService, ExpenseLineDto>(p.RepEast, s => s.CreateLineAsync(new CreateExpenseLineRequest(Today, city, 25m), Ct));

        // The second rep now reports to the area manager: outside the supervisor's team, inside the area.
        await db.UsersAsync(p.Admin, async s =>
        {
            var east = (await s.ListAsync(cancellationToken: Ct)).Single(u => u.Id == p.RepEast);
            await s.UpdateAsync(p.RepEast, new UpdateUserRequest(east.FullName, p.Area, east.TerritoryId), Ct);
        });

        var supervisor = await db.As<ExpenseService, ExpenseReportDto>(p.Supervisor, s => s.MonthReportAsync("2026-11", cancellationToken: Ct));
        var area = await db.As<ExpenseService, ExpenseReportDto>(p.Area, s => s.MonthReportAsync("2026-11", cancellationToken: Ct));
        var rep = await db.As<ExpenseService, ExpenseReportDto>(p.Rep, s => s.MonthReportAsync("2026-11", cancellationToken: Ct));

        Assert.Equal([p.Rep], supervisor.ByRep.Select(r => r.UserId).ToArray());
        Assert.Equal(40m, supervisor.Total);
        Assert.Equal(65m, area.Total);
        Assert.Equal([p.Rep, p.RepEast], area.ByRep.Select(r => r.UserId).ToArray()); // highest total first
        Assert.Equal([p.Rep], rep.ByRep.Select(r => r.UserId).ToArray());
        await Assert.ThrowsAsync<ForbiddenException>(() => MonthAsync(db, p.Supervisor, p.RepEast, "2026-11"));
    }

    [Fact]
    public async Task The_statement_csv_matches_the_month_on_screen()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        db.Clock.SetNow(Noon);
        var p = await DemoPeople.LoadAsync(db);
        var (_, nasr) = await DoctorAsync(db, "Dr. Demo Clinic");
        var (_, heliopolis) = await DoctorAsync(db, "Dr. Karim Adel");
        await db.As<ExpenseService, ExpenseLineDto>(p.Rep, s => s.CreateLineAsync(new CreateExpenseLineRequest(new DateOnly(2026, 11, 2), nasr, 60m, "Bus, \"return\""), Ct));
        await db.As<ExpenseService, ExpenseLineDto>(p.Rep, s => s.CreateLineAsync(new CreateExpenseLineRequest(new DateOnly(2026, 11, 2), heliopolis, 45.5m), Ct));
        await db.As<ExpenseService, ExpenseLineDto>(p.RepEast, s => s.CreateLineAsync(new CreateExpenseLineRequest(new DateOnly(2026, 11, 5), nasr, 12.25m), Ct));
        await db.As<ExpenseService, ExpenseDayDto>(p.Rep, s => s.SetDayNoteAsync(new DateOnly(2026, 11, 9), new SetExpenseDayNoteRequest(Note: "Office day"), Ct));

        var statements = await db.As<ExpenseService, IReadOnlyList<ExpenseMonthDto>>(p.Supervisor, s => s.StatementsAsync("2026-11", cancellationToken: Ct));
        var rows = ParseCsv(ExpenseCsv.Statements(statements, "en"));

        foreach (var statement in statements)
        {
            var mine = rows.Skip(1).Where(r => r[0] == statement.UserName).ToList();
            var total = mine.Single(r => r[2] == "Month total");
            Assert.Equal(statement.Total, decimal.Parse(total[4], System.Globalization.CultureInfo.InvariantCulture));
            Assert.Equal(statement.Total, mine.Where(r => r[2] != "Month total" && r[4] != "")
                .Sum(r => decimal.Parse(r[4], System.Globalization.CultureInfo.InvariantCulture)));
        }

        Assert.Contains(rows, r => r[7] == "Bus, \"return\"");
        Assert.Contains(rows, r => r[8] == "Office day");
        Assert.Equal(117.75m, statements.Sum(s => s.Total));

        var report = await db.As<ExpenseService, ExpenseReportDto>(p.Supervisor, s => s.MonthReportAsync("2026-11", cancellationToken: Ct));
        var lines = ParseCsv(ExpenseCsv.Lines(report, "ar"));
        Assert.Equal(report.Lines.Count + 2, lines.Count); // header and total
        Assert.Equal(report.Total, decimal.Parse(lines[^1][3], System.Globalization.CultureInfo.InvariantCulture));
    }

    // ---------------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------------

    private static Task<(Guid Doctor, Guid City)> DoctorAsync(TestDatabase db, string name) =>
        db.DbAsync(async c =>
        {
            var doctor = await c.Customers.Where(x => x.Name == name).Select(x => new { x.Id, x.TerritoryId }).SingleAsync(Ct);
            return (doctor.Id, doctor.TerritoryId!.Value);
        });

    private static Task SetCityAmountAsync(TestDatabase db, Guid admin, Guid city, decimal amount) =>
        db.As<TerritoryService, TerritoryDto>(admin, s => s.SetDefaultExpenseAsync(city, amount, Ct));

    /// <summary>A visit at the doctor's clinic: check in (now, or <paramref name="at"/>) and check out.</summary>
    private static async Task VisitAsync(TestDatabase db, Guid rep, Guid doctor, DateTimeOffset? at = null)
    {
        var visit = await db.As<VisitService, VisitDto>(rep, s => s.CheckInAsync(
            new CheckInRequest(doctor, "test-device", ClinicLat, ClinicLng, 12, at ?? DateTimeOffset.UtcNow, false, null, Guid.NewGuid()), Ct));
        await db.As<VisitService, VisitDto>(rep, s => s.CheckOutAsync(visit.Id, new CheckOutRequest(
            ClinicLat, ClinicLng, 15, DateTimeOffset.UtcNow, false, null, Guid.NewGuid()), Ct));
    }

    private static DateOnly TodayInCairo(TestDatabase db) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(db.Clock.GetUtcNow(), TimeZoneInfo.FindSystemTimeZoneById("Africa/Cairo")).DateTime);

    private static Task<ExpenseDayDto> DayAsync(TestDatabase db, Guid actor, Guid rep, DateOnly day) =>
        db.As<ExpenseService, ExpenseDayDto>(actor, s => s.GetDayAsync(day, rep, Ct));

    private static Task<ExpenseMonthDto> MonthAsync(TestDatabase db, Guid actor, Guid rep, string month) =>
        db.As<ExpenseService, ExpenseMonthDto>(actor, s => s.GetMonthAsync(month, rep, Ct));

    private static Task<bool> AuditedAsync(TestDatabase db, Guid entityId, AuditAction action) =>
        db.DbAsync(c => c.AuditEntries.AnyAsync(e => e.EntityId == entityId && e.Action == action, Ct));

    /// <summary>Minimal RFC 4180 reader (quotes, doubled quotes, commas inside quotes), BOM skipped.</summary>
    private static List<string[]> ParseCsv(byte[] bytes)
    {
        var text = Encoding.UTF8.GetString(bytes).TrimStart('﻿');
        var rows = new List<string[]>();
        var row = new List<string>();
        var cell = new StringBuilder();
        var quoted = false;
        for (var i = 0; i < text.Length; i++)
        {
            var ch = text[i];
            if (quoted)
            {
                if (ch == '"' && i + 1 < text.Length && text[i + 1] == '"')
                {
                    cell.Append('"');
                    i++;
                }
                else if (ch == '"')
                {
                    quoted = false;
                }
                else
                {
                    cell.Append(ch);
                }
            }
            else if (ch == '"')
            {
                quoted = true;
            }
            else if (ch == ',')
            {
                row.Add(cell.ToString());
                cell.Clear();
            }
            else if (ch == '\n')
            {
                row.Add(cell.ToString().TrimEnd('\r'));
                cell.Clear();
                rows.Add([.. row]);
                row.Clear();
            }
            else
            {
                cell.Append(ch);
            }
        }

        return rows;
    }
}
