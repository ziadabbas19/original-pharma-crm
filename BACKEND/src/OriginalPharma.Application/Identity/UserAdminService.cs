using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Auditing;
using OriginalPharma.Application.Common.Bulk;
using OriginalPharma.Application.Common.Images;
using OriginalPharma.Application.Common.Organization;
using OriginalPharma.Application.Common.Scoping;
using OriginalPharma.Domain.Audit;
using OriginalPharma.Domain.Catalog;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Application.Identity;

/// <summary>
/// User administration: create (users:create), edit profile, reporting line and product lines,
/// assign roles and set permission overrides. Hierarchy rules (<see cref="HierarchyGuard"/>) apply to all of it:
/// nobody edits themselves, users at or above their own level, or hands out roles and
/// permissions above what they hold.
/// </summary>
public sealed class UserAdminService(
    IAppDbContext db,
    UserManager<User> userManager,
    IDataScopeResolver scopeResolver,
    IPermissionService permissionService,
    IOrgHierarchy hierarchy,
    HierarchyGuard guard,
    AccountService accounts,
    AuditTrail audit,
    TimeProvider time)
{
    /// <param name="archived">Only archived (deleted) users, or (default) only users that are not archived.</param>
    public async Task<IReadOnlyList<UserListItemDto>> ListAsync(bool archived = false, CancellationToken cancellationToken = default)
    {
        var scope = await scopeResolver.ResolveAsync(Permissions.Users.Read, cancellationToken);

        var users = await db.Users.AsNoTracking()
            .WhereUsersInScope(scope)
            .Where(u => archived ? u.ArchivedAt != null : u.ArchivedAt == null)
            .OrderBy(u => u.FullName)
            .Select(u => new
            {
                u.Id,
                u.Email,
                u.FullName,
                u.ManagerId,
                ManagerName = u.Manager != null ? u.Manager.FullName : null,
                u.TerritoryId,
                TerritoryName = u.Territory != null ? u.Territory.Name : null,
                TerritoryNameAr = u.Territory != null ? u.Territory.NameAr : null,
                u.IsActive,
                u.PreferredLanguage,
                u.AvatarKey,
                u.MustChangePassword,
                u.ArchivedAt,
            })
            .ToListAsync(cancellationToken);

        var ids = users.Select(u => u.Id).ToList();
        var roles = await db.GetRoleSummariesAsync(ids, cancellationToken);
        var lines = (await db.UserProductLines.AsNoTracking()
                .Where(l => ids.Contains(l.UserId))
                .Select(l => new { l.UserId, l.ProductLineId })
                .ToListAsync(cancellationToken))
            .ToLookup(l => l.UserId, l => l.ProductLineId);

        return users
            .Select(u => new UserListItemDto(
                u.Id, u.Email ?? string.Empty, u.FullName, roles[u.Id].ToList(), u.ManagerId, u.TerritoryId, u.IsActive,
                u.TerritoryName, u.TerritoryNameAr, u.ManagerName, u.PreferredLanguage,
                ImageService.Url(u.AvatarKey, ImageService.Thumbnail), lines[u.Id].ToList(), u.MustChangePassword, u.ArchivedAt))
            .ToList();
    }

    /// <summary>
    /// Deletes users (users:delete). Per user: never yourself, only inside the scope and below your
    /// level, never someone people still report to, never the last active admin. A user who took part
    /// in orders, visits, tracking or administration is archived (deactivated, signed out, hidden);
    /// one without any activity is removed. Lower levels are handled first, so a team and its
    /// supervisor can go in one request.
    /// </summary>
    public async Task<BulkResult> DeleteManyAsync(BulkDeleteRequest request, CancellationToken cancellationToken = default)
    {
        var actor = await guard.GetActorAsync(cancellationToken);
        var scope = await scopeResolver.ResolveAsync(Permissions.Users.Delete, cancellationToken);
        var ids = request.Ids.Distinct().ToArray();
        var users = await db.Users.Where(u => ids.Contains(u.Id)).ToDictionaryAsync(u => u.Id, cancellationToken);
        var levels = await guard.GetBestLevelsAsync(ids, cancellationToken);
        var reports = await db.Users.AsNoTracking()
            .Where(u => u.ManagerId != null && ids.Contains(u.ManagerId.Value))
            .Select(u => new { u.Id, ManagerId = u.ManagerId!.Value, u.ArchivedAt })
            .ToListAsync(cancellationToken);
        var active = await ActiveIdsAsync(ids, cancellationToken);
        var admins = await ActiveAdminIdsAsync(cancellationToken);

        var removed = new HashSet<Guid>();
        var outcomes = new Dictionary<Guid, BulkItemResult>();
        foreach (var id in ids.OrderByDescending(i => levels.GetValueOrDefault(i)))
        {
            var outcome = Evaluate(id);
            outcomes[id] = outcome;
            if (outcome.Outcome != BulkOutcome.Blocked)
            {
                removed.Add(id);
            }
        }

        BulkItemResult Evaluate(Guid id)
        {
            if (id == actor.Id)
            {
                return new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.Self);
            }

            if (!users.TryGetValue(id, out var user))
            {
                return new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.NotFound);
            }

            if (!scope.Includes(user.Id, user.TerritoryId))
            {
                return new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.OutOfScope);
            }

            if (!actor.CanManageLevel(levels.GetValueOrDefault(id)))
            {
                return new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.UserLevelTooHigh);
            }

            var activeReports = reports.Count(r => r.ManagerId == id && r.ArchivedAt == null && !removed.Contains(r.Id));
            if (activeReports > 0)
            {
                return new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.UserHasReports, activeReports);
            }

            if (admins.Contains(id) && !admins.Except(removed).Except([id]).Any())
            {
                return new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.LastAdmin);
            }

            // Archived reports still point at the user, so the row has to stay.
            var keep = active.Contains(id) || reports.Any(r => r.ManagerId == id) || user.ArchivedAt is not null;
            return new BulkItemResult(id, keep ? BulkOutcome.Archived : BulkOutcome.Deleted);
        }

        var result = BulkResult.From(ids.Select(i => outcomes[i]).ToList(), request.DryRun);
        if (request.DryRun || result.Done == 0)
        {
            return result;
        }

        var now = time.GetUtcNow();
        var affected = new List<Guid>();
        foreach (var item in result.Items.Where(i => i.Outcome != BulkOutcome.Blocked))
        {
            var user = users[item.Id];
            var details = new { user.FullName, user.Email, user.TerritoryId, user.ManagerId };
            if (item.Outcome == BulkOutcome.Archived)
            {
                user.IsActive = false;
                user.ArchivedAt ??= now;
                user.ArchivedById ??= actor.Id;
                affected.Add(user.Id);
                await accounts.RevokeSessionsAsync(user.Id, null, SessionRevokeReasons.UserArchived, cancellationToken);
                db.UserAuditEntries.Add(UserAudit.Entry(user.Id, actor.Id, actor.FullName, UserAuditAction.Archived, details, null, now));
                await audit.AddAsync(AuditEntities.User, user.Id, AuditAction.Archived, details, cancellationToken: cancellationToken);
            }
            else
            {
                // The rows go with the user; this also stops access tokens already issued to their devices.
                await accounts.RevokeSessionsAsync(user.Id, null, SessionRevokeReasons.UserDeleted, cancellationToken);
                db.UserRoles.RemoveRange(await db.UserRoles.Where(ur => ur.UserId == user.Id).ToListAsync(cancellationToken));
                db.Users.Remove(user);
                db.UserAuditEntries.Add(UserAudit.Entry(user.Id, actor.Id, actor.FullName, UserAuditAction.Deleted, details, null, now));
                await audit.AddAsync(AuditEntities.User, user.Id, AuditAction.Deleted, details, cancellationToken: cancellationToken);
            }
        }

        await audit.AddBulkAsync(AuditEntities.User, AuditAction.BulkDelete, result, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        await permissionService.BumpVersionAsync(affected, cancellationToken);
        hierarchy.Invalidate();
        return result;
    }

    /// <summary>Brings archived users back and lets them sign in again (users:restore, scope and level rules apply).</summary>
    public async Task<BulkResult> RestoreManyAsync(BulkIdsRequest request, CancellationToken cancellationToken = default)
    {
        var actor = await guard.GetActorAsync(cancellationToken);
        var scope = await scopeResolver.ResolveAsync(Permissions.Users.Restore, cancellationToken);
        var ids = request.Ids.Distinct().ToArray();
        var users = await db.Users.Where(u => ids.Contains(u.Id)).ToDictionaryAsync(u => u.Id, cancellationToken);
        var levels = await guard.GetBestLevelsAsync(ids, cancellationToken);
        var now = time.GetUtcNow();
        var results = new List<BulkItemResult>();
        foreach (var id in ids)
        {
            if (!users.TryGetValue(id, out var user))
            {
                results.Add(new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.NotFound));
            }
            else if (!scope.Includes(user.Id, user.TerritoryId))
            {
                results.Add(new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.OutOfScope));
            }
            else if (!actor.CanManageLevel(levels.GetValueOrDefault(id)))
            {
                results.Add(new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.UserLevelTooHigh));
            }
            else if (user.ArchivedAt is null)
            {
                results.Add(new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.NotArchived));
            }
            else
            {
                user.ArchivedAt = null;
                user.ArchivedById = null;
                user.IsActive = true;
                results.Add(new BulkItemResult(id, BulkOutcome.Restored));
                db.UserAuditEntries.Add(UserAudit.Entry(user.Id, actor.Id, actor.FullName, UserAuditAction.Restored, new { user.FullName }, null, now));
                await audit.AddAsync(AuditEntities.User, user.Id, AuditAction.Restored, new { user.FullName, user.Email }, cancellationToken: cancellationToken);
            }
        }

        var result = BulkResult.From(results, false);
        if (result.Done > 0)
        {
            await audit.AddBulkAsync(AuditEntities.User, AuditAction.BulkRestore, result, cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
            await permissionService.BumpVersionAsync(results.Where(r => r.Outcome == BulkOutcome.Restored).Select(r => r.Id).ToList(), cancellationToken);
            hierarchy.Invalidate();
        }

        return result;
    }

    /// <summary>Users who took part in something that has to stay readable (orders, visits, tracking, administration).</summary>
    private async Task<HashSet<Guid>> ActiveIdsAsync(Guid[] ids, CancellationToken cancellationToken)
    {
        var found = new HashSet<Guid>();
        async Task AddAsync(IQueryable<Guid> query) => found.UnionWith(await query.Distinct().ToListAsync(cancellationToken));

        await AddAsync(db.Orders.Where(o => ids.Contains(o.UserId)).Select(o => o.UserId));
        await AddAsync(db.OrderHistory.Where(h => h.ActorId != null && ids.Contains(h.ActorId.Value)).Select(h => h.ActorId!.Value));
        await AddAsync(db.Visits.Where(v => ids.Contains(v.UserId)).Select(v => v.UserId));
        await AddAsync(db.Shifts.Where(s => ids.Contains(s.UserId)).Select(s => s.UserId));
        await AddAsync(db.Devices.Where(d => ids.Contains(d.UserId)).Select(d => d.UserId));
        await AddAsync(db.TrackingConsents.Where(c => ids.Contains(c.UserId)).Select(c => c.UserId));
        await AddAsync(db.Customers.Where(c => c.CreatedById != null && ids.Contains(c.CreatedById.Value)).Select(c => c.CreatedById!.Value));
        await AddAsync(db.RoleAuditEntries.Where(e => e.ActorId != null && ids.Contains(e.ActorId.Value)).Select(e => e.ActorId!.Value));
        await AddAsync(db.UserAuditEntries.Where(e => e.ActorId != null && ids.Contains(e.ActorId.Value)).Select(e => e.ActorId!.Value));
        await AddAsync(db.AuditEntries.Where(e => e.ActorId != null && ids.Contains(e.ActorId.Value)).Select(e => e.ActorId!.Value));
        await AddAsync(db.VisitFeedbackReplies.Where(r => ids.Contains(r.AuthorId)).Select(r => r.AuthorId));
        await AddAsync(db.ExpenseLines.Where(l => ids.Contains(l.UserId)).Select(l => l.UserId));
        await AddAsync(db.ExpenseDays.Where(d => ids.Contains(d.UserId)).Select(d => d.UserId));
        return found;
    }

    private async Task<HashSet<Guid>> ActiveAdminIdsAsync(CancellationToken cancellationToken)
    {
        var adminKey = Role.NormalizeKey(DefaultRoles.Admin);
        return (await db.UserRoles.AsNoTracking()
                .Join(db.Roles.Where(r => r.NormalizedName == adminKey), ur => ur.RoleId, r => r.Id, (ur, _) => ur.UserId)
                .Join(db.Users.Where(u => u.IsActive && u.ArchivedAt == null), userId => userId, u => u.Id, (userId, _) => userId)
                .ToListAsync(cancellationToken))
            .ToHashSet();
    }

    /// <summary>Roles the caller may give to a new user: those strictly below their own level.</summary>
    public async Task<IReadOnlyList<RoleSummaryDto>> ListAssignableRolesAsync(CancellationToken cancellationToken = default)
    {
        var actor = await guard.GetActorAsync(cancellationToken);
        var roles = await db.Roles.AsNoTracking()
            .OrderBy(r => r.Level).ThenBy(r => r.NameEn)
            .Select(r => new RoleSummaryDto(r.Id, r.Name!, r.NameAr, r.NameEn, r.Level))
            .ToListAsync(cancellationToken);
        return roles.Where(r => actor.CanManageLevel(r.Level)).ToList();
    }

    /// <summary>
    /// Creates an account (users:create). The new user is placed inside the caller's scope, gets
    /// only roles below the caller's level and a manager that outranks them, and must change the
    /// temporary password on first sign-in.
    /// </summary>
    public async Task<CreatedUserDto> CreateAsync(CreateUserRequest request, CancellationToken cancellationToken = default)
    {
        var actor = await guard.GetActorAsync(cancellationToken);
        var scope = await scopeResolver.ResolveAsync(Permissions.Users.Create, cancellationToken);
        var allowed = scope.Level switch
        {
            PermissionScope.All => true,
            PermissionScope.Territory => request.TerritoryId is { } t && scope.TerritoryIds.Contains(t),
            PermissionScope.Team => request.ManagerId is { } m && scope.UserIds.Contains(m),
            _ => false,
        };
        if (!allowed)
        {
            throw new ForbiddenException("You can only add users inside your own team or territory.");
        }

        var roles = await ResolveRolesAsync(request.Roles, cancellationToken);
        foreach (var role in roles)
        {
            HierarchyGuard.EnsureCanManageRoleLevel(actor, role.Level);
        }

        if (request.ManagerId is { } managerId)
        {
            await EnsureManagerInScopeAsync(managerId, scope, cancellationToken);
        }

        var lineIds = await ResolveProductLinesAsync(request.ProductLineIds ?? [], cancellationToken);

        var user = new User
        {
            Email = request.Email,
            UserName = request.Email,
            FullName = request.FullName.Trim(),
            PreferredLanguage = request.PreferredLanguage,
            ManagerId = request.ManagerId,
            TerritoryId = request.TerritoryId,
            EmailConfirmed = true,
            MustChangePassword = true,
            CreatedAt = time.GetUtcNow(),
        };
        foreach (var lineId in lineIds)
        {
            user.ProductLines.Add(new UserProductLine { UserId = user.Id, ProductLineId = lineId });
        }

        var change = new OrgChange();
        change.UserRoles[user.Id] = roles.Select(r => r.Id).ToList();
        change.Managers[user.Id] = request.ManagerId;
        await guard.EnsureReportingLinesAsync(change, cancellationToken);

        var generated = string.IsNullOrWhiteSpace(request.Password);
        var password = generated ? AccountService.GeneratePassword() : request.Password!;
        var created = await userManager.CreateAsync(user, password);
        if (!created.Succeeded)
        {
            var code = created.Errors.Any(e => e.Code.StartsWith("Password", StringComparison.Ordinal))
                ? AccountErrorCodes.PasswordPolicy
                : "user-create-failed";
            throw new BusinessRuleException(code, string.Join("; ", created.Errors.Select(e => e.Description)));
        }

        var rolesResult = await userManager.AddToRolesAsync(user, roles.Select(r => r.Key));
        if (!rolesResult.Succeeded)
        {
            throw new BusinessRuleException("user-roles-failed", string.Join("; ", rolesResult.Errors.Select(e => e.Description)));
        }

        await accounts.AuditAsync(user.Id, actor.Id, UserAuditAction.Created, new
        {
            roles = roles.Select(r => r.Key).ToArray(),
            territoryId = request.TerritoryId,
            managerId = request.ManagerId,
            productLineIds = lineIds,
            passwordGenerated = generated,
        }, cancellationToken);

        hierarchy.Invalidate();
        return new CreatedUserDto(await GetListItemAsync(user.Id, cancellationToken), generated ? password : null);
    }

    /// <summary>Replaces the product lines of a user below the caller (users:manage).</summary>
    public async Task<UserListItemDto> SetProductLinesAsync(Guid userId, SetUserProductLinesRequest request, CancellationToken cancellationToken = default)
    {
        var actor = await guard.GetActorAsync(cancellationToken);
        await guard.GetManageableUserAsync(actor, userId, Permissions.Users.Manage, cancellationToken);
        var lineIds = await ResolveProductLinesAsync(request.ProductLineIds, cancellationToken);

        var rows = await db.UserProductLines.Where(l => l.UserId == userId).ToListAsync(cancellationToken);
        var before = rows.Select(r => r.ProductLineId).ToHashSet();
        if (!before.SetEquals(lineIds))
        {
            db.UserProductLines.RemoveRange(rows.Where(r => !lineIds.Contains(r.ProductLineId)));
            foreach (var lineId in lineIds.Where(id => !before.Contains(id)))
            {
                db.UserProductLines.Add(new UserProductLine { UserId = userId, ProductLineId = lineId });
            }

            await db.SaveChangesAsync(cancellationToken);
            await accounts.AuditAsync(userId, actor.Id, UserAuditAction.ProductLinesChanged,
                new { before = before.ToArray(), after = lineIds }, cancellationToken);
        }

        return await GetListItemAsync(userId, cancellationToken);
    }

    /// <summary>Name, language, territory and manager of another user below the caller.</summary>
    public async Task<UserListItemDto> UpdateAsync(Guid userId, UpdateUserRequest request, CancellationToken cancellationToken = default)
    {
        var actor = await guard.GetActorAsync(cancellationToken);
        var user = await guard.GetManageableUserAsync(actor, userId, Permissions.Users.Manage, cancellationToken);
        var scope = await scopeResolver.ResolveAsync(Permissions.Users.Manage, cancellationToken);

        if (request.TerritoryId != user.TerritoryId && scope.Level == PermissionScope.Territory &&
            !(request.TerritoryId is { } territoryId && scope.TerritoryIds.Contains(territoryId)))
        {
            throw new ForbiddenException("You can only move users to territories inside your own.");
        }

        if (request.ManagerId != user.ManagerId)
        {
            if (request.ManagerId is { } managerId)
            {
                await EnsureManagerInScopeAsync(managerId, scope, cancellationToken);
            }
            else if (scope.Level == PermissionScope.Team)
            {
                throw new ForbiddenException("Users in your team need a manager from your team.");
            }

            var change = new OrgChange();
            change.Managers[user.Id] = request.ManagerId;
            await guard.EnsureReportingLinesAsync(change, cancellationToken);
        }

        var before = new { user.FullName, user.PreferredLanguage, user.TerritoryId, user.ManagerId };
        user.FullName = request.FullName.Trim();
        user.PreferredLanguage = request.PreferredLanguage;
        user.TerritoryId = request.TerritoryId;
        user.ManagerId = request.ManagerId;
        var after = new { user.FullName, user.PreferredLanguage, user.TerritoryId, user.ManagerId };
        if (!before.Equals(after))
        {
            db.UserAuditEntries.Add(UserAudit.Entry(user.Id, actor.Id, actor.FullName, UserAuditAction.Updated, new { before, after }, null, time.GetUtcNow()));
            await audit.AddAsync(AuditEntities.User, user.Id, AuditAction.Updated, new { before, after }, cancellationToken: cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);

        // Team and territory scopes are resolved from the org snapshot on every request.
        hierarchy.Invalidate();
        return await GetListItemAsync(user.Id, cancellationToken);
    }

    public async Task SetRolesAsync(Guid userId, SetUserRolesRequest request, CancellationToken cancellationToken = default)
    {
        var actor = await guard.GetActorAsync(cancellationToken);
        await guard.GetManageableUserAsync(actor, userId, Permissions.Users.Manage, cancellationToken);

        var requested = await ResolveRolesAsync(request.Roles, cancellationToken);
        var rows = await db.UserRoles.Where(ur => ur.UserId == userId).ToListAsync(cancellationToken);
        var currentIds = rows.Select(r => r.RoleId).ToHashSet();
        var requestedIds = requested.Select(r => r.Id).ToHashSet();

        var touchedIds = currentIds.Union(requestedIds).Except(currentIds.Intersect(requestedIds)).ToArray();
        var touched = await db.Roles.AsNoTracking().Where(r => touchedIds.Contains(r.Id)).ToListAsync(cancellationToken);
        foreach (var role in touched)
        {
            HierarchyGuard.EnsureCanManageRoleLevel(actor, role.Level);
        }

        if (touched.Any(r => currentIds.Contains(r.Id) && DefaultRoles.HasLockedPermissions(r.Key)))
        {
            await guard.EnsureAdminRemainsAsync([userId], cancellationToken);
        }

        var change = new OrgChange();
        change.UserRoles[userId] = requestedIds;
        await guard.EnsureReportingLinesAsync(change, cancellationToken);

        db.UserRoles.RemoveRange(rows.Where(r => !requestedIds.Contains(r.RoleId)));
        foreach (var roleId in requestedIds.Except(currentIds))
        {
            db.UserRoles.Add(new IdentityUserRole<Guid> { UserId = userId, RoleId = roleId });
        }

        if (!currentIds.SetEquals(requestedIds))
        {
            var details = new { before = currentIds.ToArray(), after = requestedIds.ToArray() };
            db.UserAuditEntries.Add(UserAudit.Entry(userId, actor.Id, actor.FullName, UserAuditAction.RolesChanged, details, null, time.GetUtcNow()));
            await audit.AddAsync(AuditEntities.User, userId, AuditAction.Updated, new { roles = details }, cancellationToken: cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);
        await permissionService.BumpVersionAsync([userId], cancellationToken);
    }

    /// <summary>The user's permission overrides, so the dashboard can edit them before saving the full set.</summary>
    public async Task<IReadOnlyList<PermissionOverrideDto>> GetOverridesAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var user = await db.Users.AsNoTracking()
                       .Where(u => u.Id == userId)
                       .Select(u => new { u.Id, u.TerritoryId })
                       .SingleOrDefaultAsync(cancellationToken)
                   ?? throw new NotFoundException("User", userId);

        var scope = await scopeResolver.ResolveAsync(Permissions.Users.Read, cancellationToken);
        if (!scope.Includes(user.Id, user.TerritoryId))
        {
            throw new ForbiddenException();
        }

        return await db.UserPermissionOverrides.AsNoTracking()
            .Where(o => o.UserId == userId)
            .OrderBy(o => o.Permission!.Key)
            .Select(o => new PermissionOverrideDto(o.Permission!.Key, o.IsGranted, o.Scope, o.ExpiresAt, o.Reason))
            .ToListAsync(cancellationToken);
    }

    public async Task SetOverridesAsync(Guid userId, SetPermissionOverridesRequest request, CancellationToken cancellationToken = default)
    {
        var actor = await guard.GetActorAsync(cancellationToken);
        await guard.GetManageableUserAsync(actor, userId, Permissions.Users.Manage, cancellationToken);

        var keys = request.Overrides.Select(o => o.Key).Distinct().ToList();
        var permissionIds = await db.Permissions.Where(p => keys.Contains(p.Key))
            .ToDictionaryAsync(p => p.Key, p => p.Id, cancellationToken);
        var unknown = keys.Except(permissionIds.Keys).ToList();
        if (unknown.Count > 0)
        {
            throw new BusinessRuleException(IdentityErrorCodes.UnknownPermission, $"Unknown permission(s): {string.Join(", ", unknown)}");
        }

        var existing = await db.UserPermissionOverrides.Include(o => o.Permission)
            .Where(o => o.UserId == userId)
            .ToListAsync(cancellationToken);

        // A grant the caller could not give themselves is only accepted if it was already
        // there with at least this scope and is not being extended in time.
        foreach (var entry in request.Overrides.Where(o => o.IsGranted))
        {
            var scope = entry.Scope ?? PermissionScope.Own;
            var expiresAt = entry.ExpiresAt?.ToUniversalTime();
            var unchanged = existing.Any(o =>
                o.IsGranted && o.Permission!.Key == entry.Key && o.Scope >= scope &&
                (o.ExpiresAt is null || (expiresAt is not null && expiresAt <= o.ExpiresAt)));
            var held = actor.Permissions.ScopeOf(entry.Key);
            if (!unchanged && !RoleHierarchyRules.Covers(held, scope))
            {
                throw HierarchyGuard.ScopeTooBroad(entry.Key, scope, held);
            }
        }

        db.UserPermissionOverrides.RemoveRange(existing);

        var now = time.GetUtcNow();
        foreach (var entry in request.Overrides)
        {
            db.UserPermissionOverrides.Add(new UserPermissionOverride
            {
                UserId = userId,
                PermissionId = permissionIds[entry.Key],
                IsGranted = entry.IsGranted,
                Scope = entry.IsGranted ? entry.Scope ?? PermissionScope.Own : null,
                ExpiresAt = entry.ExpiresAt?.ToUniversalTime(),
                Reason = entry.Reason,
                CreatedAt = now,
                CreatedById = actor.Id,
            });
        }

        await audit.AddAsync(AuditEntities.User, userId, AuditAction.Updated,
            new { overrides = request.Overrides.Select(o => new { o.Key, o.IsGranted, o.Scope, o.ExpiresAt }).ToArray() }, cancellationToken: cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        await permissionService.BumpVersionAsync([userId], cancellationToken);
    }

    private async Task<UserListItemDto> GetListItemAsync(Guid userId, CancellationToken cancellationToken)
    {
        var user = await db.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new
            {
                u.Id,
                u.Email,
                u.FullName,
                u.ManagerId,
                ManagerName = u.Manager != null ? u.Manager.FullName : null,
                u.TerritoryId,
                TerritoryName = u.Territory != null ? u.Territory.Name : null,
                TerritoryNameAr = u.Territory != null ? u.Territory.NameAr : null,
                u.IsActive,
                u.PreferredLanguage,
                u.AvatarKey,
                u.MustChangePassword,
                u.ArchivedAt,
                ProductLineIds = u.ProductLines.Select(l => l.ProductLineId).ToList(),
            })
            .SingleAsync(cancellationToken);
        var roles = await db.GetRoleSummariesAsync(userId, cancellationToken);

        return new UserListItemDto(
            user.Id, user.Email ?? string.Empty, user.FullName, roles, user.ManagerId, user.TerritoryId, user.IsActive,
            user.TerritoryName, user.TerritoryNameAr, user.ManagerName, user.PreferredLanguage,
            ImageService.Url(user.AvatarKey, ImageService.Thumbnail), user.ProductLineIds, user.MustChangePassword, user.ArchivedAt);
    }

    /// <summary>Distinct ids of existing product lines; unknown ids are refused.</summary>
    private async Task<Guid[]> ResolveProductLinesAsync(IReadOnlyList<Guid> ids, CancellationToken cancellationToken)
    {
        var wanted = ids.Distinct().ToArray();
        if (wanted.Length == 0)
        {
            return [];
        }

        var found = await db.ProductLines.Where(l => wanted.Contains(l.Id)).Select(l => l.Id).ToListAsync(cancellationToken);
        if (found.Count != wanted.Length)
        {
            throw new BusinessRuleException("unknown-product-line", "One or more product lines do not exist.");
        }

        return wanted;
    }

    private async Task EnsureManagerInScopeAsync(Guid managerId, DataScope scope, CancellationToken cancellationToken)
    {
        var manager = await db.Users.AsNoTracking()
                          .Where(u => u.Id == managerId)
                          .Select(u => new { u.Id, u.TerritoryId })
                          .SingleOrDefaultAsync(cancellationToken)
                      ?? throw new NotFoundException("User", managerId);
        if (!scope.Includes(manager.Id, manager.TerritoryId))
        {
            throw new ForbiddenException("The manager is outside your scope.");
        }
    }

    /// <summary>Roles by key (case-insensitive).</summary>
    private async Task<List<Role>> ResolveRolesAsync(IReadOnlyList<string> keys, CancellationToken cancellationToken)
    {
        var normalized = keys.Select(Role.NormalizeKey).Distinct().ToList();
        var roles = await db.Roles.AsNoTracking()
            .Where(r => normalized.Contains(r.NormalizedName!))
            .ToListAsync(cancellationToken);
        if (roles.Count != normalized.Count)
        {
            throw new BusinessRuleException(IdentityErrorCodes.UnknownRole, "One or more roles do not exist.");
        }

        return roles;
    }
}
