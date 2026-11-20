using OriginalPharma.Application.Common;
using OriginalPharma.Application.Tracking.Integrity;
using OriginalPharma.Application.Visits;
using OriginalPharma.Domain.Tracking;

namespace OriginalPharma.Tests.Visits;

/// <summary>Comparing a visit with the clinic and the earlier visits: median, previous, nearest and drift.</summary>
public class VisitLocationHistoryTests
{
    private const double ClinicLat = 30.0561;
    private const double ClinicLng = 31.3301;

    /// <summary>About 1.1 m of latitude per 0.00001 degree.</summary>
    private const double MetresPerDegree = 111_195;

    private static readonly LocationTrustSettings Settings = new(
        MaxSpeedKmh: 200,
        MaxDistanceFromDoctorMeters: 500,
        AccuracyAllowanceMeters: 50,
        LowTrustAccuracyMeters: 100,
        PerfectAccuracyMeters: 1.5,
        RepeatedAccuracyRun: 6,
        MockPolicy: MockLocationPolicy.FlagOnly,
        DeviceSignalsRetentionDays: 30,
        DriftFromClinicMeters: 150,
        DriftFromVisitsMeters: 150);

    private static readonly DateTimeOffset Now = new(2026, 11, 20, 10, 0, 0, TimeSpan.Zero);

    /// <summary>A reference visit <paramref name="northMeters"/> north of the clinic, <paramref name="daysAgo"/> days ago.</summary>
    private static ReferenceFix Fix(double northMeters, int daysAgo) =>
        new(Guid.NewGuid(), Now.AddDays(-daysAgo), ClinicLat + northMeters / MetresPerDegree, ClinicLng);

    [Fact]
    public void Without_earlier_visits_nothing_is_compared()
    {
        var result = VisitLocationHistory.Compare(ClinicLat, ClinicLng, Now, []);

        Assert.Equal(VisitLocationComparison.None, result);
        Assert.False(VisitLocationHistory.Drift(result, null, 10, Settings).IsDrift);
    }

    [Fact]
    public void The_previous_visit_is_the_latest_one_and_the_nearest_is_the_closest()
    {
        var older = Fix(10, daysAgo: 9);
        var latest = Fix(60, daysAgo: 2);

        var result = VisitLocationHistory.Compare(ClinicLat, ClinicLng, Now, [older, latest]);

        Assert.Equal(latest.VisitId, result.PreviousVisitId);
        Assert.InRange(result.PreviousDistanceMeters!.Value, 59, 61);
        Assert.Equal(TimeSpan.FromDays(2).TotalSeconds, result.SincePreviousSeconds);
        Assert.InRange(result.NearestDistanceMeters!.Value, 9, 11);
        Assert.Equal(2, result.ReferenceCount);
    }

    [Fact]
    public void The_median_needs_two_earlier_visits()
    {
        var one = VisitLocationHistory.Compare(ClinicLat, ClinicLng, Now, [Fix(40, 1)]);

        Assert.Null(one.MedianDistanceMeters);
        Assert.Equal(1, one.ReferenceCount);
    }

    [Fact]
    public void One_bad_visit_does_not_pull_the_median_away_from_the_clinic()
    {
        // Four visits at the clinic door and one 2 km away: the mean would sit ~400 m out, the median stays put.
        IReadOnlyList<ReferenceFix> earlier = [Fix(0, 5), Fix(5, 4), Fix(-5, 3), Fix(2, 2), Fix(2000, 1)];

        var (lat, lng) = VisitLocationHistory.MedianOf(earlier);
        var result = VisitLocationHistory.Compare(ClinicLat, ClinicLng, Now, earlier);

        Assert.InRange(GeoMath.DistanceMeters(ClinicLat, ClinicLng, lat, lng), 0, 5);
        Assert.InRange(result.MedianDistanceMeters!.Value, 0, 5);
    }

    [Fact]
    public void An_even_number_of_visits_takes_the_middle_of_the_two_central_values()
    {
        var (lat, _) = VisitLocationHistory.MedianOf([Fix(0, 4), Fix(10, 3), Fix(20, 2), Fix(1000, 1)]);

        Assert.InRange((lat - ClinicLat) * MetresPerDegree, 14.9, 15.1);
    }

