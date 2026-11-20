using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Auditing;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Stats;
using OriginalPharma.Application.Tracking;
using OriginalPharma.Application.Tracking.Anomalies;
using OriginalPharma.Application.Tracking.Integrity;
using OriginalPharma.Application.Visits;
using OriginalPharma.Domain.Audit;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Domain.Notifications;
using OriginalPharma.Domain.Tracking;

namespace OriginalPharma.Tests.Integration;

/// <summary>Fake location detection end to end: ingest, flags, visits, settings, review and statistics.</summary>
[Collection(PostgresCollection.Name)]
public sealed class LocationTrustTests(PostgresFixture postgres)
{
    private const double ClinicLat = 30.0561;
    private const double ClinicLng = 31.3301;

    /// <summary>The API's JSON settings: camelCase enums, numbers must be numbers.</summary>
    private static readonly JsonSerializerOptions ApiJson = new(JsonSerializerDefaults.Web)
    {
        NumberHandling = JsonNumberHandling.Strict,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>
    /// Moves the demo rep's running day three hours back, so recent points fall inside it, and clears
    /// the demo flags so every flag in the test is one the test raised.
    /// </summary>
    private static Task<Guid> DayStartedAsync(TestDatabase db, Guid rep) =>
        db.DbAsync(async c =>
        {
            await c.TrackingFlags.Where(f => f.UserId == rep).ExecuteDeleteAsync(Ct);
            var shift = await c.Shifts.Where(s => s.UserId == rep && s.Status == ShiftStatus.Active).SingleAsync(Ct);
            shift.StartedAt = DateTimeOffset.UtcNow.AddHours(-3);
            await c.SaveChangesAsync(Ct);
            return shift.Id;
        });

    private static LocationPointDto Point(double lat, int secondsAgo, double accuracy = 12, bool mock = false, double lng = ClinicLng) =>
        new(lat, lng, accuracy, DateTimeOffset.UtcNow.AddSeconds(-secondsAgo), IsMock: mock);

    private static LocationBatchRequest Batch(params LocationPointDto[] points) => new("test-device", LocationSource.Native, points);

    private static Task<LocationBatchResult> SendAsync(TestDatabase db, Guid rep, LocationBatchRequest batch) =>
        db.As<TrackingIngestService, LocationBatchResult>(rep, s => s.IngestAsync(batch, Ct));

    private static Task<List<LocationPoint>> PointsAsync(TestDatabase db, Guid rep) =>
        db.DbAsync(c => c.LocationPoints.AsNoTracking().Where(p => p.UserId == rep).OrderBy(p => p.RecordedAt).ToListAsync(Ct));

    private static Task<List<TrackingFlag>> FlagsAsync(TestDatabase db, Guid rep, TrackingFlagType type) =>
        db.DbAsync(c => c.TrackingFlags.AsNoTracking().Where(f => f.UserId == rep && f.Type == type).OrderBy(f => f.CreatedAt).ToListAsync(Ct));

    private static Task<int> SuspiciousLocationNotificationsAsync(TestDatabase db, Guid recipient, Guid rep) =>
        db.DbAsync(c => c.Notifications.CountAsync(n => n.UserId == recipient && n.Type == NotificationType.SuspiciousLocation && n.EntityId == rep, Ct));

    private static Task<VisitDto> CheckInAsync(TestDatabase db, Guid rep, Guid customer, double lat = ClinicLat, double accuracy = 12, DeviceSignalsDto? signals = null) =>
        db.As<VisitService, VisitDto>(rep, s => s.CheckInAsync(
            new CheckInRequest(customer, "test-device", lat, ClinicLng, accuracy, DateTimeOffset.UtcNow, false, null, Guid.NewGuid(), signals), Ct));

    private static Task SaveSettingsAsync(TestDatabase db, Guid admin, Func<UpdateLocationTrustSettingsRequest, UpdateLocationTrustSettingsRequest> change) =>
        db.AsAsync(admin, async sp =>
        {
            var service = sp.GetRequiredService<LocationTrustSettingsService>();
            var d = service.Defaults();
            await service.UpdateAsync(change(new UpdateLocationTrustSettingsRequest(
                d.MaxSpeedKmh, d.MaxDistanceFromDoctorMeters, d.AccuracyAllowanceMeters, d.LowTrustAccuracyMeters,
                d.PerfectAccuracyMeters, d.RepeatedAccuracyRun, d.MockPolicy, d.DeviceSignalsRetentionDays)), Ct);
        });

    [Fact]
    public async Task A_batch_from_an_older_app_without_the_new_fields_is_stored_as_before()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        await DayStartedAsync(db, p.Rep);
        var at = DateTimeOffset.UtcNow.AddMinutes(-1).ToString("O");

        // Exactly what the previous location template produced.
        var json = $$"""
            {"deviceId":"and-old","source":"native","points":[
              {"lat":30.0561,"lng":31.3301,"accuracy":14,"timestamp":"{{at}}","speed":-1,"heading":-1,
               "batteryLevel":0.8,"isMock":false,"isMoving":true,"uuid":"a1"}]}
            """;
        var batch = JsonSerializer.Deserialize<LocationBatchRequest>(json, ApiJson)!;

        var result = await SendAsync(db, p.Rep, batch);

        Assert.Equal((1, false, 0, 0), (result.Accepted, result.Flagged, result.Suspicious, result.Rejected));
        var stored = Assert.Single(await PointsAsync(db, p.Rep));
        Assert.Equal(LocationTrustStatus.Trusted, stored.TrustStatus);
        Assert.Null(stored.TrustReason);
        Assert.Null(stored.DeviceTime);
        Assert.Null(stored.Altitude);
        Assert.Null(stored.DeviceSignals);
    }

