using System.Security.Cryptography;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Auditing;
using OriginalPharma.Application.Common.Bulk;
using OriginalPharma.Application.Common.Organization;
using OriginalPharma.Application.Common.Scoping;
using OriginalPharma.Application.Lookups;
using OriginalPharma.Domain.Audit;
using OriginalPharma.Domain.Expenses;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Application.Identity;

/// <param name="UsageCount">Doctors, pharmacies, orders, visits and expense lines that point at the node (it is archived instead of deleted).</param>
/// <param name="DefaultDailyExpense">The city's default daily expense (EGP); visits there add it to the rep's day.</param>
public sealed record TerritoryDto(
    Guid Id,
    string Code,
    string Name,
    string? NameAr,
    TerritoryLevel Level,
    Guid? ParentId,
    int UserCount,
    int CustomerCount,
    int ChildCount,
    int UsageCount = 0,
    DateTimeOffset? ArchivedAt = null,
    decimal DefaultDailyExpense = 0);

/// <param name="Name">English name.</param>
/// <param name="Code">Optional; generated when empty.</param>
/// <param name="ParentId">Region for an area, area for a town, none for a region.</param>
public sealed record CreateTerritoryRequest(string Name, string? NameAr, TerritoryLevel Level, Guid? ParentId, string? Code = null);

/// <param name="ParentId">Moving a town to another area (or an area to another region) is allowed; the level never changes.</param>
public sealed record UpdateTerritoryRequest(string Name, string? NameAr, Guid? ParentId, string? Code = null);

public static class TerritoryErrorCodes
{
    public const string ParentInvalid = "territory_parent_invalid";
    public const string CodeTaken = "territory_code_taken";
    public const string InUse = "territory_in_use";
}

