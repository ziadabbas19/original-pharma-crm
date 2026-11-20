using System.Text.Json;
using System.Text.Json.Serialization;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Auditing;
using OriginalPharma.Application.Tracking.Anomalies;
using OriginalPharma.Application.Visits;
using OriginalPharma.Domain.Audit;
using OriginalPharma.Domain.Common;
using OriginalPharma.Domain.Tracking;

namespace OriginalPharma.Application.Tracking.Integrity;

/// <summary>When managers may see where a rep is.</summary>
public enum LocationVisibility
{
    /// <summary>Only from the start to the end of each visit (plus the buffer); no position outside visits.</summary>
    VisitOnly = 1,

    /// <summary>Whenever the rep's day is running, as before.</summary>
    AllDay = 2,
}

/// <summary>Configuration defaults for location trust (appsettings "Tracking:Trust").</summary>
public sealed class LocationTrustOptions
{
    public const string SectionName = "Tracking:Trust";

    /// <summary>Default for <see cref="LocationTrustSettings.MaxDistanceFromDoctorMeters"/>.</summary>
    public double MaxDistanceFromDoctorMeters { get; set; } = 500;

    /// <summary>Default for <see cref="LocationTrustSettings.MockPolicy"/>.</summary>
    public MockLocationPolicy MockPolicy { get; set; } = MockLocationPolicy.FlagOnly;

    /// <summary>Default for <see cref="LocationTrustSettings.DeviceSignalsRetentionDays"/>.</summary>
    public int DeviceSignalsRetentionDays { get; set; } = 30;

    /// <summary>A rep's supervisor gets at most one "suspicious location" notification per rep in this window.</summary>
    public int NotificationThrottleMinutes { get; set; } = 60;

    /// <summary>Suspicious points this long before a check-in (or during the visit) make the visit low trust.</summary>
    public int VisitPointWindowMinutes { get; set; } = 15;

    /// <summary>How long one API instance keeps the settings in memory before reading them again.</summary>
    public int SettingsCacheSeconds { get; set; } = 30;

    /// <summary>Default for <see cref="LocationTrustSettings.DriftFromClinicMeters"/>.</summary>
    public double DriftFromClinicMeters { get; set; } = 150;

    /// <summary>Default for <see cref="LocationTrustSettings.DriftFromVisitsMeters"/>.</summary>
    public double DriftFromVisitsMeters { get; set; } = 150;

    /// <summary>The location history of a doctor compares a new visit with at most this many earlier ones.</summary>
    public int MaxReferenceVisits { get; set; } = 50;

    /// <summary>Default for <see cref="LocationTrustSettings.Visibility"/>.</summary>
    public LocationVisibility LocationVisibility { get; set; } = LocationVisibility.VisitOnly;

    /// <summary>Default for <see cref="LocationTrustSettings.VisitWindowBufferMinutes"/>.</summary>
    public int VisitWindowBufferMinutes { get; set; } = 5;

    /// <summary>
    /// Visit-only mode: a point recorded outside every visit window is kept this long (a check-in queued offline
    /// may still arrive and cover it), never shown, then deleted.
    /// </summary>
    public int OutsideVisitGraceHours { get; set; } = 12;
}

