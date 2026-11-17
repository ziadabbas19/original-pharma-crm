using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Organization;
using OriginalPharma.Application.Tracking.Anomalies;
using OriginalPharma.Domain.Common;
using OriginalPharma.Domain.Tracking;

namespace OriginalPharma.Application.Tracking;

/// <summary>
/// Accepts batches of location points: keeps only points inside a shift, drops
/// duplicates, scores them, stores history (PostGIS) and the latest position
/// (Redis), then notifies dashboards.
/// </summary>
public sealed class TrackingIngestService(
    IAppDbContext db,
    ICurrentUser currentUser,
    TrackingAnomalyDetector detector,
    ILatestPositionStore latestPositions,
    IIpGeolocationService ipGeolocation,
    IOrgHierarchy hierarchy,
    ITrackingNotifier notifier,
    IOptions<TrackingOptions> trackingOptions,
    IOptions<AnomalyDetectionOptions> anomalyOptions,
    TimeProvider time,
    ILogger<TrackingIngestService> logger)
{
    public async Task<LocationBatchResult> IngestAsync(LocationBatchRequest request, CancellationToken cancellationToken = default)
    {
        var userId = currentUser.RequireUserId();
        var now = time.GetUtcNow();
        var grace = TimeSpan.FromSeconds(trackingOptions.Value.ShiftGraceSeconds);

        var points = request.Points
            .Select(p => p with { Timestamp = p.Timestamp.ToUniversalTime() })
            .DistinctBy(p => p.Timestamp)
            .OrderBy(p => p.Timestamp)
            .ToList();

        var from = points[0].Timestamp;
        var to = points[^1].Timestamp;

        var territoryId = await db.Users.Where(u => u.Id == userId).Select(u => u.TerritoryId).SingleAsync(cancellationToken);

        var shifts = await db.Shifts
            .Where(s => s.UserId == userId && s.StartedAt <= to + grace && (s.EndedAt == null || s.EndedAt >= from - grace))
            .OrderBy(s => s.StartedAt)
            .ToListAsync(cancellationToken);

        var existing = (await db.LocationPoints
                .Where(p => p.UserId == userId && p.RecordedAt >= from && p.RecordedAt <= to)
                .Select(p => p.RecordedAt)
                .ToListAsync(cancellationToken))
            .ToHashSet();

        var accepted = new List<(LocationPointDto Point, Shift Shift)>();
        int duplicates = 0, outsideShift = 0;
        foreach (var point in points)
        {
            if (existing.Contains(point.Timestamp))
            {
                duplicates++;
                continue;
            }

            var shift = shifts.LastOrDefault(s =>
                s.StartedAt - grace <= point.Timestamp && (s.EndedAt is null || point.Timestamp <= s.EndedAt + grace));
            if (shift is null)
            {
                outsideShift++;
                continue;
            }

            accepted.Add((point, shift));
        }

        if (accepted.Count == 0)
        {
            return new LocationBatchResult(request.Points.Count, 0, duplicates, outsideShift, 0, false);
        }

        var previous = await latestPositions.GetAsync(userId, cancellationToken);
        var ipLocation = await ipGeolocation.LocateAsync(currentUser.IpAddress, cancellationToken);
        var report = detector.Analyze(new AnomalyInput(
            previous is null ? null : new GeoSample(previous.Lat, previous.Lng, previous.Accuracy, previous.RecordedAt, previous.IsMock),
            accepted.Select(a => new GeoSample(a.Point.Lat, a.Point.Lng, a.Point.Accuracy, a.Point.Timestamp, a.Point.IsMock)).ToList(),
            now,
            request.SentAt?.ToUniversalTime(),
            ipLocation));

        for (var i = 0; i < accepted.Count; i++)
        {
            var (point, shift) = accepted[i];
            db.LocationPoints.Add(new LocationPoint
            {
                UserId = userId,
                TerritoryId = territoryId,
                ShiftId = shift.Id,
                DeviceId = request.DeviceId,
                Source = request.Source,
                Location = GeoFactory.Point(point.Lat, point.Lng),
                Accuracy = point.Accuracy,
                Speed = point.Speed is >= 0 ? point.Speed : null,
                Heading = point.Heading is >= 0 ? point.Heading : null,
                BatteryLevel = point.BatteryLevel is >= 0 ? point.BatteryLevel : null,
                IsMock = point.IsMock,
                IsMoving = point.IsMoving,
                RecordedAt = point.Timestamp,
                ReceivedAt = now,
                AnomalyScore = report.PointScores[i],
                AnomalyCodes = report.CodesForPoint(i).ToList(),
            });
        }

        var restoredShifts = new List<Shift>();
        foreach (var shift in accepted.Select(a => a.Shift).Distinct())
        {
            shift.LastPointAt = now;
            if (shift.TrackingLostAt is not null && shift.Status == ShiftStatus.Active)
            {
                shift.TrackingLostAt = null;
                restoredShifts.Add(shift);
            }
        }

        var flagged = report.Score >= anomalyOptions.Value.FlagThreshold;
        TrackingFlag? flag = null;
        if (flagged)
        {
            flag = new TrackingFlag
            {
                UserId = userId,
                TerritoryId = territoryId,
                ShiftId = accepted[^1].Shift.Id,
                Type = report.Codes.Contains(AnomalyCodes.MockLocation) ? TrackingFlagType.MockLocation : TrackingFlagType.Anomaly,
                Score = report.Score,
                Signals = report.Codes.ToList(),
                Details = string.Join(" ", report.Signals.Select(s => s.Detail).Distinct().Take(10)),
                CreatedAt = now,
            };
            db.TrackingFlags.Add(flag);
        }

        await db.SaveChangesAsync(cancellationToken);

        var newest = accepted[^1];
        var audience = await hierarchy.GetAudienceAsync(userId, cancellationToken);
        if (previous is null || newest.Point.Timestamp > previous.RecordedAt)
        {
            var position = new LivePositionDto(
                userId, newest.Point.Lat, newest.Point.Lng, newest.Point.Accuracy, newest.Point.Timestamp, now,
                newest.Point.Speed is >= 0 ? newest.Point.Speed : null,
                newest.Point.BatteryLevel is >= 0 ? newest.Point.BatteryLevel : null,
                newest.Point.IsMock, report.PointScores[^1], request.Source, newest.Shift.Id);

            await latestPositions.SetAsync(position, cancellationToken);
            await notifier.PositionUpdatedAsync(audience, position, cancellationToken);
        }

        if (restoredShifts.Count > 0)
        {
            await notifier.PresenceChangedAsync(audience, new PresenceChangeDto(userId, PresenceStatus.Online, now), cancellationToken);
        }

        if (flag is not null)
        {
            logger.LogWarning("Tracking anomaly for user {UserId}: score {Score} ({Codes})", userId, report.Score, string.Join(",", report.Codes));
            await notifier.FlagRaisedAsync(audience, TrackingMapping.ToDto(flag, null), cancellationToken);
        }

        return new LocationBatchResult(request.Points.Count, accepted.Count, duplicates, outsideShift, report.Score, flagged);
    }

    /// <summary>
    /// Checks one fix without storing it (works outside a shift). Lets the setup
    /// wizard confirm connectivity, auth, clock and mock state end to end.
    /// </summary>
    public async Task<TestPointResult> TestPointAsync(TestPointRequest request, CancellationToken cancellationToken = default)
    {
        currentUser.RequireUserId();
        var now = time.GetUtcNow();
        var point = request.Point;
        var sentAt = request.SentAt?.ToUniversalTime();
        var ipLocation = await ipGeolocation.LocateAsync(currentUser.IpAddress, cancellationToken);

        var report = detector.Analyze(new AnomalyInput(
            null,
            [new GeoSample(point.Lat, point.Lng, point.Accuracy, point.Timestamp.ToUniversalTime(), point.IsMock)],
            now,
            sentAt,
            ipLocation));

        var offset = ((sentAt ?? point.Timestamp.ToUniversalTime()) - now).TotalSeconds;
        return new TestPointResult(true, now, Math.Round(offset, 1), report.Score, report.Codes);
    }
}

internal static class TrackingMapping
{
    public static TrackingFlagDto ToDto(TrackingFlag flag, string? userName) =>
        new(flag.Id, flag.UserId, userName, flag.Type, flag.Status, flag.Score, flag.Signals, flag.Details, flag.CreatedAt);

    public static ShiftDto ToDto(Shift shift) =>
        new(shift.Id, shift.Status, shift.DeviceId, shift.StartedAt, shift.EndedAt, shift.LastPointAt, shift.TrackingLostAt);
}
