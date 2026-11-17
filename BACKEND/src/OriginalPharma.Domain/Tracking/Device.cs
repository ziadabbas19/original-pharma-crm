using OriginalPharma.Domain.Common;

namespace OriginalPharma.Domain.Tracking;

/// <summary>Everything a device reports about its ability to track reliably.</summary>
public class DeviceHealthSnapshot
{
    public LocationPermissionState LocationPermission { get; set; }
    public bool PreciseLocation { get; set; }
    public NotificationPermissionState NotificationPermission { get; set; }

    /// <summary>Null when the platform has no such setting (web/iOS).</summary>
    public bool? BatteryOptimizationIgnored { get; set; }

    public bool LocationServicesEnabled { get; set; }
    public bool MockLocationDetected { get; set; }
    public bool? DeveloperOptionsEnabled { get; set; }
    public bool? PowerSaveMode { get; set; }

    public string? AppVersion { get; set; }
    public string? Manufacturer { get; set; }
    public string? Model { get; set; }
    public string? OsVersion { get; set; }
}

/// <summary>A rep's device with its latest health state.</summary>
public class Device : Entity, IScopedEntity
{
    public Guid UserId { get; set; }
    public Guid? TerritoryId { get; set; }

    /// <summary>Install id created by the app (stable per install).</summary>
    public string DeviceId { get; set; } = string.Empty;

    public DevicePlatform Platform { get; set; }
    public LocationSource Source { get; set; }
    public string? PushToken { get; set; }

    public DeviceHealthSnapshot Health { get; set; } = new();
    public bool IsHealthy { get; set; }
    public List<string> Issues { get; set; } = [];

    /// <summary>Set once the rep finished the tracking setup wizard on this device.</summary>
    public DateTimeOffset? OnboardingCompletedAt { get; set; }

    public DateTimeOffset FirstSeenAt { get; set; }
    public DateTimeOffset LastReportedAt { get; set; }
}

/// <summary>History of health reports (one row per report).</summary>
public class DeviceHealthReport : Entity, IScopedEntity
{
    public Guid UserId { get; set; }
    public Guid? TerritoryId { get; set; }
    public Guid DeviceRecordId { get; set; }
    public string DeviceId { get; set; } = string.Empty;

    public HealthReportTrigger Trigger { get; set; }
    public DeviceHealthSnapshot Health { get; set; } = new();
    public bool IsHealthy { get; set; }
    public List<string> Issues { get; set; } = [];
    public DateTimeOffset ReportedAt { get; set; }
}
