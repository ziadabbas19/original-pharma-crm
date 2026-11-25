using FluentValidation;
using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Auditing;
using OriginalPharma.Application.Common.Bulk;
using OriginalPharma.Application.Common.Organization;
using OriginalPharma.Application.Common.Scoping;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Lookups;
using OriginalPharma.Domain.Audit;
using OriginalPharma.Domain.Common;
using OriginalPharma.Domain.Crm;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Application.Crm;

/// <param name="UsageCount">Visits and orders that point at the customer (it is archived instead of deleted).</param>
public sealed record CustomerDto(
    Guid Id,
    CustomerType Type,
    string Name,
    string? NameAr,
    string? Address,
    Guid? TerritoryId,
    string? TerritoryName,
    string? TerritoryNameAr,
    double? Lat,
    double? Lng,
    int GeofenceRadiusMeters,
    bool HasQrCode,
    bool IsActive,
    DateTimeOffset CreatedAt,
    string? Phone = null,
    string? Notes = null,
    int UsageCount = 0,
    DateTimeOffset? ArchivedAt = null,
    string? Landmark = null);

/// <summary>
/// Details of a pharmacy or AM place (doctors are edited through the doctor endpoints: town and
/// specialty are required there).
/// </summary>
/// <param name="TerritoryId">The town.</param>
/// <param name="Lat">Location used for the visit geofence; leave both empty to keep no location.</param>
/// <param name="Landmark">AM places only (a pharmacy keeps none).</param>
public sealed record UpdateCustomerRequest(
    string Name,
    string? NameAr,
    string? Address,
    Guid? TerritoryId,
    string? Phone = null,
    string? Notes = null,
    double? Lat = null,
    double? Lng = null,
    int GeofenceRadiusMeters = 150,
    bool IsActive = true,
    string? Landmark = null);

/// <summary>A new pharmacy (customers:create-pharmacy). Its location is saved from the first visit, as for doctors.</summary>
/// <param name="TerritoryId">The town; it must be inside the caller's scope (a rep: their own area).</param>
/// <param name="DuplicateConfirmed">
/// The person saw the similar pharmacies of the town and adds this one anyway. Without it, similar ones
/// make the request fail with 409 <c>duplicate_suspected</c> and the candidates.
/// </param>
public sealed record CreatePharmacyRequest(
    string Name,
    string? NameAr,
    Guid TerritoryId,
    string? Address = null,
    string? Phone = null,
    string? Notes = null,
    bool DuplicateConfirmed = false);

/// <summary>
/// A new AM place, such as a hospital visited in the morning (customers:create-pharmacy in the caller's
/// area, or customers:manage in that scope). Its location is saved from the first visit.
/// </summary>
/// <param name="TerritoryId">The town.</param>
/// <param name="RepId">Put the place on this rep's list as well (customers:assign over that rep).</param>
/// <param name="DuplicateConfirmed">
/// The person saw the similar places of the town and adds this one anyway. Without it, similar ones make
/// the request fail with 409 <c>duplicate_suspected</c> and the candidates.
/// </param>
public sealed record CreateHospitalRequest(
    string Name,
    string? NameAr,
    Guid TerritoryId,
    string? Address = null,
    string? Landmark = null,
    string? Phone = null,
    string? Notes = null,
    Guid? RepId = null,
    bool DuplicateConfirmed = false);

public static class HospitalErrorCodes
{
    /// <summary>A place with the same name already exists in that town; the response carries <c>hospitalId</c>.</summary>
    public const string Exists = "hospital_exists";

    /// <summary>The town is outside the caller's scope for adding places.</summary>
    public const string TownOutOfScope = "hospital_town_out_of_scope";
}

public static class PharmacyErrorCodes
{
    /// <summary>A pharmacy with the same name already exists in that town; the response carries <c>pharmacyId</c>.</summary>
    public const string Exists = "pharmacy_exists";

    /// <summary>The town is outside the caller's customers:create-pharmacy scope.</summary>
    public const string TownOutOfScope = "pharmacy_town_out_of_scope";
}

