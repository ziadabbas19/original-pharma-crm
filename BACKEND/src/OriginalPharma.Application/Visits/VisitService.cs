using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using OriginalPharma.Application.Catalog;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Auditing;
using OriginalPharma.Application.Common.Bulk;
using OriginalPharma.Application.Common.Images;
using OriginalPharma.Application.Common.Organization;
using OriginalPharma.Application.Common.Scoping;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Notifications;
using OriginalPharma.Application.Tracking;
using OriginalPharma.Application.Tracking.Anomalies;
using OriginalPharma.Application.Tracking.Integrity;
using OriginalPharma.Domain.Audit;
using OriginalPharma.Domain.Common;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Domain.Notifications;
using OriginalPharma.Domain.Tracking;
using OriginalPharma.Domain.Visits;

namespace OriginalPharma.Application.Visits;

/// <summary>
/// Visit check-in / check-out with geofence, photo and optional QR verification, plus the visit
/// content: the rep's feedback and the products discussed. Feedback is visible to the rep's
/// reporting line and to anyone whose visits:read scope covers the rep; the supervisor and the
/// manager above them are notified, can mark it seen and reply.
/// </summary>
public sealed class VisitService(
    IAppDbContext db,
    ICurrentUser currentUser,
    IDataScopeResolver scopeResolver,
    IPermissionService permissions,
    IOrgHierarchy hierarchy,
    ProductAccess productAccess,
    NotificationService notifications,
    AuditTrail audit,
    IFileStorage fileStorage,
    IOptions<VisitOptions> options,
    IOptions<TrackingOptions> trackingOptions,
    LocationTrustSettingsService trustSettings,
    IntegrityFlagService flags,
    IOptions<LocationTrustOptions> trustOptions,
    IOptions<AnomalyDetectionOptions> anomalyOptions,
    ITrackingNotifier notifier,
    TimeProvider time)
{
    /// <summary>How many levels of the reporting line are notified of new feedback (supervisor and their manager).</summary>
    public const int FeedbackRecipientLevels = 2;

    private static readonly Dictionary<string, string> PhotoExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ["image/jpeg"] = ".jpg",
        ["image/png"] = ".png",
        ["image/webp"] = ".webp",
    };

    public async Task<VisitRulesDto> RulesAsync(CancellationToken cancellationToken = default)
    {
        var settings = options.Value;
        var trust = await trustSettings.GetAsync(cancellationToken);
        return new VisitRulesDto(settings.MaxAccuracyMeters, trust.AccuracyAllowanceMeters, settings.RejectOutsideGeofence,
            settings.MaxPhotoBytes, settings.ContentEditHours, trust.MaxDistanceFromDoctorMeters, trust.LowTrustAccuracyMeters);
    }

    /// <summary>
    /// Opens a visit. Check-ins arrive from the app's outbox, possibly long after they happened, so the
    /// client key makes retries safe and the shift is the one that was running at the device time.
    /// </summary>
    public async Task<VisitDto> CheckInAsync(CheckInRequest request, CancellationToken cancellationToken = default)
    {
        var userId = currentUser.RequireUserId();
        var settings = options.Value;
        var now = time.GetUtcNow();

        // A retry of a check-in that already reached the server (offline queue, lost response).
        if (await FindCheckInAsync(request.ClientRequestId, userId, cancellationToken) is { } repeated)
        {
            return repeated;
        }

        var checkInAt = NotInTheFuture(request.Timestamp, now);
        var grace = TimeSpan.FromSeconds(trackingOptions.Value.ShiftGraceSeconds);
        var shift = await db.Shifts
                        .Where(s => s.UserId == userId &&
                                    (s.Status == ShiftStatus.Active || (s.StartedAt <= checkInAt + grace && s.EndedAt >= checkInAt - grace)))
                        .OrderByDescending(s => s.StartedAt)
                        .FirstOrDefaultAsync(cancellationToken)
                    ?? throw new BusinessRuleException("no-active-shift", "Start your day before checking in to a visit.");

        if (await HasOpenVisitAsync(userId, cancellationToken))
        {
            throw VisitInProgress();
        }

        var customer = await db.Customers.AsNoTracking().SingleOrDefaultAsync(c => c.Id == request.CustomerId && c.IsActive && c.ArchivedAt == null, cancellationToken)
                       ?? throw new NotFoundException("Customer", request.CustomerId);

        if (request.Accuracy > settings.MaxAccuracyMeters)
        {
            throw new BusinessRuleException("accuracy-too-low", $"Location accuracy is {request.Accuracy:0} m. Move outdoors or wait for a better GPS fix.");
        }

        var trust = await trustSettings.GetAsync(cancellationToken);
        var signals = request.DeviceSignals?.Sanitized();
        var window = TimeSpan.FromMinutes(trustOptions.Value.VisitPointWindowMinutes);
        var suspiciousNearby = await SuspiciousPointsAsync(userId, checkInAt - window, checkInAt + TimeSpan.FromMinutes(5), cancellationToken);
        var quality = VisitLocationHistory.QualityOf(request.IsMock, request.Accuracy, signals, suspiciousNearby, trust);

        // A customer without a saved location never blocks the visit: a good first fix becomes the clinic
        // location, otherwise the visit goes to review and the next visit tries again.
        var outcome = customer.Location is not null ? ClinicLocationOutcome.Compared
            : quality.IsGood ? ClinicLocationOutcome.SavedAsClinic
            : ClinicLocationOutcome.NotSaved;
        var geofence = customer.Location is { } location
            ? GeofenceEvaluator.Evaluate(
                location.Y, location.X, customer.GeofenceRadiusMeters,
                request.Lat, request.Lng, request.Accuracy, trust.AccuracyAllowanceMeters)
            : new GeofenceResult(0, customer.GeofenceRadiusMeters, true);

        if (!geofence.Inside && settings.RejectOutsideGeofence)
        {
            throw new BusinessRuleException("outside-geofence", $"You are {geofence.DistanceMeters:0} m away from this location (allowed {geofence.AllowedMeters:0} m).");
        }

        var qrVerified = false;
        if (!string.IsNullOrWhiteSpace(request.QrPayload))
        {
            qrVerified = QrVerifier.Matches(customer.QrCode, request.QrPayload);
            if (!qrVerified)
            {
                throw new BusinessRuleException("qr-mismatch", "The scanned code does not belong to this location.");
            }
        }

        var visitId = request.ClientRequestId ?? Guid.CreateVersion7();
        var territoryId = await db.Users.Where(u => u.Id == userId).Select(u => u.TerritoryId).SingleAsync(cancellationToken);
        var visitTrust = VisitTrustEvaluator.Evaluate(
            new VisitTrustInput(geofence.DistanceMeters, request.Accuracy, signals, suspiciousNearby), trust);
        double? clinicDistance = outcome == ClinicLocationOutcome.NotSaved ? null : Math.Round(geofence.DistanceMeters, 1);
        var comparison = VisitLocationHistory.Compare(
            request.Lat, request.Lng, checkInAt, await ReferenceFixesAsync(customer.Id, visitId, checkInAt, cancellationToken));
        var drift = VisitLocationHistory.Drift(comparison, clinicDistance, request.Accuracy, trust);

        var reasons = visitTrust.Reasons.ToList();
        var travel = await TravelFromPreviousVisitAsync(userId, visitId, checkInAt, request.Lat, request.Lng, request.Accuracy, trust, cancellationToken);
        if (travel is not null)
        {
            reasons.Add(AnomalyCodes.ImpossibleSpeed);
        }

        if (drift.IsDrift)
        {
            reasons.Add(VisitReviewReasons.LocationDrift);
        }

        if (outcome == ClinicLocationOutcome.NotSaved)
        {
            reasons.Add(VisitReviewReasons.ClinicLocationNotSaved);
        }

        var visit = new Visit
        {
            Id = visitId,
            UserId = userId,
            TerritoryId = territoryId,
            CustomerId = customer.Id,
            ShiftId = shift.Id,
            DeviceId = request.DeviceId,
            CheckInAt = checkInAt,
            CheckInReceivedAt = now,
            CheckInDeviceTime = request.Timestamp.ToUniversalTime(),
            CheckInLocation = GeoFactory.Point(request.Lat, request.Lng),
            CheckInAccuracy = request.Accuracy,
            CheckInDistanceMeters = Math.Round(geofence.DistanceMeters, 1),
            CheckInWithinGeofence = geofence.Inside,
            CheckInIsMock = request.IsMock,
            CheckInSignalCodes = DeviceSignalCodes.From(signals).ToList(),
            CheckInGoodFix = quality.IsGood,
            ClinicLocationOutcome = outcome,
            ClinicDistanceMeters = clinicDistance,
            PreviousVisitId = comparison.PreviousVisitId,
            PreviousVisitDistanceMeters = comparison.PreviousDistanceMeters,
            SincePreviousVisitSeconds = comparison.SincePreviousSeconds,
            MedianDistanceMeters = comparison.MedianDistanceMeters,
            NearestVisitDistanceMeters = comparison.NearestDistanceMeters,
            ReferenceVisitCount = comparison.ReferenceCount,
            LocationDrift = drift.IsDrift,
            DriftSources = drift.Sources.ToList(),
            QrVerified = qrVerified,
            TrustReasons = reasons,
            NeedsReview = request.IsMock || !geofence.Inside || reasons.Count > 0,
        };

        db.Visits.Add(visit);

        var details = outcome switch
        {
            ClinicLocationOutcome.NotSaved =>
                $"Visit check-in at {customer.Name}: no clinic location saved yet, and this fix was not kept as one. " + string.Join(" ", quality.Problems),
            ClinicLocationOutcome.SavedAsClinic => $"Visit check-in at {customer.Name}: first visit, its location became the clinic location.",
            _ => $"Visit check-in at {customer.Name}: {geofence.DistanceMeters:0} m from location.",
        };
        var flag = await RaiseVisitFlagAsync(
            visit, territoryId, request.IsMock, geofence.Inside, visitTrust, signals,
            string.Join(" ", new[] { details }.Concat(drift.Details).Concat(travel is null ? [] : [travel])), cancellationToken);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // Two check-ins at the same moment: the unique indexes let only one of them through.
            if (await FindCheckInAsync(request.ClientRequestId, userId, cancellationToken) is { } winner)
            {
                return winner;
            }

            if (await HasOpenVisitAsync(userId, cancellationToken))
            {
                throw VisitInProgress();
            }

            throw;
        }

        if (outcome == ClinicLocationOutcome.SavedAsClinic)
        {
            await SaveFirstVisitLocationAsync(customer, visit, request, now, trust, cancellationToken);
        }

        if (flag is not null)
        {
            await flags.PublishAsync([flag], cancellationToken);
        }

        if (trust.VisitOnly)
        {
            // Points that arrived before this check-in (queued offline) belong to the visit after all.
            await ClaimPointsAsync(userId, checkInAt - trust.VisitWindowBuffer, now + trust.VisitWindowBuffer, cancellationToken);

            // The live map shows the rep from now on (visit-only visibility).
            await PresenceAsync(userId, PresenceStatus.Online, now, cancellationToken);
        }

        return ToDto(visit, customer.Name, customer.GeofenceRadiusMeters);
    }

    /// <summary>
    /// The speed check between visits: from where the rep's previous visit ended (or started) to this check-in.
    /// With visit-only visibility the phone sends no points between visits, so this keeps the "impossible
    /// speed" check working from the visits themselves. Returns the evidence, or null when plausible.
    /// </summary>
    private async Task<string?> TravelFromPreviousVisitAsync(
        Guid userId,
        Guid visitId,
        DateTimeOffset checkInAt,
        double lat,
        double lng,
        double accuracy,
        LocationTrustSettings trust,
        CancellationToken cancellationToken)
    {
        var previous = await db.Visits.AsNoTracking()
            .Where(v => v.UserId == userId && v.Id != visitId && v.ArchivedAt == null && v.CheckInAt < checkInAt)
            .OrderByDescending(v => v.CheckInAt)
            .Select(v => new { v.CheckInAt, v.CheckInLocation, v.CheckInAccuracy, v.CheckOutAt, v.CheckOutLocation, v.CheckOutAccuracy })
            .FirstOrDefaultAsync(cancellationToken);
        if (previous is null)
        {
            return null;
        }

        // The check-out is the later point, unless it reached the server after this check-in's time.
        var useCheckOut = previous.CheckOutLocation is not null && previous.CheckOutAt is { } outAt && outAt <= checkInAt;
        var from = useCheckOut ? previous.CheckOutLocation! : previous.CheckInLocation;
        var fromAt = useCheckOut ? previous.CheckOutAt!.Value : previous.CheckInAt;
        var fromAccuracy = useCheckOut ? previous.CheckOutAccuracy ?? 0 : previous.CheckInAccuracy;
        var meters = Common.GeoMath.DistanceMeters(from.Y, from.X, lat, lng);
        var seconds = (checkInAt - fromAt).TotalSeconds;
        if (meters <= Math.Max(anomalyOptions.Value.MinJumpMeters, fromAccuracy + accuracy))
        {
            return null;
        }

        var kmh = seconds <= 0 ? double.PositiveInfinity : meters / seconds * 3.6;
        return kmh > trust.MaxSpeedKmh
            ? $"{meters / 1000:0.#} km from the previous visit in {Math.Max(0, seconds) / 60:0} min ({(double.IsInfinity(kmh) ? "no time elapsed" : $"{kmh:0} km/h")})."
            : null;
    }

    /// <summary>Visit-only: points of the rep inside this visit's window are visit points, not waiting for deletion.</summary>
    private Task<int> ClaimPointsAsync(Guid userId, DateTimeOffset from, DateTimeOffset to, CancellationToken cancellationToken) =>
        db.LocationPoints
            .Where(p => p.UserId == userId && p.OutsideVisitWindow && p.RecordedAt >= from && p.RecordedAt <= to)
            .ExecuteUpdateAsync(set => set.SetProperty(p => p.OutsideVisitWindow, false), cancellationToken);

    /// <summary>Tells the dashboards about a visit starting or ending (visit-only visibility). Never throws.</summary>
    private async Task PresenceAsync(Guid userId, PresenceStatus status, DateTimeOffset at, CancellationToken cancellationToken)
    {
        try
        {
            var audience = await hierarchy.GetAudienceAsync(userId, cancellationToken);
            await notifier.PresenceChangedAsync(audience, new PresenceChangeDto(userId, status, at), cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // The map catches up with its next presence refresh.
        }
    }

    /// <summary>
    /// Makes the first good check-in the customer's clinic location, unless someone else saved one in the
    /// meantime (another rep's first visit, or a manager): then this visit is measured against that one.
    /// A saved location is never moved by a later visit; only a manager edit changes it.
    /// </summary>
    private async Task SaveFirstVisitLocationAsync(
        Domain.Crm.Customer customer,
        Visit visit,
        CheckInRequest request,
        DateTimeOffset now,
        LocationTrustSettings trust,
        CancellationToken cancellationToken)
    {
        var point = GeoFactory.Point(request.Lat, request.Lng);
        var claimed = await db.Customers
            .Where(c => c.Id == customer.Id && c.Location == null)
            .ExecuteUpdateAsync(set => set
                .SetProperty(c => c.Location, point)
                .SetProperty(c => c.LocationSource, Domain.Crm.ClinicLocationSource.FirstVisit)
                .SetProperty(c => c.LocationCapturedById, visit.UserId)
                .SetProperty(c => c.LocationCapturedAt, visit.CheckInAt)
                .SetProperty(c => c.LocationAccuracyMeters, request.Accuracy)
                .SetProperty(c => c.LocationVisitId, visit.Id)
                .SetProperty(c => c.UpdatedAt, now), cancellationToken);

        if (claimed == 1)
        {
            await audit.AddAsync(AuditEntities.Customer, customer.Id, AuditAction.Updated, new
            {
                locationSource = Domain.Crm.ClinicLocationSource.FirstVisit,
                visitId = visit.Id,
                lat = request.Lat,
                lng = request.Lng,
                accuracy = request.Accuracy,
            }, cancellationToken: cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
            return;
        }

        var saved = await db.Customers.AsNoTracking().Where(c => c.Id == customer.Id).Select(c => c.Location).SingleAsync(cancellationToken);
        if (saved is null)
        {
            return;
        }

        var geofence = GeofenceEvaluator.Evaluate(
            saved.Y, saved.X, customer.GeofenceRadiusMeters, request.Lat, request.Lng, request.Accuracy, trust.AccuracyAllowanceMeters);
        visit.ClinicLocationOutcome = ClinicLocationOutcome.Compared;
        visit.ClinicDistanceMeters = Math.Round(geofence.DistanceMeters, 1);
        visit.CheckInDistanceMeters = Math.Round(geofence.DistanceMeters, 1);
        visit.CheckInWithinGeofence = geofence.Inside;
        visit.NeedsReview |= !geofence.Inside;
        await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>Earlier visits to the customer whose check-in fix was good, newest first (any rep).</summary>
    private async Task<IReadOnlyList<ReferenceFix>> ReferenceFixesAsync(
        Guid customerId, Guid visitId, DateTimeOffset before, CancellationToken cancellationToken)
    {
        var rows = await db.Visits.AsNoTracking()
            .Where(v => v.CustomerId == customerId && v.Id != visitId && v.CheckInGoodFix && v.ArchivedAt == null && v.CheckInAt < before)
            .OrderByDescending(v => v.CheckInAt)
            .Take(Math.Max(1, trustOptions.Value.MaxReferenceVisits))
            .Select(v => new { v.Id, v.CheckInAt, v.CheckInLocation })
            .ToListAsync(cancellationToken);

        // Coordinates are read after loading: PostGIS has no ST_X/ST_Y for geography columns.
        return rows.Select(v => new ReferenceFix(v.Id, v.CheckInAt, v.CheckInLocation.Y, v.CheckInLocation.X)).ToList();
    }

    /// <summary>
    /// Closes a visit. Never refused for being away from the customer, and a location is not required:
    /// a rep without a signal can still close the visit, which then goes to a supervisor for review.
    /// </summary>
    public async Task<VisitDto> CheckOutAsync(Guid visitId, CheckOutRequest request, CancellationToken cancellationToken = default)
    {
        var userId = currentUser.RequireUserId();
        var visit = await db.Visits.Include(v => v.Customer).Include(v => v.Photos)
                        .SingleOrDefaultAsync(v => v.Id == visitId && v.UserId == userId, cancellationToken)
                    ?? throw new NotFoundException("Visit", visitId);

        if (visit.Status != VisitStatus.InProgress)
        {
            // A retry of the check-out that closed this visit (offline queue, lost response).
            if (request.ClientRequestId is { } key && visit.CheckOutClientRequestId == key)
            {
                return ToDto(visit, visit.Customer?.Name, visit.Customer?.GeofenceRadiusMeters ?? 0);
            }

            throw new ConflictException("visit-not-in-progress", "This visit is already closed.");
        }

        var trust = await trustSettings.GetAsync(cancellationToken);
        var hasFix = request is { Lat: not null, Lng: not null };
        var geofence = hasFix && visit.Customer?.Location is { } location
            ? GeofenceEvaluator.Evaluate(
                location.Y, location.X, visit.Customer.GeofenceRadiusMeters,
                request.Lat!.Value, request.Lng!.Value, request.Accuracy ?? 0, trust.AccuracyAllowanceMeters)
            : null;

        // Leaving before checking out is normal (rep walks to the car), so check-out is never rejected,
        // and only a check-out far beyond the doctor's location is marked.
        var now = time.GetUtcNow();
        var checkOutAt = NotInTheFuture(request.Timestamp, now);
        var signals = request.DeviceSignals?.Sanitized();
        var visitTrust = geofence is null
            ? new VisitTrustResult([], [])
            : VisitTrustEvaluator.Evaluate(
                new VisitTrustInput(geofence.DistanceMeters, request.Accuracy ?? 0, signals,
                    await SuspiciousPointsAsync(userId, visit.CheckInAt, checkOutAt + TimeSpan.FromMinutes(5), cancellationToken)),
                trust);
        visit.Status = VisitStatus.Completed;
        visit.CheckOutAt = checkOutAt < visit.CheckInAt ? visit.CheckInAt : checkOutAt;
        visit.CheckOutReceivedAt = now;
        visit.CheckOutLocation = hasFix ? GeoFactory.Point(request.Lat!.Value, request.Lng!.Value) : null;
        visit.CheckOutAccuracy = hasFix ? request.Accuracy : null;
        visit.CheckOutDistanceMeters = geofence is null ? null : Math.Round(geofence.DistanceMeters, 1);
        visit.CheckOutWithinGeofence = geofence?.Inside;
        visit.CheckOutIsMock = request.IsMock;
        visit.CheckOutDeviceTime = request.Timestamp.ToUniversalTime();
        visit.CheckOutSignalCodes = DeviceSignalCodes.From(signals).ToList();
        visit.CheckOutClientRequestId = request.ClientRequestId;
        visit.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        visit.TrustReasons = visit.TrustReasons.Union(visitTrust.Reasons).ToList();
        visit.NeedsReview |= request.IsMock || !hasFix || visitTrust.Reasons.Count > 0;

        var flag = await RaiseVisitFlagAsync(
            visit, visit.TerritoryId, request.IsMock, inside: true, visitTrust, signals,
            $"Visit check-out at {visit.Customer?.Name}: " +
            (geofence is null ? "no location." : $"{geofence.DistanceMeters:0} m from location."), cancellationToken);

        await db.SaveChangesAsync(cancellationToken);
        if (flag is not null)
        {
            await flags.PublishAsync([flag], cancellationToken);
        }

        if (trust.VisitOnly)
        {
            await ClaimPointsAsync(userId, visit.CheckInAt - trust.VisitWindowBuffer, visit.CheckOutAt!.Value + trust.VisitWindowBuffer, cancellationToken);

            // The marker stays for the buffer after the visit; the map hides it then.
            await PresenceAsync(userId, PresenceStatus.NotOnVisit, now, cancellationToken);
        }

        return ToDto(visit, visit.Customer?.Name, visit.Customer?.GeofenceRadiusMeters ?? 0);
    }

    /// <summary>
    /// One flag per visit for the review page (repeats at check-out extend it). Never refuses anything:
    /// the visit is stored either way.
    /// </summary>
    private async Task<IntegrityFlagOutcome?> RaiseVisitFlagAsync(
        Visit visit,
        Guid? territoryId,
        bool isMock,
        bool inside,
        VisitTrustResult trust,
        DeviceSignalsDto? signals,
        string details,
        CancellationToken cancellationToken)
    {
        var far = trust.Reasons.Contains(VisitReviewReasons.FarFromDoctor);
        var low = trust.Reasons.Contains(VisitReviewReasons.LowTrust);
        // Drift and a missing clinic location are decided at check-in; the check-out does not repeat them.
        var atCheckIn = visit.CheckOutAt is null;
        var drift = atCheckIn && visit.LocationDrift;
        var notSaved = atCheckIn && visit.ClinicLocationOutcome == ClinicLocationOutcome.NotSaved;
        var travel = atCheckIn && visit.TrustReasons.Contains(AnomalyCodes.ImpossibleSpeed);
        if (!isMock && inside && !far && !low && !drift && !notSaved && !travel)
        {
            return null;
        }

        var codes = new List<string>();
        var score = 0;
        if (isMock)
        {
            codes.Add(AnomalyCodes.MockLocation);
            score += AnomalyWeights.MockLocation;
        }

        if (far)
        {
            codes.Add(VisitReviewReasons.FarFromDoctor);
            score += 50;
        }
        else if (!inside)
        {
            codes.Add(VisitReviewReasons.OutsideGeofence);
            score += 30;
        }

        if (low)
        {
            codes.Add(VisitReviewReasons.LowTrust);
            score += 30;
        }

        if (drift)
        {
            codes.Add(VisitReviewReasons.LocationDrift);
            score += 30;
        }

        if (notSaved)
        {
            codes.Add(VisitReviewReasons.ClinicLocationNotSaved);
            score += 10;
        }

        if (travel)
        {
            codes.Add(AnomalyCodes.ImpossibleSpeed);
            score += AnomalyWeights.ImpossibleSpeed;
        }

        codes.AddRange(DeviceSignalCodes.From(signals));
        var type = isMock ? TrackingFlagType.MockLocation
            : far || !inside ? TrackingFlagType.VisitOutsideGeofence
            : TrackingFlagType.VisitLowTrust;
        var text = string.Join(" ", new[] { details }.Concat(trust.Details).Append(DeviceSignalCodes.Describe(signals) ?? string.Empty).Distinct()).Trim();

        return await flags.RaiseAsync(
            new IntegrityFlagRequest(visit.UserId, territoryId, visit.ShiftId, type, Math.Min(100, score), codes, text, VisitId: visit.Id),
            cancellationToken);
    }

    /// <summary>Suspicious or rejected tracking points of the rep in a time window (evidence for "low trust").</summary>
    private Task<int> SuspiciousPointsAsync(Guid userId, DateTimeOffset from, DateTimeOffset to, CancellationToken cancellationToken) =>
        db.LocationPoints.AsNoTracking().CountAsync(
            p => p.UserId == userId && p.RecordedAt >= from && p.RecordedAt <= to && p.TrustStatus != LocationTrustStatus.Trusted,
            cancellationToken);

    /// <param name="clientRequestId">Idempotency key: the same key again returns the photo already stored.</param>
    public async Task<VisitPhotoDto> AddPhotoAsync(
        Guid visitId,
        Stream content,
        string contentType,
        long length,
        CancellationToken cancellationToken = default,
        Guid? clientRequestId = null)
    {
        var userId = currentUser.RequireUserId();
        if (!PhotoExtensions.TryGetValue(contentType, out var extension))
        {
            throw new BusinessRuleException("unsupported-photo-type", "Only JPEG, PNG or WebP photos are accepted.");
        }

        if (length <= 0 || length > options.Value.MaxPhotoBytes)
        {
            throw new BusinessRuleException("photo-too-large", $"Photo must be smaller than {options.Value.MaxPhotoBytes / 1024 / 1024} MB.");
        }

        var visit = await db.Visits.SingleOrDefaultAsync(v => v.Id == visitId && v.UserId == userId, cancellationToken)
                    ?? throw new NotFoundException("Visit", visitId);

        if (clientRequestId is { } key &&
            await db.VisitPhotos.AsNoTracking().SingleOrDefaultAsync(p => p.Id == key && p.VisitId == visit.Id, cancellationToken) is { } stored)
        {
            return ToPhotoDto(stored);
        }

        var path = await fileStorage.SaveAsync(content, $"visits/{visit.Id}", extension, cancellationToken);
        var photo = new VisitPhoto
        {
            VisitId = visit.Id,
            StoragePath = path,
            ContentType = contentType,
            SizeBytes = length,
            UploadedAt = time.GetUtcNow(),
        };
        if (clientRequestId is { } photoId)
        {
            photo.Id = photoId;
        }

        db.VisitPhotos.Add(photo);
        await db.SaveChangesAsync(cancellationToken);

        return ToPhotoDto(photo);
    }

    /// <summary>A proof photo, for anyone who can read the visit.</summary>
    public async Task<VisitPhotoFile> OpenPhotoAsync(Guid visitId, Guid photoId, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var visit = await LoadAsync(visitId, cancellationToken);
        if (!(await AccessAsync(visit, me, cancellationToken)).CanRead)
        {
            throw new NotFoundException("Visit", visitId);
        }

        var photo = await db.VisitPhotos.AsNoTracking().SingleOrDefaultAsync(p => p.Id == photoId && p.VisitId == visitId, cancellationToken)
                    ?? throw new NotFoundException("Photo", photoId);
        var stream = await fileStorage.OpenReadAsync(photo.StoragePath, cancellationToken)
                     ?? throw new NotFoundException("Photo", photoId);
        return new VisitPhotoFile(stream, photo.ContentType);
    }

    private async Task<VisitDto?> FindCheckInAsync(Guid? clientRequestId, Guid userId, CancellationToken cancellationToken)
    {
        if (clientRequestId is not { } id)
        {
            return null;
        }

        var visit = await db.Visits.AsNoTracking().Include(v => v.Customer).Include(v => v.Photos)
            .SingleOrDefaultAsync(v => v.Id == id, cancellationToken);
        if (visit is null)
        {
            return null;
        }

        return visit.UserId == userId
            ? ToDto(visit, visit.Customer?.Name, visit.Customer?.GeofenceRadiusMeters ?? 0)
            : throw new ConflictException("visit-key-in-use", "This visit key cannot be used.");
    }

    private Task<bool> HasOpenVisitAsync(Guid userId, CancellationToken cancellationToken) =>
        db.Visits.AsNoTracking().AnyAsync(v => v.UserId == userId && v.Status == VisitStatus.InProgress && v.ArchivedAt == null, cancellationToken);

    private static ConflictException VisitInProgress() => new("visit-in-progress", "Check out of the current visit first.");

    /// <summary>The device clock says when something happened, but it cannot be ahead of the server.</summary>
    private static DateTimeOffset NotInTheFuture(DateTimeOffset deviceTime, DateTimeOffset now)
    {
        var utc = deviceTime.ToUniversalTime();
        return utc > now ? now : utc;
    }

    /// <summary>
    /// A visit with its content. Readable with a visits:read scope that covers the visit, or by anyone
    /// in the rep's reporting line.
    /// </summary>
    public async Task<VisitDetailDto> GetAsync(Guid visitId, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var visit = await LoadAsync(visitId, cancellationToken);
        var access = await AccessAsync(visit, me, cancellationToken);
        if (!access.CanRead)
        {
            throw new NotFoundException("Visit", visitId);
        }

        return await BuildDetailAsync(visit, me, access, cancellationToken);
    }

    /// <summary>
    /// Replaces the feedback and products of the caller's own visit (visits:feedback) while it is open:
    /// in progress, or within <see cref="VisitOptions.ContentEditHours"/> after check-out. A changed
    /// feedback is announced to the supervisor and their manager.
    /// </summary>
    public async Task<VisitDetailDto> UpdateContentAsync(Guid visitId, UpdateVisitContentRequest request, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var visit = await db.Visits
                        .Include(v => v.Customer)
                        .Include(v => v.Feedback).ThenInclude(f => f!.SeenBy)
                        .Include(v => v.Products)
                        .SingleOrDefaultAsync(v => v.Id == visitId && v.UserId == me, cancellationToken)
                    ?? throw new NotFoundException("Visit", visitId);
        var access = await AccessAsync(visit, me, cancellationToken);

        // A retry, or an edit queued offline before one that already arrived: nothing to do.
        if (request.ClientUpdatedAt is { } clientTime && visit.ContentUpdatedAt is { } applied && clientTime <= applied)
        {
            return await BuildDetailAsync(visit, me, access, cancellationToken);
        }

        if (!access.CanEditContent)
        {
            throw new BusinessRuleException(VisitErrorCodes.ContentClosed, "This visit can no longer be changed.");
        }

        var now = time.GetUtcNow();
        await ApplyProductsAsync(visit, request.Products, me, cancellationToken);
        var feedbackChanged = ApplyFeedback(visit, request.Feedback, now);
        visit.ContentUpdatedAt = request.ClientUpdatedAt?.ToUniversalTime() ?? now;

        await audit.AddAsync(AuditEntities.Visit, visit.Id, AuditAction.Updated, new
        {
            feedback = visit.Feedback is null ? null : new { visit.Feedback.Category, length = visit.Feedback.Text.Length },
            products = visit.Products.Select(p => p.ProductId).ToArray(),
        }, cancellationToken: cancellationToken);

        if (feedbackChanged && visit.Feedback is not null)
        {
            var repName = await NameOfAsync(me, cancellationToken);
            var chain = await hierarchy.GetManagerChainAsync(me, cancellationToken);
            foreach (var recipient in chain.Take(FeedbackRecipientLevels))
            {
                notifications.Queue(recipient, NotificationType.VisitFeedback, visit.Id, new
                {
                    visitId = visit.Id,
                    repName,
                    customerName = visit.Customer!.Name,
                    customerNameAr = visit.Customer.NameAr,
                    category = visit.Feedback.Category,
                    excerpt = Excerpt(visit.Feedback.Text),
                });
            }
        }

        await db.SaveChangesAsync(cancellationToken);
        await notifications.PublishQueuedAsync(cancellationToken);
        return await GetAsync(visit.Id, cancellationToken);
    }

    /// <summary>A short answer to the rep's feedback from someone in the reporting line (or with a wider visits:read scope).</summary>
    public async Task<VisitDetailDto> ReplyAsync(Guid visitId, VisitReplyRequest request, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var visit = await LoadAsync(visitId, cancellationToken);
        var access = await AccessAsync(visit, me, cancellationToken);
        if (!access.CanRead)
        {
            throw new NotFoundException("Visit", visitId);
        }

        if (!access.CanReply)
        {
            throw visit.Feedback is null
                ? new BusinessRuleException(VisitErrorCodes.NoFeedback, "There is no feedback to answer.")
                : new ForbiddenException("Only the rep's reporting line can answer this feedback.");
        }

        var now = time.GetUtcNow();
        var name = await NameOfAsync(me, cancellationToken);
        var reply = new VisitFeedbackReply { VisitId = visit.Id, AuthorId = me, AuthorName = name, Text = request.Text.Trim(), CreatedAt = now };
        db.VisitFeedbackReplies.Add(reply);
        MarkSeen(visit, me, name, now);
        notifications.Queue(visit.UserId, NotificationType.VisitFeedbackReply, visit.Id, new
        {
            visitId = visit.Id,
            authorName = name,
            customerName = visit.Customer!.Name,
            customerNameAr = visit.Customer.NameAr,
            excerpt = Excerpt(reply.Text),
        });
        await audit.AddAsync(AuditEntities.Visit, visit.Id, AuditAction.Updated, new { reply = reply.Id }, cancellationToken: cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        await notifications.MarkEntityReadAsync(me, visit.Id, cancellationToken);
        await notifications.PublishQueuedAsync(cancellationToken);
        return await GetAsync(visit.Id, cancellationToken);
    }

    /// <summary>The caller has read the feedback (also marks their notifications about it as read).</summary>
    public async Task<VisitDetailDto> MarkFeedbackSeenAsync(Guid visitId, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var visit = await LoadAsync(visitId, cancellationToken);
        var access = await AccessAsync(visit, me, cancellationToken);
        if (!access.CanRead)
        {
            throw new NotFoundException("Visit", visitId);
        }

        if (visit.Feedback is null)
        {
            throw new BusinessRuleException(VisitErrorCodes.NoFeedback, "There is no feedback on this visit.");
        }

        if (visit.UserId != me)
        {
            MarkSeen(visit, me, await NameOfAsync(me, cancellationToken), time.GetUtcNow());
            await db.SaveChangesAsync(cancellationToken);
        }

        await notifications.MarkEntityReadAsync(me, visit.Id, cancellationToken);
        return await GetAsync(visit.Id, cancellationToken);
    }

    /// <summary>
    /// Deletes visits (visits:delete within scope). Visits are history, so they are always archived
    /// (hidden from lists and statistics, kept for audit). A visit still in progress is refused.
    /// </summary>
    public async Task<BulkResult> DeleteManyAsync(BulkDeleteRequest request, CancellationToken cancellationToken = default)
    {
        var scope = await scopeResolver.ResolveAsync(Permissions.Visits.Delete, cancellationToken);
        return await ArchiveOrRestoreAsync(request.Ids, scope, archive: true, request.DryRun, cancellationToken);
    }

    public async Task<BulkResult> RestoreManyAsync(BulkIdsRequest request, CancellationToken cancellationToken = default)
    {
        var scope = await scopeResolver.ResolveAsync(Permissions.Visits.Restore, cancellationToken);
        return await ArchiveOrRestoreAsync(request.Ids, scope, archive: false, false, cancellationToken);
    }

    private async Task<BulkResult> ArchiveOrRestoreAsync(IReadOnlyList<Guid> requested, DataScope scope, bool archive, bool dryRun, CancellationToken cancellationToken)
    {
        var me = currentUser.RequireUserId();
        var ids = requested.Distinct().ToArray();
        var visits = await db.Visits.Where(v => ids.Contains(v.Id)).ToDictionaryAsync(v => v.Id, cancellationToken);
        var now = time.GetUtcNow();
        var results = new List<BulkItemResult>();
        foreach (var id in ids)
        {
            if (!visits.TryGetValue(id, out var visit))
            {
                results.Add(new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.NotFound));
                continue;
            }

            var code = !scope.Includes(visit.UserId, visit.TerritoryId) ? BulkCodes.OutOfScope
                : archive && visit.Status == VisitStatus.InProgress ? BulkCodes.VisitInProgress
                : !archive && visit.ArchivedAt is null ? BulkCodes.NotArchived
                : null;
            if (code is not null)
            {
                results.Add(new BulkItemResult(id, BulkOutcome.Blocked, code));
                continue;
            }

            results.Add(new BulkItemResult(id, archive ? BulkOutcome.Archived : BulkOutcome.Restored));
            if (dryRun)
            {
                continue;
            }

            visit.ArchivedAt = archive ? visit.ArchivedAt ?? now : null;
            visit.ArchivedById = archive ? visit.ArchivedById ?? me : null;
            await audit.AddAsync(AuditEntities.Visit, id, archive ? AuditAction.Archived : AuditAction.Restored,
                new { visit.UserId, visit.CustomerId, visit.CheckInAt }, cancellationToken: cancellationToken);
        }

        var result = BulkResult.From(results, dryRun);
        if (!dryRun && result.Done > 0)
        {
            await audit.AddBulkAsync(AuditEntities.Visit, archive ? AuditAction.BulkDelete : AuditAction.BulkRestore, result, cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
        }

        return result;
    }

    private async Task<Visit> LoadAsync(Guid visitId, CancellationToken cancellationToken) =>
        await db.Visits
            .Include(v => v.Customer)
            .Include(v => v.Feedback).ThenInclude(f => f!.SeenBy)
            .Include(v => v.Products)
            .Include(v => v.Replies)
            .SingleOrDefaultAsync(v => v.Id == visitId, cancellationToken)
        ?? throw new NotFoundException("Visit", visitId);

    private async Task<VisitAccess> AccessAsync(Visit visit, Guid me, CancellationToken cancellationToken)
    {
        var effective = await permissions.GetEffectivePermissionsAsync(me, cancellationToken);
        var readScope = await scopeResolver.ResolveAsync(Permissions.Visits.Read, cancellationToken);
        var inReadScope = readScope.Includes(visit.UserId, visit.TerritoryId);
        var inChain = visit.UserId != me && (await hierarchy.GetManagerChainAsync(visit.UserId, cancellationToken)).Contains(me);
        var isRep = visit.UserId == me;
        var live = visit.ArchivedAt is null;

        DateTimeOffset? editableUntil = visit.Status == VisitStatus.Completed && visit.CheckOutAt is { } checkOut
            ? checkOut.AddHours(options.Value.ContentEditHours)
            : null;
        var open = live && (visit.Status == VisitStatus.InProgress ||
                            (visit.Status == VisitStatus.Completed && editableUntil > time.GetUtcNow()));

        // Someone above the rep: the reporting line, or a visits:read scope wider than "own".
        var overseer = !isRep && (inChain || (inReadScope && readScope.Level > PermissionScope.Own));
        return new VisitAccess(
            CanRead: inReadScope || inChain || isRep,
            CanEditContent: isRep && open && effective.Has(Permissions.Visits.Feedback),
            EditableUntil: editableUntil,
            CanReply: overseer && live && visit.Feedback is not null,
            CanSeeOrders: isRep || effective.Has(Permissions.Orders.Read));
    }

    private async Task<VisitDetailDto> BuildDetailAsync(Visit visit, Guid me, VisitAccess access, CancellationToken cancellationToken)
    {
        var repName = await NameOfAsync(visit.UserId, cancellationToken);
        var productIds = visit.Products.Select(p => p.ProductId).ToArray();
        var products = await db.Products.AsNoTracking()
            .Where(p => productIds.Contains(p.Id))
            .Select(p => new { p.Id, p.NameAr, p.NameEn, p.ImageKey, p.ProductLineId })
            .ToDictionaryAsync(p => p.Id, cancellationToken);
        var photos = await db.VisitPhotos.AsNoTracking().Where(p => p.VisitId == visit.Id).OrderBy(p => p.UploadedAt).ToListAsync(cancellationToken);
        var orders = access.CanSeeOrders
            ? await db.Orders.AsNoTracking()
                .Where(o => o.VisitId == visit.Id && o.UserId == visit.UserId && o.ArchivedAt == null)
                .OrderBy(o => o.CreatedAt)
                .Select(o => new VisitOrderDto(o.Id, o.Number, o.Status, o.Total, o.CreatedAt))
                .ToListAsync(cancellationToken)
            : [];
        var feedback = visit.Feedback;

        return new VisitDetailDto(
            visit.Id, visit.UserId, repName, visit.CustomerId, visit.Customer?.Name ?? string.Empty, visit.Customer?.NameAr,
            visit.Customer?.Type ?? Domain.Crm.CustomerType.Doctor, visit.Status, visit.CheckInAt, visit.CheckOutAt,
            visit.CheckInDistanceMeters, visit.CheckInWithinGeofence, visit.CheckOutDistanceMeters, visit.CheckOutWithinGeofence,
            visit.QrVerified, visit.NeedsReview, visit.Notes, photos.Count,
            feedback is null
                ? null
                : new VisitFeedbackDto(feedback.Text, feedback.Category, feedback.CreatedAt, feedback.UpdatedAt,
                    feedback.SeenBy.OrderBy(s => s.SeenAt).Select(s => new VisitFeedbackSeenDto(s.UserId, s.UserName, s.SeenAt)).ToList()),
            visit.Replies.OrderBy(r => r.CreatedAt).Select(r => new VisitReplyDto(r.Id, r.AuthorId, r.AuthorName, r.Text, r.CreatedAt)).ToList(),
            visit.Products.OrderBy(p => p.SortOrder)
                .Where(p => products.ContainsKey(p.ProductId))
                .Select(p =>
                {
                    var product = products[p.ProductId];
                    return new VisitProductDto(p.ProductId, product.NameAr, product.NameEn,
                        ImageService.Url(product.ImageKey, ImageService.Thumbnail), product.ProductLineId, p.Note);
                })
                .ToList(),
            access.CanEditContent,
            access.EditableUntil,
            access.CanReply,
            access.CanReply && feedback is not null && feedback.SeenBy.All(s => s.UserId != me),
            visit.ArchivedAt,
            visit.CheckInReceivedAt,
            visit.CheckInAccuracy,
            visit.CheckInIsMock,
            visit.CheckOutAccuracy,
            visit.CheckOutIsMock,
            visit.Customer?.GeofenceRadiusMeters ?? 0,
            ReasonsFor(visit),
            photos.Select(ToPhotoDto).ToList(),
            orders,
            LocationOf(visit),
            visit.CheckOutLocation?.Y,
            visit.CheckOutLocation?.X,
            visit.Customer?.Location?.Y,
            visit.Customer?.Location?.X);
    }

    private async Task ApplyProductsAsync(Visit visit, IReadOnlyList<VisitProductInput> requested, Guid repId, CancellationToken cancellationToken)
    {
        var kept = visit.Products.Select(p => p.ProductId).ToHashSet();
        var newIds = requested.Select(p => p.ProductId).Where(id => !kept.Contains(id)).Distinct().ToArray();
        if (newIds.Length > 0)
        {
            var visibleLines = await productAccess.VisibleLineIdsAsync(repId, cancellationToken);
            var allowed = await ProductAccess.WhereVisible(db.Products.AsNoTracking(), visibleLines)
                .Where(p => newIds.Contains(p.Id) && p.IsActive && p.ArchivedAt == null)
                .Select(p => p.Id)
                .ToListAsync(cancellationToken);
            if (allowed.Count != newIds.Length)
            {
                throw new BusinessRuleException(VisitErrorCodes.ProductUnavailable, "One of the products is not available to you.")
                {
                    Details = new Dictionary<string, object?> { ["productId"] = newIds.Except(allowed).First() },
                };
            }
        }

        var byId = visit.Products.ToDictionary(p => p.ProductId);
        var wanted = requested.Select(p => p.ProductId).ToHashSet();
        foreach (var removed in visit.Products.Where(p => !wanted.Contains(p.ProductId)).ToList())
        {
            visit.Products.Remove(removed);
            db.VisitProducts.Remove(removed);
        }

        var order = 0;
        foreach (var input in requested)
        {
            var note = string.IsNullOrWhiteSpace(input.Note) ? null : input.Note.Trim();
            if (byId.TryGetValue(input.ProductId, out var existing))
            {
                existing.Note = note;
                existing.SortOrder = order++;
            }
            else
            {
                var row = new VisitProduct { VisitId = visit.Id, ProductId = input.ProductId, Note = note, SortOrder = order++ };
                visit.Products.Add(row);
                db.VisitProducts.Add(row);
            }
        }
    }

    /// <summary>Returns true when the feedback is new or its text or category changed (seen markers are reset then).</summary>
    private bool ApplyFeedback(Visit visit, VisitFeedbackInput? input, DateTimeOffset now)
    {
        if (input is null)
        {
            if (visit.Feedback is null)
            {
                return false;
            }

            db.VisitFeedback.Remove(visit.Feedback);
            visit.Feedback = null;
            return false;
        }

        var text = input.Text.Trim();
        if (visit.Feedback is null)
        {
            visit.Feedback = new VisitFeedback { VisitId = visit.Id, Text = text, Category = input.Category, CreatedAt = now, UpdatedAt = now };
            db.VisitFeedback.Add(visit.Feedback);
            return true;
        }

        if (visit.Feedback.Text == text && visit.Feedback.Category == input.Category)
        {
            return false;
        }

        visit.Feedback.Text = text;
        visit.Feedback.Category = input.Category;
        visit.Feedback.UpdatedAt = now;
        db.VisitFeedbackSeen.RemoveRange(visit.Feedback.SeenBy);
        visit.Feedback.SeenBy.Clear();
        return true;
    }

    private void MarkSeen(Visit visit, Guid userId, string name, DateTimeOffset now)
    {
        if (visit.Feedback is null || visit.Feedback.SeenBy.Any(s => s.UserId == userId))
        {
            return;
        }

        var seen = new VisitFeedbackSeen { VisitId = visit.Id, UserId = userId, UserName = name, SeenAt = now };
        visit.Feedback.SeenBy.Add(seen);
        db.VisitFeedbackSeen.Add(seen);
    }

    private async Task<string> NameOfAsync(Guid userId, CancellationToken cancellationToken) =>
        await db.Users.AsNoTracking().Where(u => u.Id == userId).Select(u => u.FullName).SingleOrDefaultAsync(cancellationToken) ?? string.Empty;

    private static string Excerpt(string text) => text.Length <= 140 ? text : text[..137] + "...";

    private sealed record VisitAccess(bool CanRead, bool CanEditContent, DateTimeOffset? EditableUntil, bool CanReply, bool CanSeeOrders);

    /// <summary>Upper bound for one list response until the list gets server paging.</summary>
    public const int MaxListRows = 1000;

    private static readonly TimeSpan MaxListRange = TimeSpan.FromDays(31);

    /// <summary>Visits in the caller's visits:read scope, newest first. Defaults to the last 7 days.</summary>
    public async Task<IReadOnlyList<VisitListItemDto>> ListAsync(
        DateTimeOffset? from,
        DateTimeOffset? to,
        Guid? userId,
        VisitStatus? status,
        bool? needsReview,
        CancellationToken cancellationToken = default,
        bool mine = false,
        Guid? productId = null,
        Domain.Visits.VisitFeedbackCategory? feedbackCategory = null,
        bool? hasFeedback = null,
        bool archived = false,
        bool? locationDrift = null)
    {
        var toUtc = (to ?? time.GetUtcNow()).ToUniversalTime();
        var fromUtc = (from ?? toUtc.AddDays(-7)).ToUniversalTime();
        if (toUtc <= fromUtc || toUtc - fromUtc > MaxListRange)
        {
            throw new BusinessRuleException("invalid-range", "Range must be positive and at most 31 days.");
        }

        var scope = await scopeResolver.ResolveAsync(Permissions.Visits.Read, cancellationToken);
        var query = db.Visits.AsNoTracking()
            .WhereInScope(scope)
            .Where(v => v.CheckInAt >= fromUtc && v.CheckInAt < toUtc)
            .Where(v => archived ? v.ArchivedAt != null : v.ArchivedAt == null);

        if (mine)
        {
            var me = currentUser.RequireUserId();
            query = query.Where(v => v.UserId == me);
        }

        if (productId is not null)
        {
            query = query.Where(v => v.Products.Any(p => p.ProductId == productId));
        }

        if (feedbackCategory is not null)
        {
            query = query.Where(v => v.Feedback != null && v.Feedback.Category == feedbackCategory);
        }

        if (hasFeedback is not null)
        {
            query = query.Where(v => (v.Feedback != null) == hasFeedback);
        }

        if (userId is not null)
        {
            query = query.Where(v => v.UserId == userId);
        }

        if (status is not null)
        {
            query = query.Where(v => v.Status == status);
        }

        if (needsReview is not null)
        {
            query = query.Where(v => v.NeedsReview == needsReview);
        }

        if (locationDrift is not null)
        {
            query = query.Where(v => v.LocationDrift == locationDrift);
        }

        var rows = await query
            .OrderByDescending(v => v.CheckInAt)
            .Take(MaxListRows)
            .Select(v => new
            {
                v.Id,
                v.UserId,
                UserName = db.Users.Where(u => u.Id == v.UserId).Select(u => u.FullName).FirstOrDefault() ?? string.Empty,
                v.CustomerId,
                CustomerName = v.Customer!.Name,
                CustomerNameAr = v.Customer.NameAr,
                CustomerType = v.Customer.Type,
                v.Status,
                v.CheckInAt,
                v.CheckInDistanceMeters,
                v.CheckInWithinGeofence,
                v.CheckOutAt,
                v.CheckOutDistanceMeters,
                v.CheckOutWithinGeofence,
                v.QrVerified,
                v.NeedsReview,
                PhotoCount = v.Photos.Count,
                v.CheckInAccuracy,
                v.CheckInIsMock,
                v.CheckOutIsMock,
                HasCheckOutLocation = v.CheckOutLocation != null,
                v.TrustReasons,
                ProductIds = v.Products.Select(p => p.ProductId).ToList(),
                HasFeedback = v.Feedback != null,
                FeedbackCategory = v.Feedback != null ? v.Feedback.Category : null,
                ProductCount = v.Products.Count,
                ReplyCount = v.Replies.Count,
                v.ArchivedAt,
                v.CheckInLocation,
                v.CheckInSignalCodes,
                v.ClinicLocationOutcome,
                v.ClinicDistanceMeters,
                v.PreviousVisitDistanceMeters,
                v.SincePreviousVisitSeconds,
                v.MedianDistanceMeters,
                v.NearestVisitDistanceMeters,
                v.ReferenceVisitCount,
                v.CheckInGoodFix,
                v.LocationDrift,
                v.DriftSources,
            })
            .ToListAsync(cancellationToken);

        return rows
            .Select(v => new VisitListItemDto(
                v.Id, v.UserId, v.UserName, v.CustomerId, v.CustomerName, v.CustomerNameAr, v.CustomerType, v.Status,
                v.CheckInAt, v.CheckInDistanceMeters, v.CheckInWithinGeofence, v.CheckOutAt, v.CheckOutDistanceMeters,
                v.CheckOutWithinGeofence, v.QrVerified, v.NeedsReview, v.PhotoCount, v.CheckInAccuracy, v.CheckInIsMock,
                v.ProductIds,
                VisitReviewReasons.For(v.CheckInWithinGeofence, v.CheckInIsMock, v.CheckOutIsMock, v.CheckOutAt is not null, v.HasCheckOutLocation, v.TrustReasons),
                v.HasFeedback, v.FeedbackCategory, v.ProductCount, v.ReplyCount, v.ArchivedAt,
                new VisitLocationDto(
                    v.CheckInLocation.Y, v.CheckInLocation.X, v.CheckInAccuracy, v.CheckInIsMock, v.CheckInSignalCodes,
                    v.ClinicLocationOutcome, v.ClinicDistanceMeters, v.PreviousVisitDistanceMeters, v.SincePreviousVisitSeconds,
                    v.MedianDistanceMeters, v.NearestVisitDistanceMeters, v.ReferenceVisitCount, v.CheckInGoodFix,
                    v.LocationDrift, v.DriftSources)))
            .ToList();
    }

    private static IReadOnlyList<string> ReasonsFor(Visit v) =>
        VisitReviewReasons.For(v.CheckInWithinGeofence, v.CheckInIsMock, v.CheckOutIsMock, v.CheckOutAt is not null, v.CheckOutLocation is not null, v.TrustReasons);

    private static VisitPhotoDto ToPhotoDto(VisitPhoto p) =>
        new(p.Id, p.ContentType, p.SizeBytes, p.UploadedAt, $"/api/visits/{p.VisitId}/photos/{p.Id}");

    private static VisitDto ToDto(Visit v, string? customerName, int geofenceRadiusMeters) => new(
        v.Id, v.CustomerId, customerName, v.UserId, v.Status,
        v.CheckInAt, v.CheckInDistanceMeters, v.CheckInWithinGeofence,
        v.CheckOutAt, v.CheckOutDistanceMeters, v.CheckOutWithinGeofence,
        v.QrVerified, v.NeedsReview,
        v.Photos.Select(ToPhotoDto).ToList(),
        v.CheckInAccuracy, geofenceRadiusMeters, ReasonsFor(v), v.ClinicLocationOutcome);

    private static VisitLocationDto LocationOf(Visit v) => new(
        v.CheckInLocation.Y, v.CheckInLocation.X, v.CheckInAccuracy, v.CheckInIsMock, v.CheckInSignalCodes,
        v.ClinicLocationOutcome, v.ClinicDistanceMeters, v.PreviousVisitDistanceMeters, v.SincePreviousVisitSeconds,
        v.MedianDistanceMeters, v.NearestVisitDistanceMeters, v.ReferenceVisitCount, v.CheckInGoodFix, v.LocationDrift,
        v.DriftSources);
}
