using OriginalPharma.Application.Common;
using OriginalPharma.Application.Identity;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Tests.Integration;

/// <summary>
/// Privilege-escalation rules and reporting lines, exercised with the demo hierarchy:
/// sales manager (10) &lt;- area manager (20) &lt;- supervisor (30) &lt;- rep (40).
/// The area manager and supervisor are given role and user administration rights first.
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class RoleHierarchyTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private sealed record People(Guid Admin, Guid Sales, Guid Area, Guid Supervisor, Guid Rep);

    private static async Task<People> SetUpAsync(TestDatabase db)
    {
        var people = new People(
            await db.UserIdAsync(PostgresFixture.AdminEmail),
            await db.UserIdAsync("sales.manager@demo.local"),
            await db.UserIdAsync("area.manager@demo.local"),
            await db.UserIdAsync("supervisor@demo.local"),
            await db.UserIdAsync("rep@demo.local"));

        await db.GrantAsync(people.Admin, DefaultRoles.AreaManager,
            (Permissions.Roles.Read, PermissionScope.Territory),
            (Permissions.Roles.Manage, PermissionScope.Territory),
            (Permissions.Users.Manage, PermissionScope.Territory),
            (Permissions.Users.Create, PermissionScope.Territory));
        await db.GrantAsync(people.Admin, DefaultRoles.Supervisor,
            (Permissions.Roles.Read, PermissionScope.Team),
            (Permissions.Roles.Manage, PermissionScope.Team),
            (Permissions.Users.Manage, PermissionScope.Team),
            (Permissions.Users.Create, PermissionScope.Team));
        return people;
    }

    private static async Task<string> RefusedAsync(Func<Task> action)
    {
        var error = await Assert.ThrowsAnyAsync<AppException>(action);
        return error.Code;
    }

    [Fact]
    public async Task An_area_manager_cannot_assign_roles_at_or_above_their_level()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await SetUpAsync(db);
        var areaTerritory = await TerritoryOfAsync(db, p.Area);

        Assert.Equal(IdentityErrorCodes.RoleLevelTooHigh, await RefusedAsync(() => db.UsersAsync(p.Area, s =>
            s.SetRolesAsync(p.Rep, new SetUserRolesRequest([DefaultRoles.Rep, DefaultRoles.SalesManager]), Ct))));
        Assert.Equal(IdentityErrorCodes.RoleLevelTooHigh, await RefusedAsync(() => db.UsersAsync(p.Area, s =>
            s.SetRolesAsync(p.Rep, new SetUserRolesRequest([DefaultRoles.AreaManager]), Ct))));
        Assert.Equal(IdentityErrorCodes.RoleLevelTooHigh, await RefusedAsync(() => db.UsersAsync(p.Area, s =>
            s.CreateAsync(new CreateUserRequest("boss@demo.local", "Boss", PostgresFixture.Password, [DefaultRoles.SalesManager],
                TerritoryId: areaTerritory), Ct))));
    }

    [Fact]
    public async Task Nobody_can_grant_a_permission_or_scope_broader_than_their_own()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await SetUpAsync(db);
        var supervisorRole = await db.RoleAsync(DefaultRoles.Supervisor);
        var repRole = await db.RoleAsync(DefaultRoles.Rep);

        // customers:read is held with Territory scope; All is broader.
        var widened = supervisorRole.Permissions
            .Select(g => g.Key == Permissions.Customers.Read ? g with { Scope = PermissionScope.All } : g).ToList();
        Assert.Equal(IdentityErrorCodes.ScopeTooBroad, await RefusedAsync(() => db.RolesAsync(p.Area, s =>
            s.SetPermissionsAsync(supervisorRole.Id, new SetRolePermissionsRequest(widened), Ct))));

        // territories:manage is not held at all.
        Assert.Equal(IdentityErrorCodes.ScopeTooBroad, await RefusedAsync(() => db.RolesAsync(p.Area, s =>
            s.SetPermissionsAsync(repRole.Id, new SetRolePermissionsRequest(
                [.. repRole.Permissions, new PermissionGrantDto(Permissions.Territories.Manage, PermissionScope.Own)]), Ct))));

        // Copying a role whose grants the creator does not hold (rep's visits:create).
        Assert.Equal(IdentityErrorCodes.ScopeTooBroad, await RefusedAsync(() => db.RolesAsync(p.Area, s =>
            s.CreateRoleAsync(new CreateRoleRequest("نسخة", "Rep copy", Level: 45, CopyFromRoleId: repRole.Id), Ct))));

        // Overrides follow the same rule.
        Assert.Equal(IdentityErrorCodes.ScopeTooBroad, await RefusedAsync(() => db.UsersAsync(p.Area, s =>
            s.SetOverridesAsync(p.Rep, new SetPermissionOverridesRequest(
                [new PermissionOverrideDto(Permissions.Users.Read, true, PermissionScope.All, null, null)]), Ct))));
    }

    [Fact]
    public async Task Roles_at_or_above_your_level_cannot_be_created_renamed_or_moved_up()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await SetUpAsync(db);
        var sales = await db.RoleAsync(DefaultRoles.SalesManager);
        var area = await db.RoleAsync(DefaultRoles.AreaManager);
        var supervisor = await db.RoleAsync(DefaultRoles.Supervisor);

        Assert.Equal(IdentityErrorCodes.RoleLevelTooHigh, await RefusedAsync(() => db.RolesAsync(p.Area, s =>
            s.CreateRoleAsync(new CreateRoleRequest("نظير", "Peer", Level: 20), Ct))));
        Assert.Equal(IdentityErrorCodes.RoleLevelTooHigh, await RefusedAsync(() => db.RolesAsync(p.Area, s =>
            s.CreateRoleAsync(new CreateRoleRequest("أعلى", "Above", Level: 5), Ct))));
        Assert.Equal(IdentityErrorCodes.RoleLevelTooHigh, await RefusedAsync(() => db.RolesAsync(p.Area, s =>
            s.UpdateRoleAsync(sales.Id, new UpdateRoleRequest(sales.NameAr, "Sales boss", null, sales.Level), Ct))));
        Assert.Equal(IdentityErrorCodes.RoleLevelTooHigh, await RefusedAsync(() => db.RolesAsync(p.Area, s =>
            s.UpdateRoleAsync(area.Id, new UpdateRoleRequest(area.NameAr, "My own role", null, area.Level), Ct))));
        Assert.Equal(IdentityErrorCodes.RoleLevelTooHigh, await RefusedAsync(() => db.RolesAsync(p.Area, s =>
            s.UpdateRoleAsync(supervisor.Id, new UpdateRoleRequest(supervisor.NameAr, supervisor.NameEn, null, 15), Ct))));
        Assert.Equal(IdentityErrorCodes.RoleLevelTooHigh, await RefusedAsync(() => db.RolesAsync(p.Supervisor, s =>
            s.SetPermissionsAsync(supervisor.Id, new SetRolePermissionsRequest(supervisor.Permissions), Ct))));
    }

    [Fact]
    public async Task Nobody_can_edit_their_own_roles_overrides_or_reporting_line()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await SetUpAsync(db);

        Assert.Equal(IdentityErrorCodes.SelfEditForbidden, await RefusedAsync(() => db.UsersAsync(p.Area, s =>
            s.SetRolesAsync(p.Area, new SetUserRolesRequest([DefaultRoles.AreaManager, DefaultRoles.Supervisor]), Ct))));
        Assert.Equal(IdentityErrorCodes.SelfEditForbidden, await RefusedAsync(() => db.UsersAsync(p.Area, s =>
            s.SetOverridesAsync(p.Area, new SetPermissionOverridesRequest([]), Ct))));
        Assert.Equal(IdentityErrorCodes.SelfEditForbidden, await RefusedAsync(() => db.UsersAsync(p.Supervisor, s =>
            s.UpdateAsync(p.Supervisor, new UpdateUserRequest("Me", null, null), Ct))));
    }

    [Fact]
    public async Task Users_at_or_above_your_level_cannot_be_managed()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await SetUpAsync(db);
        var territory = await TerritoryOfAsync(db, p.Supervisor);

        // A second area manager in the same area is a peer, not a report.
        var peer = await db.UsersAsync(p.Admin, s => s.CreateAsync(new CreateUserRequest(
            "peer.area@demo.local", "Peer Area", PostgresFixture.Password, [DefaultRoles.AreaManager], p.Sales, territory), Ct));

        Assert.Equal(IdentityErrorCodes.UserLevelTooHigh, await RefusedAsync(() => db.UsersAsync(p.Area, s =>
            s.SetOverridesAsync(peer.User.Id, new SetPermissionOverridesRequest(
                [new PermissionOverrideDto(Permissions.Visits.Read, false, null, null, "sabotage")]), Ct))));
    }

    [Fact]
    public async Task Reporting_lines_cannot_loop_and_managers_must_outrank_their_reports()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await SetUpAsync(db);
        var supervisorRole = await db.RoleAsync(DefaultRoles.Supervisor);
        var territory = await TerritoryOfAsync(db, p.Rep);

        Assert.Equal(IdentityErrorCodes.ManagerCycle, await RefusedAsync(() => db.UsersAsync(p.Admin, s =>
            s.UpdateAsync(p.Sales, new UpdateUserRequest("Demo Sales Manager", p.Rep, null, "en"), Ct))));
        Assert.Equal(IdentityErrorCodes.ManagerCycle, await RefusedAsync(() => db.UsersAsync(p.Admin, s =>
            s.UpdateAsync(p.Rep, new UpdateUserRequest("Demo Rep", p.Rep, territory), Ct))));

        var otherRep = await db.UsersAsync(p.Admin, s => s.CreateAsync(new CreateUserRequest(
            "rep2@demo.local", "Second Rep", PostgresFixture.Password, [DefaultRoles.Rep], p.Supervisor, territory), Ct));

        // A rep cannot manage another rep, …
        Assert.Equal(IdentityErrorCodes.ManagerLevelInvalid, await RefusedAsync(() => db.UsersAsync(p.Admin, s =>
            s.UpdateAsync(p.Rep, new UpdateUserRequest("Demo Rep", otherRep.User.Id, territory), Ct))));
        // … a new user cannot report to someone on their own level, …
        Assert.Equal(IdentityErrorCodes.ManagerLevelInvalid, await RefusedAsync(() => db.UsersAsync(p.Admin, s =>
            s.CreateAsync(new CreateUserRequest("rep3@demo.local", "Third Rep", PostgresFixture.Password, [DefaultRoles.Rep], otherRep.User.Id, territory), Ct))));
        // … a promotion may not leave the manager on the same level, …
        Assert.Equal(IdentityErrorCodes.ManagerLevelInvalid, await RefusedAsync(() => db.UsersAsync(p.Admin, s =>
            s.SetRolesAsync(p.Rep, new SetUserRolesRequest([DefaultRoles.Supervisor]), Ct))));
        // … and a role cannot drop below the people its holders manage.
        Assert.Equal(IdentityErrorCodes.ManagerLevelInvalid, await RefusedAsync(() => db.RolesAsync(p.Admin, s =>
            s.UpdateRoleAsync(supervisorRole.Id, new UpdateRoleRequest(supervisorRole.NameAr, supervisorRole.NameEn, null, 45), Ct))));

        // A valid move works: the second rep reports to the area manager instead.
        var moved = await db.UsersAsync(p.Admin, s => s.UpdateAsync(otherRep.User.Id, new UpdateUserRequest("Second Rep", p.Area, territory), Ct));
        Assert.Equal(p.Area, moved.ManagerId);
    }

    [Fact]
    public async Task An_area_manager_can_manage_roles_below_them()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await SetUpAsync(db);
        var supervisorRole = await db.RoleAsync(DefaultRoles.Supervisor);
        var repRole = await db.RoleAsync(DefaultRoles.Rep);

        // Copy a role whose grants they hold, between their level and the supervisor's.
        var senior = await db.RolesAsync(p.Area, s => s.CreateRoleAsync(
            new CreateRoleRequest("مشرف أول", "Senior supervisor", Level: 25, CopyFromRoleId: supervisorRole.Id), Ct));
        Assert.Equal("SeniorSupervisor", senior.Key);
        Assert.Equal(supervisorRole.Permissions.Count, senior.Permissions.Count);

        // Default level is just below their own.
        var coordinator = await db.RolesAsync(p.Area, s => s.CreateRoleAsync(new CreateRoleRequest("منسق", "Area coordinator"), Ct));
        Assert.Equal(21, coordinator.Level);

        // Edit the rep role within their own grants; existing grants they lack stay untouched.
        var repVersion = await db.PermissionsVersionAsync(p.Rep);
        var updated = await db.RolesAsync(p.Area, s => s.SetPermissionsAsync(repRole.Id, new SetRolePermissionsRequest(
            [.. repRole.Permissions, new PermissionGrantDto(Permissions.Devices.Read, PermissionScope.Own)]), Ct));
        Assert.Contains(updated.Permissions, g => g is { Key: Permissions.Devices.Read, Scope: PermissionScope.Own });
        Assert.True(await db.PermissionsVersionAsync(p.Rep) > repVersion);

        // Rename a role below them, and give a lower role to someone in their territory.
        var trainer = await db.RolesAsync(p.Area, s => s.CreateRoleAsync(new CreateRoleRequest("مدرب ميداني", "Field trainer", Level: 35), Ct));
        await db.RolesAsync(p.Area, s => s.UpdateRoleAsync(trainer.Id, new UpdateRoleRequest("مدرب", "Trainer", "Coaches new reps", 35), Ct));
        await db.UsersAsync(p.Area, s => s.SetRolesAsync(p.Rep, new SetUserRolesRequest([DefaultRoles.Rep, trainer.Key]), Ct));
        Assert.Equal(1, (await db.RoleAsync(trainer.Key)).UserCount);
    }

    [Fact]
    public async Task A_supervisor_can_manage_lower_roles_inside_their_team_only()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await SetUpAsync(db);
        var repRole = await db.RoleAsync(DefaultRoles.Rep);

        var mentor = await db.RolesAsync(p.Supervisor, s => s.CreateRoleAsync(new CreateRoleRequest("موجه", "Mentor", Level: 35), Ct));
        await db.RolesAsync(p.Supervisor, s => s.SetPermissionsAsync(mentor.Id, new SetRolePermissionsRequest(
            [new PermissionGrantDto(Permissions.Visits.Read, PermissionScope.Team)]), Ct));
        await db.RolesAsync(p.Supervisor, s => s.SetPermissionsAsync(repRole.Id, new SetRolePermissionsRequest(
            [.. repRole.Permissions, new PermissionGrantDto(Permissions.Devices.Read, PermissionScope.Own)]), Ct));

        // Their rep is in their team; the area manager is not.
        await db.UsersAsync(p.Supervisor, s => s.SetRolesAsync(p.Rep, new SetUserRolesRequest([DefaultRoles.Rep, mentor.Key]), Ct));
        Assert.Equal("forbidden", await RefusedAsync(() => db.UsersAsync(p.Supervisor, s =>
            s.SetRolesAsync(p.Area, new SetUserRolesRequest([DefaultRoles.AreaManager, mentor.Key]), Ct))));

        // The reassign before a delete is scope-checked too.
        await db.RolesAsync(p.Supervisor, s => s.ReassignUsersAsync(mentor.Id, new ReassignRoleUsersRequest(repRole.Id), Ct));
        await db.RolesAsync(p.Supervisor, async s =>
        {
            await s.DeleteRoleAsync(mentor.Id, Ct);
            return true;
        });
    }

    [Fact]
    public async Task Seeding_again_keeps_edited_levels()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await SetUpAsync(db);
        var rep = await db.RoleAsync(DefaultRoles.Rep);
        var supervisor = await db.RoleAsync(DefaultRoles.Supervisor);

        await db.RolesAsync(p.Admin, s => s.UpdateRoleAsync(rep.Id, new UpdateRoleRequest(rep.NameAr, rep.NameEn, rep.Description, 45), Ct));
        await db.RolesAsync(p.Admin, s => s.UpdateRoleAsync(supervisor.Id, new UpdateRoleRequest(supervisor.NameAr, supervisor.NameEn, null, 33), Ct));

        await db.SeedAgainAsync();

        Assert.Equal(45, (await db.RoleAsync(DefaultRoles.Rep)).Level);
        Assert.Equal(33, (await db.RoleAsync(DefaultRoles.Supervisor)).Level);
        Assert.Equal(Role.TopLevel, (await db.RoleAsync(DefaultRoles.Admin)).Level);
    }

    private static async Task<Guid> TerritoryOfAsync(TestDatabase db, Guid userId)
    {
        var users = await db.UsersAsync(await db.UserIdAsync(PostgresFixture.AdminEmail), s => s.ListAsync(Ct));
        return users.Single(u => u.Id == userId).TerritoryId!.Value;
    }
}