    [Fact]
    public async Task A_batch_from_the_new_app_keeps_device_time_altitude_activity_and_device_signals()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        await DayStartedAsync(db, p.Rep);
        var at = DateTimeOffset.UtcNow.AddMinutes(-1);

        // The current location template, plus the uploader's params (deviceId, source, deviceSignals).
        var json = $$"""
            {"deviceId":"and-new","source":"native","deviceSignals":{"platform":"android","developerOptionsEnabled":true,
              "mockLocationAppSelected":false,"spoofingApps":["com.lexa.fakegps"],"autoTimeEnabled":true,"autoTimeZoneEnabled":true,
              "emulator":false,"emulatorSignals":[],"rooted":false,"rootSignals":[],"collectedAt":"{{at:O}}"},
             "points":[{"lat":30.0561,"lng":31.3301,"accuracy":9,"timestamp":"{{at:O}}","speed":0.4,"heading":-1,
               "batteryLevel":0.62,"isMock":false,"isMoving":false,"uuid":"b1","altitude":47.3,"activityType":"still",
               "activityConfidence":100,"deviceTime":"{{at.AddSeconds(2):O}}"}]}
            """;

        await SendAsync(db, p.Rep, JsonSerializer.Deserialize<LocationBatchRequest>(json, ApiJson)!);

        var stored = Assert.Single(await PointsAsync(db, p.Rep));
        Assert.Equal(47.3, stored.Altitude);
        Assert.Equal(("still", 100), (stored.ActivityType, stored.ActivityConfidence));
        Assert.Equal(at.AddSeconds(2).ToUnixTimeSeconds(), stored.DeviceTime!.Value.ToUnixTimeSeconds());
        Assert.Equal(["com.lexa.fakegps"], DeviceSignalsDto.FromJson(stored.DeviceSignals)!.SpoofingApps);

