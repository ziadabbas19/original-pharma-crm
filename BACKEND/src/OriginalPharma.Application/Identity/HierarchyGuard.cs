using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Scoping;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Application.Identity;

/// <summary>Error codes returned when a role or user change is refused.</summary>
public static class IdentityErrorCodes
{
    /// <summary>The role is at or above the caller's own level (or would be moved there).</summary>
    public const string RoleLevelTooHigh = "role_level_too_high";

    /// <summary>The target user's best role is at or above the caller's own level.</summary>
    public const string UserLevelTooHigh = "user_level_too_high";

    /// <summary>Granting a permission, or a scope, the caller does not hold.</summary>
    public const string ScopeTooBroad = "scope_too_broad";

    /// <summary>Changing one's own roles, overrides or reporting line.</summary>
    public const string SelfEditForbidden = "self_edit_forbidden";

    /// <summary>A manager would not outrank (lower level number than) the user reporting to them.</summary>
    public const string ManagerLevelInvalid = "manager_level_invalid";

    /// <summary>The reporting line would loop back to the user.</summary>
    public const string ManagerCycle = "manager_cycle";

    /// <summary>The Admin role's permissions and level never change.</summary>
    public const string AdminRoleLocked = "admin_role_locked";

    /// <summary>Seeded roles cannot be deleted.</summary>
    public const string SystemRole = "system_role";

    /// <summary>The role still has users; the response carries <c>userCount</c>.</summary>
    public const string RoleInUse = "role_in_use";

    /// <summary>The change would leave no active user with the Admin role.</summary>
    public const string LastAdmin = "last_admin";

    /// <summary>The change would take away the caller's own role-administration access.</summary>
    public const string SelfLockout = "self_lockout";

    /// <summary>Another role already uses this Arabic or English name.</summary>
    public const string RoleNameTaken = "role_name_taken";

    public const string ReassignSameRole = "reassign_same_role";

    /// <summary>Some affected users are outside the caller's scope; the response carries <c>userCount</c>.</summary>
    public const string UsersOutOfScope = "users_out_of_scope";

    public const string UnknownRole = "unknown-role";
    public const string UnknownPermission = "unknown-permission";
}

/// <summary>The signed-in user making an administrative change.</summary>
public sealed record Actor(Guid Id, string FullName, int Level, IReadOnlySet<Guid> RoleIds, EffectivePermissions Permissions)
{
    public bool CanManageLevel(int level) => RoleHierarchyRules.CanManage(Level, level);
}

/// <summary>Changes to roles, role assignments or reporting lines, checked before they are saved.</summary>
public sealed class OrgChange
{
    /// <summary>Role id -> new level.</summary>
    public Dictionary<Guid, int> RoleLevels { get; } = [];

    /// <summary>User id -> the user's complete new set of role ids (may include a user not saved yet).</summary>
    public Dictionary<Guid, IReadOnlyCollection<Guid>> UserRoles { get; } = [];

    /// <summary>User id -> new manager id.</summary>
    public Dictionary<Guid, Guid?> Managers { get; } = [];
}

