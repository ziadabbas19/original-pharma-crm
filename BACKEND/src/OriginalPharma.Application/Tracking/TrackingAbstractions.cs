using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Organization;

namespace OriginalPharma.Application.Tracking;

/// <summary>Latest position per rep (Redis). History lives in PostgreSQL.</summary>
public interface ILatestPositionStore
{
    Task<LivePositionDto?> GetAsync(Guid userId, CancellationToken cancellationToken = default);

    Task<IReadOnlyDictionary<Guid, LivePositionDto>> GetManyAsync(IReadOnlyCollection<Guid> userIds, CancellationToken cancellationToken = default);

    Task SetAsync(LivePositionDto position, CancellationToken cancellationToken = default);
}

/// <summary>Tracks which supervisors are watching a rep live.</summary>
public interface ILiveViewRegistry
{
    /// <returns>Whether the rep was not in live mode before, and when live mode ends if not renewed.</returns>
    Task<(bool Started, DateTimeOffset LiveUntil)> AddViewerAsync(Guid repId, Guid viewerId, TimeSpan ttl, CancellationToken cancellationToken = default);

    /// <returns>True when no viewers remain.</returns>
    Task<bool> RemoveViewerAsync(Guid repId, Guid viewerId, CancellationToken cancellationToken = default);

    Task<DateTimeOffset?> GetLiveUntilAsync(Guid repId, CancellationToken cancellationToken = default);
}

/// <summary>Coarse location of an IP address, used as a weak anti-spoofing signal.</summary>
public interface IIpGeolocationService
{
    Task<GeoCoordinate?> LocateAsync(string? ipAddress, CancellationToken cancellationToken = default);
}

/// <param name="Passed">True/false when verified; null when the token could not be checked.</param>
public sealed record IntegrityVerdict(bool? Passed, string Summary);

/// <summary>Verifies Google Play Integrity tokens sent by the Android app.</summary>
public interface IPlayIntegrityVerifier
{
    Task<IntegrityVerdict> VerifyAsync(string token, string? nonce, CancellationToken cancellationToken = default);
}

/// <summary>Sends silent data messages to devices (FCM).</summary>
public interface IPushNotificationSender
{
    Task SendDataAsync(IReadOnlyCollection<string> deviceTokens, IReadOnlyDictionary<string, string> data, CancellationToken cancellationToken = default);
}

/// <summary>Pushes tracking events to dashboards (SignalR).</summary>
public interface ITrackingNotifier
{
    Task PositionUpdatedAsync(RepAudience audience, LivePositionDto position, CancellationToken cancellationToken = default);

    Task PresenceChangedAsync(RepAudience audience, PresenceChangeDto change, CancellationToken cancellationToken = default);

    Task FlagRaisedAsync(RepAudience audience, TrackingFlagDto flag, CancellationToken cancellationToken = default);

    Task DeviceHealthChangedAsync(RepAudience audience, DeviceHealthChangeDto change, CancellationToken cancellationToken = default);
}

/// <summary>Data message types the app understands.</summary>
public static class PushMessageTypes
{
    /// <summary>Tells the device to fetch /api/tracking/config and apply it.</summary>
    public const string TrackingConfigChanged = "tracking-config-changed";

    /// <summary>A note reminder is due (<c>noteId</c>): the app shows it and opens the note when tapped.</summary>
    public const string NoteReminder = "note-reminder";
}

/// <summary>Distance travelled per rep, computed in the database (PostGIS).</summary>
public interface ILocationDistanceQuery
{
    /// <summary>
    /// Metres between consecutive points of each working day (shift) recorded in [from, to).
    /// Rejected points are skipped, so the line goes from the point before to the point after;
    /// mock points too when <paramref name="excludeMock"/> is set.
    /// </summary>
    Task<IReadOnlyDictionary<Guid, double>> MetersByUserAsync(
        IReadOnlyCollection<Guid> userIds,
        DateTimeOffset from,
        DateTimeOffset to,
        bool excludeMock,
        CancellationToken cancellationToken = default);
}
