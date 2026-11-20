using Microsoft.Extensions.Options;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Tracking.Integrity;
using OriginalPharma.Domain.Tracking;

namespace OriginalPharma.Application.Tracking.Anomalies;

public sealed class AnomalyDetectionOptions
{
    public const string SectionName = "Tracking:Anomalies";

    /// <summary>Anything faster between two fixes is treated as impossible for a rep on the road.</summary>
    public double MaxSpeedKmh { get; set; } = 200;

    /// <summary>A jump at least this long inside <see cref="TeleportWindowSeconds"/> is a teleport.</summary>
    public double TeleportDistanceMeters { get; set; } = 20_000;
    public double TeleportWindowSeconds { get; set; } = 300;

    /// <summary>Jumps shorter than this (or than the two accuracies combined) are ignored as GPS jitter.</summary>
    public double MinJumpMeters { get; set; } = 300;

    /// <summary>Real phones rarely report better than ~3 m; fake GPS apps often report 0-1 m.</summary>
    public double SuspiciousAccuracyMeters { get; set; } = 1.5;

    /// <summary>This many consecutive fixes with the exact same accuracy value looks synthetic.</summary>
    public int RepeatedAccuracyRun { get; set; } = 6;

    /// <summary>
    /// This many consecutive precise fixes (see <see cref="FrozenPositionMaxAccuracyMeters"/>) on exactly
    /// the same coordinates, over at least <see cref="FrozenPositionMinSeconds"/>, have none of the
    /// jitter a real GPS shows. Network (Wi-Fi) fixes may repeat coordinates, hence the accuracy limit.
    /// </summary>
    public int FrozenPositionRun { get; set; } = 5;
    public double FrozenPositionMaxAccuracyMeters { get; set; } = 10;
    public double FrozenPositionMinSeconds { get; set; } = 120;

    /// <summary>
    /// This many consecutive precise fixes reporting exactly 0 m altitude while the rep moves at least
    /// <see cref="ZeroAltitudeMinMeters"/>. Satellite fixes always carry some altitude noise; network
    /// fixes report 0, hence the accuracy limit and the movement requirement.
    /// </summary>
    public int ZeroAltitudeRun { get; set; } = 8;
    public double ZeroAltitudeMaxAccuracyMeters { get; set; } = 10;
    public double ZeroAltitudeMinMeters { get; set; } = 300;

    /// <summary>The phone says it is still (with this confidence) while the position moves this far and fast.</summary>
    public int StillMinConfidence { get; set; } = 75;
    public double StillMovingMinMeters { get; set; } = 200;
    public double StillMovingMinSpeedMps { get; set; } = 3;

    public double MaxClockDriftSeconds { get; set; } = 300;

    /// <summary>IP geolocation is coarse (mobile carriers route far away), so the threshold is large.</summary>
    public double IpMismatchKm { get; set; } = 500;

    /// <summary>Batches scoring at or above this create a flag for supervisor review.</summary>
    public int FlagThreshold { get; set; } = 50;

    public AnomalyDetectionOptions Copy() => (AnomalyDetectionOptions)MemberwiseClone();
}

/// <summary>How much a reason code says about a point.</summary>
public enum AnomalySeverity
{
    /// <summary>Kept for review, does not change the point's trust status on its own.</summary>
    Info = 0,

    /// <summary>The point is suspicious.</summary>
    Suspicious = 1,

    /// <summary>The point is physically impossible and is rejected (kept, never counted).</summary>
    Impossible = 2,
}

/// <summary>Reason codes of the plausibility checks. The clients translate them.</summary>
public static class AnomalyCodes
{
    public const string MockLocation = "mock-location";
    public const string Teleport = "teleport";
    public const string ImpossibleSpeed = "impossible-speed";
    public const string FutureTimestamp = "future-timestamp";
    public const string ClockDrift = "clock-drift";
    public const string PerfectAccuracy = "perfect-accuracy";
    public const string RepeatedAccuracy = "repeated-accuracy";
    public const string IpMismatch = "ip-geo-mismatch";
    public const string FrozenPosition = "frozen-position";
    public const string ZeroAltitude = "zero-altitude";
    public const string StillWhileMoving = "still-while-moving";