/// <summary>
/// Server-side enforcement of the role hierarchy and the anti-escalation rules. Every
/// role and user administration use case goes through here; the dashboard only mirrors
/// these rules to disable what would be refused.
/// </summary>
public sealed class HierarchyGuard(
    IAppDbContext db,
    ICurrentUser currentUser,
    IPermissionService permissions,
    IDataScopeResolver scopes,
    TimeProvider time)
{
    /// <summary>Permissions an edit to the caller's own roles may never take away from them.</summary>
    private static readonly string[] SelfProtectedPermissions =
        [Permissions.Roles.Read, Permissions.Roles.Manage, Permissions.Users.Manage];

    public async Task<Actor> GetActorAsync(CancellationToken cancellationToken = default)
    {
        var userId = currentUser.RequireUserId();
        var fullName = await db.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => u.FullName)
            .SingleOrDefaultAsync(cancellationToken) ?? string.Empty;
        var roles = await db.UserRoles.AsNoTracking()
            .Where(ur => ur.UserId == userId)
            .Join(db.Roles, ur => ur.RoleId, r => r.Id, (_, r) => new { r.Id, r.Level })
            .ToListAsync(cancellationToken);
        var effective = await permissions.GetEffectivePermissionsAsync(userId, cancellationToken);

        return new Actor(
            userId,
            fullName,
            RoleHierarchyRules.BestLevel(roles.Select(r => r.Level)),
            roles.Select(r => r.Id).ToHashSet(),
            effective);
    }

    public static void EnsureCanManageRoleLevel(Actor actor, int level)
    {
        if (!actor.CanManageLevel(level))
        {
            throw new ForbiddenException(
                IdentityErrorCodes.RoleLevelTooHigh,
                "You can only manage roles below your own level.")
            {
                Details = LevelDetails(actor, level),
            };
        }
    }

    /// <summary>
    /// New or widened grants must be covered by the caller's own permissions. Unchanged and
    /// narrowed grants are always allowed, so someone can still edit a role that already
    /// holds more than they do, as long as they do not add to it.
    /// </summary>
    public static void EnsureGrantsWithin(
        Actor actor,
        IReadOnlyDictionary<string, PermissionScope> current,
        IReadOnlyDictionary<string, PermissionScope> requested)
    {
        foreach (var (key, scope) in requested)
        {
            if (current.TryGetValue(key, out var before) && before >= scope)
            {
                continue;
            }

            var held = actor.Permissions.ScopeOf(key);
            if (!RoleHierarchyRules.Covers(held, scope))
            {
                throw ScopeTooBroad(key, scope, held);
            }
        }
    }

    public static ForbiddenException ScopeTooBroad(string key, PermissionScope requested, PermissionScope? held) =>
        new(IdentityErrorCodes.ScopeTooBroad,
            held is null
                ? $"You cannot grant '{key}' because you do not hold it."
                : $"You cannot grant '{key}' with scope {requested}; your own scope is {held}.")
        {
            Details = new Dictionary<string, object?>
            {
                ["permission"] = key,
                ["requestedScope"] = requested,
                ["yourScope"] = held,
            },
        };

    public static ForbiddenException SelfEditForbidden() =>
        new(IdentityErrorCodes.SelfEditForbidden, "You cannot change your own roles, permissions or reporting line.");

    /// <summary>
    /// Loads a user the caller may administer: not themselves, inside the caller's scope for
    /// <paramref name="permission"/>, and below the caller in the hierarchy.
    /// </summary>
    public async Task<User> GetManageableUserAsync(Actor actor, Guid userId, string permission, CancellationToken cancellationToken = default)
    {
        if (userId == actor.Id)
        {
            throw SelfEditForbidden();
        }

        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == userId, cancellationToken)
                   ?? throw new NotFoundException("User", userId);

        var scope = await scopes.ResolveAsync(permission, cancellationToken);
        if (!scope.Includes(user.Id, user.TerritoryId))
        {
            throw new ForbiddenException("This user is outside your scope.");
        }

        var level = (await GetBestLevelsAsync([userId], cancellationToken))[userId];
        if (!actor.CanManageLevel(level))
        {
            throw new ForbiddenException(
                IdentityErrorCodes.UserLevelTooHigh,
                "You can only manage users whose role is below your own level.")
            {
                Details = LevelDetails(actor, level),
            };
        }

        return user;
    }

    public async Task<Dictionary<Guid, int>> GetBestLevelsAsync(IReadOnlyCollection<Guid> userIds, CancellationToken cancellationToken = default)
    {
        var ids = userIds.Distinct().ToArray();
        var rows = await db.UserRoles.AsNoTracking()
            .Where(ur => ids.Contains(ur.UserId))
            .Join(db.Roles, ur => ur.RoleId, r => r.Id, (ur, r) => new { ur.UserId, r.Level })
            .ToListAsync(cancellationToken);
        var byUser = rows.ToLookup(r => r.UserId, r => r.Level);
        return ids.ToDictionary(id => id, id => RoleHierarchyRules.BestLevel(byUser[id]));
    }

    /// <summary>
    /// Validates the reporting lines touched by <paramref name="change"/>: no loops, and every
    /// manager outranks the people reporting to them.
    /// </summary>
    public async Task EnsureReportingLinesAsync(OrgChange change, CancellationToken cancellationToken = default)
    {
        var managers = await db.Users.AsNoTracking()
            .ToDictionaryAsync(u => u.Id, u => u.ManagerId, cancellationToken);

        foreach (var (userId, managerId) in change.Managers)
        {
            if (managerId is { } manager && ReportingLineRules.CreatesCycle(managers, userId, manager))
            {
                throw new BusinessRuleException(
                    IdentityErrorCodes.ManagerCycle,
                    "This manager reports (directly or indirectly) to the user, which would create a loop.");
            }

            managers[userId] = managerId;
        }

        var roleLevels = await db.Roles.AsNoTracking().ToDictionaryAsync(r => r.Id, r => r.Level, cancellationToken);
        foreach (var (roleId, level) in change.RoleLevels)
        {
            roleLevels[roleId] = level;
        }

        var assignments = await db.UserRoles.AsNoTracking()
            .Select(ur => new { ur.UserId, ur.RoleId })
            .ToListAsync(cancellationToken);
        var rolesByUser = assignments
            .GroupBy(a => a.UserId)
            .ToDictionary(g => g.Key, g => (IReadOnlyCollection<Guid>)g.Select(a => a.RoleId).ToList());
        foreach (var (userId, roleIds) in change.UserRoles)
        {
            rolesByUser[userId] = roleIds;
            managers.TryAdd(userId, null);
        }

        var affected = change.Managers.Keys.Concat(change.UserRoles.Keys).ToHashSet();
        foreach (var (userId, roleIds) in rolesByUser)
        {
            if (roleIds.Any(change.RoleLevels.ContainsKey))
            {
                affected.Add(userId);
            }
        }

        var bestLevels = managers.Keys.ToDictionary(
            id => id,
            id => RoleHierarchyRules.BestLevel(rolesByUser.GetValueOrDefault(id, [])
                .Select(roleId => roleLevels.GetValueOrDefault(roleId, RoleHierarchyRules.NoRoleLevel))));

        var invalid = ReportingLineRules.FindInvalidLinks(managers, bestLevels, affected);
        if (invalid.Count > 0)
        {
            throw new BusinessRuleException(
                IdentityErrorCodes.ManagerLevelInvalid,
                "A manager must hold a role with a lower level number than the people reporting to them.")
            {
                Details = new Dictionary<string, object?> { ["linkCount"] = invalid.Count },
            };
        }
    }

    /// <summary>Refuses a change that would leave no active user holding the Admin role.</summary>
    public async Task EnsureAdminRemainsAsync(IReadOnlyCollection<Guid> usersLosingAdmin, CancellationToken cancellationToken = default)
    {
        if (usersLosingAdmin.Count == 0)
        {
            return;
        }

        var adminKey = Role.NormalizeKey(DefaultRoles.Admin);
        var holders = await db.UserRoles.AsNoTracking()
            .Join(db.Roles.Where(r => r.NormalizedName == adminKey), ur => ur.RoleId, r => r.Id, (ur, _) => ur.UserId)
            .Join(db.Users.Where(u => u.IsActive), userId => userId, u => u.Id, (userId, _) => userId)
            .ToListAsync(cancellationToken);

        if (holders.Intersect(usersLosingAdmin).Any() && !holders.Except(usersLosingAdmin).Any())
        {
            throw new BusinessRuleException(IdentityErrorCodes.LastAdmin, "At least one active user must keep the Admin role.");
        }
    }

    /// <summary>
    /// When the caller holds the role being edited, refuses new grants that would take away
    /// their own access to roles and users administration.
    /// </summary>
    public async Task EnsureNoSelfLockoutAsync(
        Actor actor,
        Guid roleId,
        IReadOnlyDictionary<string, PermissionScope> newGrants,
        CancellationToken cancellationToken = default)
    {
        if (!actor.RoleIds.Contains(roleId))
        {
            return;
        }

        var otherRoles = actor.RoleIds.Where(id => id != roleId).ToArray();
        var grants = await db.RolePermissions.AsNoTracking()
            .Where(rp => otherRoles.Contains(rp.RoleId))
            .Select(rp => new RoleGrant(rp.Permission!.Key, rp.Scope))
            .ToListAsync(cancellationToken);
        grants.AddRange(newGrants.Select(g => new RoleGrant(g.Key, g.Value)));

        var overrides = await db.UserPermissionOverrides.AsNoTracking()
            .Where(o => o.UserId == actor.Id)
            .Select(o => new OverrideEntry(o.Permission!.Key, o.IsGranted, o.Scope, o.ExpiresAt))
            .ToListAsync(cancellationToken);

        var after = PermissionEvaluator.Evaluate(grants, overrides, time.GetUtcNow());
        foreach (var key in SelfProtectedPermissions)
        {
            PermissionScope? remaining = after.TryGetValue(key, out var scope) ? scope : null;
            if (actor.Permissions.ScopeOf(key) is { } before && !RoleHierarchyRules.Covers(remaining, before))
            {
                throw SelfLockout(key);
            }
        }
    }

    public static BusinessRuleException SelfLockout(string? permission = null) =>
        new(IdentityErrorCodes.SelfLockout, "This change would remove your own access to role administration.")
        {
            Details = new Dictionary<string, object?> { ["permission"] = permission },
        };

    private static Dictionary<string, object?> LevelDetails(Actor actor, int level) => new()
    {
        ["level"] = level == RoleHierarchyRules.NoRoleLevel ? null : level,
        ["yourLevel"] = actor.Level == RoleHierarchyRules.NoRoleLevel ? null : actor.Level,
    };
}
