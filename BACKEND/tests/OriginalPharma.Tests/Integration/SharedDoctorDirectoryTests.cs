using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Crm;
using OriginalPharma.Application.Identity;
using OriginalPharma.Domain.Crm;

namespace OriginalPharma.Tests.Integration;

/// <summary>
/// Doctors as a shared directory (every doctor visible to anyone with customers:read, on many lists, "in
/// lists of" limited to the caller's scope) and the duplicate warning when adding doctors, pharmacies and places.
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class SharedDoctorDirectoryTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static Task<IReadOnlyList<DoctorDto>> ListAsync(TestDatabase db, Guid actor, DoctorQuery query) =>
        db.As<DoctorService, IReadOnlyList<DoctorDto>>(actor, s => s.ListAsync(query, Ct));

    private static Task<DoctorDto> GetAsync(TestDatabase db, Guid actor, Guid id) =>
        db.As<DoctorService, DoctorDto>(actor, s => s.GetAsync(id, Ct));

    private static Task<IReadOnlyList<SimilarCustomerDto>> SimilarAsync(TestDatabase db, Guid actor, CustomerType type, string name, Guid town, string? phone = null) =>
        db.As<SimilarCustomerFinder, IReadOnlyList<SimilarCustomerDto>>(actor, s => s.FindAsync(new SimilarCustomersQuery(type, name, town, phone), Ct));

    /// <summary>A rep in Giza (outside the demo reps' East Cairo) with a doctor of their own in Dokki.</summary>
    private static async Task<(Guid Rep, DoctorDto Doctor)> GizaRepWithDoctorAsync(TestDatabase db, DemoPeople p)
    {
        var giza = await DemoPeople.TerritoryAsync(db, "A-GIZ");
        var dokki = await DemoPeople.TerritoryAsync(db, "T-DOK");
        var cardiology = await DemoPeople.SpecialtyAsync(db, "Cardiology");
        var rep = (await db.UsersAsync(p.Admin, s => s.CreateAsync(new CreateUserRequest(
            "rep.giza@test.local", "Giza Rep", PostgresFixture.Password, [DefaultRoles.Rep], p.Sales, giza), Ct))).User.Id;
        var doctor = await db.As<DoctorService, DoctorDto>(rep, s => s.CreateAsync(new CreateDoctorRequest(
            "Dr. Shared Directory", "د. دليل مشترك", dokki, cardiology, "01009998877", "Private notes",
            Address: "5 Tahrir St", Landmark: "Near the metro"), Ct));
        return (rep, doctor);
    }

    [Fact]
    public async Task A_rep_with_the_own_scope_sees_every_doctor_and_adds_any_of_them_to_their_list()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var (gizaRep, doctor) = await GizaRepWithDoctorAsync(db, p);

        // In "All doctors": the directory fields, no phone, notes or other reps' names.
        var row = Assert.Single(await ListAsync(db, p.Rep, new DoctorQuery()), d => d.Id == doctor.Id);
        Assert.True(row.Limited);
        Assert.False(row.OnMyList);
        Assert.Null(row.Phone);
        Assert.Null(row.Notes);
        Assert.Empty(row.Reps);
        Assert.Equal(("5 Tahrir St", "Near the metro", "Giza Rep"), (row.Address, row.Landmark, row.CreatedByName));
        Assert.True((await GetAsync(db, p.Rep, doctor.Id)).Limited);

        // The scope still limits "in scope" and "my list", and editing stays as it was.
        Assert.DoesNotContain(await ListAsync(db, p.Rep, new DoctorQuery(InScope: true)), d => d.Id == doctor.Id);
        Assert.DoesNotContain(await ListAsync(db, p.Rep, new DoctorQuery(Mine: true)), d => d.Id == doctor.Id);
        await Assert.ThrowsAsync<ForbiddenException>(() => db.As<DoctorService, DoctorDto>(p.Rep, s => s.UpdateAsync(doctor.Id,
            new UpdateDoctorRequest("Renamed", null, doctor.TownId!.Value, doctor.SpecialtyId!.Value), Ct)));

        // Added to the rep's list: on two lists now, with the full details for the rep.
        var added = await db.As<DoctorService, DoctorDto>(p.Rep, s => s.AddToMyListAsync(doctor.Id, Ct));
        Assert.True(added.OnMyList);
        Assert.False(added.Limited);
        Assert.Equal("01009998877", added.Phone);
        Assert.Equal(new[] { p.Rep }, added.Reps.Select(r => r.Id));
        Assert.Contains(await ListAsync(db, p.Rep, new DoctorQuery(Mine: true)), d => d.Id == doctor.Id);
        Assert.Contains(await ListAsync(db, gizaRep, new DoctorQuery(Mine: true)), d => d.Id == doctor.Id);
        Assert.Equal(2, await db.DbAsync(c => c.RepDoctors.CountAsync(a => a.CustomerId == doctor.Id, Ct)));

        // Archived doctors are not part of the directory.
        await db.DbAsync(async c =>
        {
            var entity = await c.Customers.SingleAsync(x => x.Id == doctor.Id, Ct);
            entity.ArchivedAt = DateTimeOffset.UtcNow;
            return await c.SaveChangesAsync(Ct);
        });
        Assert.DoesNotContain(await ListAsync(db, p.RepEast, new DoctorQuery(Archived: true)), d => d.Id == doctor.Id);
        await Assert.ThrowsAsync<NotFoundException>(() => GetAsync(db, p.RepEast, doctor.Id));
    }

    [Fact]
    public async Task Managers_see_in_whose_lists_a_doctor_is_but_only_for_the_people_in_their_scope()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var (gizaRep, doctor) = await GizaRepWithDoctorAsync(db, p);
        await db.As<DoctorService, DoctorDto>(p.Rep, s => s.AddToMyListAsync(doctor.Id, Ct));

        async Task<Guid[]> InListsOf(Guid actor) =>
            (await ListAsync(db, actor, new DoctorQuery())).Single(d => d.Id == doctor.Id).Reps.Select(r => r.Id).Order().ToArray();

        Assert.Equal(new[] { p.Rep }, await InListsOf(p.Supervisor)); // team
        Assert.Equal(new[] { p.Rep }, await InListsOf(p.Area)); // East Cairo
        Assert.Equal(new[] { p.Rep, gizaRep }.Order(), await InListsOf(p.Sales)); // all
        Assert.Equal(new[] { p.Rep, gizaRep }.Order(), await InListsOf(p.Admin));
        Assert.Equal(new[] { p.Rep }, (await GetAsync(db, p.Supervisor, doctor.Id)).Reps.Select(r => r.Id));

        // Reps never see other reps' names: only whether it is on their own list.
        Assert.Empty(await InListsOf(p.RepEast));
        Assert.Equal(new[] { gizaRep }, await InListsOf(gizaRep));

        // Viewing someone's list still needs that person in scope.
        await Assert.ThrowsAsync<ForbiddenException>(() => ListAsync(db, p.Supervisor, new DoctorQuery(ListOf: gizaRep)));
    }

    [Fact]
    public async Task Adding_a_similar_doctor_needs_a_confirmation_and_the_same_name_is_still_refused()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var nasr = await DemoPeople.TerritoryAsync(db, "T-NSR");
        var cardiology = await DemoPeople.SpecialtyAsync(db, "Cardiology");
        var first = await db.As<DoctorService, DoctorDto>(p.Rep, s => s.CreateAsync(
            new CreateDoctorRequest("أحمد محمد علي", null, nasr, cardiology), Ct));

        // The live check while typing.
        var candidate = Assert.Single(await SimilarAsync(db, p.RepEast, CustomerType.Doctor, "احمد محمد", nasr));
        Assert.Equal(first.Id, candidate.Id);
        Assert.False(candidate.Same);
        Assert.False(candidate.Limited);
        Assert.Equal(false, candidate.InMyList);
        Assert.Equal(first.CreatedByName, candidate.AddedByName);
        Assert.Equal(true, Assert.Single(await SimilarAsync(db, p.Rep, CustomerType.Doctor, "احمد محمد", nasr)).InMyList);
        Assert.Empty(await SimilarAsync(db, p.RepEast, CustomerType.Doctor, "احمد محمد", await DemoPeople.TerritoryAsync(db, "T-HLP")));
        Assert.Empty(await SimilarAsync(db, p.RepEast, CustomerType.Pharmacy, "احمد محمد", nasr));

        // Saving without the confirmation: 409 with the candidates; with it, the doctor is added.
        var conflict = await Assert.ThrowsAsync<ConflictException>(() => db.As<DoctorService, DoctorDto>(p.RepEast, s => s.CreateAsync(
            new CreateDoctorRequest("احمد محمد", null, nasr, cardiology), Ct)));
        Assert.Equal(DuplicateErrorCodes.Suspected, conflict.Code);
        var candidates = Assert.IsAssignableFrom<IReadOnlyList<SimilarCustomerDto>>(conflict.Details!["candidates"]);
        Assert.Equal(first.Id, Assert.Single(candidates).Id);
        var second = await db.As<DoctorService, DoctorDto>(p.RepEast, s => s.CreateAsync(
            new CreateDoctorRequest("احمد محمد", null, nasr, cardiology, DuplicateConfirmed: true), Ct));
        Assert.NotEqual(first.Id, second.Id);

        // The very same name in the same town is refused even when confirmed, as before.
        var exists = await Assert.ThrowsAsync<ConflictException>(() => db.As<DoctorService, DoctorDto>(p.RepEast, s => s.CreateAsync(
            new CreateDoctorRequest("أحمد محمد علي", null, nasr, cardiology, DuplicateConfirmed: true), Ct)));
        Assert.Equal(DoctorErrorCodes.Exists, exists.Code);

        // Inactive doctors still count, marked as such; the same ones come first.
        await db.DbAsync(async c =>
        {
            var entity = await c.Customers.SingleAsync(x => x.Id == first.Id, Ct);
            entity.IsActive = false;
            return await c.SaveChangesAsync(Ct);
        });
        var both = await SimilarAsync(db, p.Rep, CustomerType.Doctor, "احمد محمد", nasr);
        Assert.Equal(new[] { second.Id, first.Id }, both.Select(c => c.Id!.Value));
        Assert.True(both[0].Same);
        Assert.True(both[1].IsInactive);
    }

    [Fact]
    public async Task Pharmacies_and_places_warn_the_same_way_and_out_of_scope_ones_show_name_and_area_only()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var nasr = await DemoPeople.TerritoryAsync(db, "T-NSR");
        var (gizaRep, _) = await GizaRepWithDoctorAsync(db, p);
        var pharmacy = await db.As<CustomerService, CustomerDto>(p.Rep, s => s.CreatePharmacyAsync(
            new CreatePharmacyRequest("صيدلية النور", null, nasr, "Abbas El Akkad", "0222223333"), Ct));

        var same = Assert.Single(await SimilarAsync(db, p.RepEast, CustomerType.Pharmacy, "صيدليه النور", nasr));
        Assert.Equal((pharmacy.Id, true, "Abbas El Akkad"), (same.Id!.Value, same.Same, same.Address));
        Assert.True(Assert.Single(await SimilarAsync(db, p.RepEast, CustomerType.Pharmacy, "Another name", nasr, "+20 2 2222 3333")).Same);

        // A rep of another area: compared all the same, but only the name and the area come back.
        var limited = Assert.Single(await SimilarAsync(db, gizaRep, CustomerType.Pharmacy, "النور", nasr));
        Assert.True(limited.Limited);
        Assert.Equal(("صيدلية النور", "East Cairo"), (limited.Name, limited.AreaName));
        Assert.Null(limited.Id);
        Assert.Null(limited.Address);

        var conflict = await Assert.ThrowsAsync<ConflictException>(() => db.As<CustomerService, CustomerDto>(p.RepEast, s => s.CreatePharmacyAsync(
            new CreatePharmacyRequest("صيدليه النور", null, nasr), Ct)));
        Assert.Equal(DuplicateErrorCodes.Suspected, conflict.Code);
        await db.As<CustomerService, CustomerDto>(p.RepEast, s => s.CreatePharmacyAsync(
            new CreatePharmacyRequest("صيدليه النور", null, nasr, DuplicateConfirmed: true), Ct));

        // AM places.
        await db.As<CustomerService, CustomerDto>(p.Rep, s => s.CreateHospitalAsync(new CreateHospitalRequest("مستشفى السلام", null, nasr), Ct));
        var place = await Assert.ThrowsAsync<ConflictException>(() => db.As<CustomerService, CustomerDto>(p.RepEast, s => s.CreateHospitalAsync(
            new CreateHospitalRequest("مستشفي السلام الدولي", null, nasr), Ct)));
        Assert.Equal(DuplicateErrorCodes.Suspected, place.Code);
        await db.As<CustomerService, CustomerDto>(p.RepEast, s => s.CreateHospitalAsync(
            new CreateHospitalRequest("مستشفي السلام الدولي", null, nasr, DuplicateConfirmed: true), Ct));
    }
}
