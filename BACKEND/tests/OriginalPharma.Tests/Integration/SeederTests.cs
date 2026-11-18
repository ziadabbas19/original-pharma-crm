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

    private static Dictionary<string, string?> LiveSettings(string? email = "owner@pharma.test", string? password = "Initial-Pass-2026") => new()
    {
        ["Seed:AdminEmail"] = email,
        ["Seed:AdminPassword"] = password,
        ["Seed:DemoData"] = "true", // refused at startup in production; the seeder must ignore it as well
        ["FileStorage:RootPath"] = PostgresFixture.FilesRoot,
    };

    [Fact]
    public async Task Production_seeds_only_what_the_system_needs()
    {
        await using var db = await postgres.CreateEmptyDatabaseAsync("Production", LiveSettings());

        await db.SeedAgainAsync();

        var counts = await CountsAsync(db);
        Assert.Equal(new Counts(0, counts.Specialties, counts.Methods, 0, 0, 0, 0, 0, 1), counts);
        Assert.True(counts.Specialties > 0);
        Assert.True(counts.Methods > 0);
        Assert.Equal(Permissions.All.Count, (await db.RoleAsync(DefaultRoles.Admin)).Permissions.Count);
        Assert.False(await db.DbAsync(c => c.SeedHistory.AnyAsync(e => e.Key.StartsWith("demo-"), Ct)));

        var admin = await db.DbAsync(c => c.Users.SingleAsync(Ct));
        Assert.Equal("owner@pharma.test", admin.Email);
        Assert.True(admin.MustChangePassword);
    }

    [Fact]
    public async Task Production_never_creates_a_second_admin_from_the_environment()
    {
        await using var db = await postgres.CreateEmptyDatabaseAsync("Production", LiveSettings());
        await db.SeedAgainAsync();
        await db.DbAsync(c => c.Users.ExecuteUpdateAsync(s => s
            .SetProperty(u => u.Email, "renamed@pharma.test")
            .SetProperty(u => u.NormalizedEmail, "RENAMED@PHARMA.TEST"), Ct));

        await db.SeedAgainAsync();

        Assert.Equal("renamed@pharma.test", (await db.DbAsync(c => c.Users.SingleAsync(Ct))).Email);
    }

    [Theory]
    [InlineData(null, null)]
    [InlineData("owner@pharma.test", "weak")]
    public async Task Production_refuses_to_start_without_a_usable_first_admin(string? email, string? password)
    {
        await using var db = await postgres.CreateEmptyDatabaseAsync("Production", LiveSettings(email, password));

        var error = await Assert.ThrowsAsync<InvalidOperationException>(db.SeedAgainAsync);
        Assert.Contains("Seed__Admin", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Changing_a_temporary_password_lifts_the_restriction_at_once()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);

        var reset = await db.As<AccountService, TemporaryPasswordDto>(p.Admin, s => s.ResetPasswordAsync(p.Rep, new ResetPasswordRequest(), Ct));
        Assert.True((await db.EffectivePermissionsAsync(p.Rep)).MustChangePassword);

        await db.As<AccountService>(p.Rep, s => s.ChangePasswordAsync(new ChangePasswordRequest(reset.TemporaryPassword, "Another-Pass-2026"), Ct));
        Assert.False((await db.EffectivePermissionsAsync(p.Rep)).MustChangePassword);
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
