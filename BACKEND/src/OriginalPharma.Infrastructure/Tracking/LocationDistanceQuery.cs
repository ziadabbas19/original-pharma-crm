using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Tracking;
using OriginalPharma.Domain.Tracking;
using OriginalPharma.Infrastructure.Persistence;

namespace OriginalPharma.Infrastructure.Tracking;

/// <summary>
/// Distance travelled per rep with a window function over location_points: points that do not count
/// are filtered out first, then each remaining point is measured against the one before it in the
/// same shift (geography, so metres on the spheroid).
/// </summary>
internal sealed class LocationDistanceQuery(AppDbContext db) : ILocationDistanceQuery
{
    public async Task<IReadOnlyDictionary<Guid, double>> MetersByUserAsync(
        IReadOnlyCollection<Guid> userIds,
        DateTimeOffset from,
        DateTimeOffset to,
        bool excludeMock,
        CancellationToken cancellationToken = default)
    {
        if (userIds.Count == 0)
        {
            return new Dictionary<Guid, double>();
        }

        var ids = userIds.Distinct().ToArray();
        var fromUtc = from.ToUniversalTime();
        var toUtc = to.ToUniversalTime();
        const int rejected = (int)LocationTrustStatus.Rejected;

        var rows = await db.Database.SqlQuery<UserDistance>($"""
            SELECT step.user_id AS user_id, COALESCE(SUM(step.meters), 0) AS meters
            FROM (
                SELECT p.user_id,
                       ST_Distance(p.location, LAG(p.location) OVER (PARTITION BY p.user_id, p.shift_id ORDER BY p.recorded_at)) AS meters
                FROM location_points p
                WHERE p.user_id = ANY({ids})
                  AND p.recorded_at >= {fromUtc} AND p.recorded_at < {toUtc}
                  AND p.trust_status <> {rejected}
                  AND NOT ({excludeMock} AND p.is_mock)
            ) AS step
            GROUP BY step.user_id
            """).ToListAsync(cancellationToken);

        return rows.ToDictionary(r => r.UserId, r => r.Meters);
    }

    private sealed record UserDistance(Guid UserId, double Meters);
}