/// <summary>
/// The territory tree: regions, areas (where reps work) and towns (where doctors are). Reading
/// follows territories:read; changes need territories:manage and stay inside its scope.
/// </summary>
public sealed class TerritoryService(
    IAppDbContext db,
    IDataScopeResolver scopeResolver,
    IOrgHierarchy hierarchy,
    AuditTrail audit,
    TimeProvider time,
    ICurrentUser currentUser)
{
    /// <param name="archived">Only archived nodes (true), or only nodes that are not archived (default).</param>
    public async Task<IReadOnlyList<TerritoryDto>> ListAsync(bool archived = false, CancellationToken cancellationToken = default)
    {
        var scope = await scopeResolver.ResolveAsync(Permissions.Territories.Read, cancellationToken);
        var visible = await VisibleIdsAsync(scope, cancellationToken);

        var query = db.Territories.AsNoTracking().Where(t => archived ? t.ArchivedAt != null : t.ArchivedAt == null);
        if (visible is not null)
        {
            query = query.Where(t => visible.Contains(t.Id));
        }

        return await Project(query.OrderBy(t => t.Level).ThenBy(t => t.Name)).ToListAsync(cancellationToken);
    }

    private IQueryable<TerritoryDto> Project(IQueryable<Territory> query) =>
        query.Select(t => new TerritoryDto(
            t.Id,
            t.Code,
            t.Name,
            t.NameAr,
            t.Level,
            t.ParentId,
            db.Users.Count(u => u.TerritoryId == t.Id && u.IsActive),
            db.Customers.Count(c => c.TerritoryId == t.Id && c.IsActive && c.ArchivedAt == null),
            t.Children.Count(c => c.ArchivedAt == null),
            db.Customers.Count(c => c.TerritoryId == t.Id) + db.Orders.Count(o => o.TerritoryId == t.Id) +
            db.Visits.Count(v => v.TerritoryId == t.Id) + db.ExpenseLines.Count(l => l.CityId == t.Id) +
            db.WeeklyPlanDays.Count(d => d.CityId == t.Id),
            t.ArchivedAt,
            t.DefaultDailyExpense));

    public async Task<TerritoryDto> CreateAsync(CreateTerritoryRequest request, CancellationToken cancellationToken = default)
    {
        var manageable = await ManageableIdsAsync(cancellationToken);
        await EnsureParentAsync(request.Level, request.ParentId, manageable, cancellationToken);

        var territory = new Territory
        {
            Name = request.Name.Trim(),
            NameAr = Clean(request.NameAr),
            Level = request.Level,
            ParentId = request.ParentId,
            Code = await UniqueCodeAsync(request.Code, request.Level, null, cancellationToken),
        };
        db.Territories.Add(territory);
        await audit.AddAsync(AuditEntities.Territory, territory.Id, AuditAction.Created,
            new { territory.Code, territory.Name, territory.NameAr, territory.Level, territory.ParentId }, cancellationToken: cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        hierarchy.Invalidate();
        return await GetAsync(territory.Id, cancellationToken);
    }

    public async Task<TerritoryDto> UpdateAsync(Guid id, UpdateTerritoryRequest request, CancellationToken cancellationToken = default)
    {
        var manageable = await ManageableIdsAsync(cancellationToken);
        var territory = await db.Territories.SingleOrDefaultAsync(t => t.Id == id, cancellationToken)
                        ?? throw new NotFoundException("Territory", id);
        EnsureManageable(territory.Id, manageable);

        if (request.ParentId != territory.ParentId)
        {
            await EnsureParentAsync(territory.Level, request.ParentId, manageable, cancellationToken);
        }

        var before = new { territory.Code, territory.Name, territory.NameAr, territory.ParentId };
        territory.Name = request.Name.Trim();
        territory.NameAr = Clean(request.NameAr);
        territory.ParentId = request.ParentId;
        if (!string.IsNullOrWhiteSpace(request.Code) && !string.Equals(request.Code.Trim(), territory.Code, StringComparison.OrdinalIgnoreCase))
        {
            territory.Code = await UniqueCodeAsync(request.Code, territory.Level, territory.Id, cancellationToken);
        }

        var after = new { territory.Code, territory.Name, territory.NameAr, territory.ParentId };
        if (!before.Equals(after))
        {
            await audit.AddAsync(AuditEntities.Territory, territory.Id, AuditAction.Updated, new { before, after }, cancellationToken: cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);
        hierarchy.Invalidate();
        return await GetAsync(territory.Id, cancellationToken);
    }

    /// <summary>
    /// The towns whose daily expense the caller may set (expenses:settings, within its scope: own and
    /// team mean the areas of the people concerned, territory the caller's part of the tree), with their
    /// area. The amount is the one that applies to the caller: their own when they set one
    /// (<see cref="TownDto.IsOwn"/>), otherwise the town's default (<see cref="TownDto.FallbackAmount"/>).
    /// Archived towns are left out.
    /// </summary>
    public async Task<List<TownDto>> ListExpenseDefaultsAsync(CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var allowed = await ExpenseSettingsIdsAsync(cancellationToken);
        var towns = db.Territories.AsNoTracking().Where(t => t.Level == TerritoryLevel.Town && t.ArchivedAt == null);
        if (allowed is not null)
        {
            towns = towns.Where(t => allowed.Contains(t.Id));
        }

        var rows = await towns
            .OrderBy(t => t.Parent!.Name).ThenBy(t => t.Name)
            .Select(t => new
            {
                Town = new TownDto(t.Id, t.Name, t.NameAr, t.ParentId, t.Parent!.Name, t.Parent.NameAr, t.DefaultDailyExpense, false, null),
                Own = db.RepTownExpenseDefaults.Where(d => d.UserId == me && d.TerritoryId == t.Id).Select(d => (decimal?)d.Amount).FirstOrDefault(),
            })
            .ToListAsync(cancellationToken);
        return rows
            .Select(r => r.Town with
            {
                DefaultDailyExpense = r.Own ?? r.Town.DefaultDailyExpense,
                IsOwn = r.Own is not null,
                FallbackAmount = r.Town.DefaultDailyExpense,
            })
            .ToList();
    }

    /// <summary>
    /// Sets a city's default daily expense, the fallback for reps without an amount of their own
    /// (expenses:settings, inside its scope). Only the amount changes; name, code and area need
    /// territories:manage. Zero means visits there add no expense. Lines already created keep their amount.
    /// A caller whose expenses:settings scope is "own" (a rep, also from an older app) sets their own
    /// amount instead (<see cref="SetMyExpenseDefaultAsync"/>): a rep never changes the amount of others.
    /// </summary>
    public async Task<TerritoryDto> SetDefaultExpenseAsync(Guid id, decimal amount, CancellationToken cancellationToken = default)
    {
        var scope = await scopeResolver.ResolveAsync(Permissions.Expenses.Settings, cancellationToken);
        if (scope.Level == PermissionScope.Own)
        {
            var mine = await SetMyExpenseDefaultAsync(id, amount, cancellationToken);
            return (await GetAsync(id, cancellationToken)) with { DefaultDailyExpense = mine.DefaultDailyExpense };
        }

        var territory = await db.Territories.SingleOrDefaultAsync(t => t.Id == id, cancellationToken)
                        ?? throw new NotFoundException("Territory", id);
        var allowed = await ExpenseSettingsIdsAsync(cancellationToken);
        if (allowed is not null && !allowed.Contains(territory.Id))
        {
            throw new ForbiddenException("This city is outside your scope.");
        }

        var rounded = RoundAmount(amount);
        if (rounded != territory.DefaultDailyExpense)
        {
            await audit.AddAsync(AuditEntities.Territory, territory.Id, AuditAction.Updated,
                new { before = new { territory.DefaultDailyExpense }, after = new { DefaultDailyExpense = rounded } },
                cancellationToken: cancellationToken);
            territory.DefaultDailyExpense = rounded;
            await db.SaveChangesAsync(cancellationToken);
        }

        return await GetAsync(territory.Id, cancellationToken);
    }

    /// <summary>
    /// Sets the caller's own daily expense for a town (expenses:settings, the town inside its scope). Only
    /// the caller's amount changes: other reps keep theirs and the town's default stays as it is. New
    /// automatic lines of the caller use it; lines already created keep their amount.
    /// </summary>
    public async Task<TownDto> SetMyExpenseDefaultAsync(Guid id, decimal amount, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        await EnsureExpenseTownAsync(id, cancellationToken);
        var rounded = RoundAmount(amount);
        var row = await db.RepTownExpenseDefaults.SingleOrDefaultAsync(d => d.UserId == me && d.TerritoryId == id, cancellationToken);
        if (row is null || row.Amount != rounded)
        {
            await audit.AddAsync(AuditEntities.Territory, id, AuditAction.Updated,
                new { ownAmountOf = me, before = new { Amount = row?.Amount }, after = new { Amount = rounded } },
                cancellationToken: cancellationToken);
            if (row is null)
            {
                db.RepTownExpenseDefaults.Add(new RepTownExpenseDefault { UserId = me, TerritoryId = id, Amount = rounded, UpdatedAt = time.GetUtcNow() });
            }
            else
            {
                row.Amount = rounded;
                row.UpdatedAt = time.GetUtcNow();
            }

            await db.SaveChangesAsync(cancellationToken);
        }

        return await ExpenseTownAsync(id, cancellationToken);
    }

    /// <summary>"Use the default amount": removes the caller's own amount for a town, so the town's default applies again.</summary>
    public async Task<TownDto> ClearMyExpenseDefaultAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        await EnsureExpenseTownAsync(id, cancellationToken);
        var row = await db.RepTownExpenseDefaults.SingleOrDefaultAsync(d => d.UserId == me && d.TerritoryId == id, cancellationToken);
        if (row is not null)
        {
            await audit.AddAsync(AuditEntities.Territory, id, AuditAction.Updated,
                new { ownAmountOf = me, before = new { row.Amount }, after = new { Amount = (decimal?)null } },
                cancellationToken: cancellationToken);
            db.RepTownExpenseDefaults.Remove(row);
            await db.SaveChangesAsync(cancellationToken);
        }

        return await ExpenseTownAsync(id, cancellationToken);
    }

    /// <summary>A town that is not archived and lies inside the caller's expenses:settings scope (404 / 403 otherwise).</summary>
    private async Task EnsureExpenseTownAsync(Guid id, CancellationToken cancellationToken)
    {
        if (!await db.Territories.AnyAsync(t => t.Id == id && t.Level == TerritoryLevel.Town && t.ArchivedAt == null, cancellationToken))
        {
            throw new NotFoundException("Territory", id);
        }

        var allowed = await ExpenseSettingsIdsAsync(cancellationToken);
        if (allowed is not null && !allowed.Contains(id))
        {
            throw new ForbiddenException("This city is outside your scope.");
        }
    }

    private async Task<TownDto> ExpenseTownAsync(Guid id, CancellationToken cancellationToken) =>
        (await ListExpenseDefaultsAsync(cancellationToken)).Single(t => t.Id == id);

    private static decimal RoundAmount(decimal amount) => Math.Round(amount, 2, MidpointRounding.AwayFromZero);

    /// <summary>
    /// Deletes one node (territories:delete): removed when nothing points at it, archived while doctors,
    /// orders or visits do; refused while it has active child nodes or users.
    /// </summary>
    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var item = (await DeleteManyAsync(new BulkDeleteRequest([id]), cancellationToken)).Items.Single();
        switch (item.Code)
        {
            case null:
                return;
            case BulkCodes.NotFound:
                throw new NotFoundException("Territory", id);
            case BulkCodes.OutOfScope:
                throw new ForbiddenException("This territory is outside your scope.");
            default:
                throw new ConflictException(TerritoryErrorCodes.InUse, "Move or delete the towns and users of this territory first.")
                {
                    Details = new Dictionary<string, object?> { ["reason"] = item.Code },
                };
        }
    }

    /// <summary>
    /// Bulk delete. Towns are handled before areas and areas before regions, so a node whose children
    /// are in the same request can go too. Per node: blocked (out of scope, active children, users),
    /// archived (used, or has archived children) or deleted.
    /// </summary>
    public async Task<BulkResult> DeleteManyAsync(BulkDeleteRequest request, CancellationToken cancellationToken = default)
    {
        var manageable = await VisibleIdsAsync(await scopeResolver.ResolveAsync(Permissions.Territories.Delete, cancellationToken), cancellationToken);
        var ids = request.Ids.Distinct().ToArray();
        var nodes = await db.Territories.Where(t => ids.Contains(t.Id)).ToDictionaryAsync(t => t.Id, cancellationToken);
        var children = await db.Territories.AsNoTracking()
            .Where(t => t.ParentId != null && ids.Contains(t.ParentId.Value))
            .Select(t => new { t.Id, ParentId = t.ParentId!.Value, t.ArchivedAt })
            .ToListAsync(cancellationToken);
        var users = await db.Users.Where(u => u.TerritoryId != null && ids.Contains(u.TerritoryId.Value) && u.ArchivedAt == null)
            .GroupBy(u => u.TerritoryId!.Value).Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken);
        var usage = await UsageAsync(ids, cancellationToken);

        var now = time.GetUtcNow();
        var outcomes = new Dictionary<Guid, BulkItemResult>();
        foreach (var id in ids.OrderByDescending(i => nodes.TryGetValue(i, out var n) ? (int)n.Level : 0))
        {
            if (!nodes.TryGetValue(id, out var node))
            {
                outcomes[id] = new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.NotFound);
                continue;
            }

            var used = usage.GetValueOrDefault(id);
            if (manageable is not null && !manageable.Contains(id))
            {
                outcomes[id] = new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.OutOfScope, used);
                continue;
            }

            // Children handled earlier in this request count as gone (deleted) or archived.
            var activeChildren = children.Count(c => c.ParentId == id && c.ArchivedAt == null &&
                                                     !(outcomes.TryGetValue(c.Id, out var r) && r.Outcome is BulkOutcome.Deleted or BulkOutcome.Archived));
            var keptChildren = children.Count(c => c.ParentId == id &&
                                                   !(outcomes.TryGetValue(c.Id, out var r) && r.Outcome == BulkOutcome.Deleted));
            if (activeChildren > 0)
            {
                outcomes[id] = new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.HasChildren, used);
                continue;
            }

            if (users.GetValueOrDefault(id) > 0)
            {
                outcomes[id] = new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.HasUsers, used);
                continue;
            }

            var archive = used > 0 || keptChildren > 0 || node.ArchivedAt is not null;
            outcomes[id] = new BulkItemResult(id, archive ? BulkOutcome.Archived : BulkOutcome.Deleted, null, used);
            if (request.DryRun)
            {
                continue;
            }

            if (archive)
            {
                node.ArchivedAt ??= now;
            }
            else
            {
                db.Territories.Remove(node);
            }

            await audit.AddAsync(AuditEntities.Territory, id, archive ? AuditAction.Archived : AuditAction.Deleted,
                new { node.Code, node.Name, node.NameAr, node.Level, usageCount = used }, cancellationToken: cancellationToken);
        }

        var result = BulkResult.From(ids.Select(i => outcomes[i]).ToList(), request.DryRun);
        if (!request.DryRun && result.Done > 0)
        {
            await audit.AddBulkAsync(AuditEntities.Territory, AuditAction.BulkDelete, result, cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
            hierarchy.Invalidate();
        }

        return result;
    }

    /// <summary>Brings archived nodes back (territories:restore). A node under an archived parent waits for the parent.</summary>
    public async Task<BulkResult> RestoreManyAsync(BulkIdsRequest request, CancellationToken cancellationToken = default)
    {
        var manageable = await VisibleIdsAsync(await scopeResolver.ResolveAsync(Permissions.Territories.Restore, cancellationToken), cancellationToken);
        var ids = request.Ids.Distinct().ToArray();
        var nodes = await db.Territories.Where(t => ids.Contains(t.Id)).ToDictionaryAsync(t => t.Id, cancellationToken);
        var parentIds = nodes.Values.Where(n => n.ParentId != null).Select(n => n.ParentId!.Value).ToArray();
        var archivedParents = (await db.Territories.Where(t => parentIds.Contains(t.Id) && t.ArchivedAt != null)
            .Select(t => t.Id).ToListAsync(cancellationToken)).ToHashSet();

        var outcomes = new Dictionary<Guid, BulkItemResult>();
        foreach (var id in ids.OrderBy(i => nodes.TryGetValue(i, out var n) ? (int)n.Level : 0))
        {
            if (!nodes.TryGetValue(id, out var node))
            {
                outcomes[id] = new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.NotFound);
            }
            else if (manageable is not null && !manageable.Contains(id))
            {
                outcomes[id] = new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.OutOfScope);
            }
            else if (node.ArchivedAt is null)
            {
                outcomes[id] = new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.NotArchived);
            }
            else if (node.ParentId is { } parentId && archivedParents.Contains(parentId) &&
                     !(outcomes.TryGetValue(parentId, out var parent) && parent.Outcome == BulkOutcome.Restored))
            {
                outcomes[id] = new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.ParentArchived);
            }
            else
            {
                node.ArchivedAt = null;
                outcomes[id] = new BulkItemResult(id, BulkOutcome.Restored);
                await audit.AddAsync(AuditEntities.Territory, id, AuditAction.Restored, new { node.Code, node.Name, node.NameAr }, cancellationToken: cancellationToken);
            }
        }

        var result = BulkResult.From(ids.Select(i => outcomes[i]).ToList(), false);
        if (result.Done > 0)
        {
            await audit.AddBulkAsync(AuditEntities.Territory, AuditAction.BulkRestore, result, cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
            hierarchy.Invalidate();
        }

        return result;
    }

    private async Task<Dictionary<Guid, int>> UsageAsync(Guid[] ids, CancellationToken cancellationToken)
    {
        var counts = new Dictionary<Guid, int>();
        void Add(IEnumerable<(Guid Id, int Count)> rows)
        {
            foreach (var (id, count) in rows)
            {
                counts[id] = counts.GetValueOrDefault(id) + count;
            }
        }

        Add((await db.Customers.Where(c => c.TerritoryId != null && ids.Contains(c.TerritoryId.Value))
            .GroupBy(c => c.TerritoryId!.Value).Select(g => new { g.Key, Count = g.Count() }).ToListAsync(cancellationToken))
            .Select(x => (x.Key, x.Count)));
        Add((await db.Orders.Where(o => o.TerritoryId != null && ids.Contains(o.TerritoryId.Value))
            .GroupBy(o => o.TerritoryId!.Value).Select(g => new { g.Key, Count = g.Count() }).ToListAsync(cancellationToken))
            .Select(x => (x.Key, x.Count)));
        Add((await db.Visits.Where(v => v.TerritoryId != null && ids.Contains(v.TerritoryId.Value))
            .GroupBy(v => v.TerritoryId!.Value).Select(g => new { g.Key, Count = g.Count() }).ToListAsync(cancellationToken))
            .Select(x => (x.Key, x.Count)));
        Add((await db.ExpenseLines.Where(l => ids.Contains(l.CityId))
            .GroupBy(l => l.CityId).Select(g => new { g.Key, Count = g.Count() }).ToListAsync(cancellationToken))
            .Select(x => (x.Key, x.Count)));
        Add((await db.WeeklyPlanDays.Where(d => ids.Contains(d.CityId))
            .GroupBy(d => d.CityId).Select(g => new { g.Key, Count = g.Count() }).ToListAsync(cancellationToken))
            .Select(x => (x.Key, x.Count)));
        return counts;
    }

    private async Task<TerritoryDto> GetAsync(Guid id, CancellationToken cancellationToken) =>
        await Project(db.Territories.AsNoTracking().Where(t => t.Id == id)).SingleAsync(cancellationToken);

    /// <summary>
    /// Ids visible for a scope, or null for all. Territory scope already contains the subtree;
    /// own and team scopes see the users' nodes plus everything under them.
    /// </summary>
    private async Task<HashSet<Guid>?> VisibleIdsAsync(DataScope scope, CancellationToken cancellationToken)
    {
        var roots = await scope.ResolveTerritoryIdsAsync(db, cancellationToken);
        if (roots is null)
        {
            return null;
        }

        var tree = await TerritoryTree.LoadAsync(db, cancellationToken);
        return roots.SelectMany(tree.SelfAndDescendants).ToHashSet();
    }

    /// <summary>Nodes whose default daily expense the caller may set; null for all.</summary>
    private async Task<HashSet<Guid>?> ExpenseSettingsIdsAsync(CancellationToken cancellationToken) =>
        await VisibleIdsAsync(await scopeResolver.ResolveAsync(Permissions.Expenses.Settings, cancellationToken), cancellationToken);

    private async Task<HashSet<Guid>?> ManageableIdsAsync(CancellationToken cancellationToken) =>
        await VisibleIdsAsync(await scopeResolver.ResolveAsync(Permissions.Territories.Manage, cancellationToken), cancellationToken);

    private static void EnsureManageable(Guid id, HashSet<Guid>? manageable)
    {
        if (manageable is not null && !manageable.Contains(id))
        {
            throw new ForbiddenException("This territory is outside your scope.");
        }
    }

    private async Task EnsureParentAsync(TerritoryLevel level, Guid? parentId, HashSet<Guid>? manageable, CancellationToken cancellationToken)
    {
        if (level == TerritoryLevel.Region)
        {
            if (parentId is not null)
            {
                throw new BusinessRuleException(TerritoryErrorCodes.ParentInvalid, "A region cannot have a parent.");
            }

            if (manageable is not null)
            {
                throw new ForbiddenException("Only users with access to every territory can add regions.");
            }

            return;
        }

        if (parentId is not { } id)
        {
            throw new BusinessRuleException(TerritoryErrorCodes.ParentInvalid,
                level == TerritoryLevel.Town ? "Choose the area this town belongs to." : "Choose the region of this area.");
        }

        var parent = await db.Territories.Where(t => t.Id == id).Select(t => new { t.Level, t.ArchivedAt }).SingleOrDefaultAsync(cancellationToken)
                     ?? throw new NotFoundException("Territory", id);
        if (parent.ArchivedAt is not null)
        {
            throw new BusinessRuleException(TerritoryErrorCodes.ParentInvalid, "The chosen parent is archived. Restore it first.");
        }

        var parentLevel = parent.Level;
        if (Territory.ChildLevel(parentLevel) != level)
        {
            throw new BusinessRuleException(TerritoryErrorCodes.ParentInvalid,
                level == TerritoryLevel.Town ? "A town must belong to an area." : "An area must belong to a region.");
        }

        EnsureManageable(id, manageable);
    }

    private async Task<string> UniqueCodeAsync(string? requested, TerritoryLevel level, Guid? exceptId, CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(requested))
        {
            var code = requested.Trim().ToUpperInvariant();
            if (await db.Territories.AnyAsync(t => t.Code == code && t.Id != exceptId, cancellationToken))
            {
                throw new ConflictException(TerritoryErrorCodes.CodeTaken, "Another territory already uses this code.");
            }

            return code;
        }

        var prefix = level switch
        {
            TerritoryLevel.Region => "R",
            TerritoryLevel.Area => "A",
            _ => "T",
        };
        while (true)
        {
            var code = $"{prefix}-{RandomNumberGenerator.GetString("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6)}";
            if (!await db.Territories.AnyAsync(t => t.Code == code, cancellationToken))
            {
                return code;
            }
        }
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

