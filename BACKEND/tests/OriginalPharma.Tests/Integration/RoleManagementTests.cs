using Microsoft.Extensions.DependencyInjection;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Identity;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Tests.Integration;

[Collection(PostgresCollection.Name)]
public sealed class RoleManagementTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Renaming_a_system_role_keeps_its_key_audits_and_bumps_its_users()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var admin = await db.UserIdAsync(PostgresFixture.AdminEmail);
        var rep = await db.UserIdAsync("rep@demo.local");
        var role = await db.RoleAsync(DefaultRoles.Rep);
        var versionBefore = await db.PermissionsVersionAsync(rep);

        var renamed = await db.RolesAsync(admin, s => s.UpdateRoleAsync(
            role.Id, new UpdateRoleRequest("مندوب ميداني", "Field rep", "Visits doctors and pharmacies", role.Level), Ct));

        Assert.Equal(DefaultRoles.Rep, renamed.Key);
        Assert.Equal("Field rep", renamed.NameEn);
        Assert.Equal("مندوب ميداني", renamed.NameAr);
        Assert.True(renamed.IsSystem);
        Assert.True(await db.PermissionsVersionAsync(rep) > versionBefore);

        // The rep's profile shows the new name; code and tokens keep using the key.
        var profileRoles = await db.AsAsync(rep, sp => sp.GetRequiredService<IAppDbContext>().GetRoleSummariesAsync(rep, Ct));
        var summary = Assert.Single(profileRoles);
        Assert.Equal((DefaultRoles.Rep, "Field rep"), (summary.Key, summary.NameEn));

        var audit = await db.RolesAsync(admin, s => s.GetAuditAsync(role.Id, new RoleAuditQuery(), Ct));
        var entry = Assert.Single(audit);
        Assert.Equal(RoleAuditAction.Updated, entry.Action);
        Assert.Equal(admin, entry.ActorId);
        Assert.Contains(entry.Changes, c => c is { Field: "nameEn", Before: "Medical rep", After: "Field rep" });
        Assert.Contains(entry.Changes, c => c is { Field: "nameAr", After: "مندوب ميداني" });
    }

    [Fact]
    public async Task Creating_a_role_with_copy_generates_a_key_and_copies_permissions()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var admin = await db.UserIdAsync(PostgresFixture.AdminEmail);
        var rep = await db.RoleAsync(DefaultRoles.Rep);

        var created = await db.RolesAsync(admin, s => s.CreateRoleAsync(
            new CreateRoleRequest("زائر جودة", "QA visitor", "Quality checks", 45, rep.Id), Ct));

        Assert.Equal("QAVisitor", created.Key);
        Assert.False(created.IsSystem);
        Assert.False(created.PermissionsLocked);
        Assert.Equal(45, created.Level);
        Assert.Equal(0, created.UserCount);
        Assert.Equal(rep.Permissions.OrderBy(p => p.Key), created.Permissions.OrderBy(p => p.Key));

        // Same English name is refused; a different name with the same slug gets a suffix.
        var duplicate = await Assert.ThrowsAsync<ConflictException>(() => db.RolesAsync(admin, s => s.CreateRoleAsync(
            new CreateRoleRequest("زائر آخر", "qa visitor"), Ct)));
        Assert.Equal(IdentityErrorCodes.RoleNameTaken, duplicate.Code);

        var second = await db.RolesAsync(admin, s => s.CreateRoleAsync(new CreateRoleRequest("زائر جودة 2", "Q.A. Visitor", Level: 46), Ct));
        Assert.Equal("QAVisitor2", second.Key);
        Assert.Empty(second.Permissions);

        var audit = await db.RolesAsync(admin, s => s.GetAuditAsync(created.Id, new RoleAuditQuery(), Ct));
        var entry = Assert.Single(audit);
        Assert.Equal(RoleAuditAction.Created, entry.Action);
        Assert.Contains(entry.Changes, c => c is { Field: "copiedFrom", After: DefaultRoles.Rep });
        Assert.Contains(entry.Changes, c => c is { Field: "permission:visits:create", Before: null, After: "own" });
    }

    [Fact]
    public async Task Creating_without_a_level_puts_the_role_just_below_the_creator()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var admin = await db.UserIdAsync(PostgresFixture.AdminEmail);

        var created = await db.RolesAsync(admin, s => s.CreateRoleAsync(new CreateRoleRequest("مدقق", "Auditor"), Ct));

        Assert.Equal(1, created.Level);
    }

    [Fact]
    public async Task A_custom_role_without_users_can_be_deleted()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var admin = await db.UserIdAsync(PostgresFixture.AdminEmail);
        var role = await db.RolesAsync(admin, s => s.CreateRoleAsync(new CreateRoleRequest("مؤقت", "Temporary", Level: 50), Ct));

        await db.RolesAsync(admin, async s =>
        {
            await s.DeleteRoleAsync(role.Id, Ct);
            return true;
        });

        Assert.DoesNotContain(await db.AllRolesAsync(), r => r.Id == role.Id);
        var audit = await db.RolesAsync(admin, s => s.GetAuditAsync(role.Id, new RoleAuditQuery(), Ct));
        Assert.Equal([RoleAuditAction.Deleted, RoleAuditAction.Created], audit.Select(e => e.Action));
    }

    [Fact]
    public async Task Deleting_a_role_with_users_is_refused_with_the_user_count()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var admin = await db.UserIdAsync(PostgresFixture.AdminEmail);
        var rep = await db.UserIdAsync("rep@demo.local");
        var role = await db.RolesAsync(admin, s => s.CreateRoleAsync(new CreateRoleRequest("مدرب", "Trainer", Level: 45), Ct));
        await db.UsersAsync(admin, s => s.SetRolesAsync(rep, new SetUserRolesRequest([DefaultRoles.Rep, role.Key]), Ct));

        var error = await Assert.ThrowsAsync<ConflictException>(() => db.RolesAsync(admin, async s =>
        {
            await s.DeleteRoleAsync(role.Id, Ct);
            return true;
        }));

        Assert.Equal(IdentityErrorCodes.RoleInUse, error.Code);
        Assert.Equal(1, error.Details!["userCount"]);
        Assert.Contains(await db.AllRolesAsync(), r => r.Id == role.Id);
    }

    [Fact]
    public async Task System_roles_cannot_be_deleted()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var admin = await db.UserIdAsync(PostgresFixture.AdminEmail);
        var supervisor = await db.RoleAsync(DefaultRoles.Supervisor);

        var error = await Assert.ThrowsAsync<BusinessRuleException>(() => db.RolesAsync(admin, async s =>
        {
            await s.DeleteRoleAsync(supervisor.Id, Ct);
            return true;
        }));

        Assert.Equal(IdentityErrorCodes.SystemRole, error.Code);
    }

    [Fact]
    public async Task Reassigning_moves_every_user_bumps_their_versions_and_then_allows_delete()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var admin = await db.UserIdAsync(PostgresFixture.AdminEmail);
        var rep = await db.UserIdAsync("rep@demo.local");
        var supervisor = await db.UserIdAsync("supervisor@demo.local");
        var trainer = await db.RolesAsync(admin, s => s.CreateRoleAsync(new CreateRoleRequest("مدرب", "Trainer", Level: 45), Ct));
        var repRole = await db.RoleAsync(DefaultRoles.Rep);

        // One user already holds the target role, the other does not.
        await db.UsersAsync(admin, s => s.SetRolesAsync(rep, new SetUserRolesRequest([DefaultRoles.Rep, trainer.Key]), Ct));
        var newcomer = await db.UsersAsync(admin, s => s.CreateAsync(new CreateUserRequest(
            "newcomer@demo.local", "New Trainer", PostgresFixture.Password, [trainer.Key], supervisor), Ct));
        var repVersion = await db.PermissionsVersionAsync(rep);
        var newcomerVersion = await db.PermissionsVersionAsync(newcomer.User.Id);

        var result = await db.RolesAsync(admin, s => s.ReassignUsersAsync(trainer.Id, new ReassignRoleUsersRequest(repRole.Id), Ct));

        Assert.Equal(2, result.MovedCount);
        Assert.Equal(0, (await db.RoleAsync(trainer.Key)).UserCount);
        Assert.Equal(repRole.UserCount + 1, (await db.RoleAsync(DefaultRoles.Rep)).UserCount);
        Assert.True(await db.PermissionsVersionAsync(rep) > repVersion);
        Assert.True(await db.PermissionsVersionAsync(newcomer.User.Id) > newcomerVersion);

        var audit = await db.RolesAsync(admin, s => s.GetAuditAsync(repRole.Id, new RoleAuditQuery(), Ct));
        var moved = Assert.Single(audit, e => e.Action == RoleAuditAction.UsersReassigned);
        Assert.Contains(moved.Changes, c => c is { Field: "reassign", Before: "Trainer", After: DefaultRoles.Rep });
        Assert.Contains(moved.Changes, c => c is { Field: "sourceName", Before: "مدرب", After: "Trainer" });
        Assert.Contains(moved.Changes, c => c is { Field: "userCount", After: "2" });

        await db.RolesAsync(admin, async s =>
        {
            await s.DeleteRoleAsync(trainer.Id, Ct);
            return true;
        });
        Assert.DoesNotContain(await db.AllRolesAsync(), r => r.Id == trainer.Id);
    }

    [Fact]
    public async Task Admin_permissions_and_level_are_locked_but_it_can_be_renamed()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var admin = await db.UserIdAsync(PostgresFixture.AdminEmail);
        var adminRole = await db.RoleAsync(DefaultRoles.Admin);

        Assert.True(adminRole.PermissionsLocked);
        Assert.Contains(adminRole.Permissions, p => p is { Key: Permissions.Roles.Manage, Scope: PermissionScope.All });
        Assert.Contains(adminRole.Permissions, p => p is { Key: Permissions.Users.Manage, Scope: PermissionScope.All });

        var permissions = await Assert.ThrowsAsync<BusinessRuleException>(() => db.RolesAsync(admin, s =>
            s.SetPermissionsAsync(adminRole.Id, new SetRolePermissionsRequest([]), Ct)));
        Assert.Equal(IdentityErrorCodes.AdminRoleLocked, permissions.Code);

        var level = await Assert.ThrowsAsync<BusinessRuleException>(() => db.RolesAsync(admin, s =>
            s.UpdateRoleAsync(adminRole.Id, new UpdateRoleRequest(adminRole.NameAr, adminRole.NameEn, null, 5), Ct)));
        Assert.Equal(IdentityErrorCodes.AdminRoleLocked, level.Code);

        var renamed = await db.RolesAsync(admin, s =>
            s.UpdateRoleAsync(adminRole.Id, new UpdateRoleRequest("الإدارة", "Administration", null, 0), Ct));
        Assert.Equal((DefaultRoles.Admin, "Administration"), (renamed.Key, renamed.NameEn));
    }

    [Fact]
    public async Task The_last_admin_cannot_lose_the_admin_role()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var admin = await db.UserIdAsync(PostgresFixture.AdminEmail);
        var adminRole = await db.RoleAsync(DefaultRoles.Admin);
        var salesRole = await db.RoleAsync(DefaultRoles.SalesManager);

        // A second top-level user who does not hold Admin themselves.
        var root = await db.RolesAsync(admin, s => s.CreateRoleAsync(new CreateRoleRequest("جذر", "Root", Level: 0, CopyFromRoleId: adminRole.Id), Ct));
        var rootUser = await db.UsersAsync(admin, s => s.CreateAsync(new CreateUserRequest(
            "root@test.local", "Root User", PostgresFixture.Password, [root.Key]), Ct));

        var setRoles = await Assert.ThrowsAsync<BusinessRuleException>(() => db.UsersAsync(rootUser.User.Id, s =>
            s.SetRolesAsync(admin, new SetUserRolesRequest([DefaultRoles.SalesManager]), Ct)));
        Assert.Equal(IdentityErrorCodes.LastAdmin, setRoles.Code);

        var reassign = await Assert.ThrowsAsync<BusinessRuleException>(() => db.RolesAsync(rootUser.User.Id, s =>
            s.ReassignUsersAsync(adminRole.Id, new ReassignRoleUsersRequest(salesRole.Id), Ct)));
        Assert.Equal(IdentityErrorCodes.LastAdmin, reassign.Code);

        // Once a second admin exists, the first one can lose the role.
        await db.UsersAsync(admin, s => s.CreateAsync(new CreateUserRequest(
            "second.admin@test.local", "Second Admin", PostgresFixture.Password, [DefaultRoles.Admin]), Ct));
        await db.UsersAsync(rootUser.User.Id, s => s.SetRolesAsync(admin, new SetUserRolesRequest([DefaultRoles.SalesManager]), Ct));
        Assert.Equal(1, (await db.RoleAsync(DefaultRoles.Admin)).UserCount);
    }

    [Fact]
    public async Task Nobody_can_edit_their_own_roles_or_overrides_or_lock_themselves_out()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var admin = await db.UserIdAsync(PostgresFixture.AdminEmail);
        var adminRole = await db.RoleAsync(DefaultRoles.Admin);

        var ownRoles = await Assert.ThrowsAsync<ForbiddenException>(() => db.UsersAsync(admin, s =>
            s.SetRolesAsync(admin, new SetUserRolesRequest([DefaultRoles.Rep]), Ct)));
        Assert.Equal(IdentityErrorCodes.SelfEditForbidden, ownRoles.Code);

        var ownOverrides = await Assert.ThrowsAsync<ForbiddenException>(() => db.UsersAsync(admin, s =>
            s.SetOverridesAsync(admin, new SetPermissionOverridesRequest([]), Ct)));
        Assert.Equal(IdentityErrorCodes.SelfEditForbidden, ownOverrides.Code);

        // A top-level user whose only role is a custom one cannot strip that role's admin rights or rank.
        var root = await db.RolesAsync(admin, s => s.CreateRoleAsync(new CreateRoleRequest("جذر", "Root", Level: 0, CopyFromRoleId: adminRole.Id), Ct));
        var rootUser = await db.UsersAsync(admin, s => s.CreateAsync(new CreateUserRequest(
            "root@test.local", "Root User", PostgresFixture.Password, [root.Key]), Ct));
        var withoutRolesManage = root.Permissions.Where(p => p.Key != Permissions.Roles.Manage).ToList();

        var lockout = await Assert.ThrowsAsync<BusinessRuleException>(() => db.RolesAsync(rootUser.User.Id, s =>
            s.SetPermissionsAsync(root.Id, new SetRolePermissionsRequest(withoutRolesManage), Ct)));
        Assert.Equal(IdentityErrorCodes.SelfLockout, lockout.Code);

        var demote = await Assert.ThrowsAsync<BusinessRuleException>(() => db.RolesAsync(rootUser.User.Id, s =>
            s.UpdateRoleAsync(root.Id, new UpdateRoleRequest(root.NameAr, root.NameEn, null, 5), Ct)));
        Assert.Equal(IdentityErrorCodes.SelfLockout, demote.Code);

        // Someone else may still do it.
        await db.RolesAsync(admin, s => s.SetPermissionsAsync(root.Id, new SetRolePermissionsRequest(withoutRolesManage), Ct));
    }

    [Fact]
    public async Task A_permission_change_applies_on_the_users_next_request()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var admin = await db.UserIdAsync(PostgresFixture.AdminEmail);
        var rep = await db.UserIdAsync("rep@demo.local");

        var before = await db.EffectivePermissionsAsync(rep);
        Assert.False(before.Has(Permissions.Users.Read));

        await db.GrantAsync(admin, DefaultRoles.Rep, (Permissions.Users.Read, PermissionScope.Own));

        var after = await db.EffectivePermissionsAsync(rep);
        Assert.True(after.Version > before.Version);
        Assert.Equal(PermissionScope.Own, after.ScopeOf(Permissions.Users.Read));
    }

    [Fact]
    public async Task Seeding_again_never_overwrites_renamed_relevelled_or_edited_roles()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var admin = await db.UserIdAsync(PostgresFixture.AdminEmail);
        var sales = await db.RoleAsync(DefaultRoles.SalesManager);
        var supervisor = await db.RoleAsync(DefaultRoles.Supervisor);
        var countBefore = (await db.AllRolesAsync()).Count;

        await db.RolesAsync(admin, s => s.UpdateRoleAsync(sales.Id, new UpdateRoleRequest("رئيس المبيعات", "Head of sales", "Renamed", 15), Ct));
        await db.RolesAsync(admin, s => s.UpdateRoleAsync(supervisor.Id, new UpdateRoleRequest(supervisor.NameAr, supervisor.NameEn, null, 32), Ct));
        var trimmed = sales.Permissions.Where(p => p.Key != Permissions.Reports.Read).ToList();
        await db.RolesAsync(admin, s => s.SetPermissionsAsync(sales.Id, new SetRolePermissionsRequest(trimmed), Ct));

        await db.SeedAgainAsync();
        await db.SeedAgainAsync();

        var roles = await db.AllRolesAsync();
        Assert.Equal(countBefore, roles.Count);
        var salesAfter = roles.Single(r => r.Key == DefaultRoles.SalesManager);
        Assert.Equal(("Head of sales", "رئيس المبيعات", "Renamed", 15), (salesAfter.NameEn, salesAfter.NameAr, salesAfter.Description, salesAfter.Level));
        Assert.DoesNotContain(salesAfter.Permissions, p => p.Key == Permissions.Reports.Read);
        Assert.Equal(32, roles.Single(r => r.Key == DefaultRoles.Supervisor).Level);
        Assert.All(roles.Where(r => DefaultRoles.Templates.Any(t => t.Key == r.Key)), r => Assert.True(r.IsSystem));
        Assert.Equal(Permissions.All.Count, roles.Single(r => r.Key == DefaultRoles.Admin).Permissions.Count);
    }
}
