using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Scoping;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Tracking.Integrity;

namespace OriginalPharma.Application.Tracking;

/// <summary>
/// Adaptive reporting: devices use the battery-friendly "normal" profile unless a
/// supervisor has live view open, in which case they switch to "live" until the
/// live view expires. The collection mode follows the location visibility setting: in visit-only mode
/// the app collects only while a visit is in progress.
/// </summary>
public sealed class TrackingConfigService(
    ILiveViewRegistry liveViews,
    LocationTrustSettingsService trustSettings,
    IOptions<TrackingOptions> options)
{
    public const string NormalMode = "normal";
    public const string LiveMode = "live";

    public async Task<TrackingConfigDto> GetConfigAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var settings = options.Value;
        var liveUntil = await liveViews.GetLiveUntilAsync(userId, cancellationToken);
        var profile = liveUntil is null ? settings.Normal : settings.Live;

        return new TrackingConfigDto(
            liveUntil is null ? NormalMode : LiveMode,
            profile.DistanceFilterMeters,
            profile.UploadBatchSize,
            profile.UploadIntervalSeconds,
            profile.HeartbeatIntervalSeconds,
            liveUntil,
            settings.ConsentVersion,
            (await trustSettings.GetAsync(cancellationToken)).VisitOnly ? TrackingCollectionModes.VisitOnly : TrackingCollectionModes.AllDay);
    }
}

/// <summary>Supervisor side of live view: registers viewers and wakes the rep's device over FCM.</summary>
public sealed class LiveViewService(
    IAppDbContext db,
    ICurrentUser currentUser,
    IDataScopeResolver scopeResolver,
    ILiveViewRegistry liveViews,
    IPushNotificationSender push,
    IOptions<TrackingOptions> options,
    ILogger<LiveViewService> logger)
{
    /// <summary>Start or renew (heartbeat) a live view. The dashboard calls this every ~60 s while open.</summary>
    public async Task<LiveViewResponse> StartAsync(Guid repId, CancellationToken cancellationToken = default)
    {
        var viewerId = currentUser.RequireUserId();
        await EnsureInScopeAsync(repId, cancellationToken);

        var ttl = TimeSpan.FromSeconds(options.Value.LiveViewTtlSeconds);
        var (started, liveUntil) = await liveViews.AddViewerAsync(repId, viewerId, ttl, cancellationToken);
        if (started)
        {
            logger.LogInformation("Live view started for rep {RepId} by {ViewerId}", repId, viewerId);
            await NotifyDevicesAsync(repId, cancellationToken);
        }

        return new LiveViewResponse(repId, liveUntil);
    }

    public async Task StopAsync(Guid repId, CancellationToken cancellationToken = default)
    {
        var viewerId = currentUser.RequireUserId();
        var noViewersLeft = await liveViews.RemoveViewerAsync(repId, viewerId, cancellationToken);
        if (noViewersLeft)
        {
            await NotifyDevicesAsync(repId, cancellationToken);
        }
    }

    private async Task EnsureInScopeAsync(Guid repId, CancellationToken cancellationToken)
    {
        var scope = await scopeResolver.ResolveAsync(Permissions.Tracking.ViewLive, cancellationToken);
        var rep = await db.Users.AsNoTracking()
                      .Where(u => u.Id == repId)
                      .Select(u => new { u.Id, u.TerritoryId })
                      .SingleOrDefaultAsync(cancellationToken)
                  ?? throw new NotFoundException("User", repId);

        if (!scope.Includes(rep.Id, rep.TerritoryId))
        {
            throw new ForbiddenException();
        }
    }

    private async Task NotifyDevicesAsync(Guid repId, CancellationToken cancellationToken)
    {
        var tokens = await db.Devices.AsNoTracking()
            .Where(d => d.UserId == repId && d.PushToken != null)
            .Select(d => d.PushToken!)
            .ToListAsync(cancellationToken);

        if (tokens.Count > 0)
        {
            await push.SendDataAsync(tokens, new Dictionary<string, string> { ["type"] = PushMessageTypes.TrackingConfigChanged }, cancellationToken);
        }
    }
}
