using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Scoping;
using OriginalPharma.Application.Identity;
using OriginalPharma.Domain.Crm;

namespace OriginalPharma.Application.Crm;

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
    DateTimeOffset CreatedAt);

/// <summary>Doctors and pharmacies. Read-only for now; editing comes with the CRM module.</summary>
public sealed class CustomerService(IAppDbContext db, IDataScopeResolver scopeResolver)
{
    /// <summary>Upper bound for one list response until the list gets server paging.</summary>
    public const int MaxRows = 1000;

    public async Task<IReadOnlyList<CustomerDto>> ListAsync(
        CustomerType? type,
        string? search,
        CancellationToken cancellationToken = default)
    {
        var scope = await scopeResolver.ResolveAsync(Permissions.Customers.Read, cancellationToken);
        var visible = await scope.ResolveTerritoryIdsAsync(db, cancellationToken);

        var query = db.Customers.AsNoTracking();
        if (visible is not null)
        {
            query = query.Where(c => c.TerritoryId != null && visible.Contains(c.TerritoryId.Value));
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

        var rows = await query
            .OrderBy(c => c.Name)
            .Take(MaxRows)
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
            })
            .ToListAsync(cancellationToken);

        // Coordinates are read after loading: PostGIS has no ST_X/ST_Y for geography columns.
        return rows
            .Select(c => new CustomerDto(
                c.Id, c.Type, c.Name, c.NameAr, c.Address, c.TerritoryId, c.TerritoryName, c.TerritoryNameAr,
                c.Location?.Y, c.Location?.X, c.GeofenceRadiusMeters, c.HasQrCode, c.IsActive, c.CreatedAt))
            .ToList();
    }
}
