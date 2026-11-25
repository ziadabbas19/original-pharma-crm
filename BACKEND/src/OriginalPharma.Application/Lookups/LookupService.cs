using FluentValidation;
using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Auditing;
using OriginalPharma.Application.Common.Bulk;
using OriginalPharma.Domain.Audit;
using OriginalPharma.Domain.Common;
using OriginalPharma.Domain.Crm;
using OriginalPharma.Domain.Orders;

namespace OriginalPharma.Application.Lookups;

/// <summary>A specialty or collection method.</summary>
/// <param name="UsageCount">Doctors (specialty) or orders (collection method) that use the entry.</param>
/// <param name="ArchivedAt">Set when the entry was deleted while in use; it is then hidden from pickers.</param>
public sealed record LookupDto(
    Guid Id,
    string NameAr,
    string NameEn,
    bool IsActive,
    int SortOrder,
    int UsageCount = 0,
    DateTimeOffset? ArchivedAt = null);

/// <summary>A town with the area it belongs to (for doctor forms and filters).</summary>
/// <param name="DefaultDailyExpense">
/// The daily expense (EGP) that applies to the caller in this town: their own amount when they set one,
/// otherwise the town's default. Suggested when a rep adds an expense line for it.
/// </param>
/// <param name="IsOwn">The amount is the caller's own (expense-defaults only).</param>
/// <param name="FallbackAmount">The town's default, used when the caller has no own amount (expense-defaults only).</param>
public sealed record TownDto(
    Guid Id,
    string Name,
    string? NameAr,
    Guid? AreaId,
    string? AreaName,
    string? AreaNameAr,
    decimal DefaultDailyExpense = 0,
    bool IsOwn = false,
    decimal? FallbackAmount = null);

public sealed record SaveLookupRequest(string NameAr, string NameEn, bool IsActive = true, int SortOrder = 0);

public static class LookupErrorCodes
{
    public const string NameTaken = "lookup_name_taken";
}

/// <summary>
/// Small admin-managed lists: doctor specialties and order collection methods. Everyone signed in
/// can read the active entries (forms need them); changes need lookups:manage. Deleting an entry
/// that doctors or orders still use archives it (hidden from pickers, old records keep the name);
/// an unused entry is removed for real.
/// </summary>
public sealed class LookupService(IAppDbContext db, ICurrentUser currentUser, AuditTrail audit, TimeProvider time)
{
    /// <summary>
    /// All towns that are not archived, by area then name, with the daily expense that applies to the
    /// caller (their own amount, else the town's). Town names are not sensitive; everyone signed in can read them.
    /// </summary>
    public Task<List<TownDto>> ListTownsAsync(CancellationToken cancellationToken = default)
    {
        var me = currentUser.UserId;
        return db.Territories.AsNoTracking()
            .Where(t => t.Level == Domain.Identity.TerritoryLevel.Town && t.ArchivedAt == null)
            .OrderBy(t => t.Parent!.Name).ThenBy(t => t.Name)
            .Select(t => new TownDto(t.Id, t.Name, t.NameAr, t.ParentId, t.Parent!.Name, t.Parent.NameAr,
                db.RepTownExpenseDefaults.Where(d => d.UserId == me && d.TerritoryId == t.Id).Select(d => (decimal?)d.Amount).FirstOrDefault()
                ?? t.DefaultDailyExpense, false, null))
            .ToListAsync(cancellationToken);
    }

    /// <param name="includeInactive">Also entries switched off (for the management screen).</param>
    /// <param name="archived">Only archived entries (true), or only entries that are not archived (default).</param>
    public Task<List<LookupDto>> ListSpecialtiesAsync(bool includeInactive, bool archived = false, CancellationToken cancellationToken = default) =>
        db.Specialties.AsNoTracking()
            .Where(s => (includeInactive || s.IsActive) && (archived ? s.ArchivedAt != null : s.ArchivedAt == null))
            .OrderBy(s => s.SortOrder).ThenBy(s => s.NameEn)
            .Select(s => new LookupDto(s.Id, s.NameAr, s.NameEn, s.IsActive, s.SortOrder,
                db.Customers.Count(c => c.SpecialtyId == s.Id), s.ArchivedAt))
            .ToListAsync(cancellationToken);