    [Fact]
    public void A_check_in_far_from_the_clinic_is_drift_after_the_accuracy_allowance()
    {
        // 190 m with a 50 m fix: 140 m after the allowance stays within 150 m; 230 m does not.
        var within = VisitLocationHistory.Drift(VisitLocationComparison.None, 190, 50, Settings);
        var beyond = VisitLocationHistory.Drift(VisitLocationComparison.None, 230, 50, Settings);

        Assert.False(within.IsDrift);
        Assert.Equal([VisitLocationHistory.FromClinic], beyond.Sources);
        Assert.Contains("230 m from the clinic", beyond.Details[0]);
    }

    [Fact]
    public void The_median_rule_waits_for_two_earlier_visits_but_the_previous_visit_counts_at_once()
    {
        var oneEarlier = new VisitLocationComparison(Guid.NewGuid(), 400, 3600, MedianDistanceMeters: 400, 400, ReferenceCount: 1);
        var twoEarlier = oneEarlier with { ReferenceCount = 2 };

        Assert.Equal([VisitLocationHistory.FromPrevious], VisitLocationHistory.Drift(oneEarlier, null, 10, Settings).Sources);
        Assert.Equal(
            [VisitLocationHistory.FromMedian, VisitLocationHistory.FromPrevious],
            VisitLocationHistory.Drift(twoEarlier, null, 10, Settings).Sources);
    }

    [Fact]
    public void The_drift_settings_are_applied()
    {
        var comparison = new VisitLocationComparison(Guid.NewGuid(), 260, 60, 260, 260, 3);
        var strict = Settings with { DriftFromClinicMeters = 100, DriftFromVisitsMeters = 100 };
        var loose = Settings with { DriftFromClinicMeters = 500, DriftFromVisitsMeters = 500 };

        Assert.Equal(3, VisitLocationHistory.Drift(comparison, 260, 0, strict).Sources.Count);
        Assert.False(VisitLocationHistory.Drift(comparison, 260, 0, loose).IsDrift);
    }

    [Fact]
    public void Only_a_clean_precise_fix_is_good_enough_to_keep()
    {
        Assert.True(VisitLocationHistory.QualityOf(false, 20, null, 0, Settings).IsGood);

        Assert.False(VisitLocationHistory.QualityOf(true, 20, null, 0, Settings).IsGood);
        Assert.False(VisitLocationHistory.QualityOf(false, 120, null, 0, Settings).IsGood);
        Assert.False(VisitLocationHistory.QualityOf(false, 1, null, 0, Settings).IsGood);
        Assert.False(VisitLocationHistory.QualityOf(false, 20, new DeviceSignalsDto(MockLocationAppSelected: true), 0, Settings).IsGood);
        Assert.False(VisitLocationHistory.QualityOf(false, 20, new DeviceSignalsDto(Emulator: true), 0, Settings).IsGood);
        Assert.False(VisitLocationHistory.QualityOf(false, 20, new DeviceSignalsDto(Rooted: true), 0, Settings).IsGood);
        Assert.False(VisitLocationHistory.QualityOf(false, 20, new DeviceSignalsDto(SpoofingApps: ["com.lexa.fakegps"]), 0, Settings).IsGood);
        Assert.False(VisitLocationHistory.QualityOf(false, 20, null, suspiciousPointsNearby: 2, Settings).IsGood);

        // Automatic time off says nothing about the position itself.
        Assert.True(VisitLocationHistory.QualityOf(false, 20, new DeviceSignalsDto(AutoTimeEnabled: false), 0, Settings).IsGood);
    }

    [Fact]
    public void Saved_settings_without_the_drift_values_take_the_configured_defaults()
    {
        var saved = Settings with { DriftFromClinicMeters = 0, DriftFromVisitsMeters = 0 };
        var defaults = Settings with { DriftFromClinicMeters = 175, DriftFromVisitsMeters = 225 };

        var merged = saved.WithDefaultsFrom(defaults);

        Assert.Equal(175, merged.DriftFromClinicMeters);
        Assert.Equal(225, merged.DriftFromVisitsMeters);
        Assert.Equal(Settings.MaxDistanceFromDoctorMeters, merged.MaxDistanceFromDoctorMeters);
    }
}
