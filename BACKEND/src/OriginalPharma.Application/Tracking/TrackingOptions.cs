namespace OriginalPharma.Application.Tracking;

/// <summary>How often a device records and uploads points.</summary>
public sealed class TrackingProfile
{
    /// <summary>Minimum movement before a new point is recorded (native plugin distanceFilter).</summary>
    public int DistanceFilterMeters { get; set; }

    /// <summary>Native: number of queued points that triggers an upload (autoSyncThreshold).</summary>
    public int UploadBatchSize { get; set; }

    /// <summary>PWA: minimum seconds between uploads.</summary>
    public int UploadIntervalSeconds { get; set; }

    /// <summary>While stationary the device sends one point per heartbeat so presence stays fresh.</summary>
    public int HeartbeatIntervalSeconds { get; set; }
}

public sealed class TrackingOptions
{
    public const string SectionName = "Tracking";

    /// <summary>Bump when the consent text changes; reps must accept again.</summary>
    public string ConsentVersion { get; set; } = "2026-11-v1";

    public int MaxPointsPerBatch { get; set; } = 500;

    /// <summary>Points slightly before shift start are still accepted (device clock skew).</summary>
    public int ShiftGraceSeconds { get; set; } = 120;

    /// <summary>Last point newer than this = online. Between this and the lost window = idle.</summary>
    public int OnlineWindowMinutes { get; set; } = 12;

    /// <summary>No points for this long during an active shift = "tracking lost".</summary>
    public int TrackingLostAfterMinutes { get; set; } = 30;

    /// <summary>A live view stays active this long after the dashboard's last heartbeat.</summary>
    public int LiveViewTtlSeconds { get; set; } = 120;

    /// <summary>Require the setup wizard to be completed on the device before a shift can start.</summary>
    public bool RequireOnboardedDevice { get; set; } = true;

    public TrackingProfile Normal { get; set; } = new()
    {
        DistanceFilterMeters = 75,
        UploadBatchSize = 10,
        UploadIntervalSeconds = 300,
        HeartbeatIntervalSeconds = 600,
    };

    public TrackingProfile Live { get; set; } = new()
    {
        DistanceFilterMeters = 20,
        UploadBatchSize = 1,
        UploadIntervalSeconds = 15,
        HeartbeatIntervalSeconds = 60,
    };
}
