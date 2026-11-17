using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace OriginalPharma.Application.Common.Organization;

/// <summary>Who a rep's data should be pushed to: their territory and every manager above them.</summary>
public sealed record RepAudience(Guid UserId, Guid? TerritoryId, IReadOnlyList<Guid> ManagerChain);

/// <summary>Reporting lines and territory tree lookups.</summary>
public interface IOrgHierarchy
{
    /// <summary>Everyone reporting to the manager, at any depth (manager not included).</summary>
    Task<IReadOnlyList<Guid>> GetSubordinateIdsAsync(Guid managerId, CancellationToken cancellationToken = default);

    /// <summary>The user's managers from the direct manager upward.</summary>
    Task<IReadOnlyList<Guid>> GetManagerChainAsync(Guid userId, CancellationToken cancellationToken = default);

    /// <summary>The user's territory and all territories under it.</summary>
    Task<IReadOnlyList<Guid>> GetTerritoryScopeAsync(Guid userId, CancellationToken cancellationToken = default);

    Task<RepAudience> GetAudienceAsync(Guid userId, CancellationToken cancellationToken = default);

    /// <summary>Drop the cached snapshot after users or territories change.</summary>
    void Invalidate();
}

/// <summary>
/// Keeps a small in-memory snapshot of (user, manager, territory) and the
/// territory tree. Cheap for the expected size (hundreds to a few thousand users).
/// Other API instances pick up changes when their snapshot expires.
/// </summary>
internal sealed class OrgHierarchy(IAppDbContext db, IMemoryCache cache) : IOrgHierarchy
{
    private const string CacheKey = "org-hierarchy:snapshot";
    private static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(2);

    public async Task<IReadOnlyList<Guid>> GetSubordinateIdsAsync(Guid managerId, CancellationToken cancellationToken = default)
    {
        var snapshot = await GetSnapshotAsync(cancellationToken);
        var result = new List<Guid>();
        var visited = new HashSet<Guid> { managerId };
        var queue = new Queue<Guid>([managerId]);

        while (queue.Count > 0)
        {
            foreach (var report in snapshot.ReportsByManager[queue.Dequeue()])
            {
                if (visited.Add(report))
                {
                    result.Add(report);
                    queue.Enqueue(report);
                }
            }
        }

        return result;
    }

    public async Task<IReadOnlyList<Guid>> GetManagerChainAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var snapshot = await GetSnapshotAsync(cancellationToken);
        var chain = new List<Guid>();
        var visited = new HashSet<Guid> { userId };
        var current = userId;

        while (snapshot.Users.TryGetValue(current, out var info) && info.ManagerId is { } managerId && visited.Add(managerId))
        {
            chain.Add(managerId);
            current = managerId;
        }

        return chain;
    }

    public async Task<IReadOnlyList<Guid>> GetTerritoryScopeAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var snapshot = await GetSnapshotAsync(cancellationToken);
        if (!snapshot.Users.TryGetValue(userId, out var info) || info.TerritoryId is not { } root)
        {
            return [];
        }

        var result = new List<Guid> { root };
        var queue = new Queue<Guid>([root]);
        while (queue.Count > 0)
        {
            foreach (var child in snapshot.ChildTerritories[queue.Dequeue()])
            {
                if (!result.Contains(child))
                {
                    result.Add(child);
                    queue.Enqueue(child);
                }
            }
        }

        return result;
    }

    public async Task<RepAudience> GetAudienceAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var snapshot = await GetSnapshotAsync(cancellationToken);
        snapshot.Users.TryGetValue(userId, out var info);
        var chain = await GetManagerChainAsync(userId, cancellationToken);
        return new RepAudience(userId, info.TerritoryId, chain);
    }

    public void Invalidate() => cache.Remove(CacheKey);

    private async Task<Snapshot> GetSnapshotAsync(CancellationToken cancellationToken)
    {
        if (cache.TryGetValue(CacheKey, out Snapshot? cached) && cached is not null)
        {
            return cached;
        }

        var users = await db.Users.AsNoTracking()
            .Select(u => new { u.Id, u.ManagerId, u.TerritoryId })
            .ToListAsync(cancellationToken);
        var territories = await db.Territories.AsNoTracking()
            .Select(t => new { t.Id, t.ParentId })
            .ToListAsync(cancellationToken);

        var snapshot = new Snapshot(
            users.ToDictionary(u => u.Id, u => (u.ManagerId, u.TerritoryId)),
            users.Where(u => u.ManagerId.HasValue).ToLookup(u => u.ManagerId!.Value, u => u.Id),
            territories.Where(t => t.ParentId.HasValue).ToLookup(t => t.ParentId!.Value, t => t.Id));

        cache.Set(CacheKey, snapshot, CacheDuration);
        return snapshot;
    }

    private sealed record Snapshot(
        Dictionary<Guid, (Guid? ManagerId, Guid? TerritoryId)> Users,
        ILookup<Guid, Guid> ReportsByManager,
        ILookup<Guid, Guid> ChildTerritories);
}
