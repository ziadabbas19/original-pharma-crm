using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Scoping;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Application.Identity;

/// <summary>
/// Role administration used by the dashboard: create, rename, re-level, edit permissions,
/// move users between roles and delete. Every change is checked against the hierarchy
/// (<see cref="HierarchyGuard"/>), written to the audit trail and bumps the permissions
/// version of the role's users so it applies on their next request.
/// </summary>
public sealed class RoleService(
    IAppDbContext db,
    IPermissionService permissionService,
    HierarchyGuard guard,
    IDataScopeResolver scopeResolver,
    TimeProvider time)
{
    private static readonly Dictionary<string, PermissionScope> NoGrants = [];

    public async Task<IReadOnlyList<PermissionDto>> ListPermissionsAsync(CancellationToken cancellationToken = default) =>
        await db.Permissions.AsNoTracking()
            .OrderBy(p => p.Resource).ThenBy(p => p.Action)
            .Select(p => new PermissionDto(p.Key, p.Resource, p.Action, p.Description))
            .ToListAsync(cancellationToken);

    /// <summary>All roles, highest authority (lowest level) first.</summary>
    public Task<IReadOnlyList<RoleDto>> ListRolesAsync(CancellationToken cancellationToken = default) =>
        QueryRolesAsync(null, cancellationToken);

    public async Task<RoleDto> CreateRoleAsync(CreateRoleRequest request, CancellationToken cancellationToken = default)
    {
        var actor = await guard.GetActorAsync(cancellationToken);
        var level = request.Level ?? RoleHierarchyRules.DefaultLevelBelow(actor.Level);
        HierarchyGuard.EnsureCanManageRoleLevel(actor, level);

        var nameAr = request.NameAr.Trim();
        var nameEn = request.NameEn.Trim();
        await EnsureNamesAvailableAsync(nameAr, nameEn, null, cancellationToken);

        Role? source = null;
        var grants = NoGrants;
        if (request.CopyFromRoleId is { } sourceId)
        {
            source = await db.Roles.AsNoTracking().SingleOrDefaultAsync(r => r.Id == sourceId, cancellationToken)
                     ?? throw new NotFoundException("Role", sourceId);
            grants = await LoadGrantsAsync(sourceId, cancellationToken);
            HierarchyGuard.EnsureGrantsWithin(actor, NoGrants, grants);
        }

        var taken = (await db.Roles.Select(r => r.NormalizedName!).ToListAsync(cancellationToken)).ToHashSet();
        var role = new Role(RoleKeys.MakeUnique(RoleKeys.FromName(nameEn), taken))
        {
            NameAr = nameAr,
            NameEn = nameEn,
            Description = Clean(request.Description),
            Level = level,
            MaxDiscountPercent = request.MaxDiscountPercent,
        };

        var permissionIds = await ResolvePermissionIdsAsync(grants.Keys, cancellationToken);
        foreach (var (key, scope) in grants)
        {
            role.Permissions.Add(new RolePermission { PermissionId = permissionIds[key], Scope = scope });
        }

        db.Roles.Add(role);

        List<RoleAuditChangeDto> changes =
        [
            new("nameAr", null, role.NameAr),
            new("nameEn", null, role.NameEn),
            new("level", null, role.Level.ToString()),
        ];
        RoleAudit.AddIfChanged(changes, "description", null, role.Description);
        RoleAudit.AddIfChanged(changes, "maxDiscountPercent", null, RoleAudit.Percent(role.MaxDiscountPercent));
        if (source is not null)
        {
            changes.Add(new RoleAuditChangeDto("copiedFrom", null, source.Key));
            changes.Add(new RoleAuditChangeDto("copiedFromName", source.NameAr, source.NameEn));
        }

        changes.AddRange(RoleAudit.DiffGrants(NoGrants, grants));
        db.RoleAuditEntries.Add(RoleAudit.Entry(role, actor, RoleAuditAction.Created, changes, time.GetUtcNow()));

        await db.SaveChangesAsync(cancellationToken);

        // Nobody holds a new role yet, so no user's permissions version changes.
        return await GetRoleAsync(role.Id, cancellationToken);
    }

    /// <summary>Names, description and level. System roles can be renamed too; their key never changes.</summary>
    public async Task<RoleDto> UpdateRoleAsync(Guid roleId, UpdateRoleRequest request, CancellationToken cancellationToken = default)
    {
        var role = await FindRoleAsync(roleId, cancellationToken);
        var actor = await guard.GetActorAsync(cancellationToken);
        HierarchyGuard.EnsureCanManageRoleLevel(actor, role.Level);

        if (request.Level != role.Level)
        {
            if (DefaultRoles.HasLockedPermissions(role.Key))
            {
                throw new BusinessRuleException(IdentityErrorCodes.AdminRoleLocked, "The Admin role always stays at level 0.");
            }

            HierarchyGuard.EnsureCanManageRoleLevel(actor, request.Level);
            await EnsureLevelChangeKeepsActorAsync(actor, role.Id, request.Level, cancellationToken);

            var change = new OrgChange();
            change.RoleLevels[role.Id] = request.Level;
            await guard.EnsureReportingLinesAsync(change, cancellationToken);
        }

        var nameAr = request.NameAr.Trim();
        var nameEn = request.NameEn.Trim();
        var description = Clean(request.Description);
        await EnsureNamesAvailableAsync(nameAr, nameEn, role.Id, cancellationToken);

        var changes = new List<RoleAuditChangeDto>();
        RoleAudit.AddIfChanged(changes, "nameAr", role.NameAr, nameAr);
        RoleAudit.AddIfChanged(changes, "nameEn", role.NameEn, nameEn);
        RoleAudit.AddIfChanged(changes, "description", role.Description, description);
        RoleAudit.AddIfChanged(changes, "level", role.Level.ToString(), request.Level.ToString());
        RoleAudit.AddIfChanged(changes, "maxDiscountPercent", RoleAudit.Percent(role.MaxDiscountPercent), RoleAudit.Percent(request.MaxDiscountPercent));
        if (changes.Count == 0)
        {
            return await GetRoleAsync(role.Id, cancellationToken);
        }

        role.NameAr = nameAr;
        role.NameEn = nameEn;
        role.Description = description;
        role.Level = request.Level;
        role.MaxDiscountPercent = request.MaxDiscountPercent;
        db.RoleAuditEntries.Add(RoleAudit.Entry(role, actor, RoleAuditAction.Updated, changes, time.GetUtcNow()));
        await db.SaveChangesAsync(cancellationToken);

        // Holders see the new name in their profile, and the level decides what they may manage.
        await permissionService.BumpVersionAsync(await HoldersAsync(role.Id, cancellationToken), cancellationToken);
        return await GetRoleAsync(role.Id, cancellationToken);
    }

    /// <summary>Replaces the role's grants. Admin is locked; nobody can grant more than they hold.</summary>
    public async Task<RoleDto> SetPermissionsAsync(Guid roleId, SetRolePermissionsRequest request, CancellationToken cancellationToken = default)
    {
        var role = await FindRoleAsync(roleId, cancellationToken);
        var actor = await guard.GetActorAsync(cancellationToken);
        HierarchyGuard.EnsureCanManageRoleLevel(actor, role.Level);

        if (DefaultRoles.HasLockedPermissions(role.Key))
        {
            throw new BusinessRuleException(IdentityErrorCodes.AdminRoleLocked, "The Admin role always has every permission.");
        }

        var requested = request.Permissions
            .GroupBy(g => g.Key)
            .ToDictionary(g => g.Key, g => g.Max(x => x.Scope), StringComparer.Ordinal);
        var permissionIds = await ResolvePermissionIdsAsync(requested.Keys, cancellationToken);
        var current = await LoadGrantsAsync(roleId, cancellationToken);

        HierarchyGuard.EnsureGrantsWithin(actor, current, requested);
        await guard.EnsureNoSelfLockoutAsync(actor, roleId, requested, cancellationToken);

        var changes = RoleAudit.DiffGrants(current, requested).ToList();
        if (changes.Count == 0)
        {
            return await GetRoleAsync(roleId, cancellationToken);
        }

        var rows = await db.RolePermissions.Where(rp => rp.RoleId == roleId).ToListAsync(cancellationToken);
        var byPermissionId = rows.ToDictionary(rp => rp.PermissionId);
        foreach (var (key, scope) in requested)
        {
            if (byPermissionId.Remove(permissionIds[key], out var existing))
            {
                existing.Scope = scope;
            }
            else
            {
                db.RolePermissions.Add(new RolePermission { RoleId = roleId, PermissionId = permissionIds[key], Scope = scope });
            }
        }

        db.RolePermissions.RemoveRange(byPermissionId.Values);
        db.RoleAuditEntries.Add(RoleAudit.Entry(role, actor, RoleAuditAction.PermissionsChanged, changes, time.GetUtcNow()));
        await db.SaveChangesAsync(cancellationToken);

        await permissionService.BumpVersionAsync(await HoldersAsync(roleId, cancellationToken), cancellationToken);
        return await GetRoleAsync(roleId, cancellationToken);
    }

    /// <summary>
    /// Deletes a custom role. Refused for system roles, and while users still hold the role
    /// (<c>role_in_use</c> with <c>userCount</c>; move them first with <see cref="ReassignUsersAsync"/>).
    /// </summary>
    public async Task DeleteRoleAsync(Guid roleId, CancellationToken cancellationToken = default)
    {
        var role = await FindRoleAsync(roleId, cancellationToken);
        var actor = await guard.GetActorAsync(cancellationToken);
        HierarchyGuard.EnsureCanManageRoleLevel(actor, role.Level);

        if (role.IsSystem)
        {
            throw new BusinessRuleException(IdentityErrorCodes.SystemRole, "System roles cannot be deleted.");
        }

        var userCount = await db.UserRoles.CountAsync(ur => ur.RoleId == roleId, cancellationToken);
        if (userCount > 0)
        {
            throw new ConflictException(IdentityErrorCodes.RoleInUse, $"{userCount} user(s) still have this role. Move them to another role first.")
            {
                Details = new Dictionary<string, object?> { ["userCount"] = userCount },
            };
        }

        var grants = await LoadGrantsAsync(roleId, cancellationToken);
        List<RoleAuditChangeDto> changes =
        [
            new("nameAr", role.NameAr, null),
            new("nameEn", role.NameEn, null),
            new("level", role.Level.ToString(), null),
            .. RoleAudit.DiffGrants(grants, NoGrants),
        ];
        db.RoleAuditEntries.Add(RoleAudit.Entry(role, actor, RoleAuditAction.Deleted, changes, time.GetUtcNow()));
        db.Roles.Remove(role);
        await db.SaveChangesAsync(cancellationToken);

        // The role had no users, so no permissions version changes.
    }

    /// <summary>
    /// Moves every user of <paramref name="roleId"/> to the target role (users who already
    /// hold it just lose the source role). All moved users must be inside the caller's
    /// <c>roles:manage</c> scope and below the caller in the hierarchy.
    /// </summary>
    public async Task<ReassignRoleUsersResult> ReassignUsersAsync(Guid roleId, ReassignRoleUsersRequest request, CancellationToken cancellationToken = default)
    {
        if (request.TargetRoleId == roleId)
        {
            throw new BusinessRuleException(IdentityErrorCodes.ReassignSameRole, "Choose a different role to move the users to.");
        }

        var source = await FindRoleAsync(roleId, cancellationToken);
        var target = await FindRoleAsync(request.TargetRoleId, cancellationToken);
        var actor = await guard.GetActorAsync(cancellationToken);
        HierarchyGuard.EnsureCanManageRoleLevel(actor, source.Level);
        HierarchyGuard.EnsureCanManageRoleLevel(actor, target.Level);

        var rows = await db.UserRoles.Where(ur => ur.RoleId == roleId).ToListAsync(cancellationToken);
        var userIds = rows.Select(r => r.UserId).ToList();
        if (userIds.Count == 0)
        {
            return new ReassignRoleUsersResult(0);
        }

        if (userIds.Contains(actor.Id))
        {
            throw HierarchyGuard.SelfEditForbidden();
        }

        await EnsureUsersInScopeAsync(actor, userIds, cancellationToken);

        if (DefaultRoles.HasLockedPermissions(source.Key))
        {
            await guard.EnsureAdminRemainsAsync(userIds, cancellationToken);
        }

        var assignments = await db.UserRoles.AsNoTracking()
            .Where(ur => userIds.Contains(ur.UserId))
            .Select(ur => new { ur.UserId, ur.RoleId })
            .ToListAsync(cancellationToken);
        var change = new OrgChange();
        foreach (var group in assignments.GroupBy(a => a.UserId))
        {
            change.UserRoles[group.Key] = group.Select(a => a.RoleId).Where(id => id != roleId).Append(target.Id).Distinct().ToList();
        }

        await guard.EnsureReportingLinesAsync(change, cancellationToken);

        var alreadyInTarget = assignments.Where(a => a.RoleId == target.Id).Select(a => a.UserId).ToHashSet();
        db.UserRoles.RemoveRange(rows);
        foreach (var userId in userIds.Where(id => !alreadyInTarget.Contains(id)))
        {
            db.UserRoles.Add(new IdentityUserRole<Guid> { UserId = userId, RoleId = target.Id });
        }

        // Names are kept next to the keys so the history stays readable after either role is deleted.
        List<RoleAuditChangeDto> changes =
        [
            new("reassign", source.Key, target.Key),
            new("userCount", null, userIds.Count.ToString()),
            new("sourceName", source.NameAr, source.NameEn),
            new("targetName", target.NameAr, target.NameEn),
        ];
        var now = time.GetUtcNow();
        db.RoleAuditEntries.Add(RoleAudit.Entry(source, actor, RoleAuditAction.UsersReassigned, changes, now));
        db.RoleAuditEntries.Add(RoleAudit.Entry(target, actor, RoleAuditAction.UsersReassigned, changes, now));
        await db.SaveChangesAsync(cancellationToken);

        await permissionService.BumpVersionAsync(userIds, cancellationToken);
        return new ReassignRoleUsersResult(userIds.Count);
    }

    /// <summary>The latest changes of a role, newest first (also works for deleted roles).</summary>
    public async Task<IReadOnlyList<RoleAuditEntryDto>> GetAuditAsync(Guid roleId, RoleAuditQuery query, CancellationToken cancellationToken = default)
    {
        var entries = await db.RoleAuditEntries.AsNoTracking()
            .Where(e => e.RoleId == roleId)
            .OrderByDescending(e => e.CreatedAt).ThenByDescending(e => e.Id)
            .Take(Math.Clamp(query.Limit, 1, 100))
            .ToListAsync(cancellationToken);

        return entries
            .Select(e => new RoleAuditEntryDto(
                e.Id, e.RoleId, e.RoleKey, e.Action, e.ActorId, e.ActorName, RoleAudit.ReadChanges(e.Changes), e.CreatedAt))
            .ToList();
    }

    private async Task<RoleDto> GetRoleAsync(Guid roleId, CancellationToken cancellationToken) =>
        (await QueryRolesAsync(roleId, cancellationToken)).Single();

    private async Task<IReadOnlyList<RoleDto>> QueryRolesAsync(Guid? roleId, CancellationToken cancellationToken)
    {
        var query = db.Roles.AsNoTracking();
        if (roleId is { } id)
        {
            query = query.Where(r => r.Id == id);
        }

        var roles = await query
            .OrderBy(r => r.Level).ThenBy(r => r.NameEn)
            .Select(r => new
            {
                r.Id,
                Key = r.Name!,
                r.NameAr,
                r.NameEn,
                r.Description,
                r.IsSystem,
                r.Level,
                r.MaxDiscountPercent,
                UserCount = db.UserRoles.Count(ur => ur.RoleId == r.Id),
                Permissions = r.Permissions
                    .OrderBy(rp => rp.Permission!.Key)
                    .Select(rp => new PermissionGrantDto(rp.Permission!.Key, rp.Scope))
                    .ToList(),
            })
            .ToListAsync(cancellationToken);

        return roles
            .Select(r => new RoleDto(
                r.Id, r.Key, r.NameAr, r.NameEn, r.Description, r.IsSystem, r.Level,
                DefaultRoles.HasLockedPermissions(r.Key), r.UserCount, r.Permissions, r.MaxDiscountPercent))
            .ToList();
    }

    private async Task<Role> FindRoleAsync(Guid roleId, CancellationToken cancellationToken) =>
        await db.Roles.SingleOrDefaultAsync(r => r.Id == roleId, cancellationToken)
        ?? throw new NotFoundException("Role", roleId);

    private Task<List<Guid>> HoldersAsync(Guid roleId, CancellationToken cancellationToken) =>
        db.UserRoles.Where(ur => ur.RoleId == roleId).Select(ur => ur.UserId).ToListAsync(cancellationToken);

    private async Task<Dictionary<string, PermissionScope>> LoadGrantsAsync(Guid roleId, CancellationToken cancellationToken) =>
        await db.RolePermissions.AsNoTracking()
            .Where(rp => rp.RoleId == roleId)
            .Select(rp => new { rp.Permission!.Key, rp.Scope })
            .ToDictionaryAsync(g => g.Key, g => g.Scope, StringComparer.Ordinal, cancellationToken);

    private async Task<Dictionary<string, int>> ResolvePermissionIdsAsync(IEnumerable<string> keys, CancellationToken cancellationToken)
    {
        var wanted = keys.Distinct().ToList();
        var ids = await db.Permissions
            .Where(p => wanted.Contains(p.Key))
            .ToDictionaryAsync(p => p.Key, p => p.Id, cancellationToken);

        var unknown = wanted.Except(ids.Keys).ToList();
        if (unknown.Count > 0)
        {
            throw new BusinessRuleException(IdentityErrorCodes.UnknownPermission, $"Unknown permission(s): {string.Join(", ", unknown)}");
        }

        return ids;
    }

    private async Task EnsureNamesAvailableAsync(string nameAr, string nameEn, Guid? exceptRoleId, CancellationToken cancellationToken)
    {
        var ar = nameAr.ToLower();
        var en = nameEn.ToLower();
        var taken = await db.Roles.AnyAsync(
            r => r.Id != exceptRoleId && (r.NameAr.ToLower() == ar || r.NameEn.ToLower() == en),
            cancellationToken);
        if (taken)
        {
            throw new ConflictException(IdentityErrorCodes.RoleNameTaken, "Another role already uses this name.");
        }
    }

    /// <summary>Raising the level number of a role the caller holds must not lower the caller's own standing.</summary>
    private async Task EnsureLevelChangeKeepsActorAsync(Actor actor, Guid roleId, int newLevel, CancellationToken cancellationToken)
    {
        if (!actor.RoleIds.Contains(roleId))
        {
            return;
        }

        var otherRoleIds = actor.RoleIds.Where(id => id != roleId).ToArray();
        var otherLevels = await db.Roles.Where(r => otherRoleIds.Contains(r.Id)).Select(r => r.Level).ToListAsync(cancellationToken);
        if (RoleHierarchyRules.BestLevel(otherLevels.Append(newLevel)) > actor.Level)
        {
            throw HierarchyGuard.SelfLockout();
        }
    }

    private async Task EnsureUsersInScopeAsync(Actor actor, IReadOnlyCollection<Guid> userIds, CancellationToken cancellationToken)
    {
        var scope = await scopeResolver.ResolveAsync(Permissions.Roles.Manage, cancellationToken);
        var ids = userIds.ToArray();
        var users = await db.Users.AsNoTracking()
            .Where(u => ids.Contains(u.Id))
            .Select(u => new { u.Id, u.TerritoryId })
            .ToListAsync(cancellationToken);

        var outside = users.Count(u => !scope.Includes(u.Id, u.TerritoryId));
        if (outside > 0)
        {
            throw new ForbiddenException(IdentityErrorCodes.UsersOutOfScope, $"{outside} of these users are outside your scope.")
            {
                Details = new Dictionary<string, object?> { ["userCount"] = outside },
            };
        }

        var levels = await guard.GetBestLevelsAsync(userIds, cancellationToken);
        var above = levels.Values.Count(level => !actor.CanManageLevel(level));
        if (above > 0)
        {
            throw new ForbiddenException(IdentityErrorCodes.UserLevelTooHigh, $"{above} of these users are at or above your own level.")
            {
                Details = new Dictionary<string, object?> { ["userCount"] = above },
            };
        }
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
