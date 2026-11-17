using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using OriginalPharma.Application.Identity;
using OriginalPharma.Infrastructure.Persistence;

namespace OriginalPharma.Infrastructure.Identity;

/// <summary>
/// Two-level cache:
/// <list type="bullet">
/// <item>The per-user permissions version lives in the distributed cache (Redis), shared by all API instances.</item>
/// <item>The computed permission set lives in local memory, keyed by (user, version).</item>
/// </list>
/// Bumping the version in the database and clearing the Redis entry makes every
/// instance load fresh permissions on the user's next request.
/// </summary>
internal sealed class PermissionService(
    AppDbContext db,
    IMemoryCache memory,
    IDistributedCache distributed,
    TimeProvider time,
    ILogger<PermissionService> logger) : IPermissionService
{
    private static readonly TimeSpan VersionTtl = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan PermissionsTtl = TimeSpan.FromMinutes(30);

    // Scoped service: remembers versions for the rest of this request.
    private readonly Dictionary<Guid, int> _requestVersions = [];

    public async Task<int> GetVersionAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        if (_requestVersions.TryGetValue(userId, out var version))
        {
            return version;
        }

        var key = VersionKey(userId);
        var cached = await TryCacheAsync(() => distributed.GetStringAsync(key, cancellationToken));
        if (int.TryParse(cached, out version))
        {
            return _requestVersions[userId] = version;
        }

        version = await db.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => u.PermissionsVersion)
            .SingleOrDefaultAsync(cancellationToken);

        await TryCacheAsync(async () =>
        {
            await distributed.SetStringAsync(key, version.ToString(),
                new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = VersionTtl }, cancellationToken);
            return (string?)null;
        });

        return _requestVersions[userId] = version;
    }

    public async Task<EffectivePermissions> GetEffectivePermissionsAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var version = await GetVersionAsync(userId, cancellationToken);
        var cacheKey = $"perms:{userId:N}:{version}";
        if (memory.TryGetValue(cacheKey, out EffectivePermissions? cached) && cached is not null)
        {
            return cached;
        }

        var now = time.GetUtcNow();
        var isActive = await db.Users.AsNoTracking().Where(u => u.Id == userId).Select(u => u.IsActive).SingleOrDefaultAsync(cancellationToken);

        var roleIds = db.UserRoles.Where(ur => ur.UserId == userId).Select(ur => ur.RoleId);
        var grants = await db.RolePermissions.AsNoTracking()
            .Where(rp => roleIds.Contains(rp.RoleId))
            .Select(rp => new RoleGrant(rp.Permission!.Key, rp.Scope))
            .ToListAsync(cancellationToken);

        var overrides = await db.UserPermissionOverrides.AsNoTracking()
            .Where(o => o.UserId == userId)
            .Select(o => new OverrideEntry(o.Permission!.Key, o.IsGranted, o.Scope, o.ExpiresAt))
            .ToListAsync(cancellationToken);

        var scopes = isActive ? PermissionEvaluator.Evaluate(grants, overrides, now) : [];
        var result = new EffectivePermissions(version, scopes);

        // An override that expires soon must not outlive its expiry in the cache.
        var ttl = PermissionsTtl;
        var nextExpiry = overrides.Where(o => o.ExpiresAt > now).Select(o => o.ExpiresAt!.Value).DefaultIfEmpty(DateTimeOffset.MaxValue).Min();
        if (nextExpiry - now < ttl)
        {
            ttl = nextExpiry - now;
        }

        memory.Set(cacheKey, result, ttl);
        return result;
    }

    public async Task BumpVersionAsync(IReadOnlyCollection<Guid> userIds, CancellationToken cancellationToken = default)
    {
        if (userIds.Count == 0)
        {
            return;
        }

        var ids = userIds.Distinct().ToArray();
        await db.Users
            .Where(u => ids.Contains(u.Id))
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.PermissionsVersion, u => u.PermissionsVersion + 1), cancellationToken);

        foreach (var id in ids)
        {
            _requestVersions.Remove(id);
            await TryCacheAsync(async () =>
            {
                await distributed.RemoveAsync(VersionKey(id), cancellationToken);
                return (string?)null;
            });
        }
    }

    private static string VersionKey(Guid userId) => $"perm-version:{userId:N}";

    /// <summary>The cache is an optimisation; if Redis is down we fall back to the database.</summary>
    private async Task<string?> TryCacheAsync(Func<Task<string?>> action)
    {
        try
        {
            return await action();
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Distributed cache unavailable; reading permissions version from the database");
            return null;
        }
    }
}
