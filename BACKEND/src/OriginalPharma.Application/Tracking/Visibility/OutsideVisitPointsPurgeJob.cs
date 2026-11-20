using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Tracking.Integrity;

namespace OriginalPharma.Application.Tracking.Visibility;

/// <summary>
/// Hourly job for visit-only visibility: deletes the points recorded outside every visit window once the grace
/// period is over (a check-in queued offline may still arrive and cover them; then they are kept as visit
/// points). Points a suspicious-location flag refers to stay as evidence for the integrity review, which shows
/// only their time and reasons. Points stored before visit-only mode, or in all-day mode, are never touched.
/// </summary>
public sealed class OutsideVisitPointsPurgeJob(
    IAppDbContext db,
    VisitWindowService visitWindows,
    LocationTrustSettingsService trustSettings,
    IOptions<LocationTrustOptions> trustOptions,
    TimeProvider time,
    ILogger<OutsideVisitPointsPurgeJob> logger)
{
    private const int BatchSize = 5000;

    public sealed record PurgeResult(int Deleted, int KeptAsVisitPoints);

    public async Task<PurgeResult> RunAsync(CancellationToken cancellationToken = default)
    {
        var settings = await trustSettings.GetAsync(cancellationToken);
        var cutoff = time.GetUtcNow().AddHours(-Math.Max(0, trustOptions.Value.OutsideVisitGraceHours));
        int deleted = 0, covered = 0;

        while (!cancellationToken.IsCancellationRequested)
        {
            // Points a flag refers to are evidence: never picked up here.
            var batch = await db.LocationPoints.AsNoTracking()
                .Where(p => p.OutsideVisitWindow && p.RecordedAt < cutoff && !db.TrackingFlags.Any(f => f.LocationPointId == p.Id))
                .OrderBy(p => p.RecordedAt)
                .Take(BatchSize)
                .Select(p => new { p.Id, p.UserId, p.RecordedAt })
                .ToListAsync(cancellationToken);
            if (batch.Count == 0)
            {
                break;
            }

            var keep = new List<long>();
            var remove = new List<long>();
            foreach (var byUser in batch.GroupBy(p => p.UserId))
            {
                var windows = (await visitWindows.WindowsAsync(
                        [byUser.Key], byUser.Min(p => p.RecordedAt), byUser.Max(p => p.RecordedAt), settings.VisitWindowBuffer, cancellationToken))
                    .GetValueOrDefault(byUser.Key);
                foreach (var point in byUser)
                {
                    (VisitWindowService.Inside(windows, point.RecordedAt) ? keep : remove).Add(point.Id);
                }
            }

            // A visit that arrived late covers them: they become ordinary visit points.
            if (keep.Count > 0)
            {
                covered += await db.LocationPoints.Where(p => keep.Contains(p.Id))
                    .ExecuteUpdateAsync(set => set.SetProperty(p => p.OutsideVisitWindow, false), cancellationToken);
            }

            if (remove.Count > 0)
            {
                deleted += await db.LocationPoints.Where(p => remove.Contains(p.Id)).ExecuteDeleteAsync(cancellationToken);
            }

            if (batch.Count < BatchSize)
            {
                break;
            }
        }

        if (deleted + covered > 0)
        {
            logger.LogInformation(
                "Visit-only locations: deleted {Deleted} points recorded outside visits, kept {Covered} now covered by a visit",
                deleted, covered);
        }

        return new PurgeResult(deleted, covered);
    }
}
