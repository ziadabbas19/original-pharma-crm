using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Organization;
using OriginalPharma.Domain.Tracking;

namespace OriginalPharma.Application.Tracking;

/// <summary>
/// Recurring job (every minute): marks active shifts as "tracking lost" when no
/// point arrived within the configured window, raises a flag and tells the
/// dashboard. Receiving a point again clears the state (see ingest).
/// </summary>
public sealed class TrackingLostMonitor(
    IAppDbContext db,
    IOrgHierarchy hierarchy,
    ITrackingNotifier notifier,
    IOptions<TrackingOptions> options,
    TimeProvider time,
    ILogger<TrackingLostMonitor> logger)
{
    public async Task RunAsync(CancellationToken cancellationToken = default)
    {
        var now = time.GetUtcNow();
        var cutoff = now - TimeSpan.FromMinutes(options.Value.TrackingLostAfterMinutes);

        var lost = await db.Shifts
            .Where(s => s.Status == ShiftStatus.Active && s.TrackingLostAt == null && (s.LastPointAt ?? s.StartedAt) < cutoff)
            .ToListAsync(cancellationToken);

        if (lost.Count == 0)
        {
            return;
        }

        foreach (var shift in lost)
        {
            shift.TrackingLostAt = now;
            db.TrackingFlags.Add(new TrackingFlag
            {
                UserId = shift.UserId,
                TerritoryId = shift.TerritoryId,
                ShiftId = shift.Id,
                Type = TrackingFlagType.TrackingLost,
                Score = 0,
                Signals = ["tracking-lost"],
                Details = $"No location received since {(shift.LastPointAt ?? shift.StartedAt):u}.",
                CreatedAt = now,
            });
        }

        await db.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Marked {Count} shift(s) as tracking lost", lost.Count);

        foreach (var shift in lost)
        {
            var audience = await hierarchy.GetAudienceAsync(shift.UserId, cancellationToken);
            await notifier.PresenceChangedAsync(audience, new PresenceChangeDto(shift.UserId, PresenceStatus.TrackingLost, now), cancellationToken);
        }

        // TODO: auto-close shifts left open overnight (e.g. older than 16 h) once the business rule is agreed.
    }
}
