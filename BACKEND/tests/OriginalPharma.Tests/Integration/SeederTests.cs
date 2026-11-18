using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Identity;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Tests.Integration;

[Collection(PostgresCollection.Name)]
public sealed class SeederTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Seeding_again_keeps_every_edit_and_adds_nothing_twice()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var counts = await CountsAsync(db);

        // Edits an admin could make: rename a specialty, remove a collection method, take a grant away.
        await db.DbAsync(c => c.Specialties.Where(s => s.NameEn == "Cardiology").ExecuteUpdateAsync(s => s.SetProperty(x => x.NameEn, "Heart"), Ct));
        await db.DbAsync(c => c.CollectionMethods.Where(m => m.NameEn == "Cheque").ExecuteDeleteAsync(Ct));
        var rep = await db.RoleAsync(DefaultRoles.Rep);
        await db.RolesAsync(p.Admin, s => s.SetPermissionsAsync(rep.Id, new SetRolePermissionsRequest(
            rep.Permissions.Where(g => g.Key != Permissions.Orders.Create).ToList()), Ct));

        await db.SeedAgainAsync();

        var after = await CountsAsync(db);
        Assert.Equal(counts with { Methods = counts.Methods - 1 }, after);
        Assert.False(await db.DbAsync(c => c.Specialties.AnyAsync(s => s.NameEn == "Cardiology", Ct)));
        Assert.False(await db.DbAsync(c => c.CollectionMethods.AnyAsync(m => m.NameEn == "Cheque", Ct)));
        Assert.DoesNotContain((await db.RoleAsync(DefaultRoles.Rep)).Permissions, g => g.Key == Permissions.Orders.Create);

        // Admin still holds every permission, including the new ones.
        Assert.Equal(Permissions.All.Count, (await db.RoleAsync(DefaultRoles.Admin)).Permissions.Count);
    }

    [Fact]
    public async Task A_key_split_from_an_old_one_reaches_every_role_holding_it_once()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);

        // A custom role with territories:manage, as built before territories:delete existed.
        var custom = await db.RolesAsync(p.Admin, s => s.CreateRoleAsync(new CreateRoleRequest("منسق مناطق", "Territory coordinator", Level: 35), Ct));
        await db.GrantAsync(p.Admin, custom.Key, (Permissions.Territories.Manage, PermissionScope.Territory));

        // Make the key new again: drop it from the catalog (its grants go with it), then seed.
        await db.DbAsync(c => c.Permissions.Where(x => x.Key == Permissions.Territories.Delete).ExecuteDeleteAsync(Ct));
        await db.SeedAgainAsync();

        Assert.Contains((await db.RoleAsync(custom.Key)).Permissions, g => g is { Key: Permissions.Territories.Delete, Scope: PermissionScope.Territory });
        Assert.DoesNotContain((await db.RoleAsync(DefaultRoles.Supervisor)).Permissions, g => g.Key == Permissions.Territories.Delete);
        Assert.Contains((await db.RoleAsync(DefaultRoles.Admin)).Permissions, g => g is { Key: Permissions.Territories.Delete, Scope: PermissionScope.All });

        // Taken away from the matrix afterwards: seeding again keeps it away.
        var role = await db.RoleAsync(custom.Key);
        await db.RolesAsync(p.Admin, s => s.SetPermissionsAsync(role.Id, new SetRolePermissionsRequest(
            role.Permissions.Where(g => g.Key != Permissions.Territories.Delete).ToList()), Ct));
        await db.SeedAgainAsync();
        Assert.DoesNotContain((await db.RoleAsync(custom.Key)).Permissions, g => g.Key == Permissions.Territories.Delete);

        // Defaults for the new features on the seeded roles.
        Assert.Contains((await db.RoleAsync(DefaultRoles.Rep)).Permissions, g => g is { Key: Permissions.Visits.Feedback, Scope: PermissionScope.Own });
        Assert.Contains((await db.RoleAsync(DefaultRoles.Rep)).Permissions, g => g is { Key: Permissions.Stats.Read, Scope: PermissionScope.Own });
        Assert.Contains((await db.RoleAsync(DefaultRoles.Supervisor)).Permissions, g => g is { Key: Permissions.Orders.Deliver, Scope: PermissionScope.Team });
        Assert.Contains((await db.RoleAsync(DefaultRoles.AreaManager)).Permissions, g => g is { Key: Permissions.Stats.Read, Scope: PermissionScope.Territory });
        Assert.DoesNotContain((await db.RoleAsync(DefaultRoles.Supervisor)).Permissions, g => g.Key == Permissions.Users.Delete);
    }

    private sealed record Counts(int Territories, int Specialties, int Methods, int Lines, int Products, int Doctors, int Assignments, int Orders, int Users);

    private static Task<Counts> CountsAsync(TestDatabase db) => db.DbAsync(async c => new Counts(
        await c.Territories.CountAsync(Ct),
        await c.Specialties.CountAsync(Ct),
        await c.CollectionMethods.CountAsync(Ct),
        await c.ProductLines.CountAsync(Ct),
        await c.Products.CountAsync(Ct),
        await c.Customers.CountAsync(Ct),
        await c.RepDoctors.CountAsync(Ct),
        await c.Orders.CountAsync(Ct),
        await c.Users.CountAsync(Ct)));
}
