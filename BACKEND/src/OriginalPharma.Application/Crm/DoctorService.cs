using FluentValidation;
using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Auditing;
using OriginalPharma.Application.Common.Bulk;
using OriginalPharma.Application.Common.Organization;
using OriginalPharma.Application.Common.Scoping;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Visits;
using OriginalPharma.Domain.Audit;
using OriginalPharma.Domain.Common;
using OriginalPharma.Domain.Crm;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Domain.Visits;

namespace OriginalPharma.Application.Crm;

/// <param name="OutsideArea">The doctor's town is not inside this rep's area (a warning, never a block).</param>
public sealed record DoctorRepDto(Guid Id, string FullName, bool OutsideArea);

/// <param name="Reps">Reps (visible to the caller) who have the doctor on their list.</param>
/// <param name="OnMyList">The doctor is on the caller's own list.</param>
/// <param name="OutsideMyArea">The doctor's town is outside the caller's area.</param>
public sealed record DoctorDto(
    Guid Id,
    string Name,
    string? NameAr,
    Guid? TownId,
    string? TownName,
    string? TownNameAr,
    Guid? AreaId,
    Guid? SpecialtyId,
    string? SpecialtyNameAr,
    string? SpecialtyNameEn,
    string? Phone,
    string? Notes,
    bool IsActive,
    IReadOnlyList<DoctorRepDto> Reps,
    bool OnMyList,
    bool OutsideMyArea,
    DateTimeOffset? ArchivedAt = null,
    double? Lat = null,
    double? Lng = null,
    int GeofenceRadiusMeters = 150,
    ClinicLocationSource? LocationSource = null,
    DateTimeOffset? LocationCapturedAt = null,
    string? LocationCapturedByName = null,
    double? LocationAccuracyMeters = null,
    Guid? LocationVisitId = null);

/// <summary>A visit to the doctor as the location history shows it.</summary>
public sealed record DoctorVisitLocationDto(
    Guid VisitId,
    Guid RepId,
    string RepName,
    DateTimeOffset CheckInAt,
    VisitStatus Status,
    bool NeedsReview,
    IReadOnlyList<string> ReviewReasons,
    VisitLocationDto Location);

/// <summary>
/// The clinic location of a doctor with every visit in the caller's visits:read scope, newest first
/// (at most <see cref="DoctorService.MaxLocationHistoryVisits"/>).
/// </summary>
/// <param name="MedianLat">Median position of the visits with a good fix (null with fewer than two).</param>
/// <param name="Capped">More visits exist than are listed.</param>
public sealed record DoctorLocationHistoryDto(
    Guid DoctorId,
    string Name,
    string? NameAr,
    double? Lat,
    double? Lng,
    int GeofenceRadiusMeters,
    ClinicLocationSource? LocationSource,
    DateTimeOffset? LocationCapturedAt,
    string? LocationCapturedByName,
    double? LocationAccuracyMeters,
    Guid? LocationVisitId,
    double? MedianLat,
    double? MedianLng,
    IReadOnlyList<DoctorVisitLocationDto> Visits,
    bool Capped);

/// <param name="Mine">Only the caller's own list (the rep app).</param>
/// <param name="RepId">Only this rep's list (must be in the caller's scope).</param>
/// <param name="Unassigned">Only doctors that are on nobody's list.</param>
/// <param name="Archived">Only archived (deleted) doctors.</param>
public sealed record DoctorQuery(
    bool Mine = false,
    Guid? RepId = null,
    Guid? TownId = null,
    Guid? AreaId = null,
    Guid? SpecialtyId = null,
    string? Search = null,
    bool Unassigned = false,
    bool IncludeInactive = false,
    bool Archived = false);

/// <param name="RepId">List to add the new doctor to. Defaults to the caller; another rep needs customers:assign.</param>
public sealed record CreateDoctorRequest(
    string Name,
    string? NameAr,
    Guid TownId,
    Guid SpecialtyId,
    string? Phone = null,
    string? Notes = null,
    Guid? RepId = null);

/// <summary>Where the clinic is, for the visit geofence. Leave both coordinates empty to keep no location.</summary>
public sealed record DoctorLocationInput(double? Lat, double? Lng, int GeofenceRadiusMeters = 150);

