using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Organization;
using OriginalPharma.Application.Tracking.Integrity;
using OriginalPharma.Domain.Common;
using OriginalPharma.Domain.Tracking;

namespace OriginalPharma.Application.Tracking;

/// <summary>"Start my day" / "End my day". Tracking only runs inside a shift.</summary>
public sealed class ShiftService(
    IAppDbContext db,
    ICurrentUser currentUser,
    TrackingConfigService configService,
    IPlayIntegrityVerifier integrityVerifier,
    IOrgHierarchy hierarchy,
    ITrackingNotifier notifier,
    LocationTrustSettingsService trustSettings,
    IOptions<TrackingOptions> options,
    TimeProvider time,
    ILogger<ShiftService> logger)
{
    public async Task<ShiftDto?> GetCurrentAsync(CancellationToken cancellationToken = default)
    {
        var userId = currentUser.RequireUserId();
        var shift = await db.Shifts.AsNoTracking()
            .Where(s => s.UserId == userId && s.Status == ShiftStatus.Active)
            .OrderByDescending(s => s.StartedAt)
            .FirstOrDefaultAsync(cancellationToken);
        return shift is null ? null : TrackingMapping.ToDto(shift);
    }

    public async Task<StartShiftResponse> StartAsync(StartShiftRequest request, CancellationToken cancellationToken = default)
    {
        var userId = currentUser.RequireUserId();
        var now = time.GetUtcNow();
        var settings = options.Value;

        var hasConsent = await db.TrackingConsents.AnyAsync(
            c => c.UserId == userId && c.ConsentVersion == settings.ConsentVersion, cancellationToken);
        if (!hasConsent)
        {
            throw new BusinessRuleException("consent-required", "Tracking consent must be accepted before starting the day.");
        }

        if (settings.RequireOnboardedDevice)
        {
            var ready = await db.Devices.AnyAsync(
                d => d.UserId == userId && d.DeviceId == request.DeviceId && d.OnboardingCompletedAt != null, cancellationToken);
            if (!ready)
            {
                throw new BusinessRuleException("device-not-ready", "Finish the tracking setup on this device before starting the day.");
            }
        }

        var active = await db.Shifts
            .Where(s => s.UserId == userId && s.Status == ShiftStatus.Active)
            .OrderByDescending(s => s.StartedAt)
            .FirstOrDefaultAsync(cancellationToken);

        // Visit-only visibility: where the day starts and ends is outside any visit, so it is not stored.
        var visitOnly = (await trustSettings.GetAsync(cancellationToken)).VisitOnly;
        if (active is null)
        {
            var territoryId = await db.Users.Where(u => u.Id == userId).Select(u => u.TerritoryId).SingleAsync(cancellationToken);
            active = new Shift
            {
                UserId = userId,
                TerritoryId = territoryId,
                DeviceId = request.DeviceId,
                Source = request.Source,
                StartedAt = now,
                StartLocation = !visitOnly && request is { Lat: { } lat, Lng: { } lng } ? GeoFactory.Point(lat, lng) : null,
            };

            if (!string.IsNullOrWhiteSpace(request.IntegrityToken))
            {
                var verdict = await integrityVerifier.VerifyAsync(request.IntegrityToken, request.IntegrityNonce, cancellationToken);
                active.IntegrityPassed = verdict.Passed;
                active.IntegrityVerdict = verdict.Summary;
                if (verdict.Passed == false)
                {
                    // Flag only. A failed or unavailable attestation never blocks the rep.
                    db.TrackingFlags.Add(new TrackingFlag
                    {
                        UserId = userId,
                        TerritoryId = territoryId,
                        ShiftId = active.Id,
                        Type = TrackingFlagType.IntegrityFailed,
                        Score = 0,
                        Signals = ["integrity"],
                        Details = verdict.Summary,
                        CreatedAt = now,
                    });
                }
            }

            db.Shifts.Add(active);
            await db.SaveChangesAsync(cancellationToken);
            logger.LogInformation("Shift {ShiftId} started for user {UserId} on device {DeviceId}", active.Id, userId, request.DeviceId);

            var audience = await hierarchy.GetAudienceAsync(userId, cancellationToken);
            await notifier.PresenceChangedAsync(
                audience, new PresenceChangeDto(userId, visitOnly ? PresenceStatus.NotOnVisit : PresenceStatus.Online, now), cancellationToken);
        }

        var config = await configService.GetConfigAsync(userId, cancellationToken);
        return new StartShiftResponse(TrackingMapping.ToDto(active), config);
    }

    public async Task<ShiftDto> EndAsync(EndShiftRequest request, CancellationToken cancellationToken = default)
    {
        var userId = currentUser.RequireUserId();
        var now = time.GetUtcNow();

        var active = await db.Shifts
                         .Where(s => s.UserId == userId && s.Status == ShiftStatus.Active)
                         .OrderByDescending(s => s.StartedAt)
                         .FirstOrDefaultAsync(cancellationToken)
                     ?? throw new BusinessRuleException("no-active-shift", "There is no active shift to end.");

        active.Status = ShiftStatus.Ended;
        active.EndedAt = now;
        var visitOnly = (await trustSettings.GetAsync(cancellationToken)).VisitOnly;
        active.EndLocation = !visitOnly && request is { Lat: { } lat, Lng: { } lng } ? GeoFactory.Point(lat, lng) : null;
        await db.SaveChangesAsync(cancellationToken);

        var audience = await hierarchy.GetAudienceAsync(userId, cancellationToken);
        await notifier.PresenceChangedAsync(audience, new PresenceChangeDto(userId, PresenceStatus.OffShift, now), cancellationToken);

        return TrackingMapping.ToDto(active);
    }
}
