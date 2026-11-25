using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Auditing;
using OriginalPharma.Application.Common.Bulk;
using OriginalPharma.Application.Crm;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Lookups;
using OriginalPharma.Application.Visits;
using OriginalPharma.Domain.Audit;
using OriginalPharma.Domain.Crm;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Tests.Integration;

/// <summary>
/// A rep adds a pharmacy from the phone (customers:create-pharmacy, own scope): only in a town of their
/// area, duplicates refused like doctors, logged with the creator, its location taken from the first
/// visit; editing and deleting pharmacies stay with managers.
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class PharmacyCreateTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task A_rep_adds_a_pharmacy_in_their_area_and_finds_it_in_their_list()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var nasr = await DemoPeople.TerritoryAsync(db, "T-NSR");
        var eastCairo = await DemoPeople.TerritoryAsync(db, "A-CAI-E");

        var towns = await db.As<CustomerService, List<TownDto>>(p.Rep, s => s.PharmacyTownsAsync(Ct));
        Assert.NotEmpty(towns);
        Assert.All(towns, t => Assert.Equal(eastCairo, t.AreaId));

        var created = await db.As<CustomerService, CustomerDto>(p.Rep, s => s.CreatePharmacyAsync(
            new CreatePharmacyRequest("Al Shifa Pharmacy", "صيدلية الشفاء", nasr, "12 Abbas El Akkad", "0222223333", "Opens at 10"), Ct));
        Assert.Equal(CustomerType.Pharmacy, created.Type);
        Assert.Equal(nasr, created.TerritoryId);
        Assert.Equal(("صيدلية الشفاء", "12 Abbas El Akkad", "0222223333"), (created.NameAr, created.Address, created.Phone));
        Assert.Null(created.Lat);

        var stored = await db.DbAsync(c => c.Customers.AsNoTracking().SingleAsync(x => x.Id == created.Id, Ct));
        Assert.Equal(p.Rep, stored.CreatedById);
        Assert.Null(stored.Location);

        // On the rep's own pharmacy list at once.
        var mine = await db.As<CustomerService, IReadOnlyList<CustomerDto>>(p.Rep, s => s.ListAsync(CustomerType.Pharmacy, null, cancellationToken: Ct));
        Assert.Contains(mine, c => c.Id == created.Id);

        // The activity log names the creator.
        var entry = await db.DbAsync(c => c.AuditEntries.SingleAsync(
            e => e.EntityType == AuditEntities.Customer && e.EntityId == created.Id && e.Action == AuditAction.Created, Ct));
        Assert.Equal(p.Rep, entry.ActorId);
        Assert.Equal("Demo Rep", entry.ActorName);
        Assert.Contains("Al Shifa Pharmacy", entry.Details);

        // The first visit with a good fix saves its location, as for a new doctor.
        await db.As<VisitService, VisitDto>(p.Rep, s => s.CheckInAsync(
            new CheckInRequest(created.Id, "test-device", 30.0601, 31.3402, 12, DateTimeOffset.UtcNow, false, null, Guid.NewGuid()), Ct));
        var located = await db.DbAsync(c => c.Customers.AsNoTracking().SingleAsync(x => x.Id == created.Id, Ct));
        Assert.NotNull(located.Location);
        Assert.Equal(ClinicLocationSource.FirstVisit, located.LocationSource);
    }

    [Fact]
    public async Task Outside_the_area_duplicates_and_wrong_towns_are_refused()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var nasr = await DemoPeople.TerritoryAsync(db, "T-NSR");
        var heliopolis = await DemoPeople.TerritoryAsync(db, "T-HLP");
        var dokki = await DemoPeople.TerritoryAsync(db, "T-DOK"); // Giza
        var area = await DemoPeople.TerritoryAsync(db, "A-CAI-E");

        Task<CustomerDto> Create(Guid actor, string name, Guid town) =>
            db.As<CustomerService, CustomerDto>(actor, s => s.CreatePharmacyAsync(new CreatePharmacyRequest(name, null, town), Ct));

        var outside = await Assert.ThrowsAsync<ForbiddenException>(() => Create(p.Rep, "Dokki Pharmacy", dokki));
        Assert.Equal(PharmacyErrorCodes.TownOutOfScope, outside.Code);
        Assert.Equal(DoctorErrorCodes.TownInvalid, (await Assert.ThrowsAsync<BusinessRuleException>(() => Create(p.Rep, "Area Pharmacy", area))).Code);

        var first = await Create(p.Rep, "Nour Pharmacy", nasr);
        // The same name: first the duplicate warning, then (added anyway) still refused.
        var suspected = await Assert.ThrowsAsync<ConflictException>(() => Create(p.RepEast, "  nour PHARMACY ", nasr));
        Assert.Equal(DuplicateErrorCodes.Suspected, suspected.Code);
        var duplicate = await Assert.ThrowsAsync<ConflictException>(() => db.As<CustomerService, CustomerDto>(p.RepEast, s =>
            s.CreatePharmacyAsync(new CreatePharmacyRequest("  nour PHARMACY ", null, nasr, DuplicateConfirmed: true), Ct)));
        Assert.Equal(PharmacyErrorCodes.Exists, duplicate.Code);
        Assert.Equal(first.Id, duplicate.Details!["pharmacyId"]);
        // The same name in another town is another pharmacy.
        await Create(p.Rep, "Nour Pharmacy", heliopolis);

        // Without the permission (the default supervisor role), nothing is created.
        await Assert.ThrowsAsync<ForbiddenException>(() => Create(p.Supervisor, "Supervisor Pharmacy", nasr));
        Assert.Empty(await db.As<CustomerService, List<TownDto>>(p.Supervisor, s => s.PharmacyTownsAsync(Ct)));
        Assert.Equal(2, await db.DbAsync(c => c.Customers.CountAsync(x => x.Name == "Nour Pharmacy", Ct)));
    }

    [Fact]
    public async Task A_rep_cannot_edit_or_delete_pharmacies()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var nasr = await DemoPeople.TerritoryAsync(db, "T-NSR");
        var created = await db.As<CustomerService, CustomerDto>(p.Rep, s => s.CreatePharmacyAsync(new CreatePharmacyRequest("Salam Pharmacy", null, nasr), Ct));

        var rep = await db.EffectivePermissionsAsync(p.Rep);
        Assert.Equal(PermissionScope.Own, rep.ScopeOf(Permissions.Customers.CreatePharmacy));
        Assert.False(rep.Has(Permissions.Customers.Manage));
        Assert.False(rep.Has(Permissions.Customers.Delete));

        await Assert.ThrowsAsync<ForbiddenException>(() => db.As<CustomerService, CustomerDto>(p.Rep, s =>
            s.UpdateAsync(created.Id, new UpdateCustomerRequest("Renamed", null, null, nasr), Ct)));
        var deleted = await db.As<CustomerService, BulkResult>(p.Rep, s => s.DeleteManyAsync(new BulkDeleteRequest([created.Id]), Ct));
        Assert.Equal(1, deleted.Blocked);

        var stored = await db.DbAsync(c => c.Customers.AsNoTracking().SingleAsync(x => x.Id == created.Id, Ct));
        Assert.Equal(("Salam Pharmacy", (DateTimeOffset?)null), (stored.Name, stored.ArchivedAt));
    }

    [Fact]
    public async Task The_permission_reaches_the_existing_rep_role_once_and_no_other_role()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var custom = await db.RolesAsync(p.Admin, s => s.CreateRoleAsync(new CreateRoleRequest("مندوب ميداني", "Field rep", Level: 45), Ct));
        await db.GrantAsync(p.Admin, custom.Key, (Permissions.Customers.Create, PermissionScope.Own));

        // As in a database from before this permission existed.
        await db.DbAsync(c => c.Permissions.Where(x => x.Key == Permissions.Customers.CreatePharmacy).ExecuteDeleteAsync(Ct));
        await db.SeedAgainAsync();

        Assert.Contains((await db.RoleAsync(DefaultRoles.Rep)).Permissions, g => g is { Key: Permissions.Customers.CreatePharmacy, Scope: PermissionScope.Own });
        Assert.Contains((await db.RoleAsync(DefaultRoles.Admin)).Permissions, g => g is { Key: Permissions.Customers.CreatePharmacy, Scope: PermissionScope.All });
        foreach (var role in new[] { DefaultRoles.Supervisor, DefaultRoles.AreaManager, DefaultRoles.SalesManager, custom.Key })
        {
            Assert.DoesNotContain((await db.RoleAsync(role)).Permissions, g => g.Key == Permissions.Customers.CreatePharmacy);
        }

        // Taken away from the Rep role afterwards: a later start does not give it back.
        var repRole = await db.RoleAsync(DefaultRoles.Rep);
        await db.RolesAsync(p.Admin, s => s.SetPermissionsAsync(repRole.Id, new SetRolePermissionsRequest(
            repRole.Permissions.Where(g => g.Key != Permissions.Customers.CreatePharmacy).ToList()), Ct));
        await db.SeedAgainAsync();
        Assert.DoesNotContain((await db.RoleAsync(DefaultRoles.Rep)).Permissions, g => g.Key == Permissions.Customers.CreatePharmacy);
    }
}