    // From the device signals sent with a batch (apply to every point of it).
    public const string MockAppSelected = "mock-app-selected";
    public const string Emulator = "emulator";
    public const string RootedDevice = "rooted-device";
    public const string SpoofingAppInstalled = "spoofing-app-installed";
    public const string AutoTimeOff = "auto-time-off";
    public const string LocationAccessory = "location-accessory";

    /// <summary>Codes describing the device rather than the movement.</summary>
    public static readonly IReadOnlySet<string> DeviceCodes = new HashSet<string>
    {
        MockAppSelected, Emulator, RootedDevice, SpoofingAppInstalled, AutoTimeOff, LocationAccessory,
    };

    public static AnomalySeverity SeverityOf(string code) => code switch
    {
        Teleport or ImpossibleSpeed => AnomalySeverity.Impossible,
        IpMismatch or RootedDevice or SpoofingAppInstalled or AutoTimeOff or LocationAccessory => AnomalySeverity.Info,
        _ => AnomalySeverity.Suspicious,
    };
}

/// <summary>How much each signal adds to the 0-100 score. Each code counts once per batch.</summary>
public static class AnomalyWeights
{
    public const int MockLocation = 60;
    public const int Teleport = 50;
    public const int ImpossibleSpeed = 35;
    public const int FutureTimestamp = 25;
    public const int ClockDrift = 20;
    public const int PerfectAccuracy = 15;
    public const int RepeatedAccuracy = 15;
    public const int IpMismatch = 10;
    public const int FrozenPosition = 20;
    public const int ZeroAltitude = 15;
    public const int StillWhileMoving = 20;
    public const int MockAppSelected = 40;
    public const int Emulator = 40;
    public const int RootedDevice = 15;
    public const int SpoofingAppInstalled = 10;
    public const int AutoTimeOff = 5;
    public const int LocationAccessory = 5;
}

/// <param name="DeviceTime">Device wall clock when the app recorded the fix, when sent.</param>
/// <param name="ActivityType">Motion activity (still, on_foot, in_vehicle, ...), when sent.</param>
public sealed record GeoSample(
    double Lat,
    double Lng,
    double Accuracy,
    DateTimeOffset Timestamp,
    bool IsMock,
    double? Altitude = null,
    string? ActivityType = null,
    int? ActivityConfidence = null,
    DateTimeOffset? DeviceTime = null);

/// <param name="Previous">Last accepted point before this batch, if any.</param>
/// <param name="Points">Batch points sorted by timestamp.</param>
/// <param name="ClientSentAt">Device clock when the batch was sent (if the client provides it).</param>
/// <param name="IpLocation">Coarse location of the request IP, if known.</param>
/// <param name="Signals">Device signals sent with the batch, if any.</param>
/// <param name="PreviousRejected">The previous point was itself rejected, so it proves nothing about the next one.</param>
public sealed record AnomalyInput(
    GeoSample? Previous,
    IReadOnlyList<GeoSample> Points,
    DateTimeOffset ServerReceivedAt,
    DateTimeOffset? ClientSentAt = null,
    GeoCoordinate? IpLocation = null,
    DeviceSignalsDto? Signals = null,
    bool PreviousRejected = false);

/// <param name="PointIndex">Index in the batch, or null for batch-wide signals.</param>
public sealed record AnomalySignal(string Code, int Weight, int? PointIndex, string Detail);

public sealed class AnomalyReport(int score, IReadOnlyList<AnomalySignal> signals, IReadOnlyList<int> pointScores)
{
    public int Score { get; } = score;
    public IReadOnlyList<AnomalySignal> Signals { get; } = signals;
    public IReadOnlyList<int> PointScores { get; } = pointScores;

    public IReadOnlyList<string> Codes => Signals.Select(s => s.Code).Distinct().ToList();

    public IReadOnlyList<string> CodesForPoint(int index) =>
        Signals.Where(s => s.PointIndex == index || s.PointIndex is null).Select(s => s.Code).Distinct().ToList();

