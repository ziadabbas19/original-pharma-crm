using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Identity;

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
