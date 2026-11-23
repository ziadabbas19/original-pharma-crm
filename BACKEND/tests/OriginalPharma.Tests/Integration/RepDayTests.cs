using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Auditing;
using OriginalPharma.Application.Crm;
using OriginalPharma.Application.Plans;
using OriginalPharma.Application.Visits;
using OriginalPharma.Domain.Audit;
using OriginalPharma.Domain.Crm;

namespace OriginalPharma.Tests.Integration;

/// <summary>
/// The rep's day on the Home screen: today's area prefilled from the weekly plan, the saved order of the
/// upcoming doctors (per rep and per Egypt day), and AM places: added like pharmacies, put on today's
/// morning list from any town of the rep's area, visited with the usual visit flow and kept out of the
/// doctor target.
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class RepDayTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static Task<RepTodayDto> TodayAsync(TestDatabase db, Guid rep) =>
        db.As<RepDayService, RepTodayDto>(rep, s => s.GetTodayAsync(Ct));

    private static Task<RepTodayDto> SetAmAsync(TestDatabase db, Guid rep, params RepAmPlaceInput[] places) =>
        db.As<RepDayService, RepTodayDto>(rep, s => s.SetAmPlacesAsync(new SetRepAmPlacesRequest(places), Ct));

    private static Task<CustomerDto> HospitalAsync(TestDatabase db, Guid actor, string name, Guid town, Guid? rep = null) =>
        db.As<CustomerService, CustomerDto>(actor, s => s.CreateHospitalAsync(new CreateHospitalRequest(name, null, town, "Main road", "Opposite the station", RepId: rep), Ct));

    /// <summary>Saves the rep's plan for this week with one entry for today.</summary>
    private static async Task<WeeklyPlanDto> PlanTodayAsync(TestDatabase db, Guid rep, Guid city, Guid[]? customers = null, Guid[]? amPlaces = null)
    {
        var mine = await db.As<PlanService, WeeklyPlanDto>(rep, s => s.GetMineAsync(null, Ct));
        return await db.As<PlanService, WeeklyPlanDto>(rep, s => s.SaveDraftAsync(new SaveWeeklyPlanRequest(
            mine.WeekStart, [new WeeklyPlanDayInput(mine.Today, city, 4, null, customers, amPlaces)], mine.Version == 0 ? null : mine.Version), Ct));
    }

    [Fact]
    public async Task Todays_area_comes_from_the_weekly_plan_and_the_rep_can_change_it()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var heliopolis = await DemoPeople.TerritoryAsync(db, "T-HLP");
        var nasr = await DemoPeople.TerritoryAsync(db, "T-NSR");
        var eastCairo = await DemoPeople.TerritoryAsync(db, "A-CAI-E");
        var dokki = await DemoPeople.TerritoryAsync(db, "T-DOK");

        await PlanTodayAsync(db, p.Rep, heliopolis);
        var today = await TodayAsync(db, p.Rep);
        Assert.Equal((heliopolis, heliopolis, false, eastCairo), (today.TerritoryId!.Value, today.PlanCityId!.Value, today.AreaChosen, today.AreaId!.Value));

        // The rep picks another town; it is kept for the day, whatever the plan says.
        var changed = await db.As<RepDayService, RepTodayDto>(p.Rep, s => s.SetAreaAsync(new SetRepDayAreaRequest(nasr), Ct));
        Assert.Equal((nasr, true), (changed.TerritoryId!.Value, changed.AreaChosen));
        Assert.Equal(nasr, (await TodayAsync(db, p.Rep)).TerritoryId);

        // The whole area, or the area itself, are fine; a town of another area is not.
        Assert.Null((await db.As<RepDayService, RepTodayDto>(p.Rep, s => s.SetAreaAsync(new SetRepDayAreaRequest(null), Ct))).TerritoryId);
        Assert.Equal(eastCairo, (await db.As<RepDayService, RepTodayDto>(p.Rep, s => s.SetAreaAsync(new SetRepDayAreaRequest(eastCairo), Ct))).TerritoryId);
        Assert.Equal(RepDayErrorCodes.AreaInvalid, (await Assert.ThrowsAsync<BusinessRuleException>(() =>
            db.As<RepDayService, RepTodayDto>(p.Rep, s => s.SetAreaAsync(new SetRepDayAreaRequest(dokki), Ct)))).Code);

        // Without a plan entry nothing is prefilled: the rep's whole area.
        var other = await TodayAsync(db, p.RepEast);
        Assert.Equal((null, null, false), (other.TerritoryId, other.PlanCityId, other.AreaChosen));
    }

    [Fact]
    public async Task The_order_of_the_upcoming_doctors_is_saved_per_rep_and_per_day()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var ahmed = await DemoPeople.DoctorAsync(db, "Dr. Ahmed Fathy");
        var mona = await DemoPeople.DoctorAsync(db, "Dr. Mona Saeed"); // on both reps' lists
        var karim = await DemoPeople.DoctorAsync(db, "Dr. Karim Adel");
        var salma = await DemoPeople.DoctorAsync(db, "Dr. Salma Ibrahim"); // on nobody's list

        Task<RepTodayDto> Order(Guid rep, params Guid[] ids) =>
            db.As<RepDayService, RepTodayDto>(rep, s => s.SetDoctorOrderAsync(new SetRepVisitOrderRequest(ids), Ct));

        Assert.Empty((await TodayAsync(db, p.Rep)).DoctorOrder);
        Assert.Equal([karim, mona, ahmed], (await Order(p.Rep, karim, mona, salma, ahmed, mona)).DoctorOrder);
        var east = (await db.As<DoctorService, IReadOnlyList<DoctorDto>>(p.RepEast, s => s.ListAsync(new DoctorQuery(Mine: true), Ct))).Select(d => d.Id).Reverse().ToArray();
        Assert.Equal(east, (await Order(p.RepEast, east)).DoctorOrder);

        // Each rep reads back their own order; a new order replaces the old one.
        Assert.Equal([karim, mona, ahmed], (await TodayAsync(db, p.Rep)).DoctorOrder);
        Assert.Equal(east, (await TodayAsync(db, p.RepEast)).DoctorOrder);
        Assert.Equal([ahmed, karim], (await Order(p.Rep, ahmed, karim)).DoctorOrder);
        var rows = await db.DbAsync(c => c.RepVisitOrder.Where(o => o.UserId == p.Rep).OrderBy(o => o.Position).ToListAsync(Ct));
        Assert.Equal([(ahmed, 0), (karim, 1)], rows.Select(r => (r.CustomerId, r.Position)));

        // The next Egypt day starts without an order; yesterday's stays stored for that day.
        db.Clock.Advance(TimeSpan.FromDays(1));
        var tomorrow = await TodayAsync(db, p.Rep);
        Assert.Empty(tomorrow.DoctorOrder);
        Assert.Equal(2, await db.DbAsync(c => c.RepVisitOrder.CountAsync(o => o.UserId == p.Rep && o.Day < tomorrow.Day, Ct)));
    }

    [Fact]
    public async Task Am_places_are_added_like_pharmacies_and_visited_apart_from_the_doctor_target()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var nasr = await DemoPeople.TerritoryAsync(db, "T-NSR");
        var heliopolis = await DemoPeople.TerritoryAsync(db, "T-HLP");
        var newCairo = await DemoPeople.TerritoryAsync(db, "T-NCR");
        var dokki = await DemoPeople.TerritoryAsync(db, "T-DOK");
        var mohandessin = await DemoPeople.TerritoryAsync(db, "T-MOH");
        var doctorsBefore = (await db.As<DoctorService, IReadOnlyList<DoctorDto>>(p.Rep, s => s.ListAsync(new DoctorQuery(Mine: true), Ct))).Count;
        var pharmaciesBefore = (await db.As<CustomerService, IReadOnlyList<CustomerDto>>(p.Rep, s => s.ListAsync(CustomerType.Pharmacy, null, cancellationToken: Ct))).Count;

        // A rep adds places in the towns of their area only; the creator is in the activity log.
        var fevers = await HospitalAsync(db, p.Rep, "Fevers Hospital", newCairo);
        Assert.Equal((CustomerType.Hospital, "Opposite the station"), (fevers.Type, fevers.Landmark));
        Assert.Equal(HospitalErrorCodes.TownOutOfScope, (await Assert.ThrowsAsync<ForbiddenException>(() => HospitalAsync(db, p.Rep, "Dokki Hospital", dokki))).Code);
        Assert.Equal(HospitalErrorCodes.Exists, (await Assert.ThrowsAsync<ConflictException>(() => HospitalAsync(db, p.RepEast, " fevers hospital", newCairo))).Code);
        var created = await db.DbAsync(c => c.AuditEntries.SingleAsync(e => e.EntityType == AuditEntities.Customer && e.EntityId == fevers.Id && e.Action == AuditAction.Created, Ct));
        Assert.Equal(p.Rep, created.ActorId);

        // Managers add places inside their scope, optionally on a rep's list; a supervisor (no right) cannot.
        var general = await HospitalAsync(db, p.Area, "General Hospital", heliopolis, p.RepEast);
        var tibbi = await HospitalAsync(db, p.Sales, "Tibbi Saeed", dokki);
        var assigned = await HospitalAsync(db, p.Sales, "Mohandessin Hospital", mohandessin, p.Rep);
        await Assert.ThrowsAsync<ForbiddenException>(() => HospitalAsync(db, p.Area, "Outside Hospital", dokki));
        await Assert.ThrowsAsync<ForbiddenException>(() => HospitalAsync(db, p.Supervisor, "Team Hospital", nasr));

        // The rep sees the places of every town of their area and the ones on their list.
        var visible = (await db.As<CustomerService, IReadOnlyList<CustomerDto>>(p.Rep, s => s.ListAsync(CustomerType.Hospital, null, cancellationToken: Ct)))
            .Select(c => c.Name).Order().ToArray();
        Assert.Equal(["Fevers Hospital", "General Hospital", "Mohandessin Hospital"], visible);

        // Doctor and pharmacy lists are unchanged.
        Assert.Equal(doctorsBefore, (await db.As<DoctorService, IReadOnlyList<DoctorDto>>(p.Rep, s => s.ListAsync(new DoctorQuery(Mine: true), Ct))).Count);
        Assert.Equal(pharmaciesBefore, (await db.As<CustomerService, IReadOnlyList<CustomerDto>>(p.Rep, s => s.ListAsync(CustomerType.Pharmacy, null, cancellationToken: Ct))).Count);

        // Today's plan: doctor visits in Nasr City, AM at a place in New Cairo (another town).
        var ahmed = await DemoPeople.DoctorAsync(db, "Dr. Ahmed Fathy");
        var plan = await PlanTodayAsync(db, p.Rep, nasr, [ahmed], [fevers.Id]);
        Assert.Equal([fevers.Id], plan.Days[0].AmPlaces!.Select(c => c.CustomerId));
        Assert.Equal([ahmed], plan.Days[0].Customers.Select(c => c.CustomerId));
        Assert.Equal(PlanErrorCodes.AmPlaceInvalid, (await Assert.ThrowsAsync<BusinessRuleException>(() => PlanTodayAsync(db, p.Rep, nasr, null, [tibbi.Id]))).Code);

        var today = await TodayAsync(db, p.Rep);
        Assert.Equal(nasr, today.TerritoryId);
        var am = Assert.Single(today.AmPlaces);
        Assert.Equal((fevers.Id, newCairo, "New Cairo"), (am.CustomerId, am.TownId!.Value, am.TownName));

        // The doctors of the day are still only those of the chosen town.
        var doctorsToday = await db.As<DoctorService, IReadOnlyList<DoctorDto>>(p.Rep, s => s.ListAsync(new DoctorQuery(Mine: true, TownId: today.TerritoryId), Ct));
        Assert.NotEmpty(doctorsToday);
        Assert.All(doctorsToday, d => Assert.Equal(nasr, d.TownId));

        // The rep adds places from any of their towns (not only today's), with an optional time, and reorders them.
        var list = await SetAmAsync(db, p.Rep, new RepAmPlaceInput(general.Id, "09:30"), new RepAmPlaceInput(fevers.Id), new RepAmPlaceInput(assigned.Id, "11:00"));
        Assert.Equal([(general.Id, "09:30"), (fevers.Id, null), (assigned.Id, "11:00")], list.AmPlaces.Select(a => (a.CustomerId, a.PlannedTime)));
        list = await SetAmAsync(db, p.Rep, new RepAmPlaceInput(fevers.Id), new RepAmPlaceInput(general.Id, "09:30"));
        Assert.Equal([fevers.Id, general.Id], list.AmPlaces.Select(a => a.CustomerId));
        Assert.Equal(nasr, list.TerritoryId); // the AM list never changes or follows the area
        Assert.Equal(RepDayErrorCodes.PlaceInvalid, (await Assert.ThrowsAsync<BusinessRuleException>(() => SetAmAsync(db, p.Rep, new RepAmPlaceInput(tibbi.Id)))).Code);
        Assert.Equal(RepDayErrorCodes.PlaceInvalid, (await Assert.ThrowsAsync<BusinessRuleException>(() => SetAmAsync(db, p.Rep, new RepAmPlaceInput(ahmed)))).Code);
        Assert.Equal([fevers.Id, general.Id], (await TodayAsync(db, p.Rep)).AmPlaces.Select(a => a.CustomerId));

        // Visited with the usual flow: the first visit saves the location; the visit is an AM visit.
        var planDone = (await db.As<PlanService, WeeklyPlanDto>(p.Rep, s => s.GetMineAsync(null, Ct))).Progress.Days.Single(d => d.Day == today.Day).Done;
        var visit = await db.As<VisitService, VisitDto>(p.Rep, s => s.CheckInAsync(
            new CheckInRequest(fevers.Id, "test-device", 30.0301, 31.4702, 10, DateTimeOffset.UtcNow, false, null, Guid.NewGuid()), Ct));
        await db.As<VisitService, VisitDto>(p.Rep, s => s.CheckOutAsync(visit.Id,
            new CheckOutRequest(30.0301, 31.4702, 10, DateTimeOffset.UtcNow.AddMinutes(1), ClientRequestId: Guid.NewGuid()), Ct));
        var located = await db.DbAsync(c => c.Customers.AsNoTracking().SingleAsync(x => x.Id == fevers.Id, Ct));
        Assert.Equal(ClinicLocationSource.FirstVisit, located.LocationSource);
        var listed = await db.As<VisitService, IReadOnlyList<VisitListItemDto>>(p.Rep, s => s.ListAsync(
            null, null, null, null, null, Ct, mine: true, day: today.Day));
        Assert.Equal(CustomerType.Hospital, listed.Single(v => v.Id == visit.Id).CustomerType);

        // Not counted for the doctor target of the plan, but shown as visited on the plan's AM list.
        var after = await db.As<PlanService, WeeklyPlanDto>(p.Rep, s => s.GetMineAsync(null, Ct));
        Assert.Equal(planDone, after.Progress.Days.Single(d => d.Day == today.Day).Done);
        Assert.True(after.Days[0].AmPlaces!.Single().Visited);
    }

    [Fact]
    public async Task An_am_place_in_another_town_stays_on_the_list_whatever_area_the_rep_picks()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var nasr = await DemoPeople.TerritoryAsync(db, "T-NSR");
        var newCairo = await DemoPeople.TerritoryAsync(db, "T-NCR");
        var heliopolis = await DemoPeople.TerritoryAsync(db, "T-HLP");
        var hospital = await HospitalAsync(db, p.Rep, "Kafr El-Zayat General Hospital", newCairo);

        await SetAmAsync(db, p.Rep, new RepAmPlaceInput(hospital.Id, "10:00"));
        foreach (var town in new Guid?[] { nasr, heliopolis, null })
        {
            var day = await db.As<RepDayService, RepTodayDto>(p.Rep, s => s.SetAreaAsync(new SetRepDayAreaRequest(town), Ct));
            Assert.Equal(town, day.TerritoryId);
            Assert.Equal([(hospital.Id, "10:00")], day.AmPlaces.Select(a => (a.CustomerId, a.PlannedTime)));
        }

        await db.As<RepDayService, RepTodayDto>(p.Rep, s => s.SetAreaAsync(new SetRepDayAreaRequest(nasr), Ct));
        var doctors = await db.As<DoctorService, IReadOnlyList<DoctorDto>>(p.Rep, s => s.ListAsync(new DoctorQuery(Mine: true, TownId: nasr), Ct));
        Assert.All(doctors, d => Assert.Equal(nasr, d.TownId));
        Assert.DoesNotContain(doctors, d => d.Id == hospital.Id);
    }
}
