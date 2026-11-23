using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Auditing;
using OriginalPharma.Application.Crm;
using OriginalPharma.Application.Identity;
using OriginalPharma.Domain.Audit;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Tests.Integration;

/// <summary>
/// Doctor visiting hours (slots checked and saved), the day / time / area search with its "no hours set"
/// group and paging, the address and landmark, and who added each doctor: every role with doctors can add
/// one, a manager may give it to a rep in their scope, and the creator can be filtered on.
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class DoctorScheduleTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static Task<IReadOnlyList<DoctorDto>> ListAsync(TestDatabase db, Guid actor, DoctorQuery query) =>
        db.As<DoctorService, IReadOnlyList<DoctorDto>>(actor, s => s.ListAsync(query, Ct));

    private static Task<DoctorDto> GetAsync(TestDatabase db, Guid actor, Guid id) =>
        db.As<DoctorService, DoctorDto>(actor, s => s.GetAsync(id, Ct));

    /// <summary>Saves a doctor's details as the edit form does, with these visiting slots.</summary>
    private static async Task<DoctorDto> SetHoursAsync(TestDatabase db, Guid actor, Guid id, params DoctorSlotInput[] slots)
    {
        var d = await GetAsync(db, actor, id);
        return await db.As<DoctorService, DoctorDto>(actor, s => s.UpdateAsync(id, new UpdateDoctorRequest(
            d.Name, d.NameAr, d.TownId!.Value, d.SpecialtyId!.Value, d.Phone, d.Notes, d.IsActive, null, d.Address, d.Landmark, slots), Ct));
    }

    private static DoctorSlotInput Slot(DayOfWeek day, string start, string end, string? place = null) => new(day, start, end, place);

    [Fact]
    public async Task Visiting_slots_must_end_after_they_start_and_never_overlap_on_the_same_day()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var ahmed = await DemoPeople.DoctorAsync(db, "Dr. Ahmed Fathy");

        var overlap = await Assert.ThrowsAsync<BusinessRuleException>(() => SetHoursAsync(db, p.Rep, ahmed,
            Slot(DayOfWeek.Saturday, "17:00", "21:00"), Slot(DayOfWeek.Saturday, "20:30", "22:00")));
        Assert.Equal(DoctorErrorCodes.SlotOverlap, overlap.Code);
        Assert.Equal((1, 0), ((int)overlap.Details!["index"]!, (int)overlap.Details["otherIndex"]!));

        var backwards = await Assert.ThrowsAsync<BusinessRuleException>(() => SetHoursAsync(db, p.Rep, ahmed, Slot(DayOfWeek.Monday, "18:00", "18:00")));
        Assert.Equal(DoctorErrorCodes.SlotEndBeforeStart, backwards.Code);
        Assert.Equal(DoctorErrorCodes.TimeInvalid,
            (await Assert.ThrowsAsync<BusinessRuleException>(() => SetHoursAsync(db, p.Rep, ahmed, Slot(DayOfWeek.Monday, "6pm", "9pm")))).Code);
        Assert.False(new DoctorSlotInputValidator().Validate(Slot(DayOfWeek.Monday, "25:00", "26:00")).IsValid);
        Assert.Empty((await GetAsync(db, p.Rep, ahmed)).Availability!);

        // Back to back and on other days is fine; the list comes back Saturday first.
        var saved = await SetHoursAsync(db, p.Rep, ahmed,
            Slot(DayOfWeek.Monday, "17:00", "21:00", "Clinic"),
            Slot(DayOfWeek.Saturday, "17:00", "21:00", "Clinic"),
            Slot(DayOfWeek.Saturday, "10:00", "13:00", " El Salam Hospital "),
            Slot(DayOfWeek.Saturday, "13:00", "14:00"));
        Assert.Equal(
            ["Saturday 10:00-13:00 El Salam Hospital", "Saturday 13:00-14:00 ", "Saturday 17:00-21:00 Clinic", "Monday 17:00-21:00 Clinic"],
            saved.Availability!.Select(s => $"{s.Weekday} {s.Start}-{s.End} {s.Place}"));

        // An app from before visiting hours (no list sent) keeps them, with the address and landmark.
        await db.As<DoctorService, DoctorDto>(p.Rep, s => s.UpdateAsync(ahmed, new UpdateDoctorRequest(
            saved.Name, saved.NameAr, saved.TownId!.Value, saved.SpecialtyId!.Value, saved.Phone, saved.Notes, Address: "12 Makram Ebeid", Landmark: "Behind City Stars",
            Availability: saved.Availability!.Select(s => new DoctorSlotInput(s.Weekday, s.Start, s.End, s.Place)).ToList()), Ct));
        var older = await db.As<DoctorService, DoctorDto>(p.Rep, s => s.UpdateAsync(ahmed, new UpdateDoctorRequest(
            saved.Name, saved.NameAr, saved.TownId!.Value, saved.SpecialtyId!.Value, "01000000000", saved.Notes), Ct));
        Assert.Equal(4, older.Availability!.Count);
        Assert.Equal(("12 Makram Ebeid", "Behind City Stars", "01000000000"), (older.Address, older.Landmark, older.Phone));

        // An empty list clears them; the activity log keeps the change.
        Assert.Empty((await SetHoursAsync(db, p.Rep, ahmed)).Availability!);
        var log = await db.DbAsync(c => c.AuditEntries.Where(e => e.EntityId == ahmed && e.Action == AuditAction.Updated).OrderBy(e => e.CreatedAt).ToListAsync(Ct));
        Assert.Contains(log, e => e.Details!.Contains("Saturday 10:00-13:00 El Salam Hospital"));
    }

    [Fact]
    public async Task Search_by_day_and_time_finds_overlapping_slots_and_lists_doctors_without_hours_apart()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var nasr = await DemoPeople.TerritoryAsync(db, "T-NSR");
        var eastCairo = await DemoPeople.TerritoryAsync(db, "A-CAI-E");
        var ahmed = await DemoPeople.DoctorAsync(db, "Dr. Ahmed Fathy"); // Nasr City
        var mona = await DemoPeople.DoctorAsync(db, "Dr. Mona Saeed"); // Nasr City
        var karim = await DemoPeople.DoctorAsync(db, "Dr. Karim Adel"); // Heliopolis
        await SetHoursAsync(db, p.Rep, ahmed, Slot(DayOfWeek.Saturday, "17:00", "21:00", "Clinic"), Slot(DayOfWeek.Tuesday, "11:00", "14:00"));
        await SetHoursAsync(db, p.Rep, mona, Slot(DayOfWeek.Saturday, "10:00", "13:00"));
        await SetHoursAsync(db, p.Rep, karim, Slot(DayOfWeek.Sunday, "17:00", "20:00"));

        async Task<string[]> Names(Guid actor, DoctorQuery query) => (await ListAsync(db, actor, query)).Select(d => d.Name).ToArray();

        // Overlap with the range: touching ends do not count.
        Assert.Equal(["Dr. Ahmed Fathy"], await Names(p.Rep, new DoctorQuery(Mine: true, Weekday: DayOfWeek.Saturday, TimeFrom: "18:00", TimeTo: "22:00")));
        Assert.Equal(["Dr. Ahmed Fathy", "Dr. Mona Saeed"], await Names(p.Rep, new DoctorQuery(Mine: true, Weekday: DayOfWeek.Saturday, TimeFrom: "12:00", TimeTo: "18:00")));
        Assert.Empty(await Names(p.Rep, new DoctorQuery(Mine: true, Weekday: DayOfWeek.Saturday, TimeFrom: "13:00", TimeTo: "17:00")));
        Assert.Equal(["Dr. Ahmed Fathy", "Dr. Mona Saeed"], await Names(p.Rep, new DoctorQuery(Mine: true, Weekday: DayOfWeek.Saturday)));
        Assert.Equal(["Dr. Ahmed Fathy", "Dr. Karim Adel"], await Names(p.Rep, new DoctorQuery(Mine: true, TimeFrom: "19:00")));

        // Without an area or town, doctors with no hours are left out; with one, they follow in their own group.
        var noHoursInNasr = (await ListAsync(db, p.Rep, new DoctorQuery(Mine: true, TownId: nasr)))
            .Where(d => d.Availability!.Count == 0).Select(d => d.Name).Order().ToArray();
        Assert.NotEmpty(noHoursInNasr);
        var byTown = await ListAsync(db, p.Rep, new DoctorQuery(Mine: true, TownId: nasr, Weekday: DayOfWeek.Saturday, TimeFrom: "18:00"));
        Assert.Equal(["Dr. Ahmed Fathy", .. noHoursInNasr], byTown.Select(d => d.Name));
        Assert.NotEmpty(byTown[0].Availability!);
        Assert.All(byTown.Skip(1), d => Assert.Empty(d.Availability!));
        Assert.DoesNotContain("Dr. Mona Saeed", byTown.Select(d => d.Name)); // has hours, none matching

        var byArea = await ListAsync(db, p.Rep, new DoctorQuery(Mine: true, AreaId: eastCairo, Weekday: DayOfWeek.Sunday));
        Assert.Equal("Dr. Karim Adel", byArea[0].Name);
        Assert.All(byArea.Skip(1), d => Assert.Empty(d.Availability!));
        Assert.DoesNotContain("Dr. Youssef Samir", byArea.Select(d => d.Name)); // Dokki is in Giza

        // Server paging keeps the order across pages.
        var all = byTown.Select(d => d.Id).ToList();
        var paged = new List<Guid>();
        for (var page = 1; page <= all.Count + 1; page++)
        {
            paged.AddRange((await ListAsync(db, p.Rep, new DoctorQuery(Mine: true, TownId: nasr, Weekday: DayOfWeek.Saturday, TimeFrom: "18:00", Page: page, PageSize: 1))).Select(d => d.Id));
        }

        Assert.Equal(all, paged);

        // Managers search inside their own scope with the same filters.
        Assert.Equal(["Dr. Ahmed Fathy", "Dr. Mona Saeed"], await Names(p.Sales, new DoctorQuery(Weekday: DayOfWeek.Saturday)));
        Assert.Equal(["Dr. Ahmed Fathy"], await Names(p.Supervisor, new DoctorQuery(Weekday: DayOfWeek.Tuesday, TimeFrom: "12:00", TimeTo: "12:30")));

        Assert.Equal(DoctorErrorCodes.TimeInvalid, (await Assert.ThrowsAsync<BusinessRuleException>(() =>
            ListAsync(db, p.Rep, new DoctorQuery(Mine: true, TimeFrom: "18:00", TimeTo: "17:00")))).Code);
    }

    [Fact]
    public async Task Every_role_with_doctors_can_add_one_and_the_creator_is_kept()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var nasr = await DemoPeople.TerritoryAsync(db, "T-NSR");
        var cardiology = await DemoPeople.SpecialtyAsync(db, "Cardiology");

        foreach (var (user, scope) in new[]
                 {
                     (p.Rep, PermissionScope.Own), (p.Supervisor, PermissionScope.Team), (p.Area, PermissionScope.Territory),
                     (p.Sales, PermissionScope.All), (p.Admin, PermissionScope.All),
                 })
        {
            Assert.Equal(scope, (await db.EffectivePermissionsAsync(user)).ScopeOf(Permissions.Customers.Create));
        }

        var byRep = await db.As<DoctorService, DoctorDto>(p.Rep, s => s.CreateAsync(new CreateDoctorRequest(
            "Dr. Nader Fawzy", null, nasr, cardiology, Address: "5 Abbas El Akkad", Landmark: "Next to the metro",
            Availability: [Slot(DayOfWeek.Sunday, "18:00", "21:00")]), Ct));
        Assert.Equal((p.Rep, "Demo Rep"), (byRep.CreatedById!.Value, byRep.CreatedByName));
        Assert.True(byRep.OnMyList);
        Assert.Equal(("5 Abbas El Akkad", "Next to the metro", 1), (byRep.Address, byRep.Landmark, byRep.Availability!.Count));

        // A manager gives the new doctor to a rep in their scope; it is on that rep's list, not the manager's.
        var areaName = await db.DbAsync(c => c.Users.Where(u => u.Id == p.Area).Select(u => u.FullName).SingleAsync(Ct));
        var byManager = await db.As<DoctorService, DoctorDto>(p.Area, s => s.CreateAsync(new CreateDoctorRequest(
            "Dr. Laila Mansour", null, nasr, cardiology, RepId: p.RepEast), Ct));
        Assert.Equal(areaName, byManager.CreatedByName);
        Assert.Equal([p.RepEast], byManager.Reps.Select(r => r.Id));
        Assert.Contains((await ListAsync(db, p.RepEast, new DoctorQuery(Mine: true))), d => d.Id == byManager.Id);

        // ... but not to a rep outside it.
        var giza = await DemoPeople.TerritoryAsync(db, "A-GIZ");
        var outsider = await db.DbAsync(async c =>
        {
            var user = new User { Email = "giza.rep@test.local", UserName = "giza.rep@test.local", FullName = "Giza Rep", TerritoryId = giza, CreatedAt = DateTimeOffset.UtcNow };
            c.Users.Add(user);
            await c.SaveChangesAsync(Ct);
            return user.Id;
        });
        await Assert.ThrowsAsync<ForbiddenException>(() => db.As<DoctorService, DoctorDto>(p.Area, s => s.CreateAsync(new CreateDoctorRequest(
            "Dr. Outside Scope", null, nasr, cardiology, RepId: outsider), Ct)));
        await Assert.ThrowsAsync<ForbiddenException>(() => db.As<DoctorService, DoctorDto>(p.Supervisor, s => s.CreateAsync(new CreateDoctorRequest(
            "Dr. Outside Team", null, nasr, cardiology, RepId: outsider), Ct)));
        Assert.Equal(0, await db.DbAsync(c => c.Customers.CountAsync(x => x.Name.StartsWith("Dr. Outside"), Ct)));

        // The supervisor and the sales manager add doctors too.
        await db.As<DoctorService, DoctorDto>(p.Supervisor, s => s.CreateAsync(new CreateDoctorRequest("Dr. Sherif Amin", null, nasr, cardiology, RepId: p.Rep), Ct));
        await db.As<DoctorService, DoctorDto>(p.Sales, s => s.CreateAsync(new CreateDoctorRequest("Dr. Dalia Fouad", null, nasr, cardiology, RepId: p.Rep), Ct));

        // Filter by creator, in the managers' lists.
        Assert.Equal(["Dr. Laila Mansour"], (await ListAsync(db, p.Sales, new DoctorQuery(CreatedById: p.Area))).Select(d => d.Name));
        Assert.Equal(["Dr. Nader Fawzy"], (await ListAsync(db, p.Supervisor, new DoctorQuery(CreatedById: p.Rep))).Select(d => d.Name));
        Assert.Equal(["Dr. Dalia Fouad", "Dr. Nader Fawzy", "Dr. Sherif Amin"],
            (await ListAsync(db, p.Rep, new DoctorQuery(Mine: true))).Where(d => d.CreatedById is not null).Select(d => d.Name).Order());

        // Doctors from before this was kept have no creator.
        Assert.Null((await GetAsync(db, p.Rep, await DemoPeople.DoctorAsync(db, "Dr. Ahmed Fathy"))).CreatedByName);

        // Each creation is in the activity log with its creator.
        var created = await db.DbAsync(c => c.AuditEntries.SingleAsync(e => e.EntityType == AuditEntities.Customer && e.EntityId == byManager.Id && e.Action == AuditAction.Created, Ct));
        Assert.Equal((p.Area, areaName), (created.ActorId!.Value, created.ActorName));
        Assert.Contains(p.RepEast.ToString(), created.Details);
    }

    [Fact]
    public async Task Existing_manager_roles_receive_doctor_creation_once()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var managers = new[] { DefaultRoles.Supervisor, DefaultRoles.AreaManager, DefaultRoles.SalesManager };

        // As in a database from before: the managers' roles cannot add doctors and the step never ran.
        var permissionId = await db.DbAsync(c => c.Permissions.Where(x => x.Key == Permissions.Customers.Create).Select(x => x.Id).SingleAsync(Ct));
        foreach (var key in managers)
        {
            var roleId = (await db.RoleAsync(key)).Id;
            await db.DbAsync(c => c.RolePermissions.Where(rp => rp.RoleId == roleId && rp.PermissionId == permissionId).ExecuteDeleteAsync(Ct));
        }

        await db.DbAsync(c => c.SeedHistory.Where(e => e.Key == "doctor-create-for-managers-v1").ExecuteDeleteAsync(Ct));
        Assert.False((await db.EffectivePermissionsAsync(p.Supervisor)).Has(Permissions.Customers.Create));

        await db.SeedAgainAsync();
        Assert.Contains((await db.RoleAsync(DefaultRoles.Supervisor)).Permissions, g => g is { Key: Permissions.Customers.Create, Scope: PermissionScope.Team });
        Assert.Contains((await db.RoleAsync(DefaultRoles.AreaManager)).Permissions, g => g is { Key: Permissions.Customers.Create, Scope: PermissionScope.Territory });
        Assert.Contains((await db.RoleAsync(DefaultRoles.SalesManager)).Permissions, g => g is { Key: Permissions.Customers.Create, Scope: PermissionScope.All });
        Assert.Contains((await db.RoleAsync(DefaultRoles.Rep)).Permissions, g => g is { Key: Permissions.Customers.Create, Scope: PermissionScope.Own });

        // Taken away again by an admin: a later start does not give it back.
        var supervisor = await db.RoleAsync(DefaultRoles.Supervisor);
        await db.RolesAsync(p.Admin, s => s.SetPermissionsAsync(supervisor.Id, new SetRolePermissionsRequest(
            supervisor.Permissions.Where(g => g.Key != Permissions.Customers.Create).ToList()), Ct));
        await db.SeedAgainAsync();
        Assert.DoesNotContain((await db.RoleAsync(DefaultRoles.Supervisor)).Permissions, g => g.Key == Permissions.Customers.Create);
    }
}
