using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Auditing;
using OriginalPharma.Application.Common.Organization;
using OriginalPharma.Application.Notifications;
using OriginalPharma.Application.Tracking.Anomalies;
using OriginalPharma.Domain.Audit;
using OriginalPharma.Domain.Notifications;
using OriginalPharma.Domain.Tracking;

namespace OriginalPharma.Application.Tracking.Integrity;

/// <param name="ShiftId">Repeats within the same shift (or the same visit) update one open flag.</param>
/// <param name="LocationPointId">The point that shows the problem best, for the review page.</param>
public sealed record IntegrityFlagRequest(
    Guid UserId,
    Guid? TerritoryId,
    Guid? ShiftId,
    TrackingFlagType Type,
    int Score,
    IReadOnlyList<string> Signals,
    string? Details,
    long? LocationPointId = null,
    Guid? VisitId = null);

/// <param name="IsNew">False when the request was added to an open flag.</param>
public sealed record IntegrityFlagOutcome(TrackingFlag Flag, bool IsNew);

/// <summary>
/// Raises suspicious-location flags for ingest, visits and the app's own reports. A problem that
/// keeps happening updates the rep's open flag (more occurrences, latest time) instead of adding new
/// ones. A new flag writes an audit entry and, when its score reaches the review threshold, tells
/// the rep's supervisor in the app, at most once per rep per throttle window.
/// <para>
/// Call <see cref="RaiseAsync"/> before saving (the flag, audit entry and notification are saved
/// with the caller's change) and <see cref="PublishAsync"/> after.
/// </para>
/// </summary>
public sealed class IntegrityFlagService(
    IAppDbContext db,
    IOrgHierarchy hierarchy,
    NotificationService notifications,
    AuditTrail audit,
    ITrackingNotifier notifier,
    IOptions<LocationTrustOptions> trustOptions,
    IOptions<AnomalyDetectionOptions> anomalyOptions,
    TimeProvider time,
    ILogger<IntegrityFlagService> logger)
{
    /// <summary>Open flags older than this are not extended any more; a new one starts.</summary>
    private static readonly TimeSpan MergeWindow = TimeSpan.FromHours(24);

    /// <summary>Flag types that mean "this location may be fake" (the suspicious activity review).</summary>
    public static readonly IReadOnlyList<TrackingFlagType> IntegrityTypes =
    [
        TrackingFlagType.MockLocation,
        TrackingFlagType.Anomaly,
        TrackingFlagType.SuspiciousDevice,
        TrackingFlagType.IntegrityFailed,
        TrackingFlagType.VisitOutsideGeofence,
        TrackingFlagType.VisitLowTrust,
    ];

    public async Task<IntegrityFlagOutcome> RaiseAsync(IntegrityFlagRequest request, CancellationToken cancellationToken = default)
    {
        var now = time.GetUtcNow();
        var since = now - MergeWindow;
        var candidates = db.TrackingFlags
            .Where(f => f.UserId == request.UserId && f.Type == request.Type && f.Status == TrackingFlagStatus.Open && f.CreatedAt >= since);
        candidates = request.VisitId is { } visitId
            ? candidates.Where(f => f.VisitId == visitId)
            : candidates.Where(f => f.VisitId == null && f.ShiftId == request.ShiftId);
        var open = await candidates.OrderByDescending(f => f.CreatedAt).FirstOrDefaultAsync(cancellationToken);

        if (open is not null)
        {
            open.Score = Math.Max(open.Score, request.Score);
            open.Signals = open.Signals.Union(request.Signals).ToList();
            open.Occurrences += 1;
            open.LastSeenAt = now;
            open.LocationPointId ??= request.LocationPointId;
            open.Details = Merge(open.Details, request.Details);
            return new IntegrityFlagOutcome(open, false);
        }

        var flag = new TrackingFlag
        {
            UserId = request.UserId,
            TerritoryId = request.TerritoryId,
            ShiftId = request.ShiftId,
            Type = request.Type,
            Score = Math.Clamp(request.Score, 0, 100),
            Signals = request.Signals.Distinct().ToList(),
            Details = Clip(request.Details),
            LocationPointId = request.LocationPointId,
            VisitId = request.VisitId,
            CreatedAt = now,
        };
        db.TrackingFlags.Add(flag);

        await audit.AddAsync(AuditEntities.LocationFlag, flag.Id, AuditAction.Created, new
        {
            repId = flag.UserId,
            type = flag.Type,
            flag.Score,
            flag.Signals,
            flag.VisitId,
            flag.LocationPointId,
        }, cancellationToken: cancellationToken);

        if (flag.Score >= anomalyOptions.Value.FlagThreshold)
        {
            await QueueSupervisorNotificationAsync(flag, now, cancellationToken);
        }

        return new IntegrityFlagOutcome(flag, true);
    }

    /// <summary>After saving: live updates for dashboards and the queued in-app notifications. Never throws.</summary>
    public async Task PublishAsync(IEnumerable<IntegrityFlagOutcome> outcomes, CancellationToken cancellationToken = default)
    {
        await notifications.PublishQueuedAsync(cancellationToken);
        foreach (var outcome in outcomes.Where(o => o.IsNew))
        {
            try
            {
                var audience = await hierarchy.GetAudienceAsync(outcome.Flag.UserId, cancellationToken);
                await notifier.FlagRaisedAsync(audience, TrackingMapping.ToDto(outcome.Flag, null), cancellationToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Could not publish flag {FlagId}", outcome.Flag.Id);
            }
        }
    }

    /// <summary>The rep's direct manager, unless they were already told about this rep within the throttle window.</summary>
    private async Task QueueSupervisorNotificationAsync(TrackingFlag flag, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var chain = await hierarchy.GetManagerChainAsync(flag.UserId, cancellationToken);
        if (chain.Count == 0)
        {
            return;
        }

        var supervisor = chain[0];
        var cutoff = now - TimeSpan.FromMinutes(Math.Max(1, trustOptions.Value.NotificationThrottleMinutes));
        var recentlyTold = await db.Notifications.AnyAsync(
            n => n.UserId == supervisor && n.Type == NotificationType.SuspiciousLocation && n.EntityId == flag.UserId && n.CreatedAt > cutoff,
            cancellationToken);
        if (recentlyTold)
        {
            return;
        }

        var rep = await db.Users.AsNoTracking().Where(u => u.Id == flag.UserId).Select(u => u.FullName).SingleOrDefaultAsync(cancellationToken);
        var customer = flag.VisitId is { } visitId
            ? await db.Visits.AsNoTracking().Where(v => v.Id == visitId).Select(v => new { v.Customer!.Name, v.Customer.NameAr }).SingleOrDefaultAsync(cancellationToken)
            : null;

        notifications.Queue(supervisor, NotificationType.SuspiciousLocation, flag.UserId, new
        {
            repId = flag.UserId,
            repName = rep ?? string.Empty,
            flagId = flag.Id,
            flagType = JsonNamingPolicy.CamelCase.ConvertName(flag.Type.ToString()),
            signals = flag.Signals,
            score = flag.Score,
            visitId = flag.VisitId,
            customerName = customer?.Name,
            customerNameAr = customer?.NameAr,
        });
    }

    /// <summary>Keeps what the flag already says and adds new information once, within the column size.</summary>
    private static string? Merge(string? existing, string? added)
    {
        if (string.IsNullOrWhiteSpace(added) || (existing?.Contains(added, StringComparison.Ordinal) ?? false))
        {
            return existing;
        }

        if (string.IsNullOrWhiteSpace(existing))
        {
            return Clip(added);
        }

        return existing.Length + added.Length + 1 > 2000 ? existing : existing + " " + added;
    }

    private static string? Clip(string? details) =>
        string.IsNullOrWhiteSpace(details) ? null : details.Length <= 2000 ? details : details[..1997] + "...";
}
