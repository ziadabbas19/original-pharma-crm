using Microsoft.EntityFrameworkCore;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Application.Common.Scoping;

/// <summary>
/// Reads a <see cref="DataScope"/> as a set of territories, for data that belongs
/// to a territory rather than to a user (the territory tree itself, customers).
/// </summary>
public static class TerritoryScope
{
    /// <summary>
    /// Territory ids visible in the scope, or null when every territory is visible.
    /// <list type="bullet">
    /// <item>own: the user's own territory</item>
    /// <item>team: the territories of the user and everyone below them</item>
    /// <item>territory: the user's territory and everything under it</item>
    /// </list>
    /// </summary>
    public static async Task<Guid[]?> ResolveTerritoryIdsAsync(
        this DataScope scope,
        IAppDbContext db,
        CancellationToken cancellationToken = default)
    {
        switch (scope.Level)
        {
            case PermissionScope.All:
                return null;

            case PermissionScope.Territory:
                return scope.TerritoryIds.Where(id => id.HasValue).Select(id => id!.Value).ToArray();

            case PermissionScope.Team:
            case PermissionScope.Own:
                var userIds = scope.UserIds;
                return await db.Users.AsNoTracking()
                    .Where(u => userIds.Contains(u.Id) && u.TerritoryId != null)
                    .Select(u => u.TerritoryId!.Value)
                    .Distinct()
                    .ToArrayAsync(cancellationToken);

            default:
                return [];
        }
    }
}
