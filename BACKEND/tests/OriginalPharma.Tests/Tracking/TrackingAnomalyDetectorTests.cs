using Microsoft.Extensions.Options;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Tracking.Anomalies;

namespace OriginalPharma.Tests.Tracking;

public class TrackingAnomalyDetectorTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 16, 9, 0, 0, TimeSpan.Zero);

    private readonly TrackingAnomalyDetector _detector = new(Options.Create(new AnomalyDetectionOptions()));

    // Nasr City, Cairo. 0.001 deg latitude is about 111 m.
    private static GeoSample At(double lat, double lng, int secondsAgo, double accuracy = 12, bool mock = false) =>
        new(lat, lng, accuracy, Now.AddSeconds(-secondsAgo), mock);

    [Fact]
    public void Normal_driving_batch_scores_zero()
    {
        var points = new[]
        {
            At(30.0500, 31.3300, 300),
            At(30.0530, 31.3310, 240),
            At(30.0560, 31.3325, 180),
            At(30.0590, 31.3340, 120, accuracy: 9),
            At(30.0620, 31.3355, 60, accuracy: 15),
        };

        var report = _detector.Analyze(new AnomalyInput(null, points, Now));

        Assert.Equal(0, report.Score);
        Assert.Empty(report.Signals);
    }

    [Fact]
    public void Mock_flag_is_reported_on_that_point()
    {
        var report = _detector.Analyze(new AnomalyInput(null, [At(30.05, 31.33, 60), At(30.0505, 31.3302, 30, mock: true)], Now));

        Assert.Contains(report.Signals, s => s.Code == AnomalyCodes.MockLocation && s.PointIndex == 1);
        Assert.Equal(AnomalyWeights.MockLocation, report.Score);
        Assert.Equal(0, report.PointScores[0]);
        Assert.Equal(AnomalyWeights.MockLocation, report.PointScores[1]);
    }

    [Fact]
    public void Large_jump_in_short_time_is_a_teleport()
    {
        // Cairo -> Alexandria (~180 km) in two minutes.
        var report = _detector.Analyze(new AnomalyInput(null, [At(30.0444, 31.2357, 180), At(31.2001, 29.9187, 60)], Now));

        Assert.Contains(report.Signals, s => s.Code == AnomalyCodes.Teleport);
    }

    [Fact]
    public void Speed_above_limit_is_impossible_speed()
    {
        // ~5.5 km in 60 s = ~330 km/h, below the teleport distance.
        var report = _detector.Analyze(new AnomalyInput(null, [At(30.0000, 31.3000, 120), At(30.0500, 31.3000, 60)], Now));

        Assert.Contains(report.Signals, s => s.Code == AnomalyCodes.ImpossibleSpeed);
        Assert.DoesNotContain(report.Signals, s => s.Code == AnomalyCodes.Teleport);
    }

    [Fact]
    public void Gps_jitter_is_ignored()
    {
        // 150 m jump in 1 s with poor accuracy: jitter, not speed.
        var report = _detector.Analyze(new AnomalyInput(null, [At(30.0500, 31.3300, 2, accuracy: 80), At(30.05135, 31.3300, 1, accuracy: 80)], Now));

        Assert.DoesNotContain(report.Signals, s => s.Code is AnomalyCodes.ImpossibleSpeed or AnomalyCodes.Teleport);
    }

    [Fact]
    public void Previous_point_is_used_for_the_first_point_of_the_batch()
    {
        var previous = At(30.0444, 31.2357, 120);
        var report = _detector.Analyze(new AnomalyInput(previous, [At(31.2001, 29.9187, 60)], Now));

        Assert.Contains(report.Signals, s => s.Code == AnomalyCodes.Teleport && s.PointIndex == 0);
    }

    [Fact]
    public void Previous_point_newer_than_batch_is_ignored()
    {
        // Late upload from an offline queue: points are older than the last known position.
        var previous = At(31.2001, 29.9187, 10);
        var report = _detector.Analyze(new AnomalyInput(previous, [At(30.0444, 31.2357, 3600)], Now));

        Assert.Empty(report.Signals);
    }

    [Fact]
    public void Unrealistically_precise_accuracy_is_suspicious()
    {
        var report = _detector.Analyze(new AnomalyInput(null, [At(30.05, 31.33, 10, accuracy: 0)], Now));

        Assert.Contains(report.Signals, s => s.Code == AnomalyCodes.PerfectAccuracy);
    }

    [Fact]
    public void Same_accuracy_many_times_in_a_row_is_suspicious()
    {
        var points = Enumerable.Range(0, 6)
            .Select(i => At(30.05 + i * 0.001, 31.33, 600 - i * 60, accuracy: 5))
            .ToList();

        var report = _detector.Analyze(new AnomalyInput(null, points, Now));

        Assert.Contains(report.Signals, s => s.Code == AnomalyCodes.RepeatedAccuracy);
    }

    [Fact]
    public void Client_clock_drift_is_reported_for_the_batch()
    {
        var report = _detector.Analyze(new AnomalyInput(null, [At(30.05, 31.33, 30)], Now, ClientSentAt: Now.AddMinutes(-20)));

        var signal = Assert.Single(report.Signals);
        Assert.Equal(AnomalyCodes.ClockDrift, signal.Code);
        Assert.Null(signal.PointIndex);
        Assert.Equal(AnomalyWeights.ClockDrift, report.PointScores[0]);
    }

    [Fact]
    public void Fix_in_the_future_is_reported()
    {
        var report = _detector.Analyze(new AnomalyInput(null, [new GeoSample(30.05, 31.33, 10, Now.AddMinutes(30), false)], Now));

        Assert.Contains(report.Signals, s => s.Code == AnomalyCodes.FutureTimestamp);
    }

    [Fact]
    public void Ip_location_far_from_gps_is_reported()
    {
        var berlin = new GeoCoordinate(52.52, 13.405);
        var report = _detector.Analyze(new AnomalyInput(null, [At(30.05, 31.33, 30)], Now, IpLocation: berlin));

        Assert.Contains(report.Signals, s => s.Code == AnomalyCodes.IpMismatch);
    }

    [Fact]
    public void Score_is_capped_at_100_and_each_code_counts_once()
    {
        var points = new[]
        {
            At(30.0444, 31.2357, 120, accuracy: 0, mock: true),
            At(31.2001, 29.9187, 60, accuracy: 0, mock: true),
        };

        var report = _detector.Analyze(new AnomalyInput(null, points, Now, ClientSentAt: Now.AddHours(-1)));

        Assert.Equal(100, report.Score);
        Assert.Equal(report.Signals.Select(s => s.Code).Distinct().Count(), report.Codes.Count);
    }
}
