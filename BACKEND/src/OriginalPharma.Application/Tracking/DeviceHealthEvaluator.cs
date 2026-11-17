using OriginalPharma.Domain.Tracking;

namespace OriginalPharma.Application.Tracking;

/// <summary>Issue codes shared with the app (FRONTEND/src/features/onboarding).</summary>
public static class DeviceHealthIssues
{
    public const string LocationPermissionMissing = "location-permission-missing";
    public const string BackgroundLocationMissing = "background-location-missing";
    public const string ApproximateLocation = "approximate-location";
    public const string NotificationsDenied = "notifications-denied";
    public const string BatteryOptimizationOn = "battery-optimization-on";
    public const string LocationServicesOff = "location-services-off";
    public const string MockLocation = "mock-location";
}

/// <summary>
/// Decides whether a device can track reliably. The native app needs the full
/// set (background location, battery exemption, ...); the PWA can only track in
/// the foreground so it is held to a smaller set.
/// </summary>
public static class DeviceHealthEvaluator
{
    public static IReadOnlyList<string> Evaluate(DeviceHealthSnapshot health, LocationSource source)
    {
        var issues = new List<string>();

        if (health.LocationPermission == LocationPermissionState.None)
        {
            issues.Add(DeviceHealthIssues.LocationPermissionMissing);
        }
        else if (source == LocationSource.Native && health.LocationPermission != LocationPermissionState.Always)
        {
            issues.Add(DeviceHealthIssues.BackgroundLocationMissing);
        }

        if (health.LocationPermission != LocationPermissionState.None && !health.PreciseLocation)
        {
            issues.Add(DeviceHealthIssues.ApproximateLocation);
        }

        if (!health.LocationServicesEnabled)
        {
            issues.Add(DeviceHealthIssues.LocationServicesOff);
        }

        if (health.MockLocationDetected)
        {
            issues.Add(DeviceHealthIssues.MockLocation);
        }

        if (source == LocationSource.Native)
        {
            if (health.NotificationPermission is NotificationPermissionState.Denied or NotificationPermissionState.Prompt)
            {
                issues.Add(DeviceHealthIssues.NotificationsDenied);
            }

            if (health.BatteryOptimizationIgnored == false)
            {
                issues.Add(DeviceHealthIssues.BatteryOptimizationOn);
            }
        }

        return issues;
    }
}
