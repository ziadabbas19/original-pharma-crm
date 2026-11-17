using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Scoping;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Application.Identity;

public sealed record TerritoryDto(
    Guid Id,
    string Code,
    string Name,
    string? NameAr,
    TerritoryLevel Level,
    Guid? ParentId,
    int UserCount,
    int CustomerCount);

/// <summary>Read access to the territory tree (region, area, territory).</summary>
public sealed class TerritoryService(IAppDbContext db, IDataScopeResolver scopeResolver)
{
    public async Task<IReadOnlyList<TerritoryDto>> ListAsync(CancellationToken cancellationToken = default)
    {
        var scope = await scopeResolver.ResolveAsync(Permissions.Territories.Read, cancellationToken);
        var visible = await scope.ResolveTerritoryIdsAsync(db, cancellationToken);

        var query = db.Territories.AsNoTracking();
        if (visible is not null)
        {
            query = query.Where(t => visible.Contains(t.Id));
        }

        return await query
            .OrderBy(t => t.Level).ThenBy(t => t.Name)
            .Select(t => new TerritoryDto(
                t.Id,
                t.Code,
                t.Name,
                t.NameAr,
                t.Level,
                t.ParentId,
                db.Users.Count(u => u.TerritoryId == t.Id && u.IsActive),
                db.Customers.Count(c => c.TerritoryId == t.Id && c.IsActive)))
            .ToListAsync(cancellationToken);
    }
}
