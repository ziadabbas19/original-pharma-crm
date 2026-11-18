using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Crm;
using OriginalPharma.Application.Orders;
using OriginalPharma.Application.Visits;
using OriginalPharma.Domain.Orders;
using OriginalPharma.Domain.Tracking;
using OriginalPharma.Domain.Visits;

namespace OriginalPharma.Tests.Integration;

/// <summary>Check-in and check-out as the rep app's outbox sends them: retried, late and out of signal.</summary>
[Collection(PostgresCollection.Name)]
public sealed class VisitCheckInTests(PostgresFixture postgres)
{
    private const double ClinicLat = 30.0561;
    private const double ClinicLng = 31.3301;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static Task<Guid> ClinicAsync(TestDatabase db) => DemoPeople.DoctorAsync(db, "Dr. Demo Clinic");

    private static Task<VisitDto> CheckInAsync(
        TestDatabase db,
        Guid rep,
        Guid customer,
        Guid? key = null,
        double lat = ClinicLat,
        double accuracy = 12,
        DateTimeOffset? at = null,
        bool mock = false) =>
        db.As<VisitService, VisitDto>(rep, s => s.CheckInAsync(
            new CheckInRequest(customer, "test-device", lat, ClinicLng, accuracy, at ?? DateTimeOffset.UtcNow, mock, null, key), Ct));

    private static Task<VisitDto> CheckOutAsync(TestDatabase db, Guid rep, Guid visit, Guid? key = null, double? lat = ClinicLat, string? notes = null) =>
        db.As<VisitService, VisitDto>(rep, s => s.CheckOutAsync(visit, new CheckOutRequest(
            lat, lat is null ? null : ClinicLng, lat is null ? null : 15, DateTimeOffset.UtcNow, false, notes, key), Ct));

    private static Task<int> OpenVisitsAsync(TestDatabase db, Guid rep) =>
        db.DbAsync(c => c.Visits.CountAsync(v => v.UserId == rep && v.Status == VisitStatus.InProgress, Ct));

    [Fact]
    public async Task The_same_check_in_key_twice_creates_one_visit()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var clinic = await ClinicAsync(db);
        var key = Guid.NewGuid();
        var before = await db.DbAsync(c => c.Visits.CountAsync(v => v.UserId == p.Rep, Ct));

        var first = await CheckInAsync(db, p.Rep, clinic, key);
        var retry = await CheckInAsync(db, p.Rep, clinic, key);

