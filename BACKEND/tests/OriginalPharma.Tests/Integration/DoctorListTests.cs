using OriginalPharma.Application.Common;
using OriginalPharma.Application.Crm;

namespace OriginalPharma.Tests.Integration;

[Collection(PostgresCollection.Name)]
public sealed class DoctorListTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static Task<IReadOnlyList<DoctorDto>> ListAsync(TestDatabase db, Guid actor, DoctorQuery query) =>
        db.As<DoctorService, IReadOnlyList<DoctorDto>>(actor, s => s.ListAsync(query, Ct));

    [Fact]
    public async Task Reps_see_their_own_list_and_managers_see_the_lists_in_their_scope()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);

        var mine = await ListAsync(db, p.Rep, new DoctorQuery(Mine: true));
        Assert.Equal(6, mine.Count);
        Assert.All(mine, d => Assert.True(d.OnMyList));
        Assert.Equal(["Dr. Youssef Samir"], mine.Where(d => d.OutsideMyArea).Select(d => d.Name)); // Dokki is in Giza

        // Without a filter every doctor of the shared directory; inside the own scope only the rep's own list.
        Assert.Equal(mine.Select(d => d.Id).Order(), (await ListAsync(db, p.Rep, new DoctorQuery(InScope: true))).Select(d => d.Id).Order());
        var directory = await ListAsync(db, p.Rep, new DoctorQuery());
        Assert.Equal(10, directory.Count);
        Assert.All(directory, d => Assert.Equal(!d.OnMyList, d.Limited));
        Assert.Equal(3, (await ListAsync(db, p.RepEast, new DoctorQuery(Mine: true))).Count);
        await Assert.ThrowsAsync<ForbiddenException>(() => ListAsync(db, p.Rep, new DoctorQuery(RepId: p.RepEast)));

        // Team: both reps' lists (one doctor is on both); unassigned doctors are not part of a team.
        var team = await ListAsync(db, p.Supervisor, new DoctorQuery(InScope: true));
        Assert.Equal(8, team.Count);
        Assert.DoesNotContain(team, d => d.Name is "Dr. Salma Ibrahim" or "Dr. Omar Khaled");
        var shared = team.Single(d => d.Name == "Dr. Mona Saeed");
        Assert.Equal(new[] { p.Rep, p.RepEast }.Order(), shared.Reps.Select(r => r.Id).Order());
        Assert.True(team.Single(d => d.Name == "Dr. Youssef Samir").Reps.Single().OutsideArea);
        Assert.Equal(3, (await ListAsync(db, p.Supervisor, new DoctorQuery(RepId: p.RepEast))).Count);

        // All: every doctor, including unassigned ones.
        var all = await ListAsync(db, p.Sales, new DoctorQuery());
        Assert.Equal(10, all.Count);
        Assert.Equal(2, (await ListAsync(db, p.Sales, new DoctorQuery(Unassigned: true))).Count);

        // Filters by town and specialty.
        var nasrCity = await DemoPeople.TerritoryAsync(db, "T-NSR");
        var cardiology = await DemoPeople.SpecialtyAsync(db, "Cardiology");
        Assert.Equal(3, (await ListAsync(db, p.Rep, new DoctorQuery(Mine: true, TownId: nasrCity))).Count);
        Assert.Equal(["Dr. Ahmed Fathy", "Dr. Tamer Nabil"],
            (await ListAsync(db, p.Rep, new DoctorQuery(Mine: true, SpecialtyId: cardiology))).Select(d => d.Name).Order());
        Assert.Equal(5, (await ListAsync(db, p.Rep, new DoctorQuery(Mine: true, AreaId: await DemoPeople.TerritoryAsync(db, "A-CAI-E")))).Count);
    }

    [Fact]
    public async Task Reps_add_existing_or_new_doctors_to_their_own_list()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var nasrCity = await DemoPeople.TerritoryAsync(db, "T-NSR");
        var heliopolis = await DemoPeople.TerritoryAsync(db, "T-HLP");
        var cardiology = await DemoPeople.SpecialtyAsync(db, "Cardiology");

        var found = Assert.Single(await db.As<DoctorService, IReadOnlyList<DoctorDto>>(p.Rep, s => s.SearchDirectoryAsync("salma", null, null, Ct)));
        Assert.False(found.OnMyList);
        Assert.Empty(found.Reps);

        var added = await db.As<DoctorService, DoctorDto>(p.Rep, s => s.AddToMyListAsync(found.Id, Ct));
        Assert.True(added.OnMyList);
        Assert.True(added.OutsideMyArea); // Mohandessin is in Giza: a warning, not a refusal
        var again = await db.As<DoctorService, DoctorDto>(p.Rep, s => s.AddToMyListAsync(found.Id, Ct));
        Assert.Single(again.Reps);

        // The same name: first the duplicate warning, then (added anyway) still refused.
        var suspected = await Assert.ThrowsAsync<ConflictException>(() => db.As<DoctorService, DoctorDto>(p.Rep, s =>
            s.CreateAsync(new CreateDoctorRequest("dr. ahmed fathy", null, nasrCity, cardiology), Ct)));
        Assert.Equal(DuplicateErrorCodes.Suspected, suspected.Code);
        var duplicate = await Assert.ThrowsAsync<ConflictException>(() => db.As<DoctorService, DoctorDto>(p.Rep, s =>
            s.CreateAsync(new CreateDoctorRequest("dr. ahmed fathy", null, nasrCity, cardiology, DuplicateConfirmed: true), Ct)));
        Assert.Equal(DoctorErrorCodes.Exists, duplicate.Code);
        Assert.Equal(await DemoPeople.DoctorAsync(db, "Dr. Ahmed Fathy"), duplicate.Details!["doctorId"]);

        var created = await db.As<DoctorService, DoctorDto>(p.Rep, s =>
            s.CreateAsync(new CreateDoctorRequest("Dr. Nadia Fouad", "د. نادية فؤاد", heliopolis, cardiology, "0100 555 1234", "Thursdays after 6"), Ct));
        Assert.True(created.OnMyList);
        Assert.False(created.OutsideMyArea);
        Assert.Equal(8, (await ListAsync(db, p.Rep, new DoctorQuery(Mine: true))).Count);

        // Only customers:assign may put a doctor on someone else's list.
        await Assert.ThrowsAsync<ForbiddenException>(() => db.As<DoctorService, DoctorDto>(p.Rep, s =>
            s.CreateAsync(new CreateDoctorRequest("Dr. Someone Else", null, heliopolis, cardiology, RepId: p.RepEast), Ct)));

        // Details can be edited from your own list, not from someone else's.
        var ahmed = await DemoPeople.DoctorAsync(db, "Dr. Ahmed Fathy");
        var update = new UpdateDoctorRequest("Dr. Ahmed Fathy", "د. أحمد فتحي", nasrCity, cardiology, "01009999999", "Moved clinic");
        Assert.Equal("01009999999", (await db.As<DoctorService, DoctorDto>(p.Rep, s => s.UpdateAsync(ahmed, update, Ct))).Phone);
        await Assert.ThrowsAsync<ForbiddenException>(() => db.As<DoctorService, DoctorDto>(p.RepEast, s => s.UpdateAsync(ahmed, update, Ct)));

        await db.As<DoctorService>(p.Rep, s => s.RemoveFromMyListAsync(found.Id, Ct));
        Assert.DoesNotContain(await ListAsync(db, p.Rep, new DoctorQuery(Mine: true)), d => d.Id == found.Id);
    }

    [Fact]
    public async Task Supervisors_move_and_copy_doctors_between_their_reps()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var ahmed = await DemoPeople.DoctorAsync(db, "Dr. Ahmed Fathy");
        var youssef = await DemoPeople.DoctorAsync(db, "Dr. Youssef Samir");

        var moved = await db.As<DoctorService, AssignDoctorsResult>(p.Supervisor, s =>
            s.AssignAsync(new AssignDoctorsRequest([ahmed], p.RepEast, AssignMode.Move, p.Rep), Ct));
        Assert.Equal(new AssignDoctorsResult(1, 0, 1, 0), moved);
        Assert.DoesNotContain(await ListAsync(db, p.Rep, new DoctorQuery(Mine: true)), d => d.Id == ahmed);
        Assert.Contains(await ListAsync(db, p.RepEast, new DoctorQuery(Mine: true)), d => d.Id == ahmed);

        var copied = await db.As<DoctorService, AssignDoctorsResult>(p.Supervisor, s =>
            s.AssignAsync(new AssignDoctorsRequest([youssef], p.RepEast, AssignMode.Copy, p.Rep), Ct));
        Assert.Equal(new AssignDoctorsResult(1, 0, 0, 1), copied); // Dokki is outside East Cairo
        Assert.Contains(await ListAsync(db, p.Rep, new DoctorQuery(Mine: true)), d => d.Id == youssef);

        // Not on the source list, a rep outside the team, or no customers:assign at all.
        await Assert.ThrowsAsync<BusinessRuleException>(() => db.As<DoctorService, AssignDoctorsResult>(p.Supervisor, s =>
            s.AssignAsync(new AssignDoctorsRequest([ahmed], p.RepEast, AssignMode.Move, p.Rep), Ct)));
        await Assert.ThrowsAsync<ForbiddenException>(() => db.As<DoctorService, AssignDoctorsResult>(p.Supervisor, s =>
            s.AssignAsync(new AssignDoctorsRequest([youssef], p.Area, AssignMode.Copy, p.Rep), Ct)));
        await Assert.ThrowsAsync<ForbiddenException>(() => db.As<DoctorService, AssignDoctorsResult>(p.Rep, s =>
            s.AssignAsync(new AssignDoctorsRequest([youssef], p.RepEast, AssignMode.Copy, p.Rep), Ct)));
    }
}
