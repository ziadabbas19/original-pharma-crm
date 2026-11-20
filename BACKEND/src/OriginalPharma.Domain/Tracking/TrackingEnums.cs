namespace OriginalPharma.Domain.Tracking;

public enum LocationSource
{
    /// <summary>Capacitor Android app (background plugin, native uploads).</summary>
    Native = 1,

    /// <summary>Installable web app (foreground only).</summary>
    Pwa = 2,
}

public enum DevicePlatform
{
    Android = 1,
    Ios = 2,
    Web = 3,
}

public enum ShiftStatus
{
    Active = 1,
    Ended = 2,
}

public enum LocationPermissionState
{
    None = 0,
    WhileInUse = 1,
    Always = 2,
}

public enum NotificationPermissionState
{
    Unknown = 0,
    Granted = 1,
    Denied = 2,
    Prompt = 3,

    /// <summary>Platform does not need a runtime notification permission (Android 12 and below).</summary>
    NotRequired = 4,
}

public enum TrackingFlagType
{
    Anomaly = 1,
    MockLocation = 2,
    TrackingLost = 3,
    UnhealthyDevice = 4,
    IntegrityFailed = 5,
    VisitOutsideGeofence = 6,

    /// <summary>A visit whose location evidence is weak (poor fix, suspicious points around it, spoofing settings).</summary>
    VisitLowTrust = 7,

    /// <summary>Device settings that make every location doubtful (mock location app selected, emulator, root).</summary>
    SuspiciousDevice = 8,
}

public enum TrackingFlagStatus
{
    Open = 1,
    Confirmed = 2,
    Dismissed = 3,

    /// <summary>A reviewer has seen it and left a comment, without a verdict.</summary>
    Acknowledged = 4,
}

/// <summary>What made the device send a health report.</summary>
public enum HealthReportTrigger
{
    Onboarding = 1,
    AppOpen = 2,
    Resume = 3,
    Manual = 4,
    Periodic = 5,
}
