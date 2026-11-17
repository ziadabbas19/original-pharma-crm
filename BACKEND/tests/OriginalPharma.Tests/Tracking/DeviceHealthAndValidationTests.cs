using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using OriginalPharma.Application.Tracking;
using OriginalPharma.Domain.Tracking;

namespace OriginalPharma.Tests.Tracking;

public class DeviceHealthEvaluatorTests
{
    private static DeviceHealthSnapshot HealthyNative() => new()
    {
        LocationPermission = LocationPermissionState.Always,
        PreciseLocation = true,
        NotificationPermission = NotificationPermissionState.Granted,
        BatteryOptimizationIgnored = true,
        LocationServicesEnabled = true,
        MockLocationDetected = false,
    };

    [Fact]
    public void Fully_configured_native_device_is_healthy()
    {
        Assert.Empty(DeviceHealthEvaluator.Evaluate(HealthyNative(), LocationSource.Native));
    }

    [Fact]
    public void Native_device_needs_background_location_and_battery_exemption()
    {
        var health = HealthyNative();
        health.LocationPermission = LocationPermissionState.WhileInUse;
        health.BatteryOptimizationIgnored = false;
        health.NotificationPermission = NotificationPermissionState.Denied;

        var issues = DeviceHealthEvaluator.Evaluate(health, LocationSource.Native);

        Assert.Contains(DeviceHealthIssues.BackgroundLocationMissing, issues);
        Assert.Contains(DeviceHealthIssues.BatteryOptimizationOn, issues);
        Assert.Contains(DeviceHealthIssues.NotificationsDenied, issues);
    }

    [Fact]
    public void Pwa_is_healthy_with_foreground_permission_only()
    {
        var health = new DeviceHealthSnapshot
        {
            LocationPermission = LocationPermissionState.WhileInUse,
            PreciseLocation = true,
            NotificationPermission = NotificationPermissionState.Unknown,
            LocationServicesEnabled = true,
        };

        Assert.Empty(DeviceHealthEvaluator.Evaluate(health, LocationSource.Pwa));
    }

    [Fact]
    public void Mock_location_off_gps_and_approximate_location_are_issues()
    {
        var health = HealthyNative();
        health.MockLocationDetected = true;
        health.LocationServicesEnabled = false;
        health.PreciseLocation = false;

        var issues = DeviceHealthEvaluator.Evaluate(health, LocationSource.Native);

        Assert.Contains(DeviceHealthIssues.MockLocation, issues);
        Assert.Contains(DeviceHealthIssues.LocationServicesOff, issues);
        Assert.Contains(DeviceHealthIssues.ApproximateLocation, issues);
    }
}

public class LocationBatchValidatorTests
{
    private readonly FakeTimeProvider _time = new(new DateTimeOffset(2026, 11, 16, 9, 0, 0, TimeSpan.Zero));

    private LocationBatchRequestValidator Validator(int maxPoints = 500) =>
        new(Options.Create(new TrackingOptions { MaxPointsPerBatch = maxPoints }), _time);

    private LocationPointDto Point(double lat = 30.05, double lng = 31.33, int minutesAgo = 1) =>
        new(lat, lng, 10, _time.GetUtcNow().AddMinutes(-minutesAgo));

    [Fact]
    public void Valid_batch_passes()
    {
        var result = Validator().Validate(new LocationBatchRequest("device-1", LocationSource.Native, [Point(), Point(minutesAgo: 2)]));

        Assert.True(result.IsValid, string.Join("; ", result.Errors));
    }

    [Fact]
    public void Out_of_range_coordinates_fail()
    {
        var result = Validator().Validate(new LocationBatchRequest("device-1", LocationSource.Pwa, [Point(lat: 91)]));

        Assert.Contains(result.Errors, e => e.PropertyName.EndsWith(".Lat"));
    }

    [Fact]
    public void Too_many_points_fail()
    {
        var points = Enumerable.Range(1, 6).Select(i => Point(minutesAgo: i)).ToList();

        var result = Validator(maxPoints: 5).Validate(new LocationBatchRequest("device-1", LocationSource.Native, points));

        Assert.False(result.IsValid);
    }

    [Fact]
    public void Points_older_than_a_week_fail()
    {
        var result = Validator().Validate(new LocationBatchRequest("device-1", LocationSource.Native, [Point(minutesAgo: 60 * 24 * 8)]));

        Assert.False(result.IsValid);
    }
}