/// <summary>
/// Doctors, pharmacies and AM places (hospitals). Reading follows customers:read by territory;
/// pharmacy and place details are edited with customers:manage; deleting needs customers:delete and
/// archives customers that visits or orders point at (unused ones are removed).
/// </summary>
public sealed class CustomerService(
    IAppDbContext db,
    ICurrentUser currentUser,
    IDataScopeResolver scopeResolver,
    AuditTrail audit,
    TimeProvider time,
    SimilarCustomerFinder similar)
{
    /// <summary>Upper bound for one list response until the list gets server paging.</summary>
    public const int MaxRows = 1000;

    public async Task<IReadOnlyList<CustomerDto>> ListAsync(
        CustomerType? type,
        string? search,
        bool archived = false,
        CancellationToken cancellationToken = default)
    {
        var scope = await scopeResolver.ResolveAsync(Permissions.Customers.Read, cancellationToken);
        var query = await WhereReadableAsync(
            db, db.Customers.AsNoTracking().Where(c => archived ? c.ArchivedAt != null : c.ArchivedAt == null), scope, cancellationToken);

        if (type is not null)
        {
            query = query.Where(c => c.Type == type);
        }

        var term = CustomerNameSearch.Normalize(search);
        if (term.Length > 0)
        {
            var address = search!.Trim().ToLower();
            query = query.Where(c =>
                c.NameSearch.Contains(term) ||
                (c.NameArSearch != null && c.NameArSearch.Contains(term)) ||
                (c.Address != null && c.Address.ToLower().Contains(address)));
        }

        var ordered = term.Length > 0 ? query.OrderBy(CustomerSearch.Closeness(term)).ThenBy(c => c.Name) : query.OrderBy(c => c.Name);
        return await ProjectAsync(ordered.Take(MaxRows), cancellationToken);
    }

    /// <summary>
    /// Customers inside a customers:read scope, as the customer list reads them: in the scope's
    /// territories, pharmacies and AM places also in the towns under them (a rep works in an area while
    /// pharmacies sit in its towns), and AM places on the list of someone in the scope.
    /// </summary>
    internal static async Task<IQueryable<Customer>> WhereReadableAsync(
        IAppDbContext db,
        IQueryable<Customer> query,
        DataScope scope,
        CancellationToken cancellationToken)
    {
        var visible = await scope.ResolveTerritoryIdsAsync(db, cancellationToken);
        if (visible is null)
        {
            return query;
        }

        var tree = await TerritoryTree.LoadAsync(db, cancellationToken);
        var withTowns = visible.SelectMany(id => tree.SelfAndDescendants(id)).Distinct().ToArray();
        var reps = await db.Users.AsNoTracking().VisibleUserIds(scope).ToListAsync(cancellationToken);
        return query.Where(c => (c.TerritoryId != null &&
                                 (visible.Contains(c.TerritoryId.Value) ||
                                  ((c.Type == CustomerType.Pharmacy || c.Type == CustomerType.Hospital) &&
                                   withTowns.Contains(c.TerritoryId.Value)))) ||
                                (c.Type == CustomerType.Hospital && c.Reps.Any(a => reps.Contains(a.UserId))));
    }

    /// <summary>Towns where the caller may add a pharmacy (customers:create-pharmacy within its scope), by area then name.</summary>
    public async Task<List<TownDto>> PharmacyTownsAsync(CancellationToken cancellationToken = default)
    {
        var allowed = await PharmacyTownIdsAsync(cancellationToken);
        var towns = db.Territories.AsNoTracking().Where(t => t.Level == TerritoryLevel.Town && t.ArchivedAt == null);
        if (allowed is not null)
        {
            towns = towns.Where(t => allowed.Contains(t.Id));
        }

        return await towns
            .OrderBy(t => t.Parent!.Name).ThenBy(t => t.Name)
            .Select(t => new TownDto(t.Id, t.Name, t.NameAr, t.ParentId, t.Parent!.Name, t.Parent.NameAr, t.DefaultDailyExpense))
            .ToListAsync(cancellationToken);
    }

    /// <summary>
    /// Adds a pharmacy in a town of the caller's scope (customers:create-pharmacy). Pharmacies belong to
    /// reps through their area, so a rep's new pharmacy is on their list at once; there is no other
    /// rep to give it to. Similar pharmacies in the town make it fail with 409 <c>duplicate_suspected</c>
    /// unless <see cref="CreatePharmacyRequest.DuplicateConfirmed"/>; the exact same name in the same town
    /// is always refused (409 <c>pharmacy_exists</c> with the existing id).
    /// The location comes from the first visit with a good fix.
    /// </summary>
    public async Task<CustomerDto> CreatePharmacyAsync(CreatePharmacyRequest request, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        if (!await db.Territories.AnyAsync(t => t.Id == request.TerritoryId && t.Level == TerritoryLevel.Town && t.ArchivedAt == null, cancellationToken))
        {
            throw new BusinessRuleException(DoctorErrorCodes.TownInvalid, "Choose a town.");
        }

        var allowed = await PharmacyTownIdsAsync(cancellationToken);
        if (allowed is not null && !allowed.Contains(request.TerritoryId))
        {
            throw new ForbiddenException(PharmacyErrorCodes.TownOutOfScope, "You can add pharmacies only in the towns of your area.");
        }

        await similar.EnsureNoDuplicateAsync(
            CustomerType.Pharmacy, request.TerritoryId, [request.Name, request.NameAr], request.Phone, request.DuplicateConfirmed, cancellationToken);

        var name = request.Name.Trim();
        var lower = name.ToLower();
        var existing = await db.Customers.AsNoTracking()
            .Where(c => c.Type == CustomerType.Pharmacy && c.TerritoryId == request.TerritoryId && c.Name.ToLower() == lower)
            .Select(c => (Guid?)c.Id)
            .FirstOrDefaultAsync(cancellationToken);
        if (existing is { } existingId)
        {
            throw new ConflictException(PharmacyErrorCodes.Exists, "A pharmacy with this name already exists in this town.")
            {
                Details = new Dictionary<string, object?> { ["pharmacyId"] = existingId },
            };
        }

        var pharmacy = new Customer
        {
            Type = CustomerType.Pharmacy,
            Name = name,
            NameAr = Clean(request.NameAr),
            Address = Clean(request.Address),
            TerritoryId = request.TerritoryId,
            Phone = Clean(request.Phone),
            Notes = Clean(request.Notes),
            CreatedAt = time.GetUtcNow(),
            CreatedById = me,
        };
        db.Customers.Add(pharmacy);
        await audit.AddAsync(AuditEntities.Customer, pharmacy.Id, AuditAction.Created, new
        {
            pharmacy.Type,
            pharmacy.Name,
            pharmacy.NameAr,
            pharmacy.Address,
            pharmacy.TerritoryId,
            pharmacy.Phone,
            createdById = me,
        }, cancellationToken: cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return (await ProjectAsync(db.Customers.AsNoTracking().Where(c => c.Id == pharmacy.Id), cancellationToken)).Single();
    }

    /// <summary>Towns where the caller may add an AM place, by area then name.</summary>
    public async Task<List<TownDto>> HospitalTownsAsync(CancellationToken cancellationToken = default)
    {
        var allowed = await HospitalTownIdsAsync(cancellationToken);
        var towns = db.Territories.AsNoTracking().Where(t => t.Level == TerritoryLevel.Town && t.ArchivedAt == null);
        if (allowed is not null)
        {
            towns = towns.Where(t => allowed.Contains(t.Id));
        }

        return await towns
            .OrderBy(t => t.Parent!.Name).ThenBy(t => t.Name)
            .Select(t => new TownDto(t.Id, t.Name, t.NameAr, t.ParentId, t.Parent!.Name, t.Parent.NameAr, t.DefaultDailyExpense))
            .ToListAsync(cancellationToken);
    }

    /// <summary>
    /// Adds an AM place (a hospital visited in the morning) with the pharmacy rules: a rep in a town of
    /// their area (customers:create-pharmacy), a manager in a town of their customers:manage scope. A
    /// manager may also put it on a rep's list (customers:assign over that rep), which lets the rep see it
    /// outside their area. Similar places in the town make it fail with 409 <c>duplicate_suspected</c>
    /// unless <see cref="CreateHospitalRequest.DuplicateConfirmed"/>; the exact same name in the same town
    /// is always refused (409 <c>hospital_exists</c> with the existing id). The location comes from the
    /// first visit with a good fix.
    /// </summary>
    public async Task<CustomerDto> CreateHospitalAsync(CreateHospitalRequest request, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        if (!await db.Territories.AnyAsync(t => t.Id == request.TerritoryId && t.Level == TerritoryLevel.Town && t.ArchivedAt == null, cancellationToken))
        {
            throw new BusinessRuleException(DoctorErrorCodes.TownInvalid, "Choose a town.");
        }

        var allowed = await HospitalTownIdsAsync(cancellationToken);
        if (allowed is not null && !allowed.Contains(request.TerritoryId))
        {
            throw new ForbiddenException(HospitalErrorCodes.TownOutOfScope, "You can add places only in the towns of your scope.");
        }

        if (request.RepId is { } repId)
        {
            var rep = await db.Users.AsNoTracking().SingleOrDefaultAsync(u => u.Id == repId && u.IsActive, cancellationToken)
                      ?? throw new NotFoundException("User", repId);
            var assign = await scopeResolver.ResolveAsync(Permissions.Customers.Assign, cancellationToken);
            if (!assign.Includes(rep.Id, rep.TerritoryId))
            {
                throw new ForbiddenException("This rep is outside your scope.");
            }
        }

        await similar.EnsureNoDuplicateAsync(
            CustomerType.Hospital, request.TerritoryId, [request.Name, request.NameAr], request.Phone, request.DuplicateConfirmed, cancellationToken);

        var name = request.Name.Trim();
        var lower = name.ToLower();
        var existing = await db.Customers.AsNoTracking()
            .Where(c => c.Type == CustomerType.Hospital && c.TerritoryId == request.TerritoryId && c.Name.ToLower() == lower)
            .Select(c => (Guid?)c.Id)
            .FirstOrDefaultAsync(cancellationToken);
        if (existing is { } existingId)
        {
            throw new ConflictException(HospitalErrorCodes.Exists, "A place with this name already exists in this town.")
            {
                Details = new Dictionary<string, object?> { ["hospitalId"] = existingId },
            };
        }

        var now = time.GetUtcNow();
        var place = new Customer
        {
            Type = CustomerType.Hospital,
            Name = name,
            NameAr = Clean(request.NameAr),
            Address = Clean(request.Address),
            Landmark = Clean(request.Landmark),
            TerritoryId = request.TerritoryId,
            Phone = Clean(request.Phone),
            Notes = Clean(request.Notes),
            CreatedAt = now,
            CreatedById = me,
        };
        db.Customers.Add(place);
        if (request.RepId is { } assignedRep)
        {
            db.RepDoctors.Add(new RepDoctor { UserId = assignedRep, CustomerId = place.Id, AssignedAt = now, AssignedById = me });
        }

        await audit.AddAsync(AuditEntities.Customer, place.Id, AuditAction.Created, new
        {
            place.Type,
            place.Name,
            place.NameAr,
            place.Address,
            place.Landmark,
            place.TerritoryId,
            createdById = me,
            repId = request.RepId,
        }, cancellationToken: cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return (await ProjectAsync(db.Customers.AsNoTracking().Where(c => c.Id == place.Id), cancellationToken)).Single();
    }

    /// <summary>
    /// Towns where the caller may add an AM place: the customers:create-pharmacy scope (a rep: their
    /// area) together with the customers:manage scope (managers). Null for every town.
    /// </summary>
    private async Task<HashSet<Guid>?> HospitalTownIdsAsync(CancellationToken cancellationToken)
    {
        var create = await scopeResolver.ResolveAsync(Permissions.Customers.CreatePharmacy, cancellationToken);
        var manage = await scopeResolver.ResolveAsync(Permissions.Customers.Manage, cancellationToken);
        if (create.Level == PermissionScope.All || manage.Level == PermissionScope.All)
        {
            return null;
        }

        var roots = new List<Guid>();
        foreach (var scope in new[] { create, manage }.Where(s => s.Level is not null))
        {
            roots.AddRange(await scope.ResolveTerritoryIdsAsync(db, cancellationToken) ?? []);
        }

        var tree = await TerritoryTree.LoadAsync(db, cancellationToken);
        return roots.SelectMany(tree.SelfAndDescendants).ToHashSet();
    }

    /// <summary>Towns open to the caller's customers:create-pharmacy scope; null for every town.</summary>
    private async Task<HashSet<Guid>?> PharmacyTownIdsAsync(CancellationToken cancellationToken)
    {
        var scope = await scopeResolver.ResolveAsync(Permissions.Customers.CreatePharmacy, cancellationToken);
        var roots = await scope.ResolveTerritoryIdsAsync(db, cancellationToken);
        if (roots is null)
        {
            return null;
        }

        var tree = await TerritoryTree.LoadAsync(db, cancellationToken);
        return roots.SelectMany(tree.SelfAndDescendants).ToHashSet();
    }

    /// <summary>Edit a pharmacy or AM place (customers:manage, inside that scope).</summary>
    public async Task<CustomerDto> UpdateAsync(Guid id, UpdateCustomerRequest request, CancellationToken cancellationToken = default)
    {
        var customer = await db.Customers.SingleOrDefaultAsync(c => c.Id == id, cancellationToken) ?? throw new NotFoundException("Customer", id);
        if (customer.Type == CustomerType.Doctor)
        {
            throw new BusinessRuleException("customer_use_doctor_form", "Doctors are edited from the doctor lists.");
        }

        var scope = await scopeResolver.ResolveAsync(Permissions.Customers.Manage, cancellationToken);
        if (!await InScopeAsync(scope, [customer.Id], cancellationToken))
        {
            throw new ForbiddenException("This customer is outside your scope.");
        }

        if (request.TerritoryId is { } townId &&
            !await db.Territories.AnyAsync(t => t.Id == townId && t.Level == TerritoryLevel.Town && t.ArchivedAt == null, cancellationToken))
        {
            throw new BusinessRuleException(DoctorErrorCodes.TownInvalid, "Choose a town.");
        }

        var before = Snapshot(customer);
        customer.Name = request.Name.Trim();
        customer.NameAr = Clean(request.NameAr);
        customer.Address = Clean(request.Address);
        if (customer.Type == CustomerType.Hospital)
        {
            customer.Landmark = Clean(request.Landmark);
        }

        customer.TerritoryId = request.TerritoryId;
        customer.Phone = Clean(request.Phone);
        customer.Notes = Clean(request.Notes);
        customer.Location = request.Lat is { } lat && request.Lng is { } lng ? GeoFactory.Point(lat, lng) : null;
        customer.GeofenceRadiusMeters = request.GeofenceRadiusMeters;
        customer.IsActive = request.IsActive;
        var after = Snapshot(customer);
        if (before.Lat != after.Lat || before.Lng != after.Lng)
        {
            ClinicLocationStamp.ManagerSet(customer, currentUser.RequireUserId(), time.GetUtcNow());
        }

        if (before != after)
        {
            customer.UpdatedAt = time.GetUtcNow();
            await audit.AddAsync(AuditEntities.Customer, id, AuditAction.Updated, new { before, after }, cancellationToken: cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);
        return (await ProjectAsync(db.Customers.AsNoTracking().Where(c => c.Id == id), cancellationToken)).Single();
    }

    /// <summary>
    /// Deletes doctors and pharmacies (customers:delete, inside that scope). A customer that visits or
    /// orders point at is archived: hidden from lists and pickers, the visits and orders keep it.
    /// </summary>
    public async Task<BulkResult> DeleteManyAsync(BulkDeleteRequest request, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var ids = request.Ids.Distinct().ToArray();
        var customers = await db.Customers.Where(c => ids.Contains(c.Id)).ToDictionaryAsync(c => c.Id, cancellationToken);
        var scope = await scopeResolver.ResolveAsync(Permissions.Customers.Delete, cancellationToken);
        var inScope = await InScopeIdsAsync(scope, ids, cancellationToken);
        var usage = await UsageAsync(ids, cancellationToken);
        var now = time.GetUtcNow();
        var results = new List<BulkItemResult>();
        foreach (var id in ids)
        {
            if (!customers.TryGetValue(id, out var customer))
            {
                results.Add(new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.NotFound));
                continue;
            }

            var used = usage.GetValueOrDefault(id);
            if (!inScope.Contains(id))
            {
                results.Add(new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.OutOfScope, used));
                continue;
            }

            var archive = used > 0;
            results.Add(new BulkItemResult(id, archive ? BulkOutcome.Archived : BulkOutcome.Deleted, null, used));
            if (request.DryRun)
            {
                continue;
            }

            if (archive)
            {
                customer.ArchivedAt ??= now;
                customer.ArchivedById ??= me;
            }
            else
            {
                db.Customers.Remove(customer);
            }

            await audit.AddAsync(AuditEntities.Customer, id, archive ? AuditAction.Archived : AuditAction.Deleted,
                new { customer.Type, customer.Name, customer.NameAr, customer.TerritoryId, usageCount = used }, cancellationToken: cancellationToken);
        }

        var result = BulkResult.From(results, request.DryRun);
        if (!request.DryRun && result.Done > 0)
        {
            await audit.AddBulkAsync(AuditEntities.Customer, AuditAction.BulkDelete, result, cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
        }

        return result;
    }

    public async Task<BulkResult> RestoreManyAsync(BulkIdsRequest request, CancellationToken cancellationToken = default)
    {
        var ids = request.Ids.Distinct().ToArray();
        var customers = await db.Customers.Where(c => ids.Contains(c.Id)).ToDictionaryAsync(c => c.Id, cancellationToken);
        var scope = await scopeResolver.ResolveAsync(Permissions.Customers.Restore, cancellationToken);
        var inScope = await InScopeIdsAsync(scope, ids, cancellationToken);
        var results = new List<BulkItemResult>();
        foreach (var id in ids)
        {
            if (!customers.TryGetValue(id, out var customer))
            {
                results.Add(new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.NotFound));
            }
            else if (!inScope.Contains(id))
            {
                results.Add(new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.OutOfScope));
            }
            else if (customer.ArchivedAt is null)
            {
                results.Add(new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.NotArchived));
            }
            else
            {
                customer.ArchivedAt = null;
                customer.ArchivedById = null;
                results.Add(new BulkItemResult(id, BulkOutcome.Restored));
                await audit.AddAsync(AuditEntities.Customer, id, AuditAction.Restored, new { customer.Name, customer.NameAr }, cancellationToken: cancellationToken);
            }
        }

        var result = BulkResult.From(results, false);
        if (result.Done > 0)
        {
            await audit.AddBulkAsync(AuditEntities.Customer, AuditAction.BulkRestore, result, cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
        }

        return result;
    }

    private async Task<bool> InScopeAsync(DataScope scope, Guid[] ids, CancellationToken cancellationToken) =>
        (await InScopeIdsAsync(scope, ids, cancellationToken)).Count == ids.Length;

    /// <summary>
    /// Customers inside a scope: in one of the scope's territories, or (doctors) on the list of a rep
    /// visible in the scope. Own/team scopes reach the territories of the users concerned.
    /// </summary>
    private async Task<HashSet<Guid>> InScopeIdsAsync(DataScope scope, Guid[] ids, CancellationToken cancellationToken)
    {
        var customers = db.Customers.AsNoTracking().Where(c => ids.Contains(c.Id));
        if (scope.Level == PermissionScope.All)
        {
            return (await customers.Select(c => c.Id).ToListAsync(cancellationToken)).ToHashSet();
        }

        if (scope.Level is null)
        {
            return [];
        }

        var territories = await scope.ResolveTerritoryIdsAsync(db, cancellationToken) ?? [];
        var reps = await db.Users.AsNoTracking().VisibleUserIds(scope).ToListAsync(cancellationToken);
        return (await customers
                .Where(c => (c.TerritoryId != null && territories.Contains(c.TerritoryId.Value)) || c.Reps.Any(a => reps.Contains(a.UserId)))
                .Select(c => c.Id)
                .ToListAsync(cancellationToken))
            .ToHashSet();
    }

    private async Task<Dictionary<Guid, int>> UsageAsync(Guid[] ids, CancellationToken cancellationToken)
    {
        var visits = await db.Visits.Where(v => ids.Contains(v.CustomerId))
            .GroupBy(v => v.CustomerId).Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken);
        var orders = await db.Orders.Where(o => o.CustomerId != null && ids.Contains(o.CustomerId.Value))
            .GroupBy(o => o.CustomerId!.Value).Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken);
        return ids.ToDictionary(id => id, id => visits.GetValueOrDefault(id) + orders.GetValueOrDefault(id));
    }

    private async Task<List<CustomerDto>> ProjectAsync(IQueryable<Customer> query, CancellationToken cancellationToken)
    {
        var rows = await query
            .Select(c => new
            {
                c.Id,
                c.Type,
                c.Name,
                c.NameAr,
                c.Address,
                c.TerritoryId,
                TerritoryName = db.Territories.Where(t => t.Id == c.TerritoryId).Select(t => t.Name).FirstOrDefault(),
                TerritoryNameAr = db.Territories.Where(t => t.Id == c.TerritoryId).Select(t => t.NameAr).FirstOrDefault(),
                c.Location,
                c.GeofenceRadiusMeters,
                HasQrCode = c.QrCode != null && c.QrCode != "",
                c.IsActive,
                c.CreatedAt,
                c.Phone,
                c.Notes,
                Usage = db.Visits.Count(v => v.CustomerId == c.Id) + db.Orders.Count(o => o.CustomerId == c.Id),
                c.ArchivedAt,
                c.Landmark,
            })
            .ToListAsync(cancellationToken);

        // Coordinates are read after loading: PostGIS has no ST_X/ST_Y for geography columns.
        return rows
            .Select(c => new CustomerDto(
                c.Id, c.Type, c.Name, c.NameAr, c.Address, c.TerritoryId, c.TerritoryName, c.TerritoryNameAr,
                c.Location?.Y, c.Location?.X, c.GeofenceRadiusMeters, c.HasQrCode, c.IsActive, c.CreatedAt,
                c.Phone, c.Notes, c.Usage, c.ArchivedAt, c.Landmark))
            .ToList();
    }

    private static CustomerState Snapshot(Customer c) =>
        new(c.Name, c.NameAr, c.Address, c.TerritoryId, c.Phone, c.Notes, c.Location?.Y, c.Location?.X, c.GeofenceRadiusMeters, c.IsActive, c.Landmark);

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private sealed record CustomerState(
        string Name, string? NameAr, string? Address, Guid? TerritoryId, string? Phone, string? Notes,
        double? Lat, double? Lng, int Radius, bool IsActive, string? Landmark);
}