        // An installed spoofing app is kept as evidence but does not make the point suspicious on its own.
        Assert.Equal(LocationTrustStatus.Trusted, stored.TrustStatus);
        Assert.Contains(AnomalyCodes.SpoofingAppInstalled, stored.AnomalyCodes);
    }

    [Fact]
    public async Task Mock_points_are_kept_as_suspicious_and_raise_one_flag_with_an_audit_entry_and_a_supervisor_notification()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        await DayStartedAsync(db, p.Rep);

        var result = await SendAsync(db, p.Rep, Batch(Point(30.0500, 120), Point(30.0505, 60, mock: true)));

        Assert.True(result.Flagged);
        Assert.Equal((2, 1), (result.Accepted, result.Suspicious));
        var points = await PointsAsync(db, p.Rep);
        Assert.Equal([LocationTrustStatus.Trusted, LocationTrustStatus.Suspicious], points.Select(x => x.TrustStatus));
        Assert.Equal(AnomalyCodes.MockLocation, points[1].TrustReason);

        var flag = Assert.Single(await FlagsAsync(db, p.Rep, TrackingFlagType.MockLocation));
        Assert.Equal(points[1].Id, flag.LocationPointId);
        Assert.Contains(db.Dashboards.Flags, f => f.Id == flag.Id);
        Assert.True(await db.DbAsync(c => c.AuditEntries.AnyAsync(a => a.EntityType == AuditEntities.LocationFlag && a.EntityId == flag.Id && a.Action == AuditAction.Created, Ct)));
        Assert.Equal(1, await SuspiciousLocationNotificationsAsync(db, p.Supervisor, p.Rep));
        Assert.Contains(db.Published.Sent, s => s.UserId == p.Supervisor && s.Notification.Type == NotificationType.SuspiciousLocation);

        // The fake location keeps going: the same open flag counts it, nothing new is raised or sent.
        await SendAsync(db, p.Rep, Batch(Point(30.0510, 30, mock: true)));

        var again = Assert.Single(await FlagsAsync(db, p.Rep, TrackingFlagType.MockLocation));
        Assert.Equal(2, again.Occurrences);
        Assert.NotNull(again.LastSeenAt);
        Assert.Equal(1, await SuspiciousLocationNotificationsAsync(db, p.Supervisor, p.Rep));
    }

    [Fact]
    public async Task Impossible_movement_is_rejected_but_never_deleted()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        await DayStartedAsync(db, p.Rep);

        // Cairo, Alexandria two minutes later, Cairo again.
        var result = await SendAsync(db, p.Rep, Batch(
            Point(30.0444, 240, lng: 31.2357), Point(31.2001, 120, lng: 29.9187), Point(30.0450, 60, lng: 31.2357)));

        Assert.Equal((3, 1), (result.Accepted, result.Rejected));
        var points = await PointsAsync(db, p.Rep);
        Assert.Equal([LocationTrustStatus.Trusted, LocationTrustStatus.Rejected, LocationTrustStatus.Trusted], points.Select(x => x.TrustStatus));
        Assert.Equal(AnomalyCodes.Teleport, points[1].TrustReason);
        Assert.Single(await FlagsAsync(db, p.Rep, TrackingFlagType.Anomaly));
    }

    [Fact]
    public async Task The_supervisor_is_told_at_most_once_per_rep_per_hour()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        await DayStartedAsync(db, p.Rep);
        Task AcknowledgeAllAsync() => db.DbAsync(c => c.TrackingFlags.Where(f => f.UserId == p.Rep && f.Status == TrackingFlagStatus.Open)
            .ExecuteUpdateAsync(s => s.SetProperty(f => f.Status, TrackingFlagStatus.Acknowledged), Ct));

        await SendAsync(db, p.Rep, Batch(Point(30.0500, 300, mock: true)));
        await AcknowledgeAllAsync();
        await SendAsync(db, p.Rep, Batch(Point(30.0505, 240, mock: true)));

        // Two flags, both in the activity log, but one notification.
        Assert.Equal(2, (await FlagsAsync(db, p.Rep, TrackingFlagType.MockLocation)).Count);
        Assert.Equal(2, await db.DbAsync(c => c.AuditEntries.CountAsync(a => a.EntityType == AuditEntities.LocationFlag && a.Action == AuditAction.Created, Ct)));
        Assert.Equal(1, await SuspiciousLocationNotificationsAsync(db, p.Supervisor, p.Rep));

        // An hour later the next flag is announced again.
        await db.DbAsync(c => c.Notifications.Where(n => n.Type == NotificationType.SuspiciousLocation)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.CreatedAt, n => n.CreatedAt.AddMinutes(-61)), Ct));
        await AcknowledgeAllAsync();
        await SendAsync(db, p.Rep, Batch(Point(30.0510, 180, mock: true)));

        Assert.Equal(2, await SuspiciousLocationNotificationsAsync(db, p.Supervisor, p.Rep));
        Assert.Equal(0, await SuspiciousLocationNotificationsAsync(db, p.Area, p.Rep));
    }

    [Fact]
    public async Task The_app_report_of_a_fake_location_and_the_mock_points_share_one_flag()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        await DayStartedAsync(db, p.Rep);

        var report = await db.As<LocationIntegrityService, IntegrityEventReportResult>(p.Rep, s => s.ReportAsync(
            new IntegrityEventReport("test-device", DateTimeOffset.UtcNow.AddMinutes(-2), 30.05, 31.33, 5,
                new DeviceSignalsDto(Platform: "android", MockLocationAppSelected: true, SpoofingApps: ["com.lexa.fakegps"])), Ct));
        await SendAsync(db, p.Rep, Batch(Point(30.0505, 60, mock: true)));

        Assert.False(report.Merged);
        var flag = Assert.Single(await FlagsAsync(db, p.Rep, TrackingFlagType.MockLocation));
        Assert.Equal(report.FlagId, flag.Id);
        Assert.Equal(2, flag.Occurrences);
        Assert.Contains(AnomalyCodes.MockAppSelected, flag.Signals);
        Assert.Contains("com.lexa.fakegps", flag.Details);
    }

    [Fact]
    public async Task Device_signals_are_cleared_after_the_retention_period_and_the_points_stay()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        await DayStartedAsync(db, p.Rep);
        var signals = new DeviceSignalsDto(Platform: "android", Rooted: true, RootSignals: ["su-binary"]);
        await SendAsync(db, p.Rep, Batch(Point(30.0500, 120), Point(30.0503, 60)) with { DeviceSignals = signals });
        var old = (await PointsAsync(db, p.Rep))[0];
        await db.DbAsync(c => c.LocationPoints.Where(x => x.Id == old.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.RecordedAt, DateTimeOffset.UtcNow.AddDays(-31)), Ct));

        var cleared = await db.As<DeviceSignalsRetentionJob, int>(p.Admin, j => j.RunAsync(Ct));

        Assert.Equal(1, cleared);
        var points = await PointsAsync(db, p.Rep);
        Assert.Equal(2, points.Count);
        Assert.Null(points.Single(x => x.Id == old.Id).DeviceSignals);
        Assert.Contains(AnomalyCodes.RootedDevice, points.Single(x => x.Id == old.Id).AnomalyCodes);
        Assert.NotNull(points.Single(x => x.Id != old.Id).DeviceSignals);
    }

    [Fact]
    public async Task A_visit_far_from_the_doctor_or_on_weak_evidence_is_flagged_but_never_refused()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var clinic = await DemoPeople.DoctorAsync(db, "Dr. Demo Clinic");

        // About 2 km away: kept, outside the geofence and far from the doctor.
        var far = await CheckInAsync(db, p.Rep, clinic, lat: ClinicLat + 0.018);

        Assert.True(far.NeedsReview);
        Assert.Equal([VisitReviewReasons.OutsideGeofence, VisitReviewReasons.FarFromDoctor, VisitReviewReasons.LocationDrift], far.ReviewReasons);
        var flag = await db.DbAsync(c => c.TrackingFlags.AsNoTracking().SingleAsync(f => f.VisitId == far.Id, Ct));
        Assert.Equal(TrackingFlagType.VisitOutsideGeofence, flag.Type);
        Assert.Contains(VisitReviewReasons.FarFromDoctor, flag.Signals);
        await db.As<VisitService, VisitDto>(p.Rep, s => s.CheckOutAsync(far.Id, new CheckOutRequest(ClinicLat, ClinicLng, 10, DateTimeOffset.UtcNow), Ct));

        // At the door, but with a synthetic 0.5 m fix and a spoofing app chosen as mock location app.
        var weak = await CheckInAsync(db, p.Rep, clinic, accuracy: 0.5, signals: new DeviceSignalsDto(MockLocationAppSelected: true));

        Assert.True(weak.CheckInWithinGeofence);
        // The far visit before it had a clean fix, so this one is also 2 km from the previous visit.
        Assert.Equal([VisitReviewReasons.LowTrust, VisitReviewReasons.LocationDrift], weak.ReviewReasons);
        var lowFlag = await db.DbAsync(c => c.TrackingFlags.AsNoTracking().SingleAsync(f => f.VisitId == weak.Id, Ct));
        Assert.Equal(TrackingFlagType.VisitLowTrust, lowFlag.Type);
        Assert.Contains(AnomalyCodes.MockAppSelected, lowFlag.Signals);

        // Checking out 1.2 km away adds "far from doctor"; the visit still closes.
        var closed = await db.As<VisitService, VisitDto>(p.Rep, s => s.CheckOutAsync(weak.Id,
            new CheckOutRequest(ClinicLat + 0.011, ClinicLng, 10, DateTimeOffset.UtcNow, ClientRequestId: Guid.NewGuid()), Ct));

        Assert.Equal(Domain.Visits.VisitStatus.Completed, closed.Status);
        Assert.Equal([VisitReviewReasons.LowTrust, VisitReviewReasons.LocationDrift, VisitReviewReasons.FarFromDoctor], closed.ReviewReasons);
        var detail = await db.As<VisitService, VisitDetailDto>(p.Supervisor, s => s.GetAsync(weak.Id, Ct));
        Assert.Equal(closed.ReviewReasons, detail.ReviewReasons);
    }

    [Fact]
    public async Task Suspicious_tracking_points_just_before_a_check_in_make_the_visit_low_trust()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        await DayStartedAsync(db, p.Rep);
        var clinic = await DemoPeople.DoctorAsync(db, "Dr. Demo Clinic");
        await SendAsync(db, p.Rep, Batch(Point(ClinicLat, 120, accuracy: 0.8)));

        var visit = await CheckInAsync(db, p.Rep, clinic);

        Assert.Equal([VisitReviewReasons.LowTrust], visit.ReviewReasons);
    }

    [Fact]
    public async Task Thresholds_come_from_the_settings_saved_by_an_admin()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        await DayStartedAsync(db, p.Rep);
        var clinic = await DemoPeople.DoctorAsync(db, "Dr. Demo Clinic");

        await SaveSettingsAsync(db, p.Admin, r => r with { MaxDistanceFromDoctorMeters = 100, MaxSpeedKmh = 100 });

        // 445 m away: only outside the geofence with the defaults, far from the doctor with 100 m.
        var visit = await CheckInAsync(db, p.Rep, clinic, lat: ClinicLat + 0.004);
        Assert.Contains(VisitReviewReasons.FarFromDoctor, visit.ReviewReasons);

        // About 2.2 km in a minute (133 km/h) is impossible with a 100 km/h limit.
        var result = await SendAsync(db, p.Rep, Batch(Point(30.0000, 120), Point(30.0200, 60)));
        Assert.Equal(1, result.Rejected);

        var saved = await db.As<LocationTrustSettingsService, LocationTrustSettingsDto>(p.Admin, s => s.GetDtoAsync(Ct));
        Assert.False(saved.IsDefault);
        Assert.Equal((100d, 100d), (saved.MaxDistanceFromDoctorMeters, saved.MaxSpeedKmh));
        Assert.Equal("System Admin", saved.UpdatedByName);
        Assert.True(await db.DbAsync(c => c.AuditEntries.AnyAsync(a => a.EntityType == AuditEntities.Settings, Ct)));
        var rules = await db.As<VisitService, VisitRulesDto>(p.Rep, s => s.RulesAsync(Ct));
        Assert.Equal(100, rules.MaxDistanceFromDoctorMeters);
    }

    [Fact]
    public async Task The_mock_policy_decides_whether_mock_visits_and_points_count_in_statistics()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        await DayStartedAsync(db, p.Rep);
        var clinic = await DemoPeople.DoctorAsync(db, "Dr. Demo Clinic");

        // A straight walk north with one mock point ~1 km to the east and one teleport to Alexandria.
        await SendAsync(db, p.Rep, Batch(
            Point(30.0500, 300),
            Point(30.0510, 240, mock: true, lng: ClinicLng + 0.01),
            Point(30.0520, 180),
            Point(31.2001, 120, lng: 29.9187),
            Point(30.0530, 60)));
        await db.As<VisitService, VisitDto>(p.Rep, s => s.CheckInAsync(
            new CheckInRequest(clinic, "test-device", ClinicLat, ClinicLng, 12, DateTimeOffset.UtcNow, true, null, Guid.NewGuid()), Ct));

        Task<RepRankRow> RepRowAsync() => db.As<StatsService, RepRankRow>(p.Supervisor, async s =>
            (await s.RepsAsync(new StatsQuery(), Ct)).Reps.Single(r => r.RepId == p.Rep));
        var flagOnly = await RepRowAsync();

        await SaveSettingsAsync(db, p.Admin, r => r with { MockPolicy = MockLocationPolicy.FlagAndExclude });
        var excluded = await RepRowAsync();

        // Rejected points never count: ~0.97 + 0.97 + 0.11 km with the mock point, ~0.33 km without it.
        Assert.InRange(flagOnly.DistanceKm, 1.9m, 2.2m);
        Assert.InRange(excluded.DistanceKm, 0.2m, 0.5m);

        var mockVisits = await db.DbAsync(c => c.Visits.CountAsync(v => v.UserId == p.Rep && v.ArchivedAt == null &&
            v.Status != Domain.Visits.VisitStatus.Cancelled && (v.CheckInIsMock || v.CheckOutIsMock == true), Ct));
        Assert.True(mockVisits >= 1);
        Assert.Equal(flagOnly.Visits - mockVisits, excluded.Visits);
    }

    [Fact]
    public async Task A_supervisor_reviews_only_their_team_and_managers_see_their_whole_scope()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        await DayStartedAsync(db, p.Rep);
        await SendAsync(db, p.Rep, Batch(Point(30.0505, 60, mock: true)));
        var mine = Assert.Single(await FlagsAsync(db, p.Rep, TrackingFlagType.MockLocation));

        // Someone above the supervisor: not in their team.
        var outside = await db.DbAsync(async c =>
        {
            var areaTerritory = await c.Users.Where(u => u.Id == p.Area).Select(u => u.TerritoryId).SingleAsync(Ct);
            var flag = new TrackingFlag
            {
                UserId = p.Area, TerritoryId = areaTerritory, Type = TrackingFlagType.MockLocation, Score = 60,
                Signals = [AnomalyCodes.MockLocation], CreatedAt = DateTimeOffset.UtcNow,
            };
            c.TrackingFlags.Add(flag);
            await c.SaveChangesAsync(Ct);
            return flag.Id;
        });

        Task<IReadOnlyList<IntegrityEventDto>> ListAsync(Guid who) =>
            db.As<LocationIntegrityService, IReadOnlyList<IntegrityEventDto>>(who, s => s.ListAsync(null, null, null, null, null, null, Ct));

        var supervisorSees = await ListAsync(p.Supervisor);
        Assert.Contains(supervisorSees, e => e.Id == mine.Id);
        Assert.DoesNotContain(supervisorSees, e => e.Id == outside);
        Assert.Contains(await ListAsync(p.Sales), e => e.Id == outside);
        Assert.Contains(await ListAsync(p.Admin), e => e.Id == mine.Id);
        Assert.Empty(await ListAsync(p.Rep));

        await Assert.ThrowsAsync<NotFoundException>(() => db.As<LocationIntegrityService, IntegrityEventDto>(p.Supervisor,
            s => s.AcknowledgeAsync(outside, new AcknowledgeIntegrityEventRequest("Not mine"), Ct)));
        await Assert.ThrowsAsync<NotFoundException>(() => db.As<LocationIntegrityService, IntegrityEventDetailDto>(p.Supervisor,
            s => s.GetAsync(outside, Ct)));

        // Filters: by reason and by rep.
        var byReason = await db.As<LocationIntegrityService, IReadOnlyList<IntegrityEventDto>>(p.Supervisor,
            s => s.ListAsync(null, null, p.Rep, AnomalyCodes.MockLocation, TrackingFlagStatus.Open, null, Ct));
        Assert.Single(byReason, e => e.Id == mine.Id);
        Assert.Empty(await db.As<LocationIntegrityService, IReadOnlyList<IntegrityEventDto>>(p.Supervisor,
            s => s.ListAsync(null, null, p.Rep, AnomalyCodes.Teleport, null, null, Ct)));
    }

    [Fact]
    public async Task Acknowledging_needs_a_comment_is_audited_and_leaves_confirmed_events_alone()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        await DayStartedAsync(db, p.Rep);
        await SendAsync(db, p.Rep, Batch(Point(30.0500, 120), Point(30.0505, 60, mock: true)) with
        {
            DeviceSignals = new DeviceSignalsDto(Platform: "android", DeveloperOptionsEnabled: true),
        });
        var flag = Assert.Single(await FlagsAsync(db, p.Rep, TrackingFlagType.MockLocation));

        var detail = await db.As<LocationIntegrityService, IntegrityEventDetailDto>(p.Supervisor, s => s.GetAsync(flag.Id, Ct));
        var point = Assert.Single(detail.Points);
        Assert.True(point.IsMock);
        Assert.True(point.DeviceSignals!.DeveloperOptionsEnabled);
        Assert.Equal(point.Id, detail.Event.LocationPointId);

        Assert.False(new AcknowledgeIntegrityEventRequestValidator().Validate(new AcknowledgeIntegrityEventRequest("  ")).IsValid);
        var acknowledged = await db.As<LocationIntegrityService, IntegrityEventDto>(p.Supervisor,
            s => s.AcknowledgeAsync(flag.Id, new AcknowledgeIntegrityEventRequest(" Called the rep, the app is removed. "), Ct));

        Assert.Equal(TrackingFlagStatus.Acknowledged, acknowledged.Status);
        Assert.Equal("Called the rep, the app is removed.", acknowledged.ReviewNote);
        Assert.Equal("Demo Supervisor", acknowledged.ReviewedByName);
        Assert.True(await db.DbAsync(c => c.AuditEntries.AnyAsync(a => a.EntityType == AuditEntities.LocationFlag && a.EntityId == flag.Id && a.Action == AuditAction.Updated && a.ActorId == p.Supervisor, Ct)));

        await db.As<TrackingQueryService, TrackingFlagDto>(p.Supervisor, s => s.ReviewFlagAsync(flag.Id, new ReviewFlagRequest(TrackingFlagStatus.Confirmed), Ct));
        var refused = await Assert.ThrowsAsync<ConflictException>(() => db.As<LocationIntegrityService, IntegrityEventDto>(p.Supervisor,
            s => s.AcknowledgeAsync(flag.Id, new AcknowledgeIntegrityEventRequest("Again"), Ct)));
        Assert.Equal("event-already-reviewed", refused.Code);

        var summary = await db.As<LocationIntegrityService, IntegritySummaryDto>(p.Supervisor, s => s.SummaryAsync(null, null, Ct));
        Assert.Equal((1, 1), (summary.MockPoints, summary.SuspiciousPoints));
        Assert.Contains(summary.TopReasons, r => r.Reason == AnomalyCodes.MockLocation);
    }

    [Fact]
    public async Task Existing_databases_receive_the_new_permission_with_each_roles_default_scope()
    {
        await using var db = await postgres.CreateDatabaseAsync();

        // Make the key new again, as on a database created before it existed, then seed.
        await db.DbAsync(c => c.Permissions.Where(x => x.Key == Permissions.Tracking.ReviewSuspicious).ExecuteDeleteAsync(Ct));
        await db.SeedAgainAsync();

        Assert.Contains((await db.RoleAsync(DefaultRoles.Supervisor)).Permissions, g => g is { Key: Permissions.Tracking.ReviewSuspicious, Scope: PermissionScope.Team });
        Assert.Contains((await db.RoleAsync(DefaultRoles.AreaManager)).Permissions, g => g is { Key: Permissions.Tracking.ReviewSuspicious, Scope: PermissionScope.Territory });
        Assert.Contains((await db.RoleAsync(DefaultRoles.SalesManager)).Permissions, g => g is { Key: Permissions.Tracking.ReviewSuspicious, Scope: PermissionScope.All });
        Assert.Contains((await db.RoleAsync(DefaultRoles.Admin)).Permissions, g => g is { Key: Permissions.Tracking.ReviewSuspicious, Scope: PermissionScope.All });
        Assert.DoesNotContain((await db.RoleAsync(DefaultRoles.Rep)).Permissions, g => g.Key == Permissions.Tracking.ReviewSuspicious);

        // Settings stay with the admin unless granted from the matrix.
        Assert.Contains((await db.RoleAsync(DefaultRoles.Admin)).Permissions, g => g.Key == Permissions.Settings.Manage);
        Assert.DoesNotContain((await db.RoleAsync(DefaultRoles.SalesManager)).Permissions, g => g.Key == Permissions.Settings.Manage);
    }

    [Fact]
    public async Task The_migration_keeps_existing_rows_and_marks_old_points_from_their_stored_codes()
    {
        await using var db = await postgres.CreateUnmigratedDatabaseAsync();
        await db.DbAsync(async c =>
        {
            await c.GetService<IMigrator>().MigrateAsync("20261118182516_AddVisitFlow", Ct);
            return true;
        });

        var user = Guid.NewGuid();
        var rows = $$"""
            INSERT INTO location_points (user_id, device_id, source, location, accuracy, is_mock, recorded_at, received_at, anomaly_score, anomaly_codes)
            VALUES
              ('{{user}}', 'old', 1, ST_GeogFromText('POINT(31.33 30.05)'), 12, false, now() - interval '5 min', now(), 0, ARRAY[]::text[]),
              ('{{user}}', 'old', 1, ST_GeogFromText('POINT(31.33 30.06)'), 12, true,  now() - interval '4 min', now(), 60, ARRAY['mock-location']),
              ('{{user}}', 'old', 1, ST_GeogFromText('POINT(29.91 31.20)'), 12, false, now() - interval '3 min', now(), 50, ARRAY['teleport']),
              ('{{user}}', 'old', 1, ST_GeogFromText('POINT(31.33 30.07)'), 0,  false, now() - interval '2 min', now(), 15, ARRAY['perfect-accuracy']),
              ('{{user}}', 'old', 1, ST_GeogFromText('POINT(31.33 30.08)'), 12, false, now() - interval '1 min', now(), 10, ARRAY['ip-geo-mismatch']);
            INSERT INTO tracking_flags (id, user_id, type, status, score, signals, created_at)
            VALUES ('{{Guid.NewGuid()}}', '{{user}}', 2, 1, 60, ARRAY['mock-location'], now());
            """;
        await db.DbAsync(c => c.Database.ExecuteSqlRawAsync(rows, Ct));

        await db.MigrateAsync();

        var points = await db.DbAsync(c => c.LocationPoints.AsNoTracking().Where(x => x.UserId == user).OrderBy(x => x.RecordedAt).ToListAsync(Ct));
        Assert.Equal(5, points.Count);
        Assert.Equal(
            [
                (LocationTrustStatus.Trusted, null),
                (LocationTrustStatus.Suspicious, AnomalyCodes.MockLocation),
                (LocationTrustStatus.Rejected, AnomalyCodes.Teleport),
                (LocationTrustStatus.Suspicious, AnomalyCodes.PerfectAccuracy),
                (LocationTrustStatus.Trusted, (string?)null),
            ],
            points.Select(x => (x.TrustStatus, x.TrustReason)));
        Assert.All(points, x => Assert.Null(x.DeviceSignals));

        var flag = await db.DbAsync(c => c.TrackingFlags.AsNoTracking().SingleAsync(f => f.UserId == user, Ct));
        Assert.Equal((1, (long?)null, (Guid?)null), (flag.Occurrences, flag.LocationPointId, flag.VisitId));
        Assert.False(await db.DbAsync(c => c.AppSettings.AnyAsync(Ct)));
    }
}