    /// <summary>
    /// Trust status of one point: rejected when physically impossible, suspicious when any other check
    /// that is more than informational fired, trusted otherwise. The reason is the heaviest code of the
    /// deciding severity.
    /// </summary>
    public (LocationTrustStatus Status, string? Reason) TrustFor(int index)
    {
        var deciding = Signals
            .Where(s => s.PointIndex == index || s.PointIndex is null)
            .Select(s => (Signal: s, Severity: AnomalyCodes.SeverityOf(s.Code)))
            .Where(x => x.Severity != AnomalySeverity.Info)
            .OrderByDescending(x => x.Severity).ThenByDescending(x => x.Signal.Weight)
            .FirstOrDefault();

        return deciding.Signal is null
            ? (LocationTrustStatus.Trusted, null)
            : (deciding.Severity == AnomalySeverity.Impossible ? LocationTrustStatus.Rejected : LocationTrustStatus.Suspicious, deciding.Signal.Code);
    }
}

/// <summary>
/// Server-side plausibility checks on incoming location batches. Produces a score, the signals
/// behind it and a trust status per point; it never drops data. High scores become flags that a
/// supervisor reviews. Weak GPS (large accuracy) never counts against the rep: jumps within the
/// combined accuracy are ignored and the synthetic-fix checks only look at precise fixes.
/// </summary>
public sealed class TrackingAnomalyDetector(IOptions<AnomalyDetectionOptions> options)
{
    /// <param name="overrides">Thresholds to use instead of the configured ones (admin settings).</param>
    public AnomalyReport Analyze(AnomalyInput input, AnomalyDetectionOptions? overrides = null)
    {
        var o = overrides ?? options.Value;
        var points = input.Points;
        var signals = new List<AnomalySignal>();

        // Offline queues can upload older points after newer ones; only compare
        // against the previous point when it really is earlier.
        var previous = input.Previous is { } p0 && points.Count > 0 && p0.Timestamp < points[0].Timestamp
            ? p0
            : null;

        // A single bad fix must not take the next good one down with it: a point that only looks
        // impossible next to a rejected point is measured again against the last point that was not.
        var before = previous;
        var beforeRejected = previous is not null && input.PreviousRejected;
        var lastGood = beforeRejected ? null : previous;

        for (var i = 0; i < points.Count; i++)
        {
            var point = points[i];

            if (point.IsMock)
            {
                signals.Add(new(AnomalyCodes.MockLocation, AnomalyWeights.MockLocation, i,
                    "Device reported the fix came from a mock location provider."));
            }

            if (point.Accuracy <= o.SuspiciousAccuracyMeters)
            {
                signals.Add(new(AnomalyCodes.PerfectAccuracy, AnomalyWeights.PerfectAccuracy, i,
                    $"Accuracy {point.Accuracy:0.##} m is unrealistically precise."));
            }

            var latest = point.DeviceTime is { } deviceTime && deviceTime > point.Timestamp ? deviceTime : point.Timestamp;
            var aheadSeconds = (latest - input.ServerReceivedAt).TotalSeconds;
            if (aheadSeconds > o.MaxClockDriftSeconds)
            {
                signals.Add(new(AnomalyCodes.FutureTimestamp, AnomalyWeights.FutureTimestamp, i,
                    $"Fix is {aheadSeconds:0} s ahead of server time."));
            }

            var rejected = false;
            if (before is not null)
            {
                var movement = Movement(before, point, i, o);
                if (movement is not null && beforeRejected && (lastGood is null || Movement(lastGood, point, i, o) is null))
                {
                    movement = null;
                }

                if (movement is not null)
                {
                    signals.Add(movement);
                    rejected = true;
                }

                CheckStillWhileMoving(before, point, i, o, signals);
            }

            before = point;
            beforeRejected = rejected;
            if (!rejected)
            {
                lastGood = point;
            }
        }

        CheckRepeatedAccuracy(points, o, signals);
        CheckFrozenPosition(points, o, signals);
        CheckZeroAltitude(points, o, signals);

        if (input.ClientSentAt is { } sentAt)
        {
            var drift = (sentAt - input.ServerReceivedAt).TotalSeconds;
            if (Math.Abs(drift) > o.MaxClockDriftSeconds)
            {
                signals.Add(new(AnomalyCodes.ClockDrift, AnomalyWeights.ClockDrift, null,
                    $"Device clock differs from server by {drift:0} s."));
            }
        }

        if (input.IpLocation is { } ip && points.Count > 0)
        {
            var last = points[^1];
            var km = GeoMath.DistanceMeters(ip.Latitude, ip.Longitude, last.Lat, last.Lng) / 1000d;
            if (km > o.IpMismatchKm)
            {
                signals.Add(new(AnomalyCodes.IpMismatch, AnomalyWeights.IpMismatch, null,
                    $"GPS position is {km:0} km away from the network (IP) location."));
            }
        }

        AddDeviceSignals(input.Signals, signals);

        var score = ScoreOf(signals);
        var pointScores = Enumerable.Range(0, points.Count)
            .Select(i => ScoreOf(signals.Where(s => s.PointIndex == i || s.PointIndex is null)))
            .ToList();

        return new AnomalyReport(score, signals, pointScores);
    }

