using OriginalPharma.Application.Tracking.Integrity;
using OriginalPharma.Domain.Tracking;

namespace OriginalPharma.Application.Tracking;

/// <summary>
/// One fix. The native plugin builds this shape through its locationTemplate,
/// the PWA builds it in JS. Everything after <see cref="Uuid"/> was added later and is optional, so
/// apps that do not send it keep working.
/// </summary>
/// <param name="IsMock">The device says the fix came from a mock location provider.</param>
/// <param name="Altitude">Metres; feeds the "altitude always zero" check.</param>
/// <param name="ActivityType">Motion activity the phone detected (still, on_foot, in_vehicle, ...).</param>
/// <param name="ActivityConfidence">0-100 confidence of <paramref name="ActivityType"/>.</param>
/// <param name="DeviceTime">
/// Device wall clock when the app recorded the fix (ISO 8601 or epoch milliseconds). Text on purpose:
/// a value the server cannot read is ignored instead of refusing the batch.
/// </param>
public sealed record LocationPointDto(
    double Lat,
    double Lng,
    double Accuracy,
    DateTimeOffset Timestamp,
    double? Speed = null,
    double? Heading = null,
    double? BatteryLevel = null,
    bool IsMock = false,
    bool? IsMoving = null,
    string? Uuid = null,
    double? Altitude = null,
    string? ActivityType = null,
    int? ActivityConfidence = null,
    string? DeviceTime = null);

/// <param name="DeviceSignals">Device settings that make locations less trustworthy (optional).</param>
public sealed record LocationBatchRequest(
    string DeviceId,
    LocationSource Source,
    IReadOnlyList<LocationPointDto> Points,
    DateTimeOffset? SentAt = null,
    DeviceSignalsDto? DeviceSignals = null);

/// <param name="Suspicious">Accepted points stored as suspicious.</param>
/// <param name="Rejected">Accepted points stored as rejected (physically impossible; kept, never counted).</param>
public sealed record LocationBatchResult(
    int Received,
    int Accepted,
    int Duplicates,
    int OutsideShift,
    int AnomalyScore,
    bool Flagged,
    int Suspicious = 0,
    int Rejected = 0);

/// <summary>Single fix sent by the setup wizard to prove the device can reach the server.</summary>
public sealed record TestPointRequest(string DeviceId, LocationSource Source, LocationPointDto Point, DateTimeOffset? SentAt = null);

/// <param name="ClockOffsetSeconds">Device clock minus server clock (positive = device ahead).</param>
public sealed record TestPointResult(bool Received, DateTimeOffset ServerTime, double ClockOffsetSeconds, int AnomalyScore, IReadOnlyList<string> Signals);

/// <summary>Reporting settings the device should apply right now.</summary>
public sealed record TrackingConfigDto(
    string Mode,
    int DistanceFilterMeters,
    int UploadBatchSize,
    int UploadIntervalSeconds,
    int HeartbeatIntervalSeconds,
    DateTimeOffset? LiveUntil,
    string ConsentVersion);

public sealed record StartShiftRequest(
    string DeviceId,
    LocationSource Source,
    double? Lat = null,
    double? Lng = null,
    double? Accuracy = null,
    string? IntegrityToken = null,
    string? IntegrityNonce = null);

public sealed record EndShiftRequest(string DeviceId, double? Lat = null, double? Lng = null);

public sealed record ShiftDto(
    Guid Id,
    ShiftStatus Status,
    string DeviceId,
    DateTimeOffset StartedAt,
    DateTimeOffset? EndedAt,
    DateTimeOffset? LastPointAt,
    DateTimeOffset? TrackingLostAt);

public sealed record StartShiftResponse(ShiftDto Shift, TrackingConfigDto Config);

public sealed record DeviceHealthReportRequest(
    string DeviceId,
    LocationSource Source,
    DevicePlatform Platform,
    HealthReportTrigger Trigger,
    LocationPermissionState LocationPermission,
    bool PreciseLocation,
    NotificationPermissionState NotificationPermission,
    bool LocationServicesEnabled,
    bool MockLocationDetected,
    bool? BatteryOptimizationIgnored = null,
    bool? DeveloperOptionsEnabled = null,
    bool? PowerSaveMode = null,
    string? AppVersion = null,
    string? Manufacturer = null,
    string? Model = null,
    string? OsVersion = null,
    string? PushToken = null,
    bool OnboardingCompleted = false);