/// <summary>The same field rules as the managers' pharmacy form.</summary>
public sealed class CreatePharmacyRequestValidator : AbstractValidator<CreatePharmacyRequest>
{
    public CreatePharmacyRequestValidator()
    {
        RuleFor(x => x.Name).Must(n => !string.IsNullOrWhiteSpace(n)).WithMessage("Name is required.").MaximumLength(Customer.NameMaxLength);
        RuleFor(x => x.NameAr).MaximumLength(Customer.NameMaxLength);
        RuleFor(x => x.Address).MaximumLength(500);
        RuleFor(x => x.Phone).MaximumLength(Customer.PhoneMaxLength);
        RuleFor(x => x.Notes).MaximumLength(Customer.NotesMaxLength);
        RuleFor(x => x.TerritoryId).NotEmpty();
    }
}

public sealed class CreateHospitalRequestValidator : AbstractValidator<CreateHospitalRequest>
{
    public CreateHospitalRequestValidator()
    {
        RuleFor(x => x.Name).Must(n => !string.IsNullOrWhiteSpace(n)).WithMessage("Name is required.").MaximumLength(Customer.NameMaxLength);
        RuleFor(x => x.NameAr).MaximumLength(Customer.NameMaxLength);
        RuleFor(x => x.Address).MaximumLength(Customer.AddressMaxLength);
        RuleFor(x => x.Landmark).MaximumLength(Customer.LandmarkMaxLength);
        RuleFor(x => x.Phone).MaximumLength(Customer.PhoneMaxLength);
        RuleFor(x => x.Notes).MaximumLength(Customer.NotesMaxLength);
        RuleFor(x => x.TerritoryId).NotEmpty();
        RuleFor(x => x.RepId).NotEqual(Guid.Empty);
    }
}

