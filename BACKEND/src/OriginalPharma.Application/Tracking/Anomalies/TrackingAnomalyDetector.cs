using Microsoft.Extensions.Options;
using OriginalPharma.Application.Common;

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

    public double MaxClockDriftSeconds { get; set; } = 300;

    /// <summary>IP geolocation is coarse (mobile carriers route far away), so the threshold is large.</summary>
    public double IpMismatchKm { get; set; } = 500;

    /// <summary>Batches scoring at or above this create a flag for supervisor review.</summary>
    public int FlagThreshold { get; set; } = 50;
}

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
}

public sealed record GeoSample(double Lat, double Lng, double Accuracy, DateTimeOffset Timestamp, bool IsMock);

/// <param name="Previous">Last accepted point before this batch, if any.</param>
/// <param name="Points">Batch points sorted by timestamp.</param>
/// <param name="ClientSentAt">Device clock when the batch was sent (if the client provides it).</param>
/// <param name="IpLocation">Coarse location of the request IP, if known.</param>
public sealed record AnomalyInput(
    GeoSample? Previous,
    IReadOnlyList<GeoSample> Points,
    DateTimeOffset ServerReceivedAt,
    DateTimeOffset? ClientSentAt = null,
    GeoCoordinate? IpLocation = null);

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
}

/// <summary>
/// Server-side plausibility checks on incoming location batches. Produces a
/// score and the signals behind it; it never rejects data. High scores become
/// flags that a supervisor reviews.
/// </summary>
public sealed class TrackingAnomalyDetector(IOptions<AnomalyDetectionOptions> options)
{
    public AnomalyReport Analyze(AnomalyInput input)
    {
        var o = options.Value;
        var points = input.Points;
        var signals = new List<AnomalySignal>();

        // Offline queues can upload older points after newer ones; only compare
        // against the previous point when it really is earlier.
        var previous = input.Previous is { } p0 && points.Count > 0 && p0.Timestamp < points[0].Timestamp
            ? p0
            : null;

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

            var aheadSeconds = (point.Timestamp - input.ServerReceivedAt).TotalSeconds;
            if (aheadSeconds > o.MaxClockDriftSeconds)
            {
                signals.Add(new(AnomalyCodes.FutureTimestamp, AnomalyWeights.FutureTimestamp, i,
                    $"Fix is {aheadSeconds:0} s ahead of server time."));
            }

            var before = i == 0 ? previous : points[i - 1];
            if (before is not null)
            {
                CheckMovement(before, point, i, o, signals);
            }
        }

        CheckRepeatedAccuracy(points, o, signals);

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

        var score = ScoreOf(signals);
        var pointScores = Enumerable.Range(0, points.Count)
            .Select(i => ScoreOf(signals.Where(s => s.PointIndex == i || s.PointIndex is null)))
            .ToList();

        return new AnomalyReport(score, signals, pointScores);
    }

    private static void CheckMovement(GeoSample from, GeoSample to, int index, AnomalyDetectionOptions o, List<AnomalySignal> signals)
    {
        var distance = GeoMath.DistanceMeters(from.Lat, from.Lng, to.Lat, to.Lng);
        var jitterTolerance = Math.Max(o.MinJumpMeters, from.Accuracy + to.Accuracy);
        if (distance <= jitterTolerance)
        {
            return;
        }

        var seconds = (to.Timestamp - from.Timestamp).TotalSeconds;
        if (seconds <= 0)
        {
            signals.Add(new(AnomalyCodes.Teleport, AnomalyWeights.Teleport, index,
                $"Moved {distance:0} m with no time elapsed."));
            return;
        }

        var kmh = distance / seconds * 3.6;
        if (distance >= o.TeleportDistanceMeters && seconds <= o.TeleportWindowSeconds)
        {
            signals.Add(new(AnomalyCodes.Teleport, AnomalyWeights.Teleport, index,
                $"Jumped {distance / 1000:0.#} km in {seconds:0} s."));
        }
        else if (kmh > o.MaxSpeedKmh)
        {
            signals.Add(new(AnomalyCodes.ImpossibleSpeed, AnomalyWeights.ImpossibleSpeed, index,
                $"Implied speed {kmh:0} km/h over {distance:0} m."));
        }
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

    private static int ScoreOf(IEnumerable<AnomalySignal> signals) =>
        Math.Min(100, signals.GroupBy(s => s.Code).Sum(g => g.Max(s => s.Weight)));
}
