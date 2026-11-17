using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Scoping;
using OriginalPharma.Application.Identity;
using OriginalPharma.Domain.Tracking;

namespace OriginalPharma.Application.Tracking;

/// <summary>Dashboard reads: presence, flags and history. Every query is scope filtered.</summary>
public sealed class TrackingQueryService(
    IAppDbContext db,
    ICurrentUser currentUser,
    IDataScopeResolver scopeResolver,
    ILatestPositionStore latestPositions,
    IOptions<TrackingOptions> options,
    TimeProvider time)
{
    private const int MaxHistoryPoints = 5000;

    public async Task<IReadOnlyList<RepPresenceDto>> GetPresenceAsync(CancellationToken cancellationToken = default)
    {
        var scope = await scopeResolver.ResolveAsync(Permissions.Tracking.ViewLive, cancellationToken);
        var now = time.GetUtcNow();
        var settings = options.Value;

        // Tracked users = users in scope that have at least one registered device.
        var devices = await db.Devices.AsNoTracking()
            .WhereInScope(scope)
            .Select(d => new { d.UserId, d.IsHealthy, d.Issues, d.LastReportedAt })
            .ToListAsync(cancellationToken);

        var userIds = devices.Select(d => d.UserId).Distinct().ToList();
        if (userIds.Count == 0)
        {
            return [];
        }

        var users = await db.Users.AsNoTracking()
            .Where(u => userIds.Contains(u.Id))
            .Select(u => new { u.Id, u.FullName, u.TerritoryId })
            .ToListAsync(cancellationToken);

        var shifts = await db.Shifts.AsNoTracking()
            .Where(s => userIds.Contains(s.UserId) && s.Status == ShiftStatus.Active)
            .ToListAsync(cancellationToken);

        var openFlags = await db.TrackingFlags.AsNoTracking()
            .Where(f => userIds.Contains(f.UserId) && f.Status == TrackingFlagStatus.Open)
            .GroupBy(f => f.UserId)
            .Select(g => new { UserId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.UserId, x => x.Count, cancellationToken);

        var positions = await latestPositions.GetManyAsync(userIds, cancellationToken);

        return users.Select(u =>
            {
                var shift = shifts.Where(s => s.UserId == u.Id).MaxBy(s => s.StartedAt);
                positions.TryGetValue(u.Id, out var position);
                var latestDevice = devices.Where(d => d.UserId == u.Id).MaxBy(d => d.LastReportedAt)!;
                var lastSeen = position?.ReceivedAt ?? shift?.LastPointAt;

                var status = shift switch
                {
                    null => PresenceStatus.OffShift,
                    { TrackingLostAt: not null } => PresenceStatus.TrackingLost,
                    _ when lastSeen is { } seen && now - seen <= TimeSpan.FromMinutes(settings.OnlineWindowMinutes) => PresenceStatus.Online,
                    _ => PresenceStatus.Idle,
                };

                return new RepPresenceDto(
                    u.Id, u.FullName, u.TerritoryId, status, shift?.Id, lastSeen, position,
                    latestDevice.IsHealthy, latestDevice.Issues, openFlags.GetValueOrDefault(u.Id));
            })
            .OrderBy(p => p.FullName)
            .ToList();
    }

    public async Task<IReadOnlyList<TrackingFlagDto>> GetFlagsAsync(TrackingFlagStatus? status, CancellationToken cancellationToken = default)
    {
        var scope = await scopeResolver.ResolveAsync(Permissions.Tracking.ReviewFlags, cancellationToken);
        var query = db.TrackingFlags.AsNoTracking().WhereInScope(scope);
        if (status is not null)
        {
            query = query.Where(f => f.Status == status);
        }

        return await query
            .OrderByDescending(f => f.CreatedAt)
            .Take(200)
            .Join(db.Users, f => f.UserId, u => u.Id, (f, u) => new TrackingFlagDto(
                f.Id, f.UserId, u.FullName, f.Type, f.Status, f.Score, f.Signals, f.Details, f.CreatedAt))
            .ToListAsync(cancellationToken);
    }

    /// <summary>Devices in the caller's devices:read scope, unhealthy first.</summary>
    public async Task<IReadOnlyList<DeviceDto>> GetDevicesAsync(bool? healthy, CancellationToken cancellationToken = default)
    {
        var scope = await scopeResolver.ResolveAsync(Permissions.Devices.Read, cancellationToken);
        var query = db.Devices.AsNoTracking().WhereInScope(scope);
        if (healthy is not null)
        {
            query = query.Where(d => d.IsHealthy == healthy);
        }

        return await query
            .OrderBy(d => d.IsHealthy).ThenByDescending(d => d.LastReportedAt)
            .Select(d => new DeviceDto(
                d.Id,
                d.UserId,
                db.Users.Where(u => u.Id == d.UserId).Select(u => u.FullName).FirstOrDefault() ?? string.Empty,
                d.DeviceId,
                d.Platform,
                d.Source,
                d.IsHealthy,
                d.Issues,
                d.Health.LocationPermission,
                d.Health.PreciseLocation,
                d.Health.NotificationPermission,
                d.Health.BatteryOptimizationIgnored,
                d.Health.LocationServicesEnabled,
                d.Health.MockLocationDetected,
                d.Health.DeveloperOptionsEnabled,
                d.Health.PowerSaveMode,
                d.Health.AppVersion,
                d.Health.Manufacturer,
                d.Health.Model,
                d.Health.OsVersion,
                d.OnboardingCompletedAt,
                d.FirstSeenAt,
                d.LastReportedAt,
                db.TrackingFlags.Count(f => f.UserId == d.UserId && f.Status == TrackingFlagStatus.Open)))
            .ToListAsync(cancellationToken);
    }

    public async Task<TrackingFlagDto> ReviewFlagAsync(Guid flagId, ReviewFlagRequest request, CancellationToken cancellationToken = default)
    {
        var scope = await scopeResolver.ResolveAsync(Permissions.Tracking.ReviewFlags, cancellationToken);
        var flag = await db.TrackingFlags.WhereInScope(scope).SingleOrDefaultAsync(f => f.Id == flagId, cancellationToken)
                   ?? throw new NotFoundException("Flag", flagId);

        flag.Status = request.Status;
        flag.ReviewNote = request.Note;
        flag.ReviewedAt = time.GetUtcNow();
        flag.ReviewedById = currentUser.RequireUserId();
        await db.SaveChangesAsync(cancellationToken);

        return TrackingMapping.ToDto(flag, null);
    }

    public async Task<IReadOnlyList<HistoryPointDto>> GetHistoryAsync(Guid userId, DateTimeOffset from, DateTimeOffset to, CancellationToken cancellationToken = default)
    {
        if (to <= from || to - from > TimeSpan.FromDays(2))
        {
            throw new BusinessRuleException("invalid-range", "Range must be positive and at most 2 days.");
        }

        var scope = await scopeResolver.ResolveAsync(Permissions.Tracking.History, cancellationToken);
        var fromUtc = from.ToUniversalTime();
        var toUtc = to.ToUniversalTime();

        var rows = await db.LocationPoints.AsNoTracking()
            .WhereInScope(scope)
            .Where(p => p.UserId == userId && p.RecordedAt >= fromUtc && p.RecordedAt <= toUtc)
            .OrderBy(p => p.RecordedAt)
            .Take(MaxHistoryPoints)
            .Select(p => new { p.Location, p.Accuracy, p.RecordedAt, p.Speed, p.IsMock, p.AnomalyScore })
            .ToListAsync(cancellationToken);

        // Coordinates are read after loading: PostGIS has no ST_X/ST_Y for geography columns.
        return rows
            .Select(p => new HistoryPointDto(p.Location.Y, p.Location.X, p.Accuracy, p.RecordedAt, p.Speed, p.IsMock, p.AnomalyScore))
            .ToList();
    }
}
