using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using OriginalPharma.Application.Identity;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Infrastructure.Persistence;

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

    private const string Owner = "owner@pharma.test";
    private const string ForgottenPassword = "Forgotten-Pass-2026";
    private const string RecoveryPassword = "Recovery-Pass-2026";
    private static readonly string SeederCategory = typeof(DatabaseSeeder).FullName!;

    private static Dictionary<string, string?> ResetSettings(string? flag, string? email = Owner, string? password = RecoveryPassword)
    {
        var settings = LiveSettings(email, password);
        settings["Seed:ResetAdminPassword"] = flag;
        return settings;
    }

    [Fact]
    public async Task Resetting_the_admin_password_from_the_environment_unlocks_it_and_ends_every_session()
    {
        await using var db = await postgres.CreateEmptyDatabaseAsync("Production", LiveSettings());
        var (admin, other) = await LockedOutAdminWithSessionsAsync(db);
        var version = await db.PermissionsVersionAsync(admin);

        var logs = await db.SeedAgainAsync(ResetSettings("true"));

        Assert.True(await CanSignInAsync(db, admin, RecoveryPassword));
        Assert.False(await CanSignInAsync(db, admin, ForgottenPassword));
        var user = await db.DbAsync(c => c.Users.AsNoTracking().SingleAsync(u => u.Id == admin, Ct));
        Assert.True(user.MustChangePassword);
        Assert.Null(user.LockoutEnd);
        Assert.Equal(0, user.AccessFailedCount);
        Assert.True(await db.PermissionsVersionAsync(admin) > version); // access tokens already issued get the restriction too

        var sessions = await db.DbAsync(c => c.RefreshTokens.AsNoTracking().ToListAsync(Ct));
        Assert.Equal(2, sessions.Count(t => t.UserId == admin && t.RevokedReason == "password-reset"));
        Assert.Single(sessions, t => t.UserId == admin && t.RevokedReason == "logout"); // ended before: left as it was
        Assert.DoesNotContain(sessions, t => t.UserId == admin && t.RevokedAt == null);
        Assert.All(sessions.Where(t => t.UserId == other), t => Assert.Null(t.RevokedAt));

        var audit = await db.DbAsync(c => c.UserAuditEntries.AsNoTracking()
            .SingleAsync(e => e.UserId == admin && e.Action == UserAuditAction.PasswordReset, Ct));
        Assert.Null(audit.ActorId);
        Assert.Equal(2, await db.DbAsync(c => c.Users.CountAsync(Ct)));

        var line = Assert.Single(logs, l => l.Category == SeederCategory && l.Message.Contains("reset", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(Owner, line.Message, StringComparison.Ordinal);
        Assert.DoesNotContain(logs, l => l.Message.Contains(RecoveryPassword, StringComparison.Ordinal));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("false")]
    [InlineData("yes")]
    public async Task Without_the_reset_flag_the_admin_is_left_as_it_is(string? flag)
    {
        await using var db = await postgres.CreateEmptyDatabaseAsync("Production", LiveSettings());
        var (admin, _) = await LockedOutAdminWithSessionsAsync(db);
        var before = await AdminStateAsync(db, admin);

        var logs = await db.SeedAgainAsync(ResetSettings(flag));

        Assert.Equal(before, await AdminStateAsync(db, admin));
        Assert.False(before.MustChangePassword);
        Assert.Equal(2, before.LiveSessions);
        Assert.DoesNotContain(logs, l => l.Category == SeederCategory && l.Message.Contains("Seed__ResetAdminPassword", StringComparison.Ordinal));
    }

    [Theory]
    [InlineData(Owner, "Short-1a")] // passes the sign-in password policy, not the admin rule
    [InlineData(Owner, "recovery-pass-2026")]
    [InlineData(Owner, "RECOVERY-PASS-2026")]
    [InlineData(Owner, "Recovery-Pass-Now")]
    [InlineData(Owner, "Change-Me-Admin-2026")]
    [InlineData(Owner, null)]
    [InlineData(null, RecoveryPassword)]
    public async Task The_reset_refuses_a_missing_or_weak_password_and_changes_nothing(string? email, string? password)
    {
        await using var db = await postgres.CreateEmptyDatabaseAsync("Production", LiveSettings());
        var (admin, _) = await LockedOutAdminWithSessionsAsync(db);
        var before = await AdminStateAsync(db, admin);

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => db.SeedAgainAsync(ResetSettings("true", email, password)));

        Assert.Contains("Seed__", error.Message, StringComparison.Ordinal);
        if (password is not null)
        {
            Assert.DoesNotContain(password, error.ToString(), StringComparison.Ordinal);
        }

        Assert.Equal(before, await AdminStateAsync(db, admin));
    }

    [Fact]
    public async Task A_reset_for_an_unknown_email_creates_only_a_first_admin()
    {
        // Empty database: the first admin is created exactly as without the flag.
        await using var db = await postgres.CreateEmptyDatabaseAsync("Production", ResetSettings("true"));
        await db.SeedAgainAsync();
        var admin = await db.DbAsync(c => c.Users.AsNoTracking().SingleAsync(Ct));
        Assert.Equal(Owner, admin.Email);
        Assert.True(admin.MustChangePassword);

        // An admin exists under another address: nothing is reset and no second admin appears.
        var logs = await db.SeedAgainAsync(ResetSettings("true", email: "someone-else@pharma.test"));

        Assert.Equal(admin.PasswordHash, (await db.DbAsync(c => c.Users.AsNoTracking().SingleAsync(Ct))).PasswordHash);
        Assert.Single(logs, l => l.Category == SeederCategory && l.Level == LogLevel.Warning &&
                                 l.Message.Contains("Seed__ResetAdminPassword", StringComparison.Ordinal));
    }

    /// <summary>
    /// The production admin after the first sign-in: own password, locked out after failed attempts,
    /// two live sessions and one that already ended. A second user has a live session of their own.
    /// </summary>
    private static async Task<(Guid Admin, Guid Other)> LockedOutAdminWithSessionsAsync(TestDatabase db)
    {
        await db.SeedAgainAsync();
        var admin = await db.UserIdAsync(Owner);
        await db.As<AccountService>(admin, s => s.ChangePasswordAsync(new ChangePasswordRequest("Initial-Pass-2026", ForgottenPassword), Ct));

        var other = await db.AsAsync(admin, async sp =>
        {
            var user = new User { Email = "rep@pharma.test", UserName = "rep@pharma.test", FullName = "Rep", CreatedAt = DateTimeOffset.UtcNow };
            Assert.True((await sp.GetRequiredService<UserManager<User>>().CreateAsync(user, "Rep-Pass-2026x")).Succeeded);
            return user.Id;
        });

        var now = DateTimeOffset.UtcNow;
        await db.DbAsync(async c =>
        {
            c.RefreshTokens.AddRange(Session(admin, now), Session(admin, now), Session(admin, now, "logout"), Session(other, now));
            await c.SaveChangesAsync(Ct);
            return await c.Users.Where(u => u.Id == admin).ExecuteUpdateAsync(s => s
                .SetProperty(u => u.LockoutEnd, now.AddMinutes(15))
                .SetProperty(u => u.AccessFailedCount, 3), Ct);
        });

        Assert.False(await CanSignInAsync(db, admin, ForgottenPassword));
        return (admin, other);
    }

    private static RefreshToken Session(Guid userId, DateTimeOffset now, string? revokedReason = null) => new()
    {
        UserId = userId,
        TokenHash = Guid.NewGuid().ToString("N"),
        FamilyId = Guid.CreateVersion7(),
        Client = ClientKind.Web,
        CreatedAt = now,
        ExpiresAt = now.AddDays(30),
        RevokedAt = revokedReason is null ? null : now,
        RevokedReason = revokedReason,
    };

    /// <summary>The checks sign-in makes before issuing a session.</summary>
    private static Task<bool> CanSignInAsync(TestDatabase db, Guid userId, string password) =>
        db.AsAsync(userId, async sp =>
        {
            var users = sp.GetRequiredService<UserManager<User>>();
            var user = await users.FindByIdAsync(userId.ToString());
            return user is { IsActive: true } && !await users.IsLockedOutAsync(user) && await users.CheckPasswordAsync(user, password);
        });

    private sealed record AdminState(
        string? PasswordHash, string? SecurityStamp, bool MustChangePassword, DateTimeOffset? LockoutEnd, int AccessFailedCount, int LiveSessions, int Resets);

    private static Task<AdminState> AdminStateAsync(TestDatabase db, Guid admin) => db.DbAsync(async c =>
    {
        var user = await c.Users.AsNoTracking().SingleAsync(u => u.Id == admin, Ct);
        return new AdminState(
            user.PasswordHash, user.SecurityStamp, user.MustChangePassword, user.LockoutEnd, user.AccessFailedCount,
            await c.RefreshTokens.CountAsync(t => t.UserId == admin && t.RevokedAt == null, Ct),
            await c.UserAuditEntries.CountAsync(e => e.UserId == admin && e.Action == UserAuditAction.PasswordReset, Ct));
    });

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
