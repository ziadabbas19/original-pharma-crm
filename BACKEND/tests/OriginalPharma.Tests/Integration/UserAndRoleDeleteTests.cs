using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common.Bulk;
using OriginalPharma.Application.Identity;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Tests.Integration;

[Collection(PostgresCollection.Name)]
public sealed class UserAndRoleDeleteTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static Task<BulkResult> DeleteUsersAsync(TestDatabase db, Guid actor, params Guid[] ids) =>
        db.UsersAsync(actor, s => s.DeleteManyAsync(new BulkDeleteRequest(ids), Ct));

    [Fact]
    public async Task Each_user_is_checked_on_its_own_and_blocked_rows_say_why()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);

        // A fresh account with no activity, below the supervisor.
        var area = await TerritoryOfAsync(db, p.Rep);
        var newbie = (await db.UsersAsync(p.Admin, s => s.CreateAsync(new CreateUserRequest(
            "new.rep@test.local", "New Rep", PostgresFixture.Password, [DefaultRoles.Rep], p.Supervisor, area), Ct))).User.Id;

        // The area manager gets users:delete with territory scope.
        await db.GrantAsync(p.Admin, DefaultRoles.AreaManager, (Permissions.Users.Delete, PermissionScope.Territory));

        var result = await DeleteUsersAsync(db, p.Area, p.Area, p.Sales, p.Supervisor, newbie, p.Rep, p.Admin);
        string? Code(Guid id) => result.Items.Single(i => i.Id == id).Code;
        BulkOutcome Outcome(Guid id) => result.Items.Single(i => i.Id == id).Outcome;

        Assert.Equal(BulkCodes.Self, Code(p.Area));
        Assert.Equal(BulkCodes.OutOfScope, Code(p.Sales)); // region-level user, outside the area
        Assert.Equal(BulkCodes.UserHasReports, Code(p.Supervisor)); // rep.east still reports to them
        Assert.Equal(BulkCodes.OutOfScope, Code(p.Admin));
        Assert.Equal(BulkOutcome.Deleted, Outcome(newbie)); // no activity: removed
        Assert.Equal(BulkOutcome.Archived, Outcome(p.Rep)); // orders and visits: archived

        Assert.False(await db.DbAsync(c => c.Users.AnyAsync(u => u.Id == newbie, Ct)));
        var rep = await db.DbAsync(c => c.Users.SingleAsync(u => u.Id == p.Rep, Ct));
        Assert.False(rep.IsActive);
        Assert.NotNull(rep.ArchivedAt);
        Assert.False((await db.EffectivePermissionsAsync(p.Rep)).Has(Permissions.Orders.Create));
        Assert.True(await db.DbAsync(c => c.UserAuditEntries.AnyAsync(e => e.UserId == p.Rep && e.Action == UserAuditAction.Archived, Ct)));
        Assert.True(await db.DbAsync(c => c.UserAuditEntries.AnyAsync(e => e.UserId == newbie && e.Action == UserAuditAction.Deleted, Ct)));

        // Archived users leave the list (and its pickers) but appear with the archived filter.
        var listed = await db.UsersAsync(p.Admin, s => s.ListAsync(cancellationToken: Ct));
        Assert.DoesNotContain(listed, u => u.Id == p.Rep);
        var archived = await db.UsersAsync(p.Admin, s => s.ListAsync(archived: true, Ct));
        Assert.Equal([p.Rep], archived.Select(u => u.Id));

        // Higher level: a supervisor with users:delete still cannot touch the area manager.
        await db.GrantAsync(p.Admin, DefaultRoles.Supervisor, (Permissions.Users.Delete, PermissionScope.All));
        var upward = await DeleteUsersAsync(db, p.Supervisor, p.Area);
        Assert.Equal(BulkCodes.UserLevelTooHigh, upward.Items.Single().Code);

        // Restore brings the rep back and lets them sign in again.
        await db.GrantAsync(p.Admin, DefaultRoles.AreaManager, (Permissions.Users.Restore, PermissionScope.Territory));
        var restored = await db.UsersAsync(p.Area, s => s.RestoreManyAsync(new BulkIdsRequest([p.Rep]), Ct));
        Assert.Equal(1, restored.Restored);
        Assert.True((await db.EffectivePermissionsAsync(p.Rep)).Has(Permissions.Orders.Create));
    }

    [Fact]
    public async Task A_team_goes_together_but_the_last_admin_never_goes()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);

        // Supervisor and both reps in one request: reps first, then the supervisor has nobody left.
        var team = await DeleteUsersAsync(db, p.Admin, p.Supervisor, p.Rep, p.RepEast);
        Assert.Equal(0, team.Blocked);

        // A dry run for the only admin is blocked as well, and nothing changes.
        var dry = await db.UsersAsync(p.Admin, s => s.DeleteManyAsync(new BulkDeleteRequest([p.Admin], DryRun: true), Ct));
        Assert.Equal(BulkCodes.Self, dry.Items.Single().Code);

        // Someone at the top level without the Admin role may delete admins, but never the last active one.
        var owner = await db.RolesAsync(p.Admin, s => s.CreateRoleAsync(new CreateRoleRequest("مالك", "Owner", Level: 0), Ct));
        await db.GrantAsync(p.Admin, owner.Key, (Permissions.Users.Delete, PermissionScope.All));
        var ownerUser = (await db.UsersAsync(p.Admin, s => s.CreateAsync(new CreateUserRequest(
            "owner@test.local", "Owner", PostgresFixture.Password, [owner.Key]), Ct))).User.Id;
        var second = (await db.UsersAsync(p.Admin, s => s.CreateAsync(new CreateUserRequest(
            "admin2@test.local", "Second Admin", PostgresFixture.Password, [DefaultRoles.Admin]), Ct))).User.Id;

        var admins = await DeleteUsersAsync(db, ownerUser, p.Admin, second);
        Assert.Equal(BulkOutcome.Archived, admins.Items.Single(i => i.Id == p.Admin).Outcome);
        Assert.Equal(BulkCodes.LastAdmin, admins.Items.Single(i => i.Id == second).Code);
        Assert.True(await db.DbAsync(c => c.Users.AnyAsync(u => u.Id == second && u.IsActive, Ct)));
    }

    [Fact]
    public async Task Roles_are_deleted_one_by_one_with_system_and_in_use_roles_blocked()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var empty = await db.RolesAsync(p.Admin, s => s.CreateRoleAsync(new CreateRoleRequest("دور مؤقت", "Temporary", Level: 45), Ct));
        var used = await db.RolesAsync(p.Admin, s => s.CreateRoleAsync(new CreateRoleRequest("دور مستخدم", "Used role", Level: 45), Ct));
        await db.UsersAsync(p.Admin, s => s.SetRolesAsync(p.RepEast, new SetUserRolesRequest([DefaultRoles.Rep, used.Key]), Ct));
        var system = await db.RoleAsync(DefaultRoles.Rep);

        var result = await db.RolesAsync(p.Admin, s => s.DeleteManyAsync(new BulkDeleteRequest([empty.Id, used.Id, system.Id]), Ct));
        Assert.Equal(BulkOutcome.Deleted, result.Items.Single(i => i.Id == empty.Id).Outcome);
        var inUse = result.Items.Single(i => i.Id == used.Id);
        Assert.Equal((BulkCodes.RoleInUse, 1), (inUse.Code, inUse.UsageCount));
        Assert.Equal(BulkCodes.SystemRole, result.Items.Single(i => i.Id == system.Id).Code);

        // The supervisor (level 30) cannot delete a role above or at their level.
        await db.GrantAsync(p.Admin, DefaultRoles.Supervisor, (Permissions.Roles.Manage, PermissionScope.Team));
        var high = await db.RolesAsync(p.Admin, s => s.CreateRoleAsync(new CreateRoleRequest("دور عال", "High role", Level: 25), Ct));
        var blocked = await db.RolesAsync(p.Supervisor, s => s.DeleteManyAsync(new BulkDeleteRequest([high.Id]), Ct));
        Assert.Equal(BulkCodes.RoleLevelTooHigh, blocked.Items.Single().Code);

        var audit = await db.RolesAsync(p.Admin, s => s.GetAuditAsync(empty.Id, new RoleAuditQuery(), Ct));
        Assert.Contains(audit, e => e.Action == RoleAuditAction.Deleted);
    }

    private static Task<Guid> TerritoryOfAsync(TestDatabase db, Guid userId) =>
        db.DbAsync(c => c.Users.Where(u => u.Id == userId).Select(u => u.TerritoryId!.Value).SingleAsync(Ct));
}
