using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Crm;
using OriginalPharma.Application.Tracking.Integrity;
using OriginalPharma.Application.Visits;
using OriginalPharma.Domain.Crm;
using OriginalPharma.Domain.Tracking;
using OriginalPharma.Domain.Visits;

namespace OriginalPharma.Tests.Integration;

/// <summary>
/// Doctors without a saved location: the first good visit saves it, later visits are compared with it and
/// with every earlier visit, and nothing ever blocks the rep.
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class ClinicLocationTests(PostgresFixture postgres)
{
    /// <summary>Somewhere in Heliopolis, where the demo's Dr. Karim Adel (no saved location) works.</summary>
    private const double KarimLat = 30.0890;
    private const double KarimLng = 31.3240;
    private const double MetresPerDegree = 111_195;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static Task<Guid> KarimAsync(TestDatabase db) => DemoPeople.DoctorAsync(db, "Dr. Karim Adel");

    private static double North(double meters) => KarimLat + meters / MetresPerDegree;

    /// <summary>Checks in and out again at once, so the next visit can start.</summary>
    private static async Task<VisitDto> VisitAsync(
        TestDatabase db,
        Guid rep,
        Guid doctor,
        double lat = KarimLat,
        double accuracy = 12,
        bool mock = false,
        DeviceSignalsDto? signals = null,
        DateTimeOffset? at = null)
    {
        var visit = await db.As<VisitService, VisitDto>(rep, s => s.CheckInAsync(
            new CheckInRequest(doctor, "test-device", lat, KarimLng, accuracy, at ?? DateTimeOffset.UtcNow, mock, null, Guid.NewGuid(), signals), Ct));
        await db.As<VisitService, VisitDto>(rep, s => s.CheckOutAsync(visit.Id, new CheckOutRequest(
            lat, KarimLng, accuracy, DateTimeOffset.UtcNow, mock, null, Guid.NewGuid()), Ct));
        return visit;
    }

    private static Task<Customer> DoctorRowAsync(TestDatabase db, Guid id) =>
        db.DbAsync(c => c.Customers.AsNoTracking().SingleAsync(x => x.Id == id, Ct));

    private static Task<Visit> VisitRowAsync(TestDatabase db, Guid id) =>
        db.DbAsync(c => c.Visits.AsNoTracking().SingleAsync(v => v.Id == id, Ct));

    private static Task ClearFlagsAsync(TestDatabase db, Guid rep) =>
        db.DbAsync(c => c.TrackingFlags.Where(f => f.UserId == rep).ExecuteDeleteAsync(Ct));

    /// <summary>Only the first demo rep has a day running; this starts one for anyone else.</summary>
    private static Task DayRunningAsync(TestDatabase db, Guid rep) =>
        db.DbAsync(async c =>
        {
            var territory = await c.Users.Where(u => u.Id == rep).Select(u => u.TerritoryId).SingleAsync(Ct);
            c.Shifts.Add(new Shift
            {
                UserId = rep, TerritoryId = territory, DeviceId = "test-device", Source = LocationSource.Native,
                StartedAt = DateTimeOffset.UtcNow.AddHours(-4),
            });
            return await c.SaveChangesAsync(Ct);
        });

    [Fact]
    public async Task A_new_doctor_needs_no_location_and_its_first_visit_saves_one()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var town = await DemoPeople.TerritoryAsync(db, "T-HLP");
        var specialty = await DemoPeople.SpecialtyAsync(db, "Cardiology");

        var doctor = await db.As<DoctorService, DoctorDto>(p.Rep, s => s.CreateAsync(new CreateDoctorRequest("Dr. New Clinic", null, town, specialty), Ct));
        Assert.Null(doctor.Lat);

        var visit = await VisitAsync(db, p.Rep, doctor.Id, accuracy: 18);

        Assert.Equal(ClinicLocationOutcome.SavedAsClinic, visit.ClinicLocationOutcome);
        Assert.False(visit.NeedsReview);
        var saved = await DoctorRowAsync(db, doctor.Id);
        Assert.NotNull(saved.Location);
        Assert.Equal(KarimLat, saved.Location!.Y, 6);
        Assert.Equal(ClinicLocationSource.FirstVisit, saved.LocationSource);
        Assert.Equal(p.Rep, saved.LocationCapturedById);
        Assert.Equal(18, saved.LocationAccuracyMeters);
        Assert.Equal(visit.Id, saved.LocationVisitId);
        Assert.NotNull(saved.LocationCapturedAt);

        var stored = await VisitRowAsync(db, visit.Id);
        Assert.Equal(0, stored.ClinicDistanceMeters);
        Assert.True(stored.CheckInGoodFix);
        Assert.Equal(18, stored.CheckInAccuracy);
        Assert.NotNull(stored.CheckInDeviceTime);

        var dto = await db.As<DoctorService, DoctorDto>(p.Supervisor, s => s.GetAsync(doctor.Id, Ct));
        Assert.Equal(ClinicLocationSource.FirstVisit, dto.LocationSource);
        Assert.Equal("Demo Rep", dto.LocationCapturedByName);
    }

    [Fact]
    public async Task A_mock_first_visit_is_accepted_for_review_without_saving_and_the_next_good_visit_saves_it()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var karim = await KarimAsync(db);
        await ClearFlagsAsync(db, p.Rep);

        var mocked = await VisitAsync(db, p.Rep, karim, mock: true);

        Assert.Equal(ClinicLocationOutcome.NotSaved, mocked.ClinicLocationOutcome);
        Assert.True(mocked.NeedsReview);
        Assert.Contains(VisitReviewReasons.ClinicLocationNotSaved, mocked.ReviewReasons);
        Assert.Null((await DoctorRowAsync(db, karim)).Location);
        var flag = await db.DbAsync(c => c.TrackingFlags.AsNoTracking().SingleAsync(f => f.VisitId == mocked.Id, Ct));
        Assert.Contains(VisitReviewReasons.ClinicLocationNotSaved, flag.Signals);
        Assert.Contains(AnomalyCodesOf.Mock, flag.Signals);
        Assert.Null((await VisitRowAsync(db, mocked.Id)).ClinicDistanceMeters);

        var good = await VisitAsync(db, p.Rep, karim, lat: North(20));

        Assert.Equal(ClinicLocationOutcome.SavedAsClinic, good.ClinicLocationOutcome);
        Assert.Equal(good.Id, (await DoctorRowAsync(db, karim)).LocationVisitId);
    }

    [Fact]
    public async Task A_weak_or_spoofed_fix_never_becomes_the_clinic_location()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var karim = await KarimAsync(db);
        await db.AsAsync(p.Admin, async sp =>
        {
            var service = sp.GetRequiredService<LocationTrustSettingsService>();
            var d = service.Defaults();
            await service.UpdateAsync(new UpdateLocationTrustSettingsRequest(
                d.MaxSpeedKmh, d.MaxDistanceFromDoctorMeters, d.AccuracyAllowanceMeters, LowTrustAccuracyMeters: 40,
                d.PerfectAccuracyMeters, d.RepeatedAccuracyRun, d.MockPolicy, d.DeviceSignalsRetentionDays), Ct);
        });

        var weak = await VisitAsync(db, p.Rep, karim, accuracy: 60);
        var spoofApp = await VisitAsync(db, p.Rep, karim, signals: new DeviceSignalsDto(Platform: "android", MockLocationAppSelected: true));

        Assert.Equal(ClinicLocationOutcome.NotSaved, weak.ClinicLocationOutcome);
        Assert.Equal(ClinicLocationOutcome.NotSaved, spoofApp.ClinicLocationOutcome);
        Assert.Null((await DoctorRowAsync(db, karim)).Location);
        Assert.False((await VisitRowAsync(db, weak.Id)).CheckInGoodFix);
    }

    [Fact]
    public async Task Later_visits_are_checked_against_the_saved_location_which_never_moves_by_itself()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var karim = await KarimAsync(db);
        var first = await VisitAsync(db, p.Rep, karim, at: DateTimeOffset.UtcNow.AddMinutes(-90));
        await DayRunningAsync(db, p.RepEast);

        var far = await VisitAsync(db, p.RepEast, karim, lat: North(700));

        Assert.Equal(ClinicLocationOutcome.Compared, far.ClinicLocationOutcome);
        Assert.False(far.CheckInWithinGeofence);
        Assert.InRange(far.CheckInDistanceMeters, 690, 710);
        Assert.Contains(VisitReviewReasons.FarFromDoctor, far.ReviewReasons);
        Assert.Contains(VisitReviewReasons.LocationDrift, far.ReviewReasons);

        var clinic = await DoctorRowAsync(db, karim);
        Assert.Equal(KarimLat, clinic.Location!.Y, 6);
        Assert.Equal(first.Id, clinic.LocationVisitId);
    }

    [Fact]
    public async Task Each_visit_stores_its_distance_from_the_previous_visit_the_median_and_the_nearest_one()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var karim = await KarimAsync(db);
        var start = DateTimeOffset.UtcNow.AddHours(-2);

        await VisitAsync(db, p.Rep, karim, lat: North(0), at: start);
        var second = await VisitAsync(db, p.Rep, karim, lat: North(30), at: start.AddMinutes(20));
        await VisitAsync(db, p.Rep, karim, lat: North(10), at: start.AddMinutes(40));
        var fourth = await VisitAsync(db, p.Rep, karim, lat: North(16), at: start.AddMinutes(60));

        var two = await VisitRowAsync(db, second.Id);
        Assert.Equal(1, two.ReferenceVisitCount);
        Assert.Null(two.MedianDistanceMeters);
        Assert.InRange(two.PreviousVisitDistanceMeters!.Value, 29, 31);

        // Earlier visits at 0, 30 and 10 m: the median is 10 m north, the previous one 10 m, the nearest 6 m away.
        var four = await VisitRowAsync(db, fourth.Id);
        Assert.Equal(3, four.ReferenceVisitCount);
        Assert.InRange(four.MedianDistanceMeters!.Value, 5, 7);
        Assert.InRange(four.PreviousVisitDistanceMeters!.Value, 5, 7);
        Assert.InRange(four.NearestVisitDistanceMeters!.Value, 5, 7);
        Assert.Equal(20 * 60, four.SincePreviousVisitSeconds);
        Assert.InRange(four.ClinicDistanceMeters!.Value, 15, 17);
        Assert.False(four.LocationDrift);
        Assert.False(fourth.NeedsReview);
    }

    [Fact]
    public async Task Drift_from_the_earlier_visits_is_flagged_for_review_but_never_blocks()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var karim = await KarimAsync(db);
        var start = DateTimeOffset.UtcNow.AddHours(-2);
        await VisitAsync(db, p.Rep, karim, lat: North(0), at: start);
        await VisitAsync(db, p.Rep, karim, lat: North(10), at: start.AddMinutes(20));
        await VisitAsync(db, p.Rep, karim, lat: North(5), at: start.AddMinutes(40));
        await ClearFlagsAsync(db, p.Rep);

        // 260 m away: inside the 500 m "far from doctor" limit, beyond the 150 m drift limits.
        var drifted = await VisitAsync(db, p.Rep, karim, lat: North(260), accuracy: 10, at: start.AddMinutes(60));

        Assert.True(drifted.NeedsReview);
        Assert.Contains(VisitReviewReasons.LocationDrift, drifted.ReviewReasons);
        Assert.DoesNotContain(VisitReviewReasons.FarFromDoctor, drifted.ReviewReasons);
        var stored = await VisitRowAsync(db, drifted.Id);
        Assert.Equal([VisitLocationHistory.FromClinic, VisitLocationHistory.FromMedian, VisitLocationHistory.FromPrevious], stored.DriftSources);
        var flag = await db.DbAsync(c => c.TrackingFlags.AsNoTracking().SingleAsync(f => f.VisitId == drifted.Id, Ct));
        Assert.Equal(TrackingFlagType.VisitOutsideGeofence, flag.Type);
        Assert.Contains(VisitReviewReasons.LocationDrift, flag.Signals);
        Assert.Contains("median of 3 earlier visits", flag.Details);

        var listed = await db.As<VisitService, IReadOnlyList<VisitListItemDto>>(p.Supervisor, s =>
            s.ListAsync(null, null, null, null, null, Ct, locationDrift: true));
        Assert.Equal([drifted.Id], listed.Select(v => v.Id));
        Assert.True(listed[0].Location!.LocationDrift);

        // A drifted fix is still a good fix: it stays a reference, but one outlier does not move the median.
        var back = await VisitAsync(db, p.Rep, karim, lat: North(8), at: start.AddMinutes(80));
        var backRow = await VisitRowAsync(db, back.Id);
        Assert.Equal(4, backRow.ReferenceVisitCount);
        Assert.InRange(backRow.MedianDistanceMeters!.Value, 0, 4);
        Assert.Equal([VisitLocationHistory.FromPrevious], backRow.DriftSources);
    }

    [Fact]
    public async Task Only_a_manager_moves_the_clinic_location_and_then_it_is_theirs()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var karim = await KarimAsync(db);
        await VisitAsync(db, p.Rep, karim);
        var doctor = await db.As<DoctorService, DoctorDto>(p.Supervisor, s => s.GetAsync(karim, Ct));
        var request = new UpdateDoctorRequest(doctor.Name, doctor.NameAr, doctor.TownId!.Value, doctor.SpecialtyId!.Value);

        await Assert.ThrowsAsync<ForbiddenException>(() => db.As<DoctorService, DoctorDto>(p.Rep, s =>
            s.UpdateAsync(karim, request with { Location = new DoctorLocationInput(North(100), KarimLng) }, Ct)));
        var unchanged = await db.As<DoctorService, DoctorDto>(p.Rep, s => s.UpdateAsync(karim, request with { Notes = "Second floor" }, Ct));
        Assert.Equal(ClinicLocationSource.FirstVisit, unchanged.LocationSource);

        var moved = await db.As<DoctorService, DoctorDto>(p.Admin, s =>
            s.UpdateAsync(karim, request with { Location = new DoctorLocationInput(North(100), KarimLng) }, Ct));

        Assert.Equal(ClinicLocationSource.ManagerSet, moved.LocationSource);
        Assert.Null(moved.LocationVisitId);
        Assert.Null(moved.LocationAccuracyMeters);
        Assert.Equal(p.Admin, (await DoctorRowAsync(db, karim)).LocationCapturedById);
    }

    [Fact]
    public async Task The_location_history_follows_the_callers_scope()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var karim = await KarimAsync(db);
        var start = DateTimeOffset.UtcNow.AddHours(-2);
        await DayRunningAsync(db, p.RepEast);
        var seeded = await db.DbAsync(c => c.Visits.CountAsync(v => v.CustomerId == karim && v.UserId == p.Rep, Ct));
        var mine = await VisitAsync(db, p.Rep, karim, at: start);
        var other = await VisitAsync(db, p.RepEast, karim, lat: North(12), at: start.AddMinutes(30));
        await VisitAsync(db, p.Rep, karim, lat: North(6), at: start.AddMinutes(60));

        var supervisor = await db.As<DoctorService, DoctorLocationHistoryDto>(p.Supervisor, s => s.LocationHistoryAsync(karim, Ct));
        Assert.Equal(seeded + 3, supervisor.Visits.Count);
        Assert.Equal(KarimLat, supervisor.Lat!.Value, 6);
        Assert.Equal(ClinicLocationSource.FirstVisit, supervisor.LocationSource);
        Assert.Equal(mine.Id, supervisor.LocationVisitId);
        Assert.NotNull(supervisor.MedianLat);
        Assert.Contains(supervisor.Visits, v => v.VisitId == other.Id && v.RepName == "Demo Rep East");

        var sales = await db.As<DoctorService, DoctorLocationHistoryDto>(p.Sales, s => s.LocationHistoryAsync(karim, Ct));
        Assert.Equal(seeded + 3, sales.Visits.Count);

        // The rep sees their own visits only. The other rep does not have the doctor on their list: the
        // shared directory entry without the saved location, and their own visit only.
        var rep = await db.As<DoctorService, DoctorLocationHistoryDto>(p.Rep, s => s.LocationHistoryAsync(karim, Ct));
        Assert.Equal(seeded + 2, rep.Visits.Count);
        Assert.All(rep.Visits, v => Assert.Equal(p.Rep, v.RepId));
        var outsider = await db.As<DoctorService, DoctorLocationHistoryDto>(p.RepEast, s => s.LocationHistoryAsync(karim, Ct));
        Assert.Null(outsider.Lat);
        Assert.Null(outsider.LocationSource);
        Assert.Equal(new[] { other.Id }, outsider.Visits.Select(v => v.VisitId));
    }

    [Fact]
    public async Task The_drift_limits_are_location_trust_settings_with_defaults_from_configuration()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);

        var defaults = await db.As<LocationTrustSettingsService, LocationTrustSettingsDto>(p.Admin, s => s.GetDtoAsync(Ct));
        Assert.Equal(150, defaults.DriftFromClinicMeters);
        Assert.Equal(150, defaults.DriftFromVisitsMeters);

        var saved = await db.AsAsync(p.Admin, async sp =>
        {
            var service = sp.GetRequiredService<LocationTrustSettingsService>();
            var d = service.Defaults();
            return await service.UpdateAsync(new UpdateLocationTrustSettingsRequest(
                d.MaxSpeedKmh, d.MaxDistanceFromDoctorMeters, d.AccuracyAllowanceMeters, d.LowTrustAccuracyMeters,
                d.PerfectAccuracyMeters, d.RepeatedAccuracyRun, d.MockPolicy, d.DeviceSignalsRetentionDays, 300, 250), Ct);
        });
        Assert.Equal(300, saved.DriftFromClinicMeters);
        Assert.Equal(250, saved.DriftFromVisitsMeters);

        // An older dashboard that does not send them keeps the saved values.
        var kept = await db.AsAsync(p.Admin, async sp =>
        {
            var service = sp.GetRequiredService<LocationTrustSettingsService>();
            var d = service.Defaults();
            return await service.UpdateAsync(new UpdateLocationTrustSettingsRequest(
                d.MaxSpeedKmh, 600, d.AccuracyAllowanceMeters, d.LowTrustAccuracyMeters,
                d.PerfectAccuracyMeters, d.RepeatedAccuracyRun, d.MockPolicy, d.DeviceSignalsRetentionDays), Ct);
        });
        Assert.Equal(300, kept.DriftFromClinicMeters);
        Assert.Equal(600, kept.MaxDistanceFromDoctorMeters);
    }

    private static class AnomalyCodesOf
    {
        public const string Mock = Application.Tracking.Anomalies.AnomalyCodes.MockLocation;
    }
}