    /// <summary>A physically impossible move from one fix to the next (teleport or speed), or null.</summary>
    private static AnomalySignal? Movement(GeoSample from, GeoSample to, int index, AnomalyDetectionOptions o)
    {
        var distance = GeoMath.DistanceMeters(from.Lat, from.Lng, to.Lat, to.Lng);
        var jitterTolerance = Math.Max(o.MinJumpMeters, from.Accuracy + to.Accuracy);
        if (distance <= jitterTolerance)
        {
            return null;
        }

        var seconds = (to.Timestamp - from.Timestamp).TotalSeconds;
        if (seconds <= 0)
        {
            return new(AnomalyCodes.Teleport, AnomalyWeights.Teleport, index, $"Moved {distance:0} m with no time elapsed.");
        }

        var kmh = distance / seconds * 3.6;
        if (distance >= o.TeleportDistanceMeters && seconds <= o.TeleportWindowSeconds)
        {
            return new(AnomalyCodes.Teleport, AnomalyWeights.Teleport, index, $"Jumped {distance / 1000:0.#} km in {seconds:0} s.");
        }

        return kmh > o.MaxSpeedKmh
            ? new(AnomalyCodes.ImpossibleSpeed, AnomalyWeights.ImpossibleSpeed, index, $"Implied speed {kmh:0} km/h over {distance:0} m.")
            : null;
    }

    /// <summary>The phone's motion sensors say "still" while the reported position travels.</summary>
    private static void CheckStillWhileMoving(GeoSample from, GeoSample to, int index, AnomalyDetectionOptions o, List<AnomalySignal> signals)
    {
        if (!string.Equals(to.ActivityType, "still", StringComparison.OrdinalIgnoreCase) || (to.ActivityConfidence ?? 0) < o.StillMinConfidence)
        {
            return;
        }

        var seconds = (to.Timestamp - from.Timestamp).TotalSeconds;
        var distance = GeoMath.DistanceMeters(from.Lat, from.Lng, to.Lat, to.Lng);
        if (seconds <= 0 || distance <= Math.Max(o.StillMovingMinMeters, from.Accuracy + to.Accuracy) || distance / seconds < o.StillMovingMinSpeedMps)
        {
            return;
        }

        signals.Add(new(AnomalyCodes.StillWhileMoving, AnomalyWeights.StillWhileMoving, index,
            $"Phone reported being still while the position moved {distance:0} m in {seconds:0} s."));
    }

    private static void CheckRepeatedAccuracy(IReadOnlyList<GeoSample> points, AnomalyDetectionOptions o, List<AnomalySignal> signals)
    {
        if (o.RepeatedAccuracyRun < 2 || points.Count < o.RepeatedAccuracyRun)
        {
            return;
        }

        var run = 1;
        for (var i = 1; i < points.Count; i++)
        {
            run = points[i].Accuracy.Equals(points[i - 1].Accuracy) ? run + 1 : 1;
            if (run == o.RepeatedAccuracyRun)
            {
                signals.Add(new(AnomalyCodes.RepeatedAccuracy, AnomalyWeights.RepeatedAccuracy, i,
                    $"{run} consecutive fixes reported exactly {points[i].Accuracy:0.##} m accuracy."));
                return;
            }
        }
    }

