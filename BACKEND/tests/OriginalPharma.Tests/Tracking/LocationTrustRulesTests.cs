using Microsoft.Extensions.Options;
using OriginalPharma.Application.Tracking;
using OriginalPharma.Application.Tracking.Anomalies;
using OriginalPharma.Application.Tracking.Integrity;
using OriginalPharma.Application.Visits;
using OriginalPharma.Domain.Tracking;

namespace OriginalPharma.Tests.Tracking;

/// <summary>The plausibility checks added for fake locations, and how they decide a point's trust.</summary>
public class LocationTrustRulesTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 19, 9, 0, 0, TimeSpan.Zero);

    private readonly TrackingAnomalyDetector _detector = new(Options.Create(new AnomalyDetectionOptions()));

    // Nasr City, Cairo. 0.001 deg latitude is about 111 m.
    private static GeoSample At(
        double lat,
        int secondsAgo,
        double accuracy = 8,
        bool mock = false,
        double? altitude = null,
        string? activity = null,
        int? confidence = null,
        double lng = 31.33) =>
        new(lat, lng, accuracy, Now.AddSeconds(-secondsAgo), mock, altitude, activity, confidence);

    private AnomalyReport Analyze(IReadOnlyList<GeoSample> points, DeviceSignalsDto? signals = null, AnomalyDetectionOptions? options = null) =>
        _detector.Analyze(new AnomalyInput(null, points, Now, Signals: signals), options);

    private static LocationTrustSettings Settings(
        double maxSpeedKmh = 200,
        double maxDistance = 500,
        double allowance = 50,
        double lowTrustAccuracy = 100,
        double perfectAccuracy = 1.5) =>
        new(maxSpeedKmh, maxDistance, allowance, lowTrustAccuracy, perfectAccuracy, 6, MockLocationPolicy.FlagOnly, 30);

    [Fact]
    public void A_normal_drive_is_trusted_point_by_point()
    {
        var report = Analyze(
        [
            At(30.0500, 300, altitude: 31.2, activity: "in_vehicle", confidence: 90),
            At(30.0530, 240, altitude: 33.8, activity: "in_vehicle", confidence: 90),
            At(30.0560, 180, altitude: 29.5, activity: "in_vehicle", confidence: 85),
        ]);

        Assert.Empty(report.Signals);
        Assert.All(Enumerable.Range(0, 3), i => Assert.Equal((LocationTrustStatus.Trusted, (string?)null), report.TrustFor(i)));
    }

    [Fact]
    public void A_teleport_is_rejected_and_the_points_around_it_stay_trusted()
    {
        // Cairo -> Alexandria (~180 km) in two minutes.
        var report = Analyze([At(30.0444, 180, lng: 31.2357), At(31.2001, 60, lng: 29.9187)]);

        Assert.Equal((LocationTrustStatus.Trusted, (string?)null), report.TrustFor(0));
        Assert.Equal((LocationTrustStatus.Rejected, AnomalyCodes.Teleport), report.TrustFor(1));
    }

    [Fact]
    public void One_bad_fix_does_not_get_the_next_good_fix_rejected()
    {
        // A, a glitch 180 km away, then B next to A again.
        var report = Analyze([At(30.0444, 180, lng: 31.2357), At(31.2001, 120, lng: 29.9187), At(30.0450, 60, lng: 31.2357)]);

        Assert.Equal(LocationTrustStatus.Rejected, report.TrustFor(1).Status);
        Assert.Equal((LocationTrustStatus.Trusted, (string?)null), report.TrustFor(2));
    }

    [Fact]
    public void After_a_wrong_starting_point_the_rep_is_not_rejected_forever()
    {
        // The first fix is far off (undetectable on its own); the real positions that follow agree
        // with each other, so only the first jump is rejected.
        var report = Analyze([At(31.2001, 240, lng: 29.9187), At(30.0444, 180, lng: 31.2357), At(30.0450, 120, lng: 31.2357), At(30.0456, 60, lng: 31.2357)]);

        Assert.Equal(LocationTrustStatus.Rejected, report.TrustFor(1).Status);
        Assert.Equal(LocationTrustStatus.Trusted, report.TrustFor(2).Status);
        Assert.Equal(LocationTrustStatus.Trusted, report.TrustFor(3).Status);
    }

    [Fact]
    public void A_rejected_previous_position_proves_nothing_about_the_next_batch()
    {
        var previous = At(31.2001, 120, lng: 29.9187);

        var report = _detector.Analyze(new AnomalyInput(previous, [At(30.0444, 60, lng: 31.2357)], Now, PreviousRejected: true));

        Assert.Empty(report.Signals);
    }

    [Fact]
    public void Impossible_speed_is_rejected()
    {
        // ~5.5 km in 60 s = ~330 km/h.
        var report = Analyze([At(30.0000, 120), At(30.0500, 60)]);

        Assert.Equal((LocationTrustStatus.Rejected, AnomalyCodes.ImpossibleSpeed), report.TrustFor(1));
    }

    [Fact]
    public void A_lower_speed_limit_from_the_settings_rejects_a_slower_jump()
    {
        // ~2.2 km in 60 s = ~133 km/h: plausible with the default 200 km/h, impossible with 120 km/h.
        GeoSample[] points = [At(30.0000, 120), At(30.0200, 60)];
        var strict = Settings(maxSpeedKmh: 120).ApplyTo(new AnomalyDetectionOptions());

        Assert.DoesNotContain(Analyze(points).Signals, s => s.Code == AnomalyCodes.ImpossibleSpeed);
        Assert.Equal((LocationTrustStatus.Rejected, AnomalyCodes.ImpossibleSpeed), Analyze(points, options: strict).TrustFor(1));
    }

    [Fact]
    public void A_mock_fix_is_suspicious_with_the_mock_reason()
    {
        var report = Analyze([At(30.05, 60), At(30.0502, 30, mock: true)]);

        Assert.Equal((LocationTrustStatus.Trusted, (string?)null), report.TrustFor(0));
        Assert.Equal((LocationTrustStatus.Suspicious, AnomalyCodes.MockLocation), report.TrustFor(1));
    }

    [Fact]
    public void Perfect_accuracy_is_suspicious()
    {
        Assert.Equal((LocationTrustStatus.Suspicious, AnomalyCodes.PerfectAccuracy), Analyze([At(30.05, 30, accuracy: 0)]).TrustFor(0));
    }

    [Fact]
    public void Constant_accuracy_on_many_fixes_is_suspicious()
    {
        var points = Enumerable.Range(0, 6).Select(i => At(30.05 + i * 0.001, 600 - i * 60, accuracy: 5)).ToList();

        var report = Analyze(points);

        Assert.Equal((LocationTrustStatus.Suspicious, AnomalyCodes.RepeatedAccuracy), report.TrustFor(5));
    }

    [Fact]
    public void The_same_coordinates_without_any_jitter_are_a_frozen_position()
    {
        var points = Enumerable.Range(0, 5).Select(i => At(30.0561, 600 - i * 60, accuracy: 4 + i * 0.5)).ToList();

        var report = Analyze(points);

        Assert.Contains(report.Signals, s => s.Code == AnomalyCodes.FrozenPosition && s.PointIndex == 4);
        Assert.Equal(LocationTrustStatus.Suspicious, report.TrustFor(4).Status);
    }

    [Fact]
    public void Repeated_coordinates_of_a_weak_network_fix_are_not_a_frozen_position()
    {
        // Wi-Fi positions repeat the same coordinates, but report tens of metres of accuracy.
        var points = Enumerable.Range(0, 6).Select(i => At(30.0561, 900 - i * 120, accuracy: 25)).ToList();

        Assert.DoesNotContain(Analyze(points).Signals, s => s.Code == AnomalyCodes.FrozenPosition);
    }

    [Fact]
    public void Repeated_coordinates_within_a_minute_are_not_a_frozen_position()
    {
        var points = Enumerable.Range(0, 6).Select(i => At(30.0561, 60 - i * 10, accuracy: 5)).ToList();

        Assert.DoesNotContain(Analyze(points).Signals, s => s.Code == AnomalyCodes.FrozenPosition);
    }

    [Fact]
    public void Altitude_always_zero_while_driving_is_suspicious()
    {
        var points = Enumerable.Range(0, 8).Select(i => At(30.05 + i * 0.001, 800 - i * 60, accuracy: 5, altitude: 0)).ToList();

        var report = Analyze(points);

        Assert.Contains(report.Signals, s => s.Code == AnomalyCodes.ZeroAltitude && s.PointIndex == 7);
        Assert.Equal(LocationTrustStatus.Suspicious, report.TrustFor(7).Status);
    }

    [Fact]
    public void Zero_altitude_from_older_apps_weak_fixes_or_standing_still_is_not_counted()
    {
        var noAltitude = Enumerable.Range(0, 8).Select(i => At(30.05 + i * 0.001, 800 - i * 60, accuracy: 5)).ToList();
        var weakFixes = Enumerable.Range(0, 8).Select(i => At(30.05 + i * 0.001, 800 - i * 60, accuracy: 30, altitude: 0)).ToList();
        var standing = Enumerable.Range(0, 8).Select(i => At(30.05 + i * 0.00001, 800 - i * 60, accuracy: 5 + i, altitude: 0)).ToList();

        Assert.DoesNotContain(Analyze(noAltitude).Signals, s => s.Code == AnomalyCodes.ZeroAltitude);
        Assert.DoesNotContain(Analyze(weakFixes).Signals, s => s.Code == AnomalyCodes.ZeroAltitude);
        Assert.DoesNotContain(Analyze(standing).Signals, s => s.Code == AnomalyCodes.ZeroAltitude);
    }

    [Fact]
    public void A_still_phone_whose_position_travels_is_suspicious()
    {
        // ~555 m in 60 s while the phone says it is still.
        var report = Analyze([At(30.0500, 120), At(30.0550, 60, activity: "still", confidence: 95)]);

        Assert.Equal((LocationTrustStatus.Suspicious, AnomalyCodes.StillWhileMoving), report.TrustFor(1));
    }

    [Fact]
    public void Still_with_low_confidence_in_a_vehicle_or_within_gps_jitter_is_not_suspicious()
    {
        Assert.Empty(Analyze([At(30.0500, 120), At(30.0550, 60, activity: "still", confidence: 40)]).Signals);
        Assert.Empty(Analyze([At(30.0500, 120), At(30.0550, 60, activity: "in_vehicle", confidence: 95)]).Signals);
        Assert.Empty(Analyze([At(30.0500, 120, accuracy: 80), At(30.0510, 60, accuracy: 80, activity: "still", confidence: 95)]).Signals);
    }

    [Fact]
    public void A_device_clock_ahead_of_the_server_is_reported_from_the_device_time()
    {
        var point = At(30.05, 30) with { DeviceTime = Now.AddMinutes(20) };

        var report = Analyze([point]);

        Assert.Equal((LocationTrustStatus.Suspicious, AnomalyCodes.FutureTimestamp), report.TrustFor(0));
    }

    [Fact]
    public void A_selected_mock_app_or_an_emulator_makes_every_point_suspicious()
    {
        var report = Analyze([At(30.05, 60), At(30.0505, 30)], new DeviceSignalsDto(MockLocationAppSelected: true, Emulator: true));

        Assert.Equal(AnomalyWeights.MockAppSelected + AnomalyWeights.Emulator, report.Score);
        Assert.All(Enumerable.Range(0, 2), i => Assert.Equal(LocationTrustStatus.Suspicious, report.TrustFor(i).Status));
    }

    [Fact]
    public void Root_a_spoofing_app_on_the_phone_and_manual_time_are_kept_but_do_not_change_trust()
    {
        var signals = new DeviceSignalsDto(Rooted: true, RootSignals: ["su-binary"], SpoofingApps: ["com.lexa.fakegps"], AutoTimeEnabled: false);

        var report = Analyze([At(30.05, 30)], signals);

        Assert.Equal([AnomalyCodes.RootedDevice, AnomalyCodes.SpoofingAppInstalled, AnomalyCodes.AutoTimeOff], report.CodesForPoint(0));
        Assert.Equal((LocationTrustStatus.Trusted, (string?)null), report.TrustFor(0));
        Assert.True(report.Score < new AnomalyDetectionOptions().FlagThreshold);
    }

    [Fact]
    public void The_most_severe_reason_decides()
    {
        // A mock fix that also jumps impossibly far is rejected, not just suspicious.
        var report = Analyze([At(30.0444, 180, lng: 31.2357), At(31.2001, 60, mock: true, lng: 29.9187)]);

        Assert.Equal((LocationTrustStatus.Rejected, AnomalyCodes.Teleport), report.TrustFor(1));
    }

    [Theory]
    [InlineData(null, null)]
    [InlineData("", null)]
    [InlineData("not a time", null)]
    [InlineData("2026-11-19T08:30:00.000Z", "2026-11-19T08:30:00+00:00")]
    [InlineData("2026-11-19T10:30:00+02:00", "2026-11-19T08:30:00+00:00")]
    [InlineData("1795595400000", "2026-11-25T08:30:00+00:00")]
    public void Device_time_is_read_from_iso_or_epoch_and_anything_else_is_ignored(string? raw, string? expected)
    {
        Assert.Equal(expected is null ? null : DateTimeOffset.Parse(expected), TrackingIngestService.ParseDeviceTime(raw));
    }

    [Fact]
    public void The_flag_type_follows_the_strongest_kind_of_reason()
    {
        Assert.Equal(TrackingFlagType.MockLocation, TrackingIngestService.FlagTypeFor([AnomalyCodes.MockLocation, AnomalyCodes.Emulator]));
        Assert.Equal(TrackingFlagType.Anomaly, TrackingIngestService.FlagTypeFor([AnomalyCodes.Teleport, AnomalyCodes.Emulator]));
        Assert.Equal(TrackingFlagType.SuspiciousDevice, TrackingIngestService.FlagTypeFor([AnomalyCodes.MockAppSelected, AnomalyCodes.Emulator]));
    }

    [Fact]
    public void Device_signals_are_trimmed_instead_of_refused()
    {
        var noisy = new DeviceSignalsDto(
            Platform: "  android  ",
            SpoofingApps: [.. Enumerable.Range(0, 50).Select(i => $"com.fake.app{i}"), "", new string('x', 500)]);

        var clean = noisy.Sanitized();

        Assert.Equal("android", clean.Platform);
        Assert.Equal(20, clean.SpoofingApps!.Count);
        Assert.Null(DeviceSignalsDto.FromJson("{ not json"));
        Assert.Equal(clean.SpoofingApps, DeviceSignalsDto.FromJson(clean.ToJson())!.SpoofingApps);
    }

    [Fact]
    public void A_visit_at_the_clinic_with_a_normal_fix_has_no_trust_reasons()
    {
        var result = VisitTrustEvaluator.Evaluate(new VisitTrustInput(40, 12, null, 0), Settings());

        Assert.Empty(result.Reasons);
    }

    [Fact]
    public void Far_from_the_doctor_takes_the_accuracy_allowance_into_account()
    {
        // 540 m with a 50 m fix: 540 - 50 = 490, inside the 500 m limit.
        Assert.Empty(VisitTrustEvaluator.Evaluate(new VisitTrustInput(540, 50, null, 0), Settings()).Reasons);

        // The allowance is capped (50 m), so a 600 m fix that is 700 m away is still far.
        Assert.Equal([VisitReviewReasons.FarFromDoctor, VisitReviewReasons.LowTrust],
            VisitTrustEvaluator.Evaluate(new VisitTrustInput(700, 600, null, 0), Settings()).Reasons);

        // A stricter admin setting flags a closer check-in.
        Assert.Equal([VisitReviewReasons.FarFromDoctor],
            VisitTrustEvaluator.Evaluate(new VisitTrustInput(300, 12, null, 0), Settings(maxDistance: 200)).Reasons);
    }

    [Theory]
    [InlineData(150, false, false, 0)]
    [InlineData(0.5, false, false, 0)]
    [InlineData(12, true, false, 0)]
    [InlineData(12, false, true, 0)]
    [InlineData(12, false, false, 3)]
    public void Weak_or_synthetic_evidence_makes_a_visit_low_trust(double accuracy, bool mockApp, bool emulator, int suspiciousPoints)
    {
        var signals = new DeviceSignalsDto(MockLocationAppSelected: mockApp, Emulator: emulator);

        var result = VisitTrustEvaluator.Evaluate(new VisitTrustInput(30, accuracy, signals, suspiciousPoints), Settings());

        Assert.Equal([VisitReviewReasons.LowTrust], result.Reasons);
        Assert.NotEmpty(result.Details);
    }

    [Fact]
    public void Settings_validation_keeps_values_in_sane_ranges()
    {
        var validator = new UpdateLocationTrustSettingsRequestValidator();
        var good = new UpdateLocationTrustSettingsRequest(200, 500, 50, 100, 1.5, 6, MockLocationPolicy.FlagAndExclude, 30);

        Assert.True(validator.Validate(good).IsValid);
        Assert.False(validator.Validate(good with { MaxSpeedKmh = 20 }).IsValid);
        Assert.False(validator.Validate(good with { DeviceSignalsRetentionDays = 0 }).IsValid);
        Assert.False(validator.Validate(good with { MockPolicy = (MockLocationPolicy)9 }).IsValid);
    }
}