        Assert.Equal(key, first.Id);
        Assert.Equal(first.Id, retry.Id);
        Assert.Equal(first.CheckInAt.ToUnixTimeMilliseconds(), retry.CheckInAt.ToUnixTimeMilliseconds());
        Assert.Equal(before + 1, await db.DbAsync(c => c.Visits.CountAsync(v => v.UserId == p.Rep, Ct)));
    }

    [Fact]
    public async Task The_same_check_in_key_at_the_same_moment_creates_one_visit()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var clinic = await ClinicAsync(db);
        var key = Guid.NewGuid();

        var results = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => CheckInAsync(db, p.Rep, clinic, key)));

        Assert.All(results, r => Assert.Equal(key, r.Id));
        Assert.Equal(1, await OpenVisitsAsync(db, p.Rep));
    }

    [Fact]
    public async Task A_second_visit_is_blocked_while_one_is_in_progress()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var clinic = await ClinicAsync(db);
        var first = await CheckInAsync(db, p.Rep, clinic, Guid.NewGuid());

        var blocked = await Assert.ThrowsAsync<ConflictException>(() => CheckInAsync(db, p.Rep, clinic, Guid.NewGuid()));
        Assert.Equal("visit-in-progress", blocked.Code);

        await CheckOutAsync(db, p.Rep, first.Id, Guid.NewGuid());
        var next = await CheckInAsync(db, p.Rep, clinic, Guid.NewGuid());
        Assert.Equal(VisitStatus.InProgress, next.Status);
    }

    [Fact]
    public async Task Two_different_check_ins_at_the_same_moment_leave_one_open_visit()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var clinic = await ClinicAsync(db);

        var attempts = await Task.WhenAll(Enumerable.Range(0, 4).Select(async _ =>
        {
            try
            {
                await CheckInAsync(db, p.Rep, clinic, Guid.NewGuid());
                return null;
            }
            catch (ConflictException conflict)
            {
                return conflict.Code;
            }
        }));

        Assert.Equal(1, attempts.Count(code => code is null));
        Assert.All(attempts.Where(code => code is not null), code => Assert.Equal("visit-in-progress", code));
        Assert.Equal(1, await OpenVisitsAsync(db, p.Rep));
    }

    [Fact]
    public async Task An_offline_check_in_that_syncs_after_the_day_ended_keeps_its_device_time()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var clinic = await ClinicAsync(db);
        var startedAt = DateTimeOffset.UtcNow.AddHours(-3);
        var shiftId = await db.DbAsync(async c =>
        {
            var shift = await c.Shifts.Where(s => s.UserId == p.Rep && s.Status == ShiftStatus.Active).SingleAsync(Ct);
            shift.StartedAt = startedAt;
            shift.Status = ShiftStatus.Ended;
            shift.EndedAt = DateTimeOffset.UtcNow.AddMinutes(-30);
            await c.SaveChangesAsync(Ct);
            return shift.Id;
        });
        var happenedAt = DateTimeOffset.UtcNow.AddHours(-2);

        var visit = await CheckInAsync(db, p.Rep, clinic, Guid.NewGuid(), at: happenedAt);

        var stored = await db.DbAsync(c => c.Visits.AsNoTracking().SingleAsync(v => v.Id == visit.Id, Ct));
        Assert.Equal(shiftId, stored.ShiftId);
        Assert.Equal(happenedAt.ToUnixTimeSeconds(), stored.CheckInAt.ToUnixTimeSeconds());
        Assert.True(stored.CheckInReceivedAt > stored.CheckInAt.AddHours(1));

        // The check-out queued behind it follows, and the whole visit is on the rep's list.
        await CheckOutAsync(db, p.Rep, visit.Id, Guid.NewGuid());
        var mine = await db.As<VisitService, IReadOnlyList<VisitListItemDto>>(p.Rep, s => s.ListAsync(
            DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddMinutes(1), null, null, null, Ct, mine: true));
        Assert.Equal(VisitStatus.Completed, mine.Single(v => v.Id == visit.Id).Status);
    }

    [Fact]
    public async Task A_check_in_outside_any_working_day_is_refused()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var clinic = await ClinicAsync(db);

        var refused = await Assert.ThrowsAsync<BusinessRuleException>(() =>
            CheckInAsync(db, p.RepEast, clinic, Guid.NewGuid(), at: DateTimeOffset.UtcNow.AddDays(-20)));
        Assert.Equal("no-active-shift", refused.Code);
    }

    [Fact]
    public async Task A_device_clock_ahead_of_the_server_cannot_date_a_visit_in_the_future()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var clinic = await ClinicAsync(db);

        var visit = await CheckInAsync(db, p.Rep, clinic, Guid.NewGuid(), at: DateTimeOffset.UtcNow.AddHours(3));

        Assert.True(visit.CheckInAt <= DateTimeOffset.UtcNow);
    }

    [Fact]
    public async Task The_same_check_out_key_twice_closes_the_visit_once()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var clinic = await ClinicAsync(db);
        var visit = await CheckInAsync(db, p.Rep, clinic, Guid.NewGuid());
        var key = Guid.NewGuid();

        var first = await CheckOutAsync(db, p.Rep, visit.Id, key, notes: "Left the leaflet");
        var retry = await CheckOutAsync(db, p.Rep, visit.Id, key, notes: "Left the leaflet");

        Assert.Equal(VisitStatus.Completed, retry.Status);
        Assert.Equal(first.CheckOutAt!.Value.ToUnixTimeMilliseconds(), retry.CheckOutAt!.Value.ToUnixTimeMilliseconds());

        var other = await Assert.ThrowsAsync<ConflictException>(() => CheckOutAsync(db, p.Rep, visit.Id, Guid.NewGuid()));
        Assert.Equal("visit-not-in-progress", other.Code);
    }

    [Fact]
    public async Task A_check_in_outside_the_geofence_is_kept_and_flagged_for_review()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var clinic = await ClinicAsync(db);

        var visit = await CheckInAsync(db, p.Rep, clinic, Guid.NewGuid(), lat: ClinicLat + 0.004);

        Assert.False(visit.CheckInWithinGeofence);
        Assert.True(visit.NeedsReview);
        Assert.InRange(visit.CheckInDistanceMeters, 400, 500);
        Assert.Equal([VisitReviewReasons.OutsideGeofence], visit.ReviewReasons);

        var detail = await db.As<VisitService, VisitDetailDto>(p.Supervisor, s => s.GetAsync(visit.Id, Ct));
        Assert.Equal(12, detail.CheckInAccuracy);
        Assert.Equal(150, detail.GeofenceRadiusMeters);
        Assert.Equal([VisitReviewReasons.OutsideGeofence], detail.ReviewReasons);
        Assert.True(await db.DbAsync(c => c.TrackingFlags.AnyAsync(f => f.UserId == p.Rep && f.Type == TrackingFlagType.VisitOutsideGeofence, Ct)));
    }

    [Fact]
    public async Task A_mock_location_is_kept_and_flagged_for_review()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var clinic = await ClinicAsync(db);

        var visit = await CheckInAsync(db, p.Rep, clinic, Guid.NewGuid(), mock: true);

        Assert.True(visit.NeedsReview);
        Assert.Equal([VisitReviewReasons.MockLocation], visit.ReviewReasons);
        Assert.True((await db.As<VisitService, VisitDetailDto>(p.Supervisor, s => s.GetAsync(visit.Id, Ct))).CheckInIsMock);
    }

    [Fact]
    public async Task A_customer_without_a_location_and_a_weak_fix_are_refused_with_their_own_codes()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);

        var noLocation = await Assert.ThrowsAsync<BusinessRuleException>(async () =>
            await CheckInAsync(db, p.Rep, await DemoPeople.DoctorAsync(db, "Dr. Karim Adel"), Guid.NewGuid()));
        Assert.Equal("customer-location-missing", noLocation.Code);

        var weak = await Assert.ThrowsAsync<BusinessRuleException>(async () =>
            await CheckInAsync(db, p.Rep, await ClinicAsync(db), Guid.NewGuid(), accuracy: 400));
        Assert.Equal("accuracy-too-low", weak.Code);
        Assert.Equal(0, await OpenVisitsAsync(db, p.Rep));
    }

    [Fact]
    public async Task A_check_out_without_a_signal_closes_the_visit_and_flags_it()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var clinic = await ClinicAsync(db);
        var visit = await CheckInAsync(db, p.Rep, clinic, Guid.NewGuid());

        var closed = await CheckOutAsync(db, p.Rep, visit.Id, Guid.NewGuid(), lat: null, notes: "No signal in the basement clinic");

        Assert.Equal(VisitStatus.Completed, closed.Status);
        Assert.Null(closed.CheckOutDistanceMeters);
        Assert.True(closed.NeedsReview);
        Assert.Equal([VisitReviewReasons.NoCheckOutLocation], closed.ReviewReasons);
        Assert.Equal("No signal in the basement clinic",
            (await db.As<VisitService, VisitDetailDto>(p.Rep, s => s.GetAsync(visit.Id, Ct))).Notes);
    }

    [Fact]
    public async Task Content_stays_editable_for_the_window_after_check_out_only()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var clinic = await ClinicAsync(db);
        var visit = await CheckInAsync(db, p.Rep, clinic, Guid.NewGuid());
        await CheckOutAsync(db, p.Rep, visit.Id, Guid.NewGuid());

        var open = await db.As<VisitService, VisitDetailDto>(p.Rep, s => s.GetAsync(visit.Id, Ct));
        Assert.True(open.CanEditContent);
        Assert.NotNull(open.ContentEditableUntil);

        await db.DbAsync(c => c.Visits.Where(v => v.Id == visit.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(v => v.CheckOutAt, DateTimeOffset.UtcNow.AddHours(-25)), Ct));
        var closed = await Assert.ThrowsAsync<BusinessRuleException>(() => db.As<VisitService, VisitDetailDto>(p.Rep, s =>
            s.UpdateContentAsync(visit.Id, new UpdateVisitContentRequest(new VisitFeedbackInput("Too late"), [], DateTimeOffset.UtcNow), Ct)));
        Assert.Equal(VisitErrorCodes.ContentClosed, closed.Code);
    }

    [Fact]
    public async Task An_order_taken_in_a_visit_is_linked_even_when_it_arrives_before_the_check_in()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var clinic = await ClinicAsync(db);
        var product = await DemoPeople.ProductAsync(db, "Cardiolin 5 mg, 30 tablets");
        var cash = await DemoPeople.MethodAsync(db, "Cash");
        var key = Guid.NewGuid();

        var order = await db.As<OrderService, OrderDto>(p.Rep, s => s.CreateAsync(new CreateOrderRequest(
            Guid.NewGuid(), DateOnly.FromDateTime(DateTime.UtcNow), PlaceType.Pharmacy, "Dr. Demo Clinic",
            [new OrderLineInput(product, 2)], clinic, cash, VisitId: key), Ct));
        await CheckInAsync(db, p.Rep, clinic, key);

        Assert.Equal(key, order.VisitId);
        var detail = await db.As<VisitService, VisitDetailDto>(p.Rep, s => s.GetAsync(key, Ct));
        Assert.Equal(order.Id, detail.Orders.Single().Id);
        Assert.Single((await db.As<VisitService, VisitDetailDto>(p.Supervisor, s => s.GetAsync(key, Ct))).Orders);
    }

    [Fact]
    public async Task A_proof_photo_retried_with_its_key_is_stored_once_and_read_only_by_the_reporting_line()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var clinic = await ClinicAsync(db);
        var visit = await CheckInAsync(db, p.Rep, clinic, Guid.NewGuid());
        var bytes = new byte[] { 0xFF, 0xD8, 0xFF, 0xD9 };
        var key = Guid.NewGuid();

        Task<VisitPhotoDto> UploadAsync() => db.As<VisitService, VisitPhotoDto>(p.Rep, s =>
            s.AddPhotoAsync(visit.Id, new MemoryStream(bytes), "image/jpeg", bytes.Length, Ct, key));
        var first = await UploadAsync();
        var retry = await UploadAsync();

        Assert.Equal(first.Id, retry.Id);
        var detail = await db.As<VisitService, VisitDetailDto>(p.Supervisor, s => s.GetAsync(visit.Id, Ct));
        Assert.Equal(first.Url, detail.Photos.Single().Url);

        var file = await db.As<VisitService, VisitPhotoFile>(p.Supervisor, s => s.OpenPhotoAsync(visit.Id, first.Id, Ct));
        await file.Content.DisposeAsync();
        Assert.Equal("image/jpeg", file.ContentType);
        await Assert.ThrowsAsync<NotFoundException>(() => db.As<VisitService, VisitPhotoFile>(p.RepEast, s => s.OpenPhotoAsync(visit.Id, first.Id, Ct)));
    }

    [Fact]
    public async Task A_rep_sees_the_pharmacies_in_the_towns_of_their_area_but_not_other_reps_doctors()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);

        var visible = await db.As<CustomerService, IReadOnlyList<CustomerDto>>(p.Rep, s => s.ListAsync(null, null, false, Ct));

        Assert.Contains(visible, c => c.Name == "Demo Pharmacy");
        Assert.DoesNotContain(visible, c => c.Name == "Dr. Rania Hassan");
    }

    [Fact]
    public async Task Only_a_manager_can_change_the_saved_location_of_a_doctor()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var id = await DemoPeople.DoctorAsync(db, "Dr. Karim Adel");
        var doctor = await db.As<DoctorService, DoctorDto>(p.Rep, s => s.GetAsync(id, Ct));
        UpdateDoctorRequest Update(DoctorLocationInput? location) =>
            new(doctor.Name, doctor.NameAr, doctor.TownId!.Value, doctor.SpecialtyId!.Value, Location: location);

        await Assert.ThrowsAsync<ForbiddenException>(() => db.As<DoctorService, DoctorDto>(p.Rep, s =>
            s.UpdateAsync(id, Update(new DoctorLocationInput(30.1, 31.3)), Ct)));

        var saved = await db.As<DoctorService, DoctorDto>(p.Area, s => s.UpdateAsync(id, Update(new DoctorLocationInput(30.1, 31.3, 200)), Ct));
        Assert.Equal((30.1, 31.3, 200), (saved.Lat, saved.Lng, saved.GeofenceRadiusMeters));

        // A rep editing their own doctor without touching the location keeps it.
        var edited = await db.As<DoctorService, DoctorDto>(p.Rep, s => s.UpdateAsync(id, Update(null), Ct));
        Assert.Equal(30.1, edited.Lat);
    }
}