    /// <summary>Exactly the same coordinates again and again, with no GPS jitter at all.</summary>
    private static void CheckFrozenPosition(IReadOnlyList<GeoSample> points, AnomalyDetectionOptions o, List<AnomalySignal> signals)
    {
        if (o.FrozenPositionRun < 2 || points.Count < o.FrozenPositionRun)
        {
            return;
        }

        var start = 0;
        for (var i = 0; i < points.Count; i++)
        {
            var precise = points[i].Accuracy <= o.FrozenPositionMaxAccuracyMeters;
            if (!precise)
            {
                start = i + 1;
                continue;
            }

            if (i > start && !SameSpot(points[i], points[start]))
            {
                start = i;
            }

            var run = i - start + 1;
            if (run >= o.FrozenPositionRun && (points[i].Timestamp - points[start].Timestamp).TotalSeconds >= o.FrozenPositionMinSeconds)
            {
                signals.Add(new(AnomalyCodes.FrozenPosition, AnomalyWeights.FrozenPosition, i,
                    $"{run} precise fixes over {(points[i].Timestamp - points[start].Timestamp).TotalMinutes:0} min on exactly the same coordinates."));
                return;
            }
        }
    }

    /// <summary>Precise fixes reporting exactly zero altitude while the rep travels.</summary>
    private static void CheckZeroAltitude(IReadOnlyList<GeoSample> points, AnomalyDetectionOptions o, List<AnomalySignal> signals)
    {
        if (o.ZeroAltitudeRun < 2 || points.Count < o.ZeroAltitudeRun)
        {
            return;
        }

        var start = 0;
        for (var i = 0; i < points.Count; i++)
        {
            var p = points[i];
            if (p.Altitude is not 0d || p.Accuracy > o.ZeroAltitudeMaxAccuracyMeters)
            {
                start = i + 1;
                continue;
            }

            var run = i - start + 1;
            if (run >= o.ZeroAltitudeRun && PathMeters(points, start, i) >= o.ZeroAltitudeMinMeters)
            {
                signals.Add(new(AnomalyCodes.ZeroAltitude, AnomalyWeights.ZeroAltitude, i,
                    $"{run} precise fixes in a row reported exactly 0 m altitude while moving."));
                return;
            }
        }
    }

    private static void AddDeviceSignals(DeviceSignalsDto? deviceSignals, List<AnomalySignal> signals)
    {
        foreach (var code in DeviceSignalCodes.From(deviceSignals))
        {
            var (weight, detail) = code switch
            {
                AnomalyCodes.MockAppSelected => (AnomalyWeights.MockAppSelected, "A spoofing app is selected as the mock location app."),
                AnomalyCodes.Emulator => (AnomalyWeights.Emulator, "The app runs on an emulator."),
                AnomalyCodes.RootedDevice => (AnomalyWeights.RootedDevice, "The phone shows root signals."),
                AnomalyCodes.SpoofingAppInstalled => (AnomalyWeights.SpoofingAppInstalled, "A known spoofing app is installed."),
                AnomalyCodes.AutoTimeOff => (AnomalyWeights.AutoTimeOff, "Automatic time or time zone is off."),
                _ => (AnomalyWeights.LocationAccessory, "The location comes from an external accessory."),
            };
            signals.Add(new(code, weight, null, detail));
        }
    }

    private static bool SameSpot(GeoSample a, GeoSample b) =>
        Math.Abs(a.Lat - b.Lat) < 1e-7 && Math.Abs(a.Lng - b.Lng) < 1e-7;

    private static double PathMeters(IReadOnlyList<GeoSample> points, int from, int to)
    {
        var meters = 0d;
        for (var i = from + 1; i <= to; i++)
        {
            meters += GeoMath.DistanceMeters(points[i - 1].Lat, points[i - 1].Lng, points[i].Lat, points[i].Lng);
        }

        return meters;
    }

    private static int ScoreOf(IEnumerable<AnomalySignal> signals) =>
        Math.Min(100, signals.GroupBy(s => s.Code).Sum(g => g.Max(s => s.Weight)));
}