/// <param name="Location">
/// Null leaves the saved location as it is. Changing it needs customers:manage: a rep must not be able
/// to move the clinic to wherever they are standing.
/// </param>
public sealed record UpdateDoctorRequest(
    string Name,
    string? NameAr,
    Guid TownId,
    Guid SpecialtyId,
    string? Phone = null,
    string? Notes = null,
    bool IsActive = true,
    DoctorLocationInput? Location = null);

public enum AssignMode
{
    /// <summary>Add to the target list; the source list keeps the doctors.</summary>
    Copy = 1,

    /// <summary>Add to the target list and remove from the source list.</summary>
    Move = 2,
}

/// <param name="FromRepId">Source list. Required to move; when copying without it the doctors must be visible to the caller.</param>
public sealed record AssignDoctorsRequest(IReadOnlyList<Guid> DoctorIds, Guid ToRepId, AssignMode Mode, Guid? FromRepId = null);

/// <param name="OutsideAreaCount">Assigned doctors whose town is outside the target rep's area.</param>
public sealed record AssignDoctorsResult(int Added, int AlreadyOnList, int Removed, int OutsideAreaCount);

public static class DoctorErrorCodes
{
    /// <summary>A doctor with the same name already exists in that town; the response carries <c>doctorId</c>.</summary>
    public const string Exists = "doctor_exists";

    public const string TownInvalid = "doctor_town_invalid";
    public const string SpecialtyInvalid = "doctor_specialty_invalid";
    public const string NotOnList = "doctor_not_on_list";
}