public sealed class UpdateCustomerRequestValidator : AbstractValidator<UpdateCustomerRequest>
{
    public UpdateCustomerRequestValidator()
    {
        RuleFor(x => x.Name).Must(n => !string.IsNullOrWhiteSpace(n)).WithMessage("Name is required.").MaximumLength(Customer.NameMaxLength);
        RuleFor(x => x.NameAr).MaximumLength(Customer.NameMaxLength);
        RuleFor(x => x.Address).MaximumLength(500);
        RuleFor(x => x.Phone).MaximumLength(Customer.PhoneMaxLength);
        RuleFor(x => x.Notes).MaximumLength(Customer.NotesMaxLength);
        RuleFor(x => x.TerritoryId).NotEqual(Guid.Empty);
        RuleFor(x => x.Lat).InclusiveBetween(-90, 90);
        RuleFor(x => x.Lng).InclusiveBetween(-180, 180);
        RuleFor(x => x).Must(x => (x.Lat is null) == (x.Lng is null)).OverridePropertyName("Lat")
            .WithMessage("Give both latitude and longitude, or neither.");
        RuleFor(x => x.GeofenceRadiusMeters).InclusiveBetween(20, 2000);
        RuleFor(x => x.Landmark).MaximumLength(Customer.LandmarkMaxLength);
    }
}