public sealed record DeviceHealthResult(bool IsHealthy, IReadOnlyList<string> Issues, bool OnboardingCompleted);

public sealed record ConsentStatusDto(string CurrentVersion, bool Accepted, DateTimeOffset? AcceptedAt);

public sealed record RecordConsentRequest(
    string ConsentVersion,
    string DeviceId,
    DevicePlatform Platform,
    string Locale,
    DateTimeOffset? ClientAcceptedAt = null);

/// <summary>Latest known position of a rep (kept in Redis, pushed over SignalR).</summary>
public sealed record LivePositionDto(
    Guid UserId,
    double Lat,
    double Lng,
    double Accuracy,
    DateTimeOffset RecordedAt,
    DateTimeOffset ReceivedAt,
    double? Speed,
    double? BatteryLevel,
    bool IsMock,
    int AnomalyScore,
    LocationSource Source,
    Guid? ShiftId,
    LocationTrustStatus TrustStatus = LocationTrustStatus.Trusted,
    string? TrustReason = null);

public enum PresenceStatus
{
    OffShift = 0,
    Online = 1,
    Idle = 2,
    TrackingLost = 3,
}

public sealed record RepPresenceDto(
    Guid UserId,
    string FullName,
    Guid? TerritoryId,
    PresenceStatus Status,
    Guid? ShiftId,
    DateTimeOffset? LastSeenAt,
    LivePositionDto? Position,
    bool DeviceHealthy,
    IReadOnlyList<string> HealthIssues,
    int OpenFlags,
    string? AvatarUrl = null);

public sealed record PresenceChangeDto(Guid UserId, PresenceStatus Status, DateTimeOffset At);

public sealed record DeviceHealthChangeDto(Guid UserId, string DeviceId, bool IsHealthy, IReadOnlyList<string> Issues, DateTimeOffset At);

/// <param name="Occurrences">How often the problem was seen while the flag stayed open.</param>
public sealed record TrackingFlagDto(
    Guid Id,
    Guid UserId,
    string? UserName,
    TrackingFlagType Type,
    TrackingFlagStatus Status,
    int Score,
    IReadOnlyList<string> Signals,
    string? Details,
    DateTimeOffset CreatedAt,
    long? LocationPointId = null,
    Guid? VisitId = null,
    int Occurrences = 1,
    DateTimeOffset? LastSeenAt = null);

/// <summary>A rep's device with its latest health report (dashboard device list).</summary>
public sealed record DeviceDto(
    Guid Id,
    Guid UserId,
    string UserName,
    string DeviceId,
    DevicePlatform Platform,
    LocationSource Source,
    bool IsHealthy,
    IReadOnlyList<string> Issues,
    LocationPermissionState LocationPermission,
    bool PreciseLocation,
    NotificationPermissionState NotificationPermission,
    bool? BatteryOptimizationIgnored,
    bool LocationServicesEnabled,
    bool MockLocationDetected,
    bool? DeveloperOptionsEnabled,
    bool? PowerSaveMode,
    string? AppVersion,
    string? Manufacturer,
    string? Model,
    string? OsVersion,
    DateTimeOffset? OnboardingCompletedAt,
    DateTimeOffset FirstSeenAt,
    DateTimeOffset LastReportedAt,
    int OpenFlags);

public sealed record ReviewFlagRequest(TrackingFlagStatus Status, string? Note = null);

/// <param name="Excluded">Left out of the distance travelled: rejected, or mock under the "flag and exclude" policy.</param>
public sealed record HistoryPointDto(
    double Lat,
    double Lng,
    double Accuracy,
    DateTimeOffset RecordedAt,
    double? Speed,
    bool IsMock,
    int AnomalyScore,
    long Id = 0,
    LocationTrustStatus TrustStatus = LocationTrustStatus.Trusted,
    string? TrustReason = null,
    bool Excluded = false);

public sealed record LiveViewResponse(Guid RepId, DateTimeOffset LiveUntil);
