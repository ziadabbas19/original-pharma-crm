using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Scoping;
using OriginalPharma.Application.Identity;
using OriginalPharma.Domain.Common;
using OriginalPharma.Domain.Tracking;
using OriginalPharma.Domain.Visits;

namespace OriginalPharma.Application.Visits;

/// <summary>Visit check-in / check-out with geofence, photo and optional QR verification.</summary>
public sealed class VisitService(
    IAppDbContext db,
    ICurrentUser currentUser,
    IDataScopeResolver scopeResolver,
    IFileStorage fileStorage,
    IOptions<VisitOptions> options,
    TimeProvider time)
{
    private static readonly Dictionary<string, string> PhotoExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ["image/jpeg"] = ".jpg",
        ["image/png"] = ".png",
        ["image/webp"] = ".webp",
    };

    public async Task<VisitDto> CheckInAsync(CheckInRequest request, CancellationToken cancellationToken = default)
    {
        var userId = currentUser.RequireUserId();
        var settings = options.Value;
        var now = time.GetUtcNow();

        var shift = await db.Shifts
                        .Where(s => s.UserId == userId && s.Status == ShiftStatus.Active)
                        .OrderByDescending(s => s.StartedAt)
                        .FirstOrDefaultAsync(cancellationToken)
                    ?? throw new BusinessRuleException("no-active-shift", "Start your day before checking in to a visit.");

        if (await db.Visits.AnyAsync(v => v.UserId == userId && v.Status == VisitStatus.InProgress, cancellationToken))
        {
            throw new ConflictException("visit-in-progress", "Check out of the current visit first.");
        }

        var customer = await db.Customers.AsNoTracking().SingleOrDefaultAsync(c => c.Id == request.CustomerId && c.IsActive, cancellationToken)
                       ?? throw new NotFoundException("Customer", request.CustomerId);

        if (customer.Location is null)
        {
            throw new BusinessRuleException("customer-location-missing", "This customer has no saved location yet.");
        }

        if (request.Accuracy > settings.MaxAccuracyMeters)
        {
            throw new BusinessRuleException("accuracy-too-low", $"Location accuracy is {request.Accuracy:0} m. Move outdoors or wait for a better GPS fix.");
        }

        var geofence = GeofenceEvaluator.Evaluate(
            customer.Location.Y, customer.Location.X, customer.GeofenceRadiusMeters,
            request.Lat, request.Lng, request.Accuracy, settings.MaxAccuracyAllowanceMeters);

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

        var territoryId = await db.Users.Where(u => u.Id == userId).Select(u => u.TerritoryId).SingleAsync(cancellationToken);
        var visit = new Visit
        {
            UserId = userId,
            TerritoryId = territoryId,
            CustomerId = customer.Id,
            ShiftId = shift.Id,
            DeviceId = request.DeviceId,
            CheckInAt = request.Timestamp.ToUniversalTime(),
            CheckInReceivedAt = now,
            CheckInLocation = GeoFactory.Point(request.Lat, request.Lng),
            CheckInAccuracy = request.Accuracy,
            CheckInDistanceMeters = Math.Round(geofence.DistanceMeters, 1),
            CheckInWithinGeofence = geofence.Inside,
            CheckInIsMock = request.IsMock,
            QrVerified = qrVerified,
            NeedsReview = request.IsMock || !geofence.Inside,
        };
        db.Visits.Add(visit);

        if (request.IsMock || !geofence.Inside)
        {
            db.TrackingFlags.Add(new TrackingFlag
            {
                UserId = userId,
                TerritoryId = territoryId,
                ShiftId = shift.Id,
                Type = request.IsMock ? TrackingFlagType.MockLocation : TrackingFlagType.VisitOutsideGeofence,
                Score = request.IsMock ? 60 : 30,
                Signals = request.IsMock ? ["mock-location"] : ["outside-geofence"],
                Details = $"Visit check-in at {customer.Name}: {geofence.DistanceMeters:0} m from location.",
                CreatedAt = now,
            });
        }

        await db.SaveChangesAsync(cancellationToken);
        return ToDto(visit, customer.Name);
    }

    public async Task<VisitDto> CheckOutAsync(Guid visitId, CheckOutRequest request, CancellationToken cancellationToken = default)
    {
        var userId = currentUser.RequireUserId();
        var visit = await db.Visits.Include(v => v.Customer).Include(v => v.Photos)
                        .SingleOrDefaultAsync(v => v.Id == visitId && v.UserId == userId, cancellationToken)
                    ?? throw new NotFoundException("Visit", visitId);

        if (visit.Status != VisitStatus.InProgress)
        {
            throw new ConflictException("visit-not-in-progress", "This visit is already closed.");
        }

        var location = visit.Customer!.Location!;
        var geofence = GeofenceEvaluator.Evaluate(
            location.Y, location.X, visit.Customer.GeofenceRadiusMeters,
            request.Lat, request.Lng, request.Accuracy, options.Value.MaxAccuracyAllowanceMeters);

        // Leaving before checking out is normal (rep walks to the car), so check-out is never rejected.
        visit.Status = VisitStatus.Completed;
        visit.CheckOutAt = request.Timestamp.ToUniversalTime();
        visit.CheckOutReceivedAt = time.GetUtcNow();
        visit.CheckOutLocation = GeoFactory.Point(request.Lat, request.Lng);
        visit.CheckOutAccuracy = request.Accuracy;
        visit.CheckOutDistanceMeters = Math.Round(geofence.DistanceMeters, 1);
        visit.CheckOutWithinGeofence = geofence.Inside;
        visit.CheckOutIsMock = request.IsMock;
        visit.Notes = request.Notes;
        visit.NeedsReview |= request.IsMock;

        await db.SaveChangesAsync(cancellationToken);
        return ToDto(visit, visit.Customer.Name);
    }

    public async Task<VisitPhotoDto> AddPhotoAsync(Guid visitId, Stream content, string contentType, long length, CancellationToken cancellationToken = default)
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

        var path = await fileStorage.SaveAsync(content, $"visits/{visit.Id}", extension, cancellationToken);
        var photo = new VisitPhoto
        {
            VisitId = visit.Id,
            StoragePath = path,
            ContentType = contentType,
            SizeBytes = length,
            UploadedAt = time.GetUtcNow(),
        };
        db.VisitPhotos.Add(photo);
        await db.SaveChangesAsync(cancellationToken);

        return new VisitPhotoDto(photo.Id, photo.ContentType, photo.SizeBytes, photo.UploadedAt);
    }

    public async Task<VisitDto> GetAsync(Guid visitId, CancellationToken cancellationToken = default)
    {
        var scope = await scopeResolver.ResolveAsync(Permissions.Visits.Read, cancellationToken);
        var visit = await db.Visits.AsNoTracking()
                        .WhereInScope(scope)
                        .Include(v => v.Customer)
                        .Include(v => v.Photos)
                        .SingleOrDefaultAsync(v => v.Id == visitId, cancellationToken)
                    ?? throw new NotFoundException("Visit", visitId);

        return ToDto(visit, visit.Customer?.Name);
    }

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
        CancellationToken cancellationToken = default)
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
            .Where(v => v.CheckInAt >= fromUtc && v.CheckInAt < toUtc);

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

        return await query
            .OrderByDescending(v => v.CheckInAt)
            .Take(MaxListRows)
            .Select(v => new VisitListItemDto(
                v.Id,
                v.UserId,
                db.Users.Where(u => u.Id == v.UserId).Select(u => u.FullName).FirstOrDefault() ?? string.Empty,
                v.CustomerId,
                v.Customer!.Name,
                v.Customer.NameAr,
                v.Customer.Type,
                v.Status,
                v.CheckInAt,
                v.CheckInDistanceMeters,
                v.CheckInWithinGeofence,
                v.CheckOutAt,
                v.CheckOutDistanceMeters,
                v.CheckOutWithinGeofence,
                v.QrVerified,
                v.NeedsReview,
                v.Photos.Count))
            .ToListAsync(cancellationToken);
    }

    private static VisitDto ToDto(Visit v, string? customerName) => new(
        v.Id, v.CustomerId, customerName, v.UserId, v.Status,
        v.CheckInAt, v.CheckInDistanceMeters, v.CheckInWithinGeofence,
        v.CheckOutAt, v.CheckOutDistanceMeters, v.CheckOutWithinGeofence,
        v.QrVerified, v.NeedsReview,
        v.Photos.Select(p => new VisitPhotoDto(p.Id, p.ContentType, p.SizeBytes, p.UploadedAt)).ToList());
}