/// <summary>
/// Location trust rules edited from the dashboard (Settings, Location trust). Stored in
/// app_settings under <see cref="Key"/>; until an admin saves them they come from configuration.
/// </summary>
/// <param name="MaxSpeedKmh">Faster movement between two fixes is impossible (the point is rejected).</param>
/// <param name="MaxDistanceFromDoctorMeters">A visit check-in or check-out further than this from the doctor (after the accuracy allowance) is flagged "far from doctor".</param>
/// <param name="AccuracyAllowanceMeters">Up to this much of a fix's reported accuracy is added to the allowed distance.</param>
/// <param name="LowTrustAccuracyMeters">Visit fixes less accurate than this are "low trust".</param>
/// <param name="PerfectAccuracyMeters">Fixes claiming this accuracy or better look synthetic.</param>
/// <param name="RepeatedAccuracyRun">This many fixes in a row with exactly the same accuracy look synthetic.</param>
/// <param name="MockPolicy">Whether mock locations are only flagged or also left out of distance and attendance.</param>
/// <param name="DeviceSignalsRetentionDays">Device signals stored with location points are cleared after this many days.</param>
/// <param name="DriftFromClinicMeters">A check-in further than this from the saved clinic location (after the accuracy allowance) is "location drift".</param>
/// <param name="DriftFromVisitsMeters">
/// A check-in further than this from the median of the earlier good visits (with at least two of them), or
/// from the previous good visit, is "location drift".
/// </param>
public sealed record LocationTrustSettings(
    double MaxSpeedKmh,
    double MaxDistanceFromDoctorMeters,
    double AccuracyAllowanceMeters,
    double LowTrustAccuracyMeters,
    double PerfectAccuracyMeters,
    int RepeatedAccuracyRun,
    MockLocationPolicy MockPolicy,
    int DeviceSignalsRetentionDays,
    double DriftFromClinicMeters = 0,
    double DriftFromVisitsMeters = 0,
    LocationVisibility Visibility = 0,
    int VisitWindowBufferMinutes = -1)
{
    public const string Key = "location-trust";

    public bool VisitOnly => Visibility == LocationVisibility.VisitOnly;

    public TimeSpan VisitWindowBuffer => TimeSpan.FromMinutes(Math.Max(0, VisitWindowBufferMinutes));

    /// <summary>Values saved before a setting existed are missing (0, or -1 for the buffer): they take the configured default.</summary>
    public LocationTrustSettings WithDefaultsFrom(LocationTrustSettings defaults) => this with
    {
        DriftFromClinicMeters = DriftFromClinicMeters > 0 ? DriftFromClinicMeters : defaults.DriftFromClinicMeters,
        DriftFromVisitsMeters = DriftFromVisitsMeters > 0 ? DriftFromVisitsMeters : defaults.DriftFromVisitsMeters,
        Visibility = Enum.IsDefined(Visibility) ? Visibility : defaults.Visibility,
        VisitWindowBufferMinutes = VisitWindowBufferMinutes >= 0 ? VisitWindowBufferMinutes : defaults.VisitWindowBufferMinutes,
    };

    public bool ExcludeMock => MockPolicy == MockLocationPolicy.FlagAndExclude;

    /// <summary>The detector thresholds with these settings applied.</summary>
    public AnomalyDetectionOptions ApplyTo(AnomalyDetectionOptions configured)
    {
        var copy = configured.Copy();
        copy.MaxSpeedKmh = MaxSpeedKmh;
        copy.SuspiciousAccuracyMeters = PerfectAccuracyMeters;
        copy.RepeatedAccuracyRun = RepeatedAccuracyRun;
        return copy;
    }
}

/// <param name="IsDefault">Nothing saved yet: the values come from configuration.</param>
public sealed record LocationTrustSettingsDto(
    double MaxSpeedKmh,
    double MaxDistanceFromDoctorMeters,
    double AccuracyAllowanceMeters,
    double LowTrustAccuracyMeters,
    double PerfectAccuracyMeters,
    int RepeatedAccuracyRun,
    MockLocationPolicy MockPolicy,
    int DeviceSignalsRetentionDays,
    bool IsDefault,
    DateTimeOffset? UpdatedAt,
    string? UpdatedByName,
    double DriftFromClinicMeters,
    double DriftFromVisitsMeters,
    LocationVisibility Visibility,
    int VisitWindowBufferMinutes);

