using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Organization;
using OriginalPharma.Domain.Tracking;

namespace OriginalPharma.Application.Tracking;

/// <summary>Devices report their tracking readiness on onboarding, app open and resume.</summary>
public sealed class DeviceHealthService(
    IAppDbContext db,
    ICurrentUser currentUser,
    IOrgHierarchy hierarchy,
    ITrackingNotifier notifier,
    TimeProvider time)
{
    public async Task<DeviceHealthResult> ReportAsync(DeviceHealthReportRequest request, CancellationToken cancellationToken = default)
    {
        var userId = currentUser.RequireUserId();
        var now = time.GetUtcNow();

        var snapshot = new DeviceHealthSnapshot
        {
            LocationPermission = request.LocationPermission,
            PreciseLocation = request.PreciseLocation,
            NotificationPermission = request.NotificationPermission,
            BatteryOptimizationIgnored = request.BatteryOptimizationIgnored,
            LocationServicesEnabled = request.LocationServicesEnabled,
            MockLocationDetected = request.MockLocationDetected,
            DeveloperOptionsEnabled = request.DeveloperOptionsEnabled,
            PowerSaveMode = request.PowerSaveMode,
            AppVersion = request.AppVersion,
            Manufacturer = request.Manufacturer,
            Model = request.Model,
            OsVersion = request.OsVersion,
        };

        var issues = DeviceHealthEvaluator.Evaluate(snapshot, request.Source);
        var isHealthy = issues.Count == 0;
        var territoryId = await db.Users.Where(u => u.Id == userId).Select(u => u.TerritoryId).SingleAsync(cancellationToken);

        var device = await db.Devices.SingleOrDefaultAsync(d => d.UserId == userId && d.DeviceId == request.DeviceId, cancellationToken);
        var wasHealthy = device?.IsHealthy;
        var previousIssues = device?.Issues ?? [];

        if (device is null)
        {
            device = new Device { UserId = userId, DeviceId = request.DeviceId, FirstSeenAt = now };
            db.Devices.Add(device);
        }

        device.TerritoryId = territoryId;
        device.Platform = request.Platform;
        device.Source = request.Source;
        device.Health = snapshot;
        device.IsHealthy = isHealthy;
        device.Issues = issues.ToList();
        device.LastReportedAt = now;
        if (!string.IsNullOrWhiteSpace(request.PushToken))
        {
            device.PushToken = request.PushToken;
        }

        if (request.OnboardingCompleted && isHealthy && device.OnboardingCompletedAt is null)
        {
            device.OnboardingCompletedAt = now;
        }

        db.DeviceHealthReports.Add(new DeviceHealthReport
        {
            UserId = userId,
            TerritoryId = territoryId,
            DeviceRecordId = device.Id,
            DeviceId = request.DeviceId,
            Trigger = request.Trigger,
            Health = new DeviceHealthSnapshot
            {
                LocationPermission = snapshot.LocationPermission,
                PreciseLocation = snapshot.PreciseLocation,
                NotificationPermission = snapshot.NotificationPermission,
                BatteryOptimizationIgnored = snapshot.BatteryOptimizationIgnored,
                LocationServicesEnabled = snapshot.LocationServicesEnabled,
                MockLocationDetected = snapshot.MockLocationDetected,
                DeveloperOptionsEnabled = snapshot.DeveloperOptionsEnabled,
                PowerSaveMode = snapshot.PowerSaveMode,
                AppVersion = snapshot.AppVersion,
                Manufacturer = snapshot.Manufacturer,
                Model = snapshot.Model,
                OsVersion = snapshot.OsVersion,
            },
            IsHealthy = isHealthy,
            Issues = issues.ToList(),
            ReportedAt = now,
        });

        if (snapshot.MockLocationDetected)
        {
            db.TrackingFlags.Add(new TrackingFlag
            {
                UserId = userId,
                TerritoryId = territoryId,
                Type = TrackingFlagType.MockLocation,
                Score = 60,
                Signals = [DeviceHealthIssues.MockLocation],
                Details = "Device health check found a mock location provider.",
                CreatedAt = now,
            });
        }

        await db.SaveChangesAsync(cancellationToken);

        var changed = wasHealthy != isHealthy || !previousIssues.SequenceEqual(issues);
        if (changed)
        {
            var audience = await hierarchy.GetAudienceAsync(userId, cancellationToken);
            await notifier.DeviceHealthChangedAsync(
                audience,
                new DeviceHealthChangeDto(userId, request.DeviceId, isHealthy, issues, now),
                cancellationToken);
        }

        return new DeviceHealthResult(isHealthy, issues, device.OnboardingCompletedAt is not null);
    }
}

/// <summary>Tracking consent log.</summary>
public sealed class ConsentService(
    IAppDbContext db,
    ICurrentUser currentUser,
    IOptions<TrackingOptions> options,
    TimeProvider time)
{
    public async Task<ConsentStatusDto> GetStatusAsync(CancellationToken cancellationToken = default)
    {
        var userId = currentUser.RequireUserId();
        var version = options.Value.ConsentVersion;
        var latest = await db.TrackingConsents.AsNoTracking()
            .Where(c => c.UserId == userId && c.ConsentVersion == version)
            .OrderByDescending(c => c.AcceptedAt)
            .Select(c => (DateTimeOffset?)c.AcceptedAt)
            .FirstOrDefaultAsync(cancellationToken);

        return new ConsentStatusDto(version, latest is not null, latest);
    }

    public async Task<ConsentStatusDto> RecordAsync(RecordConsentRequest request, CancellationToken cancellationToken = default)
    {
        var userId = currentUser.RequireUserId();
        var version = options.Value.ConsentVersion;
        if (request.ConsentVersion != version)
        {
            throw new BusinessRuleException("consent-version-mismatch", $"Current consent version is '{version}'. Reload the app and try again.");
        }

        var territoryId = await db.Users.Where(u => u.Id == userId).Select(u => u.TerritoryId).SingleAsync(cancellationToken);
        var now = time.GetUtcNow();

        db.TrackingConsents.Add(new TrackingConsent
        {
            UserId = userId,
            TerritoryId = territoryId,
            ConsentVersion = version,
            DeviceId = request.DeviceId,
            Platform = request.Platform,
            Locale = request.Locale,
            AcceptedAt = now,
            ClientAcceptedAt = request.ClientAcceptedAt?.ToUniversalTime(),
            IpAddress = currentUser.IpAddress,
            UserAgent = currentUser.UserAgent,
        });
        await db.SaveChangesAsync(cancellationToken);

        return new ConsentStatusDto(version, true, now);
    }
}
