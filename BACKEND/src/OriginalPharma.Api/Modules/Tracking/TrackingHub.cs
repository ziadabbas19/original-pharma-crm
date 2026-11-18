using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using OriginalPharma.Application.Common.Organization;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Notifications;
using OriginalPharma.Application.Tracking;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Infrastructure.Identity;

namespace OriginalPharma.Api.Modules.Tracking;

/// <summary>Events pushed to dashboards. Method names are the client-side event names.</summary>
public interface ITrackingClient
{
    Task PositionUpdated(LivePositionDto position);
    Task PresenceChanged(PresenceChangeDto change);
    Task FlagRaised(TrackingFlagDto flag);
    Task DeviceHealthChanged(DeviceHealthChangeDto change);

    /// <summary>A new in-app notification for the connected user.</summary>
    Task NotificationReceived(NotificationDto notification);
}

internal static class TrackingGroups
{
    public const string All = "tracking:all";
    public static string Territory(Guid id) => $"tracking:territory:{id:N}";
    public static string Manager(Guid id) => $"tracking:manager:{id:N}";
    public static string User(Guid id) => $"tracking:user:{id:N}";

    /// <summary>Every connection of one user, whatever their permissions (their own notifications).</summary>
    public static string Inbox(Guid id) => $"inbox:{id:N}";
}

/// <summary>
/// Realtime connection. Dashboards keep it open; the rep app opens it only while it is in the
/// foreground, to receive its notifications. On connect every user joins their own inbox group, and
/// the groups matching their tracking:view-live scope. Permission changes take effect on the next reconnect.
/// </summary>
[Authorize]
public sealed class TrackingHub(IPermissionService permissions, IOrgHierarchy hierarchy) : Hub<ITrackingClient>
{
    public override async Task OnConnectedAsync()
    {
        if (Guid.TryParse(Context.User?.FindFirstValue(AppClaims.Subject), out var userId))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, TrackingGroups.Inbox(userId));
            var effective = await permissions.GetEffectivePermissionsAsync(userId);
            foreach (var group in await GroupsForAsync(userId, effective.ScopeOf(Permissions.Tracking.ViewLive)))
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, group);
            }
        }

        await base.OnConnectedAsync();
    }

    private async Task<IReadOnlyList<string>> GroupsForAsync(Guid userId, PermissionScope? scope) => scope switch
    {
        PermissionScope.All => [TrackingGroups.All],
        PermissionScope.Territory => (await hierarchy.GetTerritoryScopeAsync(userId)).Select(TrackingGroups.Territory).Append(TrackingGroups.User(userId)).ToList(),
        PermissionScope.Team => [TrackingGroups.Manager(userId), TrackingGroups.User(userId)],
        PermissionScope.Own => [TrackingGroups.User(userId)],
        _ => [],
    };
}

/// <summary>Sends tracking events to every group that may see the rep.</summary>
internal sealed class SignalRTrackingNotifier(IHubContext<TrackingHub, ITrackingClient> hub) : ITrackingNotifier
{
    public Task PositionUpdatedAsync(RepAudience audience, LivePositionDto position, CancellationToken cancellationToken = default) =>
        Clients(audience).PositionUpdated(position);

    public Task PresenceChangedAsync(RepAudience audience, PresenceChangeDto change, CancellationToken cancellationToken = default) =>
        Clients(audience).PresenceChanged(change);

    public Task FlagRaisedAsync(RepAudience audience, TrackingFlagDto flag, CancellationToken cancellationToken = default) =>
        Clients(audience).FlagRaised(flag);

    public Task DeviceHealthChangedAsync(RepAudience audience, DeviceHealthChangeDto change, CancellationToken cancellationToken = default) =>
        Clients(audience).DeviceHealthChanged(change);

    private ITrackingClient Clients(RepAudience audience)
    {
        var groups = new List<string> { TrackingGroups.All, TrackingGroups.User(audience.UserId) };
        if (audience.TerritoryId is { } territoryId)
        {
            groups.Add(TrackingGroups.Territory(territoryId));
        }

        groups.AddRange(audience.ManagerChain.Select(TrackingGroups.Manager));
        return hub.Clients.Groups(groups);
    }
}

/// <summary>Delivers a new notification to every open connection of the recipient (dashboard or rep app).</summary>
internal sealed class SignalRNotificationPublisher(IHubContext<TrackingHub, ITrackingClient> hub) : INotificationPublisher
{
    public Task PublishAsync(Guid userId, NotificationDto notification, CancellationToken cancellationToken = default) =>
        hub.Clients.Group(TrackingGroups.Inbox(userId)).NotificationReceived(notification);
}