/// <param name="DriftFromClinicMeters">Optional: left out, the current value is kept.</param>
/// <param name="DriftFromVisitsMeters">Optional: left out, the current value is kept.</param>
/// <param name="Visibility">Optional: left out, the current value is kept.</param>
/// <param name="VisitWindowBufferMinutes">Optional: left out, the current value is kept.</param>
public sealed record UpdateLocationTrustSettingsRequest(
    double MaxSpeedKmh,
    double MaxDistanceFromDoctorMeters,
    double AccuracyAllowanceMeters,
    double LowTrustAccuracyMeters,
    double PerfectAccuracyMeters,
    int RepeatedAccuracyRun,
    MockLocationPolicy MockPolicy,
    int DeviceSignalsRetentionDays,
    double? DriftFromClinicMeters = null,
    double? DriftFromVisitsMeters = null,
    LocationVisibility? Visibility = null,
    int? VisitWindowBufferMinutes = null);

public sealed class UpdateLocationTrustSettingsRequestValidator : AbstractValidator<UpdateLocationTrustSettingsRequest>
{
    public UpdateLocationTrustSettingsRequestValidator()
    {
        RuleFor(x => x.MaxSpeedKmh).InclusiveBetween(60, 1000);
        RuleFor(x => x.MaxDistanceFromDoctorMeters).InclusiveBetween(50, 10_000);
        RuleFor(x => x.AccuracyAllowanceMeters).InclusiveBetween(0, 200);
        RuleFor(x => x.LowTrustAccuracyMeters).InclusiveBetween(10, 500);
        RuleFor(x => x.PerfectAccuracyMeters).InclusiveBetween(0, 10);
        RuleFor(x => x.RepeatedAccuracyRun).InclusiveBetween(3, 50);
        RuleFor(x => x.MockPolicy).IsInEnum();
        RuleFor(x => x.DeviceSignalsRetentionDays).InclusiveBetween(1, 365);
        RuleFor(x => x.DriftFromClinicMeters).InclusiveBetween(20, 10_000).When(x => x.DriftFromClinicMeters is not null);
        RuleFor(x => x.DriftFromVisitsMeters).InclusiveBetween(20, 10_000).When(x => x.DriftFromVisitsMeters is not null);
        RuleFor(x => x.Visibility).IsInEnum().When(x => x.Visibility is not null);
        RuleFor(x => x.VisitWindowBufferMinutes).InclusiveBetween(0, 60).When(x => x.VisitWindowBufferMinutes is not null);
    }
}