public sealed class CreateTerritoryRequestValidator : AbstractValidator<CreateTerritoryRequest>
{
    public CreateTerritoryRequestValidator()
    {
        RuleFor(x => x.Name).Must(n => !string.IsNullOrWhiteSpace(n)).WithMessage("Name is required.").MaximumLength(Territory.NameMaxLength);
        RuleFor(x => x.NameAr).MaximumLength(Territory.NameMaxLength);
        RuleFor(x => x.Level).IsInEnum();
        RuleFor(x => x.Code).MaximumLength(Territory.CodeMaxLength).Matches("^[A-Za-z0-9-]*$").When(x => x.Code is not null);
        RuleFor(x => x.ParentId).NotEqual(Guid.Empty);
    }
}

public sealed class UpdateTerritoryRequestValidator : AbstractValidator<UpdateTerritoryRequest>
{
    public UpdateTerritoryRequestValidator()
    {
        RuleFor(x => x.Name).Must(n => !string.IsNullOrWhiteSpace(n)).WithMessage("Name is required.").MaximumLength(Territory.NameMaxLength);
        RuleFor(x => x.NameAr).MaximumLength(Territory.NameMaxLength);
        RuleFor(x => x.Code).MaximumLength(Territory.CodeMaxLength).Matches("^[A-Za-z0-9-]*$").When(x => x.Code is not null);
        RuleFor(x => x.ParentId).NotEqual(Guid.Empty);
    }
}