/// <summary>
/// Reps' personal doctor lists. A doctor is stored once; <see cref="RepDoctor"/> rows put it on
/// reps' lists. Reading follows customers:read: own = the caller's list, team/territory = the
/// lists of the reps in scope (territory also covers doctors in its towns), all = everything.
/// </summary>
public sealed class DoctorService(
    IAppDbContext db,
    ICurrentUser currentUser,
    IDataScopeResolver scopeResolver,
    IPermissionService permissions,
    AuditTrail audit,
    TimeProvider time)
{
    public const int MaxRows = 1000;
    public const int DirectoryRows = 30;
    public const int MaxLocationHistoryVisits = 300;

    public async Task<IReadOnlyList<DoctorDto>> ListAsync(DoctorQuery query, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var scope = await scopeResolver.ResolveAsync(Permissions.Customers.Read, cancellationToken);
        var visibleReps = await VisibleRepIdsAsync(scope, cancellationToken);
        var tree = await TerritoryTree.LoadAsync(db, cancellationToken);

        var repFilter = query.Mine ? me : query.RepId;
        if (repFilter is { } repId && repId != me && visibleReps is not null && !visibleReps.Contains(repId))
        {
            throw new ForbiddenException("This rep is outside your scope.");
        }

        var doctors = db.Customers.AsNoTracking()
            .Where(c => c.Type == CustomerType.Doctor && (query.Archived ? c.ArchivedAt != null : c.ArchivedAt == null));
        if (!query.IncludeInactive)
        {
            doctors = doctors.Where(c => c.IsActive);
        }

        if (repFilter is { } rep)
        {
            doctors = doctors.Where(c => c.Reps.Any(a => a.UserId == rep));
        }
        else
        {
            doctors = WhereVisible(doctors, scope, visibleReps);
        }

        if (query.Unassigned)
        {
            doctors = doctors.Where(c => !c.Reps.Any());
        }

        if (query.TownId is { } townId)
        {
            doctors = doctors.Where(c => c.TerritoryId == townId);
        }

        if (query.AreaId is { } areaId)
        {
            var towns = tree.SelfAndDescendants(areaId).Select(id => (Guid?)id).ToArray();
            doctors = doctors.Where(c => towns.Contains(c.TerritoryId));
        }

        if (query.SpecialtyId is { } specialtyId)
        {
            doctors = doctors.Where(c => c.SpecialtyId == specialtyId);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim().ToLower();
            doctors = doctors.Where(c =>
                c.Name.ToLower().Contains(term) ||
                (c.NameAr != null && c.NameAr.Contains(term)) ||
                (c.Phone != null && c.Phone.Contains(term)));
        }

        var rows = await Project(doctors.OrderBy(c => c.Name).Take(MaxRows)).ToListAsync(cancellationToken);
        return await ToDtosAsync(rows, me, visibleReps, tree, cancellationToken);
    }

    public async Task<DoctorDto> GetAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var scope = await scopeResolver.ResolveAsync(Permissions.Customers.Read, cancellationToken);
        var visibleReps = await VisibleRepIdsAsync(scope, cancellationToken);
        var visible = await db.RepDoctors.AnyAsync(a => a.UserId == me && a.CustomerId == id, cancellationToken) ||
                      await WhereVisible(db.Customers.Where(c => c.Id == id && c.Type == CustomerType.Doctor), scope, visibleReps)
                          .AnyAsync(cancellationToken);
        if (!visible)
        {
            throw new NotFoundException("Doctor", id);
        }

        var row = await Project(db.Customers.AsNoTracking().Where(c => c.Id == id)).SingleAsync(cancellationToken);
        var tree = await TerritoryTree.LoadAsync(db, cancellationToken);
        return (await ToDtosAsync([row], me, visibleReps, tree, cancellationToken))[0];
    }

    /// <summary>
    /// The clinic location and where every visit to the doctor was recorded, with the distances stored on
    /// each visit. The doctor must be visible to the caller (customers:read) and only visits inside the
    /// caller's visits:read scope are listed.
    /// </summary>
    public async Task<DoctorLocationHistoryDto> LocationHistoryAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var doctor = await GetAsync(id, cancellationToken);
        var visitScope = await scopeResolver.ResolveAsync(Permissions.Visits.Read, cancellationToken);
        var rows = await db.Visits.AsNoTracking()
            .WhereInScope(visitScope)
            .Where(v => v.CustomerId == id && v.ArchivedAt == null)
            .OrderByDescending(v => v.CheckInAt)
            .Take(MaxLocationHistoryVisits + 1)
            .Select(v => new
            {
                v.Id,
                v.UserId,
                RepName = db.Users.Where(u => u.Id == v.UserId).Select(u => u.FullName).FirstOrDefault() ?? string.Empty,
                v.CheckInAt,
                v.Status,
                v.NeedsReview,
                v.CheckInWithinGeofence,
                v.CheckInIsMock,
                v.CheckOutIsMock,
                v.CheckOutAt,
                HasCheckOutLocation = v.CheckOutLocation != null,
                v.TrustReasons,
                v.CheckInLocation,
                v.CheckInAccuracy,
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

        var visits = rows.Take(MaxLocationHistoryVisits)
            .Select(v => new DoctorVisitLocationDto(
                v.Id, v.UserId, v.RepName, v.CheckInAt, v.Status, v.NeedsReview,
                VisitReviewReasons.For(v.CheckInWithinGeofence, v.CheckInIsMock, v.CheckOutIsMock, v.CheckOutAt is not null, v.HasCheckOutLocation, v.TrustReasons),
                new VisitLocationDto(
                    v.CheckInLocation.Y, v.CheckInLocation.X, v.CheckInAccuracy, v.CheckInIsMock, v.CheckInSignalCodes,
                    v.ClinicLocationOutcome, v.ClinicDistanceMeters, v.PreviousVisitDistanceMeters, v.SincePreviousVisitSeconds,
                    v.MedianDistanceMeters, v.NearestVisitDistanceMeters, v.ReferenceVisitCount, v.CheckInGoodFix,
                    v.LocationDrift, v.DriftSources)))
            .ToList();
        var good = visits.Where(v => v.Location.GoodFix)
            .Select(v => new ReferenceFix(v.VisitId, v.CheckInAt, v.Location.Lat, v.Location.Lng))
            .ToList();
        (double Lat, double Lng)? median = good.Count >= VisitLocationHistory.MinVisitsForMedian ? VisitLocationHistory.MedianOf(good) : null;

        return new DoctorLocationHistoryDto(
            doctor.Id, doctor.Name, doctor.NameAr, doctor.Lat, doctor.Lng, doctor.GeofenceRadiusMeters,
            doctor.LocationSource, doctor.LocationCapturedAt, doctor.LocationCapturedByName, doctor.LocationAccuracyMeters,
            doctor.LocationVisitId, median?.Lat, median?.Lng, visits, rows.Count > MaxLocationHistoryVisits);
    }

    /// <summary>
    /// Search all active doctors (name, town, specialty only) so a rep can pick an existing doctor
    /// instead of creating a duplicate.
    /// </summary>
    public async Task<IReadOnlyList<DoctorDto>> SearchDirectoryAsync(
        string? search,
        Guid? townId,
        Guid? specialtyId,
        CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var doctors = db.Customers.AsNoTracking().Where(c => c.Type == CustomerType.Doctor && c.IsActive && c.ArchivedAt == null);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            doctors = doctors.Where(c => c.Name.ToLower().Contains(term) || (c.NameAr != null && c.NameAr.Contains(term)));
        }

        if (townId is not null)
        {
            doctors = doctors.Where(c => c.TerritoryId == townId);
        }

        if (specialtyId is not null)
        {
            doctors = doctors.Where(c => c.SpecialtyId == specialtyId);
        }

        var rows = await Project(doctors.OrderBy(c => c.Name).Take(DirectoryRows)).ToListAsync(cancellationToken);
        var tree = await TerritoryTree.LoadAsync(db, cancellationToken);

        // Other reps' names are not part of the directory; phone and notes neither.
        return (await ToDtosAsync(rows, me, [me], tree, cancellationToken))
            .Select(d => d with
            {
                Phone = null, Notes = null, Lat = null, Lng = null, LocationSource = null, LocationCapturedAt = null,
                LocationCapturedByName = null, LocationAccuracyMeters = null, LocationVisitId = null,
            })
            .ToList();
    }

    /// <summary>Creates a doctor and puts it on the caller's list (or another rep's, with customers:assign).</summary>
    public async Task<DoctorDto> CreateAsync(CreateDoctorRequest request, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var repId = request.RepId ?? me;
        if (repId != me)
        {
            await EnsureAssignableRepAsync(repId, cancellationToken);
        }

        await EnsureTownAndSpecialtyAsync(request.TownId, request.SpecialtyId, cancellationToken);

        var name = request.Name.Trim();
        var lower = name.ToLower();
        var existing = await db.Customers.AsNoTracking()
            .Where(c => c.Type == CustomerType.Doctor && c.TerritoryId == request.TownId && c.Name.ToLower() == lower)
            .Select(c => (Guid?)c.Id)
            .FirstOrDefaultAsync(cancellationToken);
        if (existing is { } existingId)
        {
            throw new ConflictException(DoctorErrorCodes.Exists, "A doctor with this name already exists in this town. Add the existing doctor instead.")
            {
                Details = new Dictionary<string, object?> { ["doctorId"] = existingId },
            };
        }

        var now = time.GetUtcNow();
        var doctor = new Customer
        {
            Type = CustomerType.Doctor,
            Name = name,
            NameAr = Clean(request.NameAr),
            TerritoryId = request.TownId,
            SpecialtyId = request.SpecialtyId,
            Phone = Clean(request.Phone),
            Notes = Clean(request.Notes),
            CreatedAt = now,
            CreatedById = me,
        };
        db.Customers.Add(doctor);
        db.RepDoctors.Add(new RepDoctor { UserId = repId, CustomerId = doctor.Id, AssignedAt = now, AssignedById = me });
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(doctor.Id, cancellationToken);
    }

    /// <summary>Puts an existing doctor on the caller's own list (no-op when already there).</summary>
    public async Task<DoctorDto> AddToMyListAsync(Guid doctorId, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        if (!await db.Customers.AnyAsync(c => c.Id == doctorId && c.Type == CustomerType.Doctor && c.IsActive && c.ArchivedAt == null, cancellationToken))
        {
            throw new NotFoundException("Doctor", doctorId);
        }

        if (!await db.RepDoctors.AnyAsync(a => a.UserId == me && a.CustomerId == doctorId, cancellationToken))
        {
            db.RepDoctors.Add(new RepDoctor { UserId = me, CustomerId = doctorId, AssignedAt = time.GetUtcNow(), AssignedById = me });
            await db.SaveChangesAsync(cancellationToken);
        }

        return await GetAsync(doctorId, cancellationToken);
    }

    public async Task RemoveFromMyListAsync(Guid doctorId, CancellationToken cancellationToken = default)
    {
        var result = await RemoveManyFromMyListAsync(new BulkIdsRequest([doctorId]), cancellationToken);
        if (result.Blocked > 0)
        {
            throw new NotFoundException("Doctor", doctorId);
        }
    }

    /// <summary>
    /// Takes doctors off the caller's own list (customers:create). The doctors themselves stay in the
    /// directory and on other reps' lists; <see cref="BulkOutcome.Deleted"/> means "removed from the list".
    /// </summary>
    public async Task<BulkResult> RemoveManyFromMyListAsync(BulkIdsRequest request, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var ids = request.Ids.Distinct().ToArray();
        var rows = await db.RepDoctors.Where(a => a.UserId == me && ids.Contains(a.CustomerId)).ToDictionaryAsync(a => a.CustomerId, cancellationToken);
        var results = ids
            .Select(id => rows.ContainsKey(id)
                ? new BulkItemResult(id, BulkOutcome.Deleted)
                : new BulkItemResult(id, BulkOutcome.Blocked, DoctorErrorCodes.NotOnList))
            .ToList();
        if (rows.Count > 0)
        {
            db.RepDoctors.RemoveRange(rows.Values);
            await audit.AddAsync(AuditEntities.Customer, null, AuditAction.Updated,
                new { removedFromListOf = me, doctorIds = rows.Keys.ToArray() }, rows.Count, cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
        }

        return BulkResult.From(results, false);
    }

    /// <summary>
    /// Edit a doctor's details: with customers:manage when the doctor is in that scope, or with
    /// customers:create when the doctor is on the caller's own list.
    /// </summary>
    public async Task<DoctorDto> UpdateAsync(Guid id, UpdateDoctorRequest request, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var doctor = await db.Customers.SingleOrDefaultAsync(c => c.Id == id && c.Type == CustomerType.Doctor, cancellationToken)
                     ?? throw new NotFoundException("Doctor", id);

        var effective = await permissions.GetEffectivePermissionsAsync(me, cancellationToken);
        var onMyList = await db.RepDoctors.AnyAsync(a => a.UserId == me && a.CustomerId == id, cancellationToken);
        var canManage = false;
        if (effective.Has(Permissions.Customers.Manage))
        {
            var scope = await scopeResolver.ResolveAsync(Permissions.Customers.Manage, cancellationToken);
            var visibleReps = await VisibleRepIdsAsync(scope, cancellationToken);
            canManage = await WhereVisible(db.Customers.Where(c => c.Id == id), scope, visibleReps).AnyAsync(cancellationToken);
        }

        if (!canManage && !(onMyList && effective.Has(Permissions.Customers.Create)))
        {
            throw new ForbiddenException("You can only edit doctors on your own list or inside your scope.");
        }

        if (request.Location is not null && !canManage)
        {
            throw new ForbiddenException("Only a manager can change the saved location of a doctor.");
        }

        await EnsureTownAndSpecialtyAsync(request.TownId, request.SpecialtyId, cancellationToken);
        var before = new
        {
            doctor.Name, doctor.NameAr, doctor.TerritoryId, doctor.SpecialtyId, doctor.Phone, doctor.Notes, doctor.IsActive,
            Lat = doctor.Location?.Y, Lng = doctor.Location?.X, doctor.GeofenceRadiusMeters,
        };
        doctor.Name = request.Name.Trim();
        doctor.NameAr = Clean(request.NameAr);
        doctor.TerritoryId = request.TownId;
        doctor.SpecialtyId = request.SpecialtyId;
        doctor.Phone = Clean(request.Phone);
        doctor.Notes = Clean(request.Notes);
        doctor.IsActive = request.IsActive;
        if (request.Location is { } location)
        {
            var moved = location.Lat != before.Lat || location.Lng != before.Lng;
            doctor.Location = location is { Lat: { } lat, Lng: { } lng } ? GeoFactory.Point(lat, lng) : null;
            doctor.GeofenceRadiusMeters = location.GeofenceRadiusMeters;
            if (moved)
            {
                ClinicLocationStamp.ManagerSet(doctor, me, time.GetUtcNow());
            }
        }

        var after = new
        {
            doctor.Name, doctor.NameAr, doctor.TerritoryId, doctor.SpecialtyId, doctor.Phone, doctor.Notes, doctor.IsActive,
            Lat = doctor.Location?.Y, Lng = doctor.Location?.X, doctor.GeofenceRadiusMeters,
        };
        if (!before.Equals(after))
        {
            doctor.UpdatedAt = time.GetUtcNow();
            await audit.AddAsync(AuditEntities.Customer, id, AuditAction.Updated, new { before, after }, cancellationToken: cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    /// <summary>Copies or moves doctors to a rep's list. Both reps must be inside the caller's customers:assign scope.</summary>
    public async Task<AssignDoctorsResult> AssignAsync(AssignDoctorsRequest request, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var target = await EnsureAssignableRepAsync(request.ToRepId, cancellationToken);
        var doctorIds = request.DoctorIds.Distinct().ToList();

        List<RepDoctor> sourceRows = [];
        if (request.FromRepId is { } fromRepId)
        {
            if (fromRepId == request.ToRepId)
            {
                throw new BusinessRuleException("assign_same_rep", "Choose a different rep.");
            }

            await EnsureAssignableRepAsync(fromRepId, cancellationToken);
            sourceRows = await db.RepDoctors.Where(a => a.UserId == fromRepId && doctorIds.Contains(a.CustomerId)).ToListAsync(cancellationToken);
            if (sourceRows.Count != doctorIds.Count)
            {
                throw new BusinessRuleException(DoctorErrorCodes.NotOnList, "Some of these doctors are not on the source rep's list.");
            }
        }
        else
        {
            if (request.Mode == AssignMode.Move)
            {
                throw new BusinessRuleException("assign_source_required", "Choose the rep to move the doctors from.");
            }

            // Without a source list: unassigned doctors, or doctors the caller can already see.
            var scope = await scopeResolver.ResolveAsync(Permissions.Customers.Read, cancellationToken);
            var visibleReps = await VisibleRepIdsAsync(scope, cancellationToken);
            var candidates = db.Customers.Where(c => doctorIds.Contains(c.Id) && c.Type == CustomerType.Doctor);
            var allowed = await WhereVisible(candidates, scope, visibleReps, includeUnassigned: true).CountAsync(cancellationToken);
            if (allowed < doctorIds.Count)
            {
                throw new ForbiddenException("Some of these doctors are outside your scope.");
            }
        }

        var already = await db.RepDoctors
            .Where(a => a.UserId == request.ToRepId && doctorIds.Contains(a.CustomerId))
            .Select(a => a.CustomerId)
            .ToListAsync(cancellationToken);
        var now = time.GetUtcNow();
        var toAdd = doctorIds.Except(already).ToList();
        foreach (var doctorId in toAdd)
        {
            db.RepDoctors.Add(new RepDoctor { UserId = request.ToRepId, CustomerId = doctorId, AssignedAt = now, AssignedById = me });
        }

        var removed = 0;
        if (request.Mode == AssignMode.Move)
        {
            db.RepDoctors.RemoveRange(sourceRows);
            removed = sourceRows.Count;
        }

        await db.SaveChangesAsync(cancellationToken);

        var tree = await TerritoryTree.LoadAsync(db, cancellationToken);
        var towns = await db.Customers.AsNoTracking().Where(c => doctorIds.Contains(c.Id)).Select(c => c.TerritoryId).ToListAsync(cancellationToken);
        var outside = towns.Count(town => tree.IsOutsideArea(town, target.TerritoryId));
        return new AssignDoctorsResult(toAdd.Count, already.Count, removed, outside);
    }

    /// <summary>Doctors visible in a scope: on the list of a visible rep, or (territory scope) in one of its towns.</summary>
    internal static IQueryable<Customer> WhereVisible(
        IQueryable<Customer> doctors,
        DataScope scope,
        HashSet<Guid>? visibleReps,
        bool includeUnassigned = false)
    {
        if (visibleReps is null)
        {
            return doctors;
        }

        var repIds = visibleReps.ToArray();
        var territoryIds = scope.Level == PermissionScope.Territory ? scope.TerritoryIds : [];
        return doctors.Where(c =>
            c.Reps.Any(a => repIds.Contains(a.UserId)) ||
            territoryIds.Contains(c.TerritoryId) ||
            (includeUnassigned && !c.Reps.Any()));
    }

    /// <summary>Users visible in the scope, or null when the scope is "all".</summary>
    private async Task<HashSet<Guid>?> VisibleRepIdsAsync(DataScope scope, CancellationToken cancellationToken)
    {
        if (scope.Level == PermissionScope.All)
        {
            return null;
        }

        return (await db.Users.AsNoTracking().VisibleUserIds(scope).ToListAsync(cancellationToken)).ToHashSet();
    }

    private async Task<User> EnsureAssignableRepAsync(Guid repId, CancellationToken cancellationToken)
    {
        var rep = await db.Users.AsNoTracking().SingleOrDefaultAsync(u => u.Id == repId && u.IsActive, cancellationToken)
                  ?? throw new NotFoundException("User", repId);
        var scope = await scopeResolver.ResolveAsync(Permissions.Customers.Assign, cancellationToken);
        if (!scope.Includes(rep.Id, rep.TerritoryId))
        {
            throw new ForbiddenException("This rep is outside your scope.");
        }

        return rep;
    }

    private async Task EnsureTownAndSpecialtyAsync(Guid townId, Guid specialtyId, CancellationToken cancellationToken)
    {
        if (!await db.Territories.AnyAsync(t => t.Id == townId && t.Level == TerritoryLevel.Town && t.ArchivedAt == null, cancellationToken))
        {
            throw new BusinessRuleException(DoctorErrorCodes.TownInvalid, "Choose a town.");
        }

        if (!await db.Specialties.AnyAsync(s => s.Id == specialtyId && s.IsActive && s.ArchivedAt == null, cancellationToken))
        {
            throw new BusinessRuleException(DoctorErrorCodes.SpecialtyInvalid, "Choose an active specialty.");
        }
    }

    private IQueryable<DoctorRow> Project(IQueryable<Customer> doctors) =>
        doctors.Select(c => new DoctorRow(
            c.Id,
            c.Name,
            c.NameAr,
            c.TerritoryId,
            db.Territories.Where(t => t.Id == c.TerritoryId).Select(t => t.Name).FirstOrDefault(),
            db.Territories.Where(t => t.Id == c.TerritoryId).Select(t => t.NameAr).FirstOrDefault(),
            c.SpecialtyId,
            c.Specialty != null ? c.Specialty.NameAr : null,
            c.Specialty != null ? c.Specialty.NameEn : null,
            c.Phone,
            c.Notes,
            c.IsActive,
            c.ArchivedAt,
            c.Location,
            c.GeofenceRadiusMeters,
            c.LocationSource,
            c.LocationCapturedAt,
            db.Users.Where(u => u.Id == c.LocationCapturedById).Select(u => u.FullName).FirstOrDefault(),
            c.LocationAccuracyMeters,
            c.LocationVisitId));

    private async Task<List<DoctorDto>> ToDtosAsync(
        IReadOnlyList<DoctorRow> rows,
        Guid me,
        IReadOnlyCollection<Guid>? visibleReps,
        TerritoryTree tree,
        CancellationToken cancellationToken)
    {
        var ids = rows.Select(r => r.Id).ToArray();
        var assignments = await db.RepDoctors.AsNoTracking()
            .Where(a => ids.Contains(a.CustomerId))
            .Join(db.Users, a => a.UserId, u => u.Id, (a, u) => new { a.CustomerId, u.Id, u.FullName, u.TerritoryId })
            .ToListAsync(cancellationToken);
        var byDoctor = assignments.ToLookup(a => a.CustomerId);
        var myTerritory = await db.Users.AsNoTracking().Where(u => u.Id == me).Select(u => u.TerritoryId).SingleOrDefaultAsync(cancellationToken);

        return rows
            .Select(r => new DoctorDto(
                r.Id, r.Name, r.NameAr, r.TownId, r.TownName, r.TownNameAr, tree.AreaOf(r.TownId), r.SpecialtyId,
                r.SpecialtyNameAr, r.SpecialtyNameEn, r.Phone, r.Notes, r.IsActive,
                byDoctor[r.Id]
                    .Where(a => visibleReps is null || visibleReps.Contains(a.Id))
                    .OrderBy(a => a.FullName)
                    .Select(a => new DoctorRepDto(a.Id, a.FullName, tree.IsOutsideArea(r.TownId, a.TerritoryId)))
                    .ToList(),
                byDoctor[r.Id].Any(a => a.Id == me),
                tree.IsOutsideArea(r.TownId, myTerritory),
                r.ArchivedAt,
                r.Location?.Y,
                r.Location?.X,
                r.GeofenceRadiusMeters,
                r.Location is null ? null : r.LocationSource,
                r.Location is null ? null : r.LocationCapturedAt,
                r.Location is null ? null : r.LocationCapturedByName,
                r.Location is null ? null : r.LocationAccuracyMeters,
                r.Location is null ? null : r.LocationVisitId))
            .ToList();
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private sealed record DoctorRow(
        Guid Id,
        string Name,
        string? NameAr,
        Guid? TownId,
        string? TownName,
        string? TownNameAr,
        Guid? SpecialtyId,
        string? SpecialtyNameAr,
        string? SpecialtyNameEn,
        string? Phone,
        string? Notes,
        bool IsActive,
        DateTimeOffset? ArchivedAt,
        NetTopologySuite.Geometries.Point? Location,
        int GeofenceRadiusMeters,
        ClinicLocationSource? LocationSource,
        DateTimeOffset? LocationCapturedAt,
        string? LocationCapturedByName,
        double? LocationAccuracyMeters,
        Guid? LocationVisitId);
}

/// <summary>Records who set a customer's saved location and how.</summary>
internal static class ClinicLocationStamp
{
    /// <summary>A manager typed, moved or cleared the location: it is theirs now (cleared: no metadata).</summary>
    public static void ManagerSet(Customer customer, Guid managerId, DateTimeOffset at)
    {
        var has = customer.Location is not null;
        customer.LocationSource = has ? ClinicLocationSource.ManagerSet : null;
        customer.LocationCapturedById = has ? managerId : null;
        customer.LocationCapturedAt = has ? at : null;
        customer.LocationAccuracyMeters = null;
        customer.LocationVisitId = null;
    }
}

public sealed class CreateDoctorRequestValidator : AbstractValidator<CreateDoctorRequest>
{
    public CreateDoctorRequestValidator()
    {
        RuleFor(x => x.Name).Must(n => !string.IsNullOrWhiteSpace(n)).WithMessage("Name is required.").MaximumLength(Customer.NameMaxLength);
        RuleFor(x => x.NameAr).MaximumLength(Customer.NameMaxLength);
        RuleFor(x => x.TownId).NotEmpty();
        RuleFor(x => x.SpecialtyId).NotEmpty();
        RuleFor(x => x.Phone).MaximumLength(Customer.PhoneMaxLength);
        RuleFor(x => x.Notes).MaximumLength(Customer.NotesMaxLength);
        RuleFor(x => x.RepId).NotEqual(Guid.Empty);
    }
}

public sealed class UpdateDoctorRequestValidator : AbstractValidator<UpdateDoctorRequest>
{
    public UpdateDoctorRequestValidator()
    {
        RuleFor(x => x.Name).Must(n => !string.IsNullOrWhiteSpace(n)).WithMessage("Name is required.").MaximumLength(Customer.NameMaxLength);
        RuleFor(x => x.NameAr).MaximumLength(Customer.NameMaxLength);
        RuleFor(x => x.TownId).NotEmpty();
        RuleFor(x => x.SpecialtyId).NotEmpty();
        RuleFor(x => x.Phone).MaximumLength(Customer.PhoneMaxLength);
        RuleFor(x => x.Notes).MaximumLength(Customer.NotesMaxLength);
        When(x => x.Location is not null, () =>
        {
            RuleFor(x => x.Location!.Lat).InclusiveBetween(-90, 90);
            RuleFor(x => x.Location!.Lng).InclusiveBetween(-180, 180);
            RuleFor(x => x.Location!.GeofenceRadiusMeters).InclusiveBetween(20, 2000);
            RuleFor(x => x.Location!).Must(l => (l.Lat is null) == (l.Lng is null))
                .WithMessage("Give both latitude and longitude, or neither.");
        });
    }
}

public sealed class AssignDoctorsRequestValidator : AbstractValidator<AssignDoctorsRequest>
{
    public AssignDoctorsRequestValidator()
    {
        RuleFor(x => x.DoctorIds).NotEmpty().Must(ids => ids.Count <= 500).WithMessage("At most 500 doctors at a time.");
        RuleForEach(x => x.DoctorIds).NotEmpty();
        RuleFor(x => x.ToRepId).NotEmpty();
        RuleFor(x => x.Mode).IsInEnum();
        RuleFor(x => x.FromRepId).NotEqual(Guid.Empty);
    }
}
