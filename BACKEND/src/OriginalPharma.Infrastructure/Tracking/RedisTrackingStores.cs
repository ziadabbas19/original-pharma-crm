using System.Text.Json;
using OriginalPharma.Application.Tracking;
using StackExchange.Redis;

namespace OriginalPharma.Infrastructure.Tracking;

/// <summary>Latest position per rep as a JSON string key. Kept for 7 days after the last update.</summary>
internal sealed class RedisLatestPositionStore(IConnectionMultiplexer redis) : ILatestPositionStore
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly TimeSpan Ttl = TimeSpan.FromDays(7);

    public async Task<LivePositionDto?> GetAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var value = await redis.GetDatabase().StringGetAsync(Key(userId));
        return value.IsNullOrEmpty ? null : JsonSerializer.Deserialize<LivePositionDto>(value.ToString(), Json);
    }

    public async Task<IReadOnlyDictionary<Guid, LivePositionDto>> GetManyAsync(IReadOnlyCollection<Guid> userIds, CancellationToken cancellationToken = default)
    {
        if (userIds.Count == 0)
        {
            return new Dictionary<Guid, LivePositionDto>();
        }

        var ids = userIds.ToArray();
        var values = await redis.GetDatabase().StringGetAsync(ids.Select(Key).ToArray());
        var result = new Dictionary<Guid, LivePositionDto>(ids.Length);
        for (var i = 0; i < ids.Length; i++)
        {
            if (!values[i].IsNullOrEmpty && JsonSerializer.Deserialize<LivePositionDto>(values[i].ToString(), Json) is { } position)
            {
                result[ids[i]] = position;
            }
        }

        return result;
    }

    public Task SetAsync(LivePositionDto position, CancellationToken cancellationToken = default) =>
        redis.GetDatabase().StringSetAsync(Key(position.UserId), JsonSerializer.Serialize(position, Json), Ttl);

    private static RedisKey Key(Guid userId) => $"tracking:latest:{userId:N}";
}

/// <summary>
/// Live viewers per rep as a sorted set: member = viewer id, score = expiry (unix ms).
/// Expired viewers are pruned on every access, so a closed browser tab stops
/// live mode after the TTL even without an explicit stop.
/// </summary>
internal sealed class RedisLiveViewRegistry(IConnectionMultiplexer redis, TimeProvider time) : ILiveViewRegistry
{
    public async Task<(bool Started, DateTimeOffset LiveUntil)> AddViewerAsync(Guid repId, Guid viewerId, TimeSpan ttl, CancellationToken cancellationToken = default)
    {
        var db = redis.GetDatabase();
        var key = Key(repId);
        var now = time.GetUtcNow();
        var until = now + ttl;

        await PruneAsync(db, key, now);
        var viewersBefore = await db.SortedSetLengthAsync(key);
        await db.SortedSetAddAsync(key, viewerId.ToString("N"), until.ToUnixTimeMilliseconds());
        await db.KeyExpireAsync(key, ttl + TimeSpan.FromMinutes(1));

        return (viewersBefore == 0, until);
    }

    public async Task<bool> RemoveViewerAsync(Guid repId, Guid viewerId, CancellationToken cancellationToken = default)
    {
        var db = redis.GetDatabase();
        var key = Key(repId);
        await db.SortedSetRemoveAsync(key, viewerId.ToString("N"));
        await PruneAsync(db, key, time.GetUtcNow());
        return await db.SortedSetLengthAsync(key) == 0;
    }

    public async Task<DateTimeOffset?> GetLiveUntilAsync(Guid repId, CancellationToken cancellationToken = default)
    {
        var db = redis.GetDatabase();
        var key = Key(repId);
        await PruneAsync(db, key, time.GetUtcNow());

        var latest = await db.SortedSetRangeByRankWithScoresAsync(key, -1, -1);
        return latest.Length == 0 ? null : DateTimeOffset.FromUnixTimeMilliseconds((long)latest[0].Score);
    }

    private static Task PruneAsync(IDatabase db, RedisKey key, DateTimeOffset now) =>
        db.SortedSetRemoveRangeByScoreAsync(key, double.NegativeInfinity, now.ToUnixTimeMilliseconds());

    private static RedisKey Key(Guid repId) => $"tracking:live:{repId:N}";
}
