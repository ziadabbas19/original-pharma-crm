using FluentValidation;
using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Auditing;
using OriginalPharma.Application.Common.Bulk;
using OriginalPharma.Application.Common.Organization;
using OriginalPharma.Application.Common.Scoping;
using OriginalPharma.Application.Identity;
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
    DateTimeOffset? ArchivedAt = null);

/// <summary>Details of a pharmacy (doctors are edited through the doctor endpoints: town and specialty are required there).</summary>
/// <param name="TerritoryId">The town.</param>
/// <param name="Lat">Location used for the visit geofence; leave both empty to keep no location.</param>
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
    bool IsActive = true);

/// <summary>
/// Doctors and pharmacies. Reading follows customers:read by territory; pharmacy details are edited
/// with customers:manage; deleting needs customers:delete and archives customers that visits or
/// orders point at (unused ones are removed).
/// </summary>
public sealed class CustomerService(IAppDbContext db, ICurrentUser currentUser, IDataScopeResolver scopeResolver, AuditTrail audit, TimeProvider time)
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
        var visible = await scope.ResolveTerritoryIdsAsync(db, cancellationToken);

        var query = db.Customers.AsNoTracking().Where(c => archived ? c.ArchivedAt != null : c.ArchivedAt == null);
        if (visible is not null)
        {
            // A rep works in an area while pharmacies sit in its towns. Doctors stay with the reps' own lists.
            var tree = await TerritoryTree.LoadAsync(db, cancellationToken);
            var withTowns = visible.SelectMany(id => tree.SelfAndDescendants(id)).Distinct().ToArray();
            query = query.Where(c => c.TerritoryId != null &&
                                     (visible.Contains(c.TerritoryId.Value) ||
                                      (c.Type == CustomerType.Pharmacy && withTowns.Contains(c.TerritoryId.Value))));
        }

        if (type is not null)
        {
            query = query.Where(c => c.Type == type);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(c =>
                c.Name.ToLower().Contains(term) ||
                (c.NameAr != null && c.NameAr.Contains(term)) ||
                (c.Address != null && c.Address.ToLower().Contains(term)));
        }

        return await ProjectAsync(query.OrderBy(c => c.Name).Take(MaxRows), cancellationToken);
    }

    /// <summary>Edit a pharmacy (customers:manage, inside that scope).</summary>
    public async Task<CustomerDto> UpdateAsync(Guid id, UpdateCustomerRequest request, CancellationToken cancellationToken = default)
    {
        var customer = await db.Customers.SingleOrDefaultAsync(c => c.Id == id, cancellationToken) ?? throw new NotFoundException("Customer", id);
        if (customer.Type != CustomerType.Pharmacy)
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
        customer.TerritoryId = request.TerritoryId;
        customer.Phone = Clean(request.Phone);
        customer.Notes = Clean(request.Notes);
        customer.Location = request.Lat is { } lat && request.Lng is { } lng ? GeoFactory.Point(lat, lng) : null;
        customer.GeofenceRadiusMeters = request.GeofenceRadiusMeters;
        customer.IsActive = request.IsActive;
        var after = Snapshot(customer);
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
            })
            .ToListAsync(cancellationToken);

        // Coordinates are read after loading: PostGIS has no ST_X/ST_Y for geography columns.
        return rows
            .Select(c => new CustomerDto(
                c.Id, c.Type, c.Name, c.NameAr, c.Address, c.TerritoryId, c.TerritoryName, c.TerritoryNameAr,
                c.Location?.Y, c.Location?.X, c.GeofenceRadiusMeters, c.HasQrCode, c.IsActive, c.CreatedAt,
                c.Phone, c.Notes, c.Usage, c.ArchivedAt))
            .ToList();
    }

    private static CustomerState Snapshot(Customer c) =>
        new(c.Name, c.NameAr, c.Address, c.TerritoryId, c.Phone, c.Notes, c.Location?.Y, c.Location?.X, c.GeofenceRadiusMeters, c.IsActive);

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private sealed record CustomerState(
        string Name, string? NameAr, string? Address, Guid? TerritoryId, string? Phone, string? Notes,
        double? Lat, double? Lng, int Radius, bool IsActive);
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
    }
}