    public async Task<LookupDto> CreateSpecialtyAsync(SaveLookupRequest request, CancellationToken cancellationToken = default)
    {
        var (ar, en) = Names(request);
        await EnsureSpecialtyNamesFreeAsync(ar, en, null, cancellationToken);
        var specialty = new Specialty { NameAr = ar, NameEn = en, IsActive = request.IsActive, SortOrder = request.SortOrder };
        db.Specialties.Add(specialty);
        await audit.AddAsync(AuditEntities.Specialty, specialty.Id, AuditAction.Created, Snapshot(specialty), cancellationToken: cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return ToDto(specialty, 0);
    }

    public async Task<LookupDto> UpdateSpecialtyAsync(Guid id, SaveLookupRequest request, CancellationToken cancellationToken = default)
    {
        var specialty = await db.Specialties.SingleOrDefaultAsync(s => s.Id == id, cancellationToken)
                        ?? throw new NotFoundException("Specialty", id);
        var (ar, en) = Names(request);
        await EnsureSpecialtyNamesFreeAsync(ar, en, id, cancellationToken);
        await ApplyAsync(AuditEntities.Specialty, specialty, ar, en, request, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return ToDto(specialty, await db.Customers.CountAsync(c => c.SpecialtyId == id, cancellationToken));
    }

    /// <summary>Unused specialties are removed; those doctors still use are archived.</summary>
    public async Task<BulkResult> DeleteSpecialtiesAsync(BulkDeleteRequest request, CancellationToken cancellationToken = default)
    {
        var ids = request.Ids.Distinct().ToArray();
        var items = await db.Specialties.Where(s => ids.Contains(s.Id)).ToDictionaryAsync(s => s.Id, cancellationToken);
        var usage = await db.Customers.Where(c => c.SpecialtyId != null && ids.Contains(c.SpecialtyId.Value))
            .GroupBy(c => c.SpecialtyId!.Value)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken);
        return await DeleteAsync(AuditEntities.Specialty, ids, items, usage, s => db.Specialties.Remove((Specialty)s), request.DryRun, cancellationToken);
    }

    public async Task<BulkResult> RestoreSpecialtiesAsync(BulkIdsRequest request, CancellationToken cancellationToken = default)
    {
        var ids = request.Ids.Distinct().ToArray();
        var items = await db.Specialties.Where(s => ids.Contains(s.Id)).ToDictionaryAsync(s => s.Id, s => (ILookupItem)s, cancellationToken);
        return await RestoreAsync(AuditEntities.Specialty, ids, items, cancellationToken);
    }

    public Task<List<LookupDto>> ListCollectionMethodsAsync(bool includeInactive, bool archived = false, CancellationToken cancellationToken = default) =>
        db.CollectionMethods.AsNoTracking()
            .Where(m => (includeInactive || m.IsActive) && (archived ? m.ArchivedAt != null : m.ArchivedAt == null))
            .OrderBy(m => m.SortOrder).ThenBy(m => m.NameEn)
            .Select(m => new LookupDto(m.Id, m.NameAr, m.NameEn, m.IsActive, m.SortOrder,
                db.Orders.Count(o => o.CollectionMethodId == m.Id), m.ArchivedAt))
            .ToListAsync(cancellationToken);

    public async Task<LookupDto> CreateCollectionMethodAsync(SaveLookupRequest request, CancellationToken cancellationToken = default)
    {
        var (ar, en) = Names(request);
        await EnsureMethodNamesFreeAsync(ar, en, null, cancellationToken);
        var method = new CollectionMethod { NameAr = ar, NameEn = en, IsActive = request.IsActive, SortOrder = request.SortOrder };
        db.CollectionMethods.Add(method);
        await audit.AddAsync(AuditEntities.CollectionMethod, method.Id, AuditAction.Created, Snapshot(method), cancellationToken: cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return ToDto(method, 0);
    }

    public async Task<LookupDto> UpdateCollectionMethodAsync(Guid id, SaveLookupRequest request, CancellationToken cancellationToken = default)
    {
        var method = await db.CollectionMethods.SingleOrDefaultAsync(m => m.Id == id, cancellationToken)
                     ?? throw new NotFoundException("CollectionMethod", id);
        var (ar, en) = Names(request);
        await EnsureMethodNamesFreeAsync(ar, en, id, cancellationToken);
        await ApplyAsync(AuditEntities.CollectionMethod, method, ar, en, request, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return ToDto(method, await db.Orders.CountAsync(o => o.CollectionMethodId == id, cancellationToken));
    }

    /// <summary>Unused collection methods are removed; those past orders use are archived.</summary>
    public async Task<BulkResult> DeleteCollectionMethodsAsync(BulkDeleteRequest request, CancellationToken cancellationToken = default)
    {
        var ids = request.Ids.Distinct().ToArray();
        var items = await db.CollectionMethods.Where(m => ids.Contains(m.Id)).ToDictionaryAsync(m => m.Id, cancellationToken);
        var usage = await db.Orders.Where(o => o.CollectionMethodId != null && ids.Contains(o.CollectionMethodId.Value))
            .GroupBy(o => o.CollectionMethodId!.Value)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken);
        return await DeleteAsync(AuditEntities.CollectionMethod, ids, items, usage, m => db.CollectionMethods.Remove((CollectionMethod)m), request.DryRun, cancellationToken);
    }

    public async Task<BulkResult> RestoreCollectionMethodsAsync(BulkIdsRequest request, CancellationToken cancellationToken = default)
    {
        var ids = request.Ids.Distinct().ToArray();
        var items = await db.CollectionMethods.Where(m => ids.Contains(m.Id)).ToDictionaryAsync(m => m.Id, m => (ILookupItem)m, cancellationToken);
        return await RestoreAsync(AuditEntities.CollectionMethod, ids, items, cancellationToken);
    }

    private async Task<BulkResult> DeleteAsync<T>(
        string entityType,
        IReadOnlyList<Guid> ids,
        IReadOnlyDictionary<Guid, T> items,
        IReadOnlyDictionary<Guid, int> usage,
        Action<ILookupItem> remove,
        bool dryRun,
        CancellationToken cancellationToken)
        where T : ILookupItem
    {
        var now = time.GetUtcNow();
        var results = new List<BulkItemResult>();
        foreach (var id in ids)
        {
            if (!items.TryGetValue(id, out var item))
            {
                results.Add(new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.NotFound));
                continue;
            }

            var used = usage.GetValueOrDefault(id);
            var outcome = used > 0 ? BulkOutcome.Archived : BulkOutcome.Deleted;
            results.Add(new BulkItemResult(id, outcome, null, used));
            if (dryRun)
            {
                continue;
            }

            if (outcome == BulkOutcome.Archived)
            {
                item.ArchivedAt ??= now;
            }
            else
            {
                remove(item);
            }

            await audit.AddAsync(entityType, id, outcome == BulkOutcome.Archived ? AuditAction.Archived : AuditAction.Deleted,
                new { item.NameAr, item.NameEn, usageCount = used }, cancellationToken: cancellationToken);
        }

        var result = BulkResult.From(results, dryRun);
        if (!dryRun && result.Done > 0)
        {
            await audit.AddBulkAsync(entityType, AuditAction.BulkDelete, result, cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
        }

        return result;
    }

    private async Task<BulkResult> RestoreAsync(
        string entityType,
        IReadOnlyList<Guid> ids,
        IReadOnlyDictionary<Guid, ILookupItem> items,
        CancellationToken cancellationToken)
    {
        var results = new List<BulkItemResult>();
        foreach (var id in ids)
        {
            if (!items.TryGetValue(id, out var item))
            {
                results.Add(new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.NotFound));
            }
            else if (item.ArchivedAt is null)
            {
                results.Add(new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.NotArchived));
            }
            else
            {
                item.ArchivedAt = null;
                results.Add(new BulkItemResult(id, BulkOutcome.Restored));
                await audit.AddAsync(entityType, id, AuditAction.Restored, new { item.NameAr, item.NameEn }, cancellationToken: cancellationToken);
            }
        }

        var result = BulkResult.From(results, false);
        if (result.Done > 0)
        {
            await audit.AddBulkAsync(entityType, AuditAction.BulkRestore, result, cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
        }

        return result;
    }

    private async Task ApplyAsync(string entityType, ILookupItem item, string ar, string en, SaveLookupRequest request, CancellationToken cancellationToken)
    {
        var before = Snapshot(item);
        item.NameAr = ar;
        item.NameEn = en;
        item.IsActive = request.IsActive;
        item.SortOrder = request.SortOrder;
        var after = Snapshot(item);
        if (before != after)
        {
            await audit.AddAsync(entityType, item.Id, AuditAction.Updated, new { before, after }, cancellationToken: cancellationToken);
        }
    }

    private static LookupSnapshot Snapshot(ILookupItem item) => new(item.NameAr, item.NameEn, item.IsActive, item.SortOrder);

    private static LookupDto ToDto(ILookupItem item, int usage) =>
        new(item.Id, item.NameAr, item.NameEn, item.IsActive, item.SortOrder, usage, item.ArchivedAt);

    private static (string Ar, string En) Names(SaveLookupRequest request) => (request.NameAr.Trim(), request.NameEn.Trim());

    private async Task EnsureSpecialtyNamesFreeAsync(string ar, string en, Guid? exceptId, CancellationToken cancellationToken)
    {
        var arLower = ar.ToLower();
        var enLower = en.ToLower();
        if (await db.Specialties.AnyAsync(s => s.Id != exceptId && (s.NameAr.ToLower() == arLower || s.NameEn.ToLower() == enLower), cancellationToken))
        {
            throw new ConflictException(LookupErrorCodes.NameTaken, "Another entry already uses this name (it may be archived).");
        }
    }

    private async Task EnsureMethodNamesFreeAsync(string ar, string en, Guid? exceptId, CancellationToken cancellationToken)
    {
        var arLower = ar.ToLower();
        var enLower = en.ToLower();
        if (await db.CollectionMethods.AnyAsync(m => m.Id != exceptId && (m.NameAr.ToLower() == arLower || m.NameEn.ToLower() == enLower), cancellationToken))
        {
            throw new ConflictException(LookupErrorCodes.NameTaken, "Another entry already uses this name (it may be archived).");
        }
    }

    private sealed record LookupSnapshot(string NameAr, string NameEn, bool IsActive, int SortOrder);
}

public sealed class SaveLookupRequestValidator : AbstractValidator<SaveLookupRequest>
{
    public SaveLookupRequestValidator()
    {
        RuleFor(x => x.NameAr).Must(n => !string.IsNullOrWhiteSpace(n)).WithMessage("Name is required.").MaximumLength(Specialty.NameMaxLength);
        RuleFor(x => x.NameEn).Must(n => !string.IsNullOrWhiteSpace(n)).WithMessage("Name is required.").MaximumLength(Specialty.NameMaxLength);
        RuleFor(x => x.SortOrder).InclusiveBetween(0, 10_000);
    }
}
