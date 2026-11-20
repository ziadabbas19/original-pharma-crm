using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using OriginalPharma.Application.Common;

namespace OriginalPharma.Application.Tracking.Integrity;

/// <summary>
/// Daily job: clears the device signals stored with location points once they are older than the
/// retention period in the location trust settings. The points themselves, their trust status and
/// reason codes stay; only the device details (installed spoofing apps, root signals, ...) go.
/// </summary>
public sealed class DeviceSignalsRetentionJob(
    IAppDbContext db,
    LocationTrustSettingsService settings,
    TimeProvider time,
    ILogger<DeviceSignalsRetentionJob> logger)
{
    public async Task<int> RunAsync(CancellationToken cancellationToken = default)
    {
        var retention = (await settings.GetAsync(cancellationToken)).DeviceSignalsRetentionDays;
        var cutoff = time.GetUtcNow().AddDays(-Math.Max(1, retention));

        var cleared = await db.LocationPoints
            .Where(p => p.DeviceSignals != null && p.RecordedAt < cutoff)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.DeviceSignals, (string?)null), cancellationToken);

        if (cleared > 0)
        {
            logger.LogInformation("Cleared device signals from {Count} location points older than {Days} days", cleared, retention);
        }

        return cleared;
    }
}
