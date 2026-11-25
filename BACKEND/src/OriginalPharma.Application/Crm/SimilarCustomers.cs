using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Scoping;
using OriginalPharma.Application.Identity;
using OriginalPharma.Domain.Crm;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Application.Crm;

/// <summary>
/// A customer that looks like the one being added (same type, same town). Customers outside the caller's
/// customers:read scope come with their name and town / area only (<see cref="Limited"/>).
/// </summary>
/// <param name="Id">Null when <see cref="Limited"/>.</param>
/// <param name="Same">The same name (after normalizing) or the same phone number; otherwise only similar.</param>
/// <param name="Limited">Outside the caller's scope: only the name, town and area are given.</param>
/// <param name="AddedByName">Doctors: who added the doctor.</param>
/// <param name="InMyList">Doctors: already on the caller's own list.</param>
/// <param name="IsInactive">Switched off (still counts: it can be switched on again).</param>
public sealed record SimilarCustomerDto(
    Guid? Id,
    CustomerType Type,
    string Name,
    string? NameAr,
    string? TownName,
    string? TownNameAr,
    string? AreaName,
    string? AreaNameAr,
    bool Same,
    bool Limited,
    string? Address = null,
    string? Landmark = null,
    string? AddedByName = null,
    bool? InMyList = null,
    bool IsInactive = false);

/// <param name="Type">Doctor, pharmacy or hospital (AM place).</param>
/// <param name="Name">The name being typed (Arabic or English).</param>
/// <param name="TerritoryId">The town it is added in.</param>
/// <param name="Phone">Optional; the same number counts as the same customer.</param>
public sealed record SimilarCustomersQuery(CustomerType Type, string? Name, Guid TerritoryId, string? Phone = null);

public static class DuplicateErrorCodes
{
    /// <summary>Similar customers exist in that town; the response carries <c>candidates</c> (<see cref="SimilarCustomerDto"/>).</summary>
    public const string Suspected = "duplicate_suspected";
}

/// <summary>
/// Finds existing customers of the same type in the same town that look like a new one
/// (<see cref="CustomerSimilarity"/>), active or not (archived ones are left out). Every customer of the
/// town is compared, whatever the caller's scope; those outside it are returned with name and area only.
/// Doctors are a shared directory, so every doctor is inside the scope of anyone with customers:read.
/// </summary>
public sealed class SimilarCustomerFinder(IAppDbContext db, ICurrentUser currentUser, IDataScopeResolver scopeResolver)
{
    public const int MaxCandidates = 5;

    public Task<IReadOnlyList<SimilarCustomerDto>> FindAsync(SimilarCustomersQuery query, CancellationToken cancellationToken = default) =>
        FindAsync(query.Type, query.TerritoryId, [query.Name], query.Phone, cancellationToken);

    /// <summary>Up to <see cref="MaxCandidates"/> candidates, the same ones first, then the closest names, then by name.</summary>
    public async Task<IReadOnlyList<SimilarCustomerDto>> FindAsync(
        CustomerType type,
        Guid territoryId,
        IReadOnlyList<string?> names,
        string? phone,
        CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var normalized = names.Select(CustomerNameSearch.Normalize).Where(n => n.Length > 0).Distinct().ToList();
        var phoneKey = CustomerSimilarity.NormalizePhone(phone);
        if (normalized.Count == 0 && phoneKey is null)
        {
            return [];
        }

        var rows = await db.Customers.AsNoTracking()
            .Where(c => c.Type == type && c.TerritoryId == territoryId && c.ArchivedAt == null)
            .Select(c => new { c.Id, c.Name, c.NameAr, c.NameSearch, c.NameArSearch, c.Phone, c.IsActive, c.Address, c.Landmark, c.CreatedById })
            .ToListAsync(cancellationToken);
        var matches = rows
            .Select(r => new
            {
                Row = r,
                Rank = CustomerSimilarity.RankNormalized(
                    normalized,
                    phoneKey,
                    r.NameArSearch is null ? [r.NameSearch] : [r.NameSearch, r.NameArSearch],
                    CustomerSimilarity.NormalizePhone(r.Phone)),
            })
            .Where(m => m.Rank is not null)
            .OrderBy(m => m.Rank).ThenBy(m => m.Row.Name).ThenBy(m => m.Row.Id)
            .Take(MaxCandidates)
            .ToList();
        if (matches.Count == 0)
        {
            return [];
        }

        var ids = matches.Select(m => m.Row.Id).ToArray();
        var scope = await scopeResolver.ResolveAsync(Permissions.Customers.Read, cancellationToken);
        HashSet<Guid> inScope = type == CustomerType.Doctor
            ? scope.Level is null ? [] : ids.ToHashSet()
            : (await (await CustomerService.WhereReadableAsync(db, db.Customers.AsNoTracking().Where(c => ids.Contains(c.Id)), scope, cancellationToken))
                .Select(c => c.Id).ToListAsync(cancellationToken)).ToHashSet();

        var town = await db.Territories.AsNoTracking()
            .Where(t => t.Id == territoryId)
            .Select(t => new { t.Name, t.NameAr, AreaName = t.Parent != null ? t.Parent.Name : null, AreaNameAr = t.Parent != null ? t.Parent.NameAr : null })
            .SingleOrDefaultAsync(cancellationToken);
        var creatorIds = matches.Select(m => m.Row.CreatedById).OfType<Guid>().Distinct().ToArray();
        var creators = type == CustomerType.Doctor
            ? await db.Users.AsNoTracking().Where(u => creatorIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.FullName, cancellationToken)
            : [];
        var mine = type == CustomerType.Doctor
            ? (await db.RepDoctors.AsNoTracking().Where(a => a.UserId == me && ids.Contains(a.CustomerId)).Select(a => a.CustomerId).ToListAsync(cancellationToken)).ToHashSet()
            : [];

        return matches
            .Select(m =>
            {
                var r = m.Row;
                var same = m.Rank == CustomerSimilarity.Same;
                if (!inScope.Contains(r.Id))
                {
                    return new SimilarCustomerDto(null, type, r.Name, r.NameAr, town?.Name, town?.NameAr, town?.AreaName, town?.AreaNameAr, same, true);
                }

                var doctor = type == CustomerType.Doctor;
                return new SimilarCustomerDto(
                    r.Id, type, r.Name, r.NameAr, town?.Name, town?.NameAr, town?.AreaName, town?.AreaNameAr, same, false,
                    r.Address, r.Landmark,
                    doctor && r.CreatedById is { } creator ? creators.GetValueOrDefault(creator) : null,
                    doctor ? mine.Contains(r.Id) : null,
                    !r.IsActive);
            })
            .ToList();
    }

    /// <summary>
    /// Before creating a customer: 409 <see cref="DuplicateErrorCodes.Suspected"/> with the candidates when
    /// similar ones exist, unless the person already saw them and chose to add anyway.
    /// </summary>
    public async Task EnsureNoDuplicateAsync(
        CustomerType type,
        Guid territoryId,
        IReadOnlyList<string?> names,
        string? phone,
        bool duplicateConfirmed,
        CancellationToken cancellationToken = default)
    {
        if (duplicateConfirmed)
        {
            return;
        }

        var candidates = await FindAsync(type, territoryId, names, phone, cancellationToken);
        if (candidates.Count > 0)
        {
            throw new ConflictException(DuplicateErrorCodes.Suspected, "Similar ones already exist in this area. Check them before adding a new one.")
            {
                Details = new Dictionary<string, object?> { ["candidates"] = candidates },
            };
        }
    }
}
