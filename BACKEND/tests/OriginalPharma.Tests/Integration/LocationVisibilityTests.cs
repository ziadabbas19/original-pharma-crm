using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OriginalPharma.Application.Tracking;
using OriginalPharma.Application.Tracking.Anomalies;
using OriginalPharma.Application.Tracking.Integrity;
using OriginalPharma.Application.Tracking.Visibility;
using OriginalPharma.Application.Visits;
using OriginalPharma.Domain.Common;
using OriginalPharma.Domain.Tracking;
using OriginalPharma.Domain.Visits;

namespace OriginalPharma.Tests.Integration;

/// <summary>
/// Visit-only visibility (the default): managers see a rep's position only inside the rep's visit windows,
/// on every endpoint and on the live channel, and points recorded outside them are not kept.
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class LocationVisibilityTests(PostgresFixture postgres)
{
    private const double ClinicLat = 30.0561;
    private const double ClinicLng = 31.3301;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static DateTimeOffset Now => DateTimeOffset.UtcNow;

    /// <summary>
    /// The demo rep's running day, started early enough for every point of the test, with a registered phone
    /// (the map lists reps with a phone), no old flags and the seeded demo visits archived, so only the test's
    /// own visits make windows.
    /// </summary>
    private static async Task DayStartedAsync(TestDatabase db, Guid rep, double hoursAgo = 6)
    {
        await ArchiveDemoVisitsAsync(db, rep);
        await db.DbAsync(async c =>
        {
            await c.TrackingFlags.Where(f => f.UserId == rep).ExecuteDeleteAsync(Ct);
            var shift = await c.Shifts.Where(s => s.UserId == rep && s.Status == ShiftStatus.Active).SingleAsync(Ct);
            shift.StartedAt = Now.AddHours(-hoursAgo);
            return await c.SaveChangesAsync(Ct);
        });
        await db.As<DeviceHealthService, DeviceHealthResult>(rep, s => s.ReportAsync(new DeviceHealthReportRequest(
            "test-device", LocationSource.Native, DevicePlatform.Android, HealthReportTrigger.AppOpen, LocationPermissionState.Always,
            true, NotificationPermissionState.Granted, true, false, true, OnboardingCompleted: true), Ct));
    }

    private static Task<int> ArchiveDemoVisitsAsync(TestDatabase db, Guid rep) =>
        db.DbAsync(c => c.Visits.Where(v => v.UserId == rep && v.ArchivedAt == null)
            .ExecuteUpdateAsync(set => set.SetProperty(v => v.ArchivedAt, Now), Ct));

    private static Task<LocationBatchResult> SendAsync(TestDatabase db, Guid rep, params DateTimeOffset[] times) =>
        db.As<TrackingIngestService, LocationBatchResult>(rep, s => s.IngestAsync(new LocationBatchRequest(
            "test-device", LocationSource.Native,
            times.Select((t, i) => new LocationPointDto(ClinicLat + i * 0.00001, ClinicLng, 12, t)).ToList()), Ct));

    private static Task<VisitDto> CheckInAsync(TestDatabase db, Guid rep, Guid customer, DateTimeOffset at, double lat = ClinicLat) =>
        db.As<VisitService, VisitDto>(rep, s => s.CheckInAsync(
            new CheckInRequest(customer, "test-device", lat, ClinicLng, 12, at, false, null, Guid.NewGuid()), Ct));

    private static Task<VisitDto> CheckOutAsync(TestDatabase db, Guid rep, Guid visit, DateTimeOffset at, double lat = ClinicLat) =>
        db.As<VisitService, VisitDto>(rep, s => s.CheckOutAsync(visit, new CheckOutRequest(lat, ClinicLng, 12, at, ClientRequestId: Guid.NewGuid()), Ct));

    private static async Task<RepPresenceDto> PresenceAsync(TestDatabase db, Guid viewer, Guid rep) =>
        (await db.As<TrackingQueryService, IReadOnlyList<RepPresenceDto>>(viewer, s => s.GetPresenceAsync(Ct))).Single(p => p.UserId == rep);

    private static Task<IReadOnlyList<HistoryPointDto>> HistoryAsync(TestDatabase db, Guid viewer, Guid rep) =>
        db.As<TrackingQueryService, IReadOnlyList<HistoryPointDto>>(viewer, s => s.GetHistoryAsync(rep, Now.AddHours(-5), Now.AddMinutes(1), Ct));

    private static Task SetVisibilityAsync(TestDatabase db, Guid admin, LocationVisibility visibility, int? buffer = null) =>
        db.AsAsync(admin, async sp =>
        {
            var service = sp.GetRequiredService<LocationTrustSettingsService>();
            var d = service.Defaults();
            await service.UpdateAsync(new UpdateLocationTrustSettingsRequest(
                d.MaxSpeedKmh, d.MaxDistanceFromDoctorMeters, d.AccuracyAllowanceMeters, d.LowTrustAccuracyMeters,
                d.PerfectAccuracyMeters, d.RepeatedAccuracyRun, d.MockPolicy, d.DeviceSignalsRetentionDays,
                Visibility: visibility, VisitWindowBufferMinutes: buffer), Ct);
        });

    private static Task<Guid> ClinicAsync(TestDatabase db) => DemoPeople.DoctorAsync(db, "Dr. Demo Clinic");

    [Fact]
    public async Task Visit_only_is_the_default_and_outside_a_visit_the_rep_has_no_position()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        await DayStartedAsync(db, p.Rep);

        var visibility = await db.As<TrackingQueryService, LocationVisibilityDto>(p.Supervisor, s => s.GetVisibilityAsync(Ct));
        Assert.Equal(LocationVisibility.VisitOnly, visibility.Mode);
        Assert.Equal(5, visibility.BufferMinutes);

        await SendAsync(db, p.Rep, Now.AddMinutes(-3), Now.AddMinutes(-2));

        var presence = await PresenceAsync(db, p.Supervisor, p.Rep);
        Assert.Null(presence.Position);
        Assert.True(presence.LocationHidden);
        Assert.False(presence.OnVisit);
        Assert.Equal(PresenceStatus.NotOnVisit, presence.Status);
        Assert.Empty(db.Dashboards.Positions);
        Assert.Empty(await HistoryAsync(db, p.Supervisor, p.Rep));
        Assert.All(await db.DbAsync(c => c.LocationPoints.Where(x => x.UserId == p.Rep && x.RecordedAt > Now.AddMinutes(-10)).ToListAsync(Ct)),
            point => Assert.True(point.OutsideVisitWindow));
    }

    [Fact]
    public async Task During_a_visit_the_rep_is_shown_live_with_the_doctor_and_disappears_after_the_buffer()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        await DayStartedAsync(db, p.Rep);
        var clinic = await ClinicAsync(db);

        var visit = await CheckInAsync(db, p.Rep, clinic, Now.AddMinutes(-4));
        await SendAsync(db, p.Rep, Now.AddMinutes(-1));

        var onVisit = await PresenceAsync(db, p.Supervisor, p.Rep);
        Assert.True(onVisit.OnVisit);
        Assert.Equal(visit.Id, onVisit.VisitId);
        Assert.Equal("Dr. Demo Clinic", onVisit.VisitCustomerName);
        Assert.NotNull(onVisit.Position);
        Assert.Equal("Dr. Demo Clinic", onVisit.Position!.VisitCustomerName);
        Assert.Null(onVisit.VisibleUntil);
        var pushed = Assert.Single(db.Dashboards.Positions);
        Assert.Equal(visit.Id, pushed.VisitId);

        // Ended two minutes ago: still shown for the rest of the five-minute buffer.
        await CheckOutAsync(db, p.Rep, visit.Id, Now.AddMinutes(-2));
        var justEnded = await PresenceAsync(db, p.Supervisor, p.Rep);
        Assert.NotNull(justEnded.Position);
        Assert.NotNull(justEnded.VisibleUntil);
        Assert.InRange(justEnded.VisibleUntil!.Value, Now.AddMinutes(2), Now.AddMinutes(4));

        // Ended twenty minutes ago: gone, with the end time instead.
        await db.DbAsync(async c =>
        {
            var row = await c.Visits.SingleAsync(v => v.Id == visit.Id, Ct);
            row.CheckOutAt = Now.AddMinutes(-20);
            row.CheckInAt = Now.AddMinutes(-30);
            return await c.SaveChangesAsync(Ct);
        });
        var later = await PresenceAsync(db, p.Supervisor, p.Rep);
        Assert.Null(later.Position);
        Assert.False(later.OnVisit);
        Assert.Equal(PresenceStatus.NotOnVisit, later.Status);
        Assert.NotNull(later.LastVisitEndedAt);
    }

    [Fact]
    public async Task The_trail_holds_only_the_visit_windows_with_their_buffer()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        await DayStartedAsync(db, p.Rep);
        var clinic = await ClinicAsync(db);
        var checkIn = Now.AddMinutes(-90);
        var checkOut = Now.AddMinutes(-60);

        await SendAsync(db, p.Rep,
            checkIn.AddMinutes(-20), checkIn.AddMinutes(-6), checkIn.AddMinutes(-4), checkIn.AddMinutes(10),
            checkOut.AddMinutes(4), checkOut.AddMinutes(6), checkOut.AddMinutes(30));
        var visit = await CheckInAsync(db, p.Rep, clinic, checkIn);
        await CheckOutAsync(db, p.Rep, visit.Id, checkOut);

        var trail = await HistoryAsync(db, p.Supervisor, p.Rep);

        Assert.Equal(
            [checkIn.AddMinutes(-4), checkIn.AddMinutes(10), checkOut.AddMinutes(4)],
            trail.Select(x => x.RecordedAt.ToUniversalTime()).Select(t => t.AddTicks(-(t.Ticks % TimeSpan.TicksPerMillisecond))).ToList(),
            new MillisecondComparer());
    }

    [Fact]
    public async Task Switching_to_all_day_shows_positions_and_trails_as_before()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        await DayStartedAsync(db, p.Rep);
        await SetVisibilityAsync(db, p.Admin, LocationVisibility.AllDay);

        await SendAsync(db, p.Rep, Now.AddMinutes(-3), Now.AddMinutes(-2));

        var presence = await PresenceAsync(db, p.Supervisor, p.Rep);
        Assert.NotNull(presence.Position);
        Assert.False(presence.LocationHidden);
        Assert.NotEqual(PresenceStatus.NotOnVisit, presence.Status);
        Assert.Single(db.Dashboards.Positions);
        Assert.Equal(2, (await HistoryAsync(db, p.Supervisor, p.Rep)).Count);
        Assert.False(await db.DbAsync(c => c.LocationPoints.AnyAsync(x => x.UserId == p.Rep && x.OutsideVisitWindow, Ct)));
        var config = await db.As<TrackingConfigService, TrackingConfigDto>(p.Rep, s => s.GetConfigAsync(p.Rep, Ct));
        Assert.Equal(TrackingCollectionModes.AllDay, config.CollectionMode);
    }

    [Fact]
    public async Task The_app_is_told_to_collect_only_during_visits()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);

        var config = await db.As<TrackingConfigService, TrackingConfigDto>(p.Rep, s => s.GetConfigAsync(p.Rep, Ct));

        Assert.Equal(TrackingCollectionModes.VisitOnly, config.CollectionMode);
    }

    [Fact]
    public async Task Positions_follow_the_viewers_scope()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        await DayStartedAsync(db, p.Rep);
        var visit = await CheckInAsync(db, p.Rep, await ClinicAsync(db), Now.AddMinutes(-3));
        await SendAsync(db, p.Rep, Now.AddMinutes(-1));

        Assert.NotNull((await PresenceAsync(db, p.Area, p.Rep)).Position);
        Assert.NotNull((await PresenceAsync(db, p.Sales, p.Rep)).Position);

        // Another rep sees nobody else, on the map or in a trail.
        var asRepEast = await db.As<TrackingQueryService, IReadOnlyList<RepPresenceDto>>(p.RepEast, s => s.GetPresenceAsync(Ct));
        Assert.DoesNotContain(asRepEast, x => x.UserId == p.Rep);
        Assert.Empty(await HistoryAsync(db, p.RepEast, p.Rep));
        Assert.NotEqual(Guid.Empty, visit.Id);
    }

    [Fact]
    public async Task Integrity_review_shows_only_reason_and_time_outside_a_visit()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        await DayStartedAsync(db, p.Rep);
        var clinic = await ClinicAsync(db);

        // A mock point outside any visit, then one during a visit.
        await db.As<TrackingIngestService, LocationBatchResult>(p.Rep, s => s.IngestAsync(new LocationBatchRequest(
            "test-device", LocationSource.Native, [new LocationPointDto(ClinicLat, ClinicLng, 12, Now.AddMinutes(-60), IsMock: true)]), Ct));
        var visit = await CheckInAsync(db, p.Rep, clinic, Now.AddMinutes(-10));
        await db.As<TrackingIngestService, LocationBatchResult>(p.Rep, s => s.IngestAsync(new LocationBatchRequest(
            "test-device", LocationSource.Native, [new LocationPointDto(ClinicLat, ClinicLng, 12, Now.AddMinutes(-5), IsMock: true)]), Ct));
        var report = await db.As<LocationIntegrityService, IntegrityEventReportResult>(p.Rep, s => s.ReportAsync(
            new IntegrityEventReport("test-device", Now.AddMinutes(-1), ClinicLat, ClinicLng), Ct));

        var events = await db.As<LocationIntegrityService, IReadOnlyList<IntegrityEventDto>>(p.Supervisor, s =>
            s.ListAsync(null, null, p.Rep, null, null, null, Ct));
        var flag = Assert.Single(events, e => e.LocationPointId is not null);
        var detail = await db.As<LocationIntegrityService, IntegrityEventDetailDto>(p.Supervisor, s => s.GetAsync(flag.Id, Ct));

        var outside = detail.Points.Single(x => x.RecordedAt < Now.AddMinutes(-30));
        Assert.True(outside.LocationHidden);
        Assert.Null(outside.Lat);
        Assert.Contains(AnomalyCodes.MockLocation, outside.Codes);
        var inside = detail.Points.Single(x => x.RecordedAt > Now.AddMinutes(-30));
        Assert.False(inside.LocationHidden);
        Assert.Equal(ClinicLat, inside.Lat!.Value, 5);

        var mockReport = Assert.Single(events, e => e.Id == report.FlagId);
        Assert.DoesNotContain(ClinicLat.ToString("0.#####", System.Globalization.CultureInfo.InvariantCulture), mockReport.Details);
        Assert.NotEqual(Guid.Empty, visit.Id);
    }

    [Fact]
    public async Task Points_outside_visits_are_deleted_after_the_grace_period_unless_a_late_visit_or_a_flag_needs_them()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        await ArchiveDemoVisitsAsync(db, p.Rep);
        var clinic = await ClinicAsync(db);
        var old = Now.AddHours(-20);
        var ids = await db.DbAsync(async c =>
        {
            LocationPoint Point(DateTimeOffset at, bool outside) => new()
            {
                UserId = p.Rep, DeviceId = "test-device", Source = LocationSource.Native, Location = GeoFactory.Point(ClinicLat, ClinicLng),
                Accuracy = 10, RecordedAt = at, ReceivedAt = at, OutsideVisitWindow = outside,
            };
            var stray = Point(old, true);
            var covered = Point(old.AddMinutes(30), true);
            var evidence = Point(old.AddMinutes(60), true);
            var recent = Point(Now.AddHours(-1), true);
            var allDay = Point(old.AddMinutes(90), false);
            c.LocationPoints.AddRange(stray, covered, evidence, recent, allDay);
            await c.SaveChangesAsync(Ct);

            // A visit queued offline arrived later and covers one of them; a flag points at another.
            c.Visits.Add(new Visit
            {
                UserId = p.Rep, CustomerId = clinic, DeviceId = "test-device", Status = VisitStatus.Completed,
                CheckInAt = old.AddMinutes(25), CheckInReceivedAt = Now, CheckInLocation = GeoFactory.Point(ClinicLat, ClinicLng),
                CheckOutAt = old.AddMinutes(40), CheckOutReceivedAt = Now,
            });
            c.TrackingFlags.Add(new TrackingFlag
            {
                UserId = p.Rep, Type = TrackingFlagType.MockLocation, Score = 60, LocationPointId = evidence.Id, CreatedAt = Now,
            });
            await c.SaveChangesAsync(Ct);
            return (stray.Id, covered.Id, evidence.Id, recent.Id, allDay.Id);
        });

        var result = await db.As<OutsideVisitPointsPurgeJob, OutsideVisitPointsPurgeJob.PurgeResult>(p.Admin, s => s.RunAsync(Ct));

        Assert.Equal(1, result.Deleted);
        Assert.Equal(1, result.KeptAsVisitPoints);
        var left = await db.DbAsync(c => c.LocationPoints.AsNoTracking().Where(x => x.UserId == p.Rep).ToDictionaryAsync(x => x.Id, Ct));
        Assert.False(left.ContainsKey(ids.Item1));
        Assert.False(left[ids.Item2].OutsideVisitWindow);
        Assert.True(left.ContainsKey(ids.Item3));
        Assert.True(left[ids.Item4].OutsideVisitWindow);
        Assert.True(left.ContainsKey(ids.Item5));
    }

    [Fact]
    public async Task Tracking_is_only_lost_when_a_visit_runs_without_points()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        await DayStartedAsync(db, p.Rep, hoursAgo: 3);
        await db.DbAsync(c => c.Shifts.Where(s => s.UserId == p.Rep && s.Status == ShiftStatus.Active)
            .ExecuteUpdateAsync(set => set.SetProperty(s => s.LastPointAt, Now.AddHours(-2)), Ct));

        await db.As<TrackingLostMonitor>(p.Admin, s => s.RunAsync(Ct));
        Assert.False(await db.DbAsync(c => c.Shifts.AnyAsync(s => s.UserId == p.Rep && s.TrackingLostAt != null, Ct)));

        var visit = await CheckInAsync(db, p.Rep, await ClinicAsync(db), Now.AddMinutes(-50));
        await db.DbAsync(c => c.Visits.Where(v => v.Id == visit.Id)
            .ExecuteUpdateAsync(set => set.SetProperty(v => v.CheckInReceivedAt, Now.AddMinutes(-50)), Ct));
        await db.As<TrackingLostMonitor>(p.Admin, s => s.RunAsync(Ct));
        Assert.True(await db.DbAsync(c => c.Shifts.AnyAsync(s => s.UserId == p.Rep && s.TrackingLostAt != null, Ct)));
    }

    [Fact]
    public async Task An_impossible_trip_between_two_visits_is_flagged_from_the_visits_themselves()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        await DayStartedAsync(db, p.Rep);
        var clinic = await ClinicAsync(db);
        var karim = await DemoPeople.DoctorAsync(db, "Dr. Karim Adel");

        var first = await CheckInAsync(db, p.Rep, clinic, Now.AddMinutes(-40));
        await CheckOutAsync(db, p.Rep, first.Id, Now.AddMinutes(-30));

        // About 45 km away ten minutes later: 270 km/h.
        var second = await CheckInAsync(db, p.Rep, karim, Now.AddMinutes(-20), lat: ClinicLat + 0.4);
        Assert.Contains(AnomalyCodes.ImpossibleSpeed, second.ReviewReasons);
        var flag = await db.DbAsync(c => c.TrackingFlags.AsNoTracking().SingleAsync(f => f.VisitId == second.Id, Ct));
        Assert.Contains(AnomalyCodes.ImpossibleSpeed, flag.Signals);
        Assert.Contains("km/h", flag.Details);
        await CheckOutAsync(db, p.Rep, second.Id, Now.AddMinutes(-15), lat: ClinicLat + 0.4);

        // A plausible drive is not flagged.
        var third = await CheckInAsync(db, p.Rep, clinic, Now.AddMinutes(-5), lat: ClinicLat + 0.39);
        Assert.DoesNotContain(AnomalyCodes.ImpossibleSpeed, third.ReviewReasons);
    }

    private sealed class MillisecondComparer : IEqualityComparer<DateTimeOffset>
    {
        public bool Equals(DateTimeOffset x, DateTimeOffset y) => Math.Abs((x - y).TotalMilliseconds) < 2;

        public int GetHashCode(DateTimeOffset obj) => 0;
    }
}
