using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Organization;
using OriginalPharma.Application.Tracking.Anomalies;
using OriginalPharma.Application.Tracking.Integrity;
using OriginalPharma.Application.Tracking.Visibility;
using OriginalPharma.Domain.Common;
using OriginalPharma.Domain.Tracking;

namespace OriginalPharma.Application.Tracking;

/// <summary>
/// Accepts batches of location points: keeps only points inside a shift, drops
/// duplicates, runs the plausibility checks, stores history (PostGIS) with a trust status per
/// point (suspicious and rejected points are kept, never dropped) and the latest position (Redis),
/// then notifies dashboards. Batches from older apps without the newer fields work as before.
/// <para>
/// Visit-only visibility: every point is still checked (the checks need them), but a point recorded outside
/// every visit window of the rep is marked, never shown and deleted after a grace period, and dashboards
/// only get a live position from inside a visit window.
/// </para>
/// </summary>
public sealed class TrackingIngestService(
    IAppDbContext db,
    ICurrentUser currentUser,
    TrackingAnomalyDetector detector,
    ILatestPositionStore latestPositions,
    IIpGeolocationService ipGeolocation,
    IOrgHierarchy hierarchy,
    ITrackingNotifier notifier,
    LocationTrustSettingsService trustSettings,
    IntegrityFlagService flags,
    VisitWindowService visitWindows,
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

        var settings = await trustSettings.GetAsync(cancellationToken);
        var signals = request.DeviceSignals?.Sanitized();
        var previous = await latestPositions.GetAsync(userId, cancellationToken);
        var ipLocation = await ipGeolocation.LocateAsync(currentUser.IpAddress, cancellationToken);
        var report = detector.Analyze(
            new AnomalyInput(
                previous is null ? null : new GeoSample(previous.Lat, previous.Lng, previous.Accuracy, previous.RecordedAt, previous.IsMock),
                accepted.Select(a => ToSample(a.Point)).ToList(),
                now,
                request.SentAt?.ToUniversalTime(),
                ipLocation,
                signals,
                previous?.TrustStatus == LocationTrustStatus.Rejected),
            settings.ApplyTo(anomalyOptions.Value));

        var signalsJson = signals?.ToJson();
        var buffer = settings.VisitWindowBuffer;
        var windows = settings.VisitOnly
            ? (await visitWindows.WindowsAsync([userId], from, to, buffer, cancellationToken)).GetValueOrDefault(userId) ?? []
            : null;
        var rows = new List<LocationPoint>(accepted.Count);
        for (var i = 0; i < accepted.Count; i++)
        {
            var (point, shift) = accepted[i];
            var (trust, reason) = report.TrustFor(i);
            var row = new LocationPoint
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
                TrustStatus = trust,
                TrustReason = reason,
                DeviceTime = ParseDeviceTime(point.DeviceTime),
                Altitude = point.Altitude is { } altitude && double.IsFinite(altitude) ? altitude : null,
                ActivityType = Activity(point.ActivityType),
                ActivityConfidence = point.ActivityConfidence is >= 0 and <= 100 ? point.ActivityConfidence : null,
                DeviceSignals = signalsJson,
                OutsideVisitWindow = windows is not null && !VisitWindowService.Inside(windows, point.Timestamp),
            };
            rows.Add(row);
            db.LocationPoints.Add(row);
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

        // Points first: whatever happens to the flag afterwards, the history is stored.
        await db.SaveChangesAsync(cancellationToken);

        var flagged = report.Score >= anomalyOptions.Value.FlagThreshold;
        IntegrityFlagOutcome? flag = null;
        if (flagged)
        {
            var worst = Enumerable.Range(0, rows.Count).MaxBy(i => report.PointScores[i]);
            flag = await flags.RaiseAsync(new IntegrityFlagRequest(
                userId,
                territoryId,
                accepted[^1].Shift.Id,
                FlagTypeFor(report.Codes),
                report.Score,
                report.Codes,
                string.Join(" ", report.Signals.Select(s => s.Detail).Distinct().Take(10).Append(DeviceSignalCodes.Describe(signals) ?? string.Empty)).Trim(),
                rows[worst].Id), cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
        }

        var newest = accepted[^1];
        var newestRow = rows[^1];
        var audience = await hierarchy.GetAudienceAsync(userId, cancellationToken);
        if (previous is null || newest.Point.Timestamp > previous.RecordedAt)
        {
            var position = new LivePositionDto(
                userId, newest.Point.Lat, newest.Point.Lng, newest.Point.Accuracy, newest.Point.Timestamp, now,
                newestRow.Speed, newestRow.BatteryLevel, newest.Point.IsMock, report.PointScores[^1], request.Source, newest.Shift.Id,
                newestRow.TrustStatus, newestRow.TrustReason);

            // Kept for the next batch's movement checks; shown to managers only inside a visit window.
            await latestPositions.SetAsync(position, cancellationToken);
            if (!settings.VisitOnly)
            {
                await notifier.PositionUpdatedAsync(audience, position, cancellationToken);
            }
            else if (!newestRow.OutsideVisitWindow &&
                     (await visitWindows.CurrentAsync([userId], buffer, cancellationToken)).TryGetValue(userId, out var visit))
            {
                await notifier.PositionUpdatedAsync(
                    audience,
                    position with { VisitId = visit.VisitId, VisitCustomerName = visit.CustomerName, VisitCustomerNameAr = visit.CustomerNameAr },
                    cancellationToken);
            }
        }

        if (restoredShifts.Count > 0 && (!settings.VisitOnly || !newestRow.OutsideVisitWindow))
        {
            await notifier.PresenceChangedAsync(audience, new PresenceChangeDto(userId, PresenceStatus.Online, now), cancellationToken);
        }

        if (flag is not null)
        {
            logger.LogWarning("Suspicious location for user {UserId}: score {Score} ({Codes})", userId, report.Score, string.Join(",", report.Codes));
            await flags.PublishAsync([flag], cancellationToken);
        }

        return new LocationBatchResult(
            request.Points.Count, accepted.Count, duplicates, outsideShift, report.Score, flagged,
            rows.Count(r => r.TrustStatus == LocationTrustStatus.Suspicious),
            rows.Count(r => r.TrustStatus == LocationTrustStatus.Rejected));
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
        var settings = await trustSettings.GetAsync(cancellationToken);

        var report = detector.Analyze(
            new AnomalyInput(null, [ToSample(point with { Timestamp = point.Timestamp.ToUniversalTime() })], now, sentAt, ipLocation),
            settings.ApplyTo(anomalyOptions.Value));

        var offset = ((sentAt ?? point.Timestamp.ToUniversalTime()) - now).TotalSeconds;
        return new TestPointResult(true, now, Math.Round(offset, 1), report.Score, report.Codes);
    }

    private static GeoSample ToSample(LocationPointDto p) =>
        new(p.Lat, p.Lng, p.Accuracy, p.Timestamp, p.IsMock,
            p.Altitude is { } altitude && double.IsFinite(altitude) ? altitude : null,
            Activity(p.ActivityType),
            p.ActivityConfidence,
            ParseDeviceTime(p.DeviceTime));

    /// <summary>The kind of flag a batch raises: a mock fix, otherwise movement, otherwise only the device setup.</summary>
    internal static TrackingFlagType FlagTypeFor(IReadOnlyCollection<string> codes) =>
        codes.Contains(AnomalyCodes.MockLocation) ? TrackingFlagType.MockLocation
        : codes.All(AnomalyCodes.DeviceCodes.Contains) ? TrackingFlagType.SuspiciousDevice
        : TrackingFlagType.Anomaly;

    /// <summary>ISO 8601 or epoch milliseconds; anything else is ignored rather than refusing the batch.</summary>
    internal static DateTimeOffset? ParseDeviceTime(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        if (long.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var epochMs) && epochMs > 0)
        {
            return epochMs < 253_402_300_800_000 ? DateTimeOffset.FromUnixTimeMilliseconds(epochMs) : null;
        }

        return DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var parsed)
            ? parsed.ToUniversalTime()
            : null;
    }

    private static string? Activity(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Equals("null", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var trimmed = value.Trim().ToLowerInvariant();
        return trimmed.Length <= 32 ? trimmed : trimmed[..32];
    }
}

internal static class TrackingMapping
{
    public static TrackingFlagDto ToDto(TrackingFlag flag, string? userName) =>
        new(flag.Id, flag.UserId, userName, flag.Type, flag.Status, flag.Score, flag.Signals, flag.Details, flag.CreatedAt,
            flag.LocationPointId, flag.VisitId, flag.Occurrences, flag.LastSeenAt);

    public static ShiftDto ToDto(Shift shift) =>
        new(shift.Id, shift.Status, shift.DeviceId, shift.StartedAt, shift.EndedAt, shift.LastPointAt, shift.TrackingLostAt);
}