/// <summary>Reads (cached per API instance) and saves the location trust settings.</summary>
public sealed class LocationTrustSettingsService(
    IAppDbContext db,
    IMemoryCache cache,
    IOptions<LocationTrustOptions> trustOptions,
    IOptions<AnomalyDetectionOptions> anomalyOptions,
    IOptions<VisitOptions> visitOptions,
    ICurrentUser currentUser,
    AuditTrail audit,
    TimeProvider time)
{
    private const string CacheKey = "settings:" + LocationTrustSettings.Key;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    /// <summary>Configuration values, used until an admin saves the settings.</summary>
    public LocationTrustSettings Defaults()
    {
        var anomalies = anomalyOptions.Value;
        var visits = visitOptions.Value;
        var trust = trustOptions.Value;
        return new LocationTrustSettings(
            anomalies.MaxSpeedKmh,
            trust.MaxDistanceFromDoctorMeters,
            visits.MaxAccuracyAllowanceMeters,
            visits.MaxAccuracyMeters,
            anomalies.SuspiciousAccuracyMeters,
            anomalies.RepeatedAccuracyRun,
            trust.MockPolicy,
            trust.DeviceSignalsRetentionDays,
            trust.DriftFromClinicMeters,
            trust.DriftFromVisitsMeters,
            Enum.IsDefined(trust.LocationVisibility) ? trust.LocationVisibility : LocationVisibility.VisitOnly,
            Math.Clamp(trust.VisitWindowBufferMinutes, 0, 60));
    }

    public async Task<LocationTrustSettings> GetAsync(CancellationToken cancellationToken = default)
    {
        if (cache.TryGetValue(CacheKey, out LocationTrustSettings? cached) && cached is not null)
        {
            return cached;
        }

        var row = await db.AppSettings.AsNoTracking().SingleOrDefaultAsync(s => s.Key == LocationTrustSettings.Key, cancellationToken);
        var settings = Parse(row)?.WithDefaultsFrom(Defaults()) ?? Defaults();
        cache.Set(CacheKey, settings, TimeSpan.FromSeconds(Math.Max(0, trustOptions.Value.SettingsCacheSeconds)));
        return settings;
    }

    public async Task<LocationTrustSettingsDto> GetDtoAsync(CancellationToken cancellationToken = default)
    {
        var row = await db.AppSettings.AsNoTracking().SingleOrDefaultAsync(s => s.Key == LocationTrustSettings.Key, cancellationToken);
        return await ToDtoAsync(Parse(row)?.WithDefaultsFrom(Defaults()) ?? Defaults(), row, cancellationToken);
    }

    /// <summary>Saves the settings (settings:manage). Applies to new data at once on this instance.</summary>
    public async Task<LocationTrustSettingsDto> UpdateAsync(UpdateLocationTrustSettingsRequest request, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var row = await db.AppSettings.SingleOrDefaultAsync(s => s.Key == LocationTrustSettings.Key, cancellationToken);
        var before = Parse(row)?.WithDefaultsFrom(Defaults()) ?? Defaults();
        var after = before with
        {
            MaxSpeedKmh = request.MaxSpeedKmh,
            MaxDistanceFromDoctorMeters = request.MaxDistanceFromDoctorMeters,
            AccuracyAllowanceMeters = request.AccuracyAllowanceMeters,
            LowTrustAccuracyMeters = request.LowTrustAccuracyMeters,
            PerfectAccuracyMeters = request.PerfectAccuracyMeters,
            RepeatedAccuracyRun = request.RepeatedAccuracyRun,
            MockPolicy = request.MockPolicy,
            DeviceSignalsRetentionDays = request.DeviceSignalsRetentionDays,
            DriftFromClinicMeters = request.DriftFromClinicMeters ?? before.DriftFromClinicMeters,
            DriftFromVisitsMeters = request.DriftFromVisitsMeters ?? before.DriftFromVisitsMeters,
            Visibility = request.Visibility ?? before.Visibility,
            VisitWindowBufferMinutes = request.VisitWindowBufferMinutes ?? before.VisitWindowBufferMinutes,
        };

        if (row is null)
        {
            row = new AppSetting { Key = LocationTrustSettings.Key };
            db.AppSettings.Add(row);
        }

        row.Value = JsonSerializer.Serialize(after, Json);
        row.UpdatedAt = time.GetUtcNow();
        row.UpdatedById = me;
        await audit.AddAsync(AuditEntities.Settings, null, AuditAction.Updated, new { key = LocationTrustSettings.Key, before, after }, cancellationToken: cancellationToken);
        await db.SaveChangesAsync(cancellationToken);

        cache.Remove(CacheKey);
        return await ToDtoAsync(after, row, cancellationToken);
    }

    private static LocationTrustSettings? Parse(AppSetting? row)
    {
        if (row is null)
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<LocationTrustSettings>(row.Value, Json);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private async Task<LocationTrustSettingsDto> ToDtoAsync(LocationTrustSettings s, AppSetting? row, CancellationToken cancellationToken)
    {
        var updatedBy = row?.UpdatedById is { } id
            ? await db.Users.AsNoTracking().Where(u => u.Id == id).Select(u => u.FullName).SingleOrDefaultAsync(cancellationToken)
            : null;
        return new LocationTrustSettingsDto(
            s.MaxSpeedKmh, s.MaxDistanceFromDoctorMeters, s.AccuracyAllowanceMeters, s.LowTrustAccuracyMeters,
            s.PerfectAccuracyMeters, s.RepeatedAccuracyRun, s.MockPolicy, s.DeviceSignalsRetentionDays,
            row is null, row?.UpdatedAt, updatedBy, s.DriftFromClinicMeters, s.DriftFromVisitsMeters,
            s.Visibility, s.VisitWindowBufferMinutes);
    }
}
