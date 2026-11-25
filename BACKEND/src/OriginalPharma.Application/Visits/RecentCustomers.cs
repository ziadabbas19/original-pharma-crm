using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Domain.Crm;

namespace OriginalPharma.Application.Visits;

/// <summary>A doctor, pharmacy or AM place the caller visited lately, with what the app needs to start a visit.</summary>
/// <param name="TownId">The customer's town.</param>
/// <param name="LastVisitAt">Check-in time of the caller's latest visit to this customer.</param>
public sealed record RecentCustomerDto(
    Guid Id,
    CustomerType Type,
    string Name,
    string? NameAr,
    double? Lat,
    double? Lng,
    int GeofenceRadiusMeters,
    string? Phone,
    string? Address,
    string? Landmark,
    Guid? TownId,
    string? TownName,
    string? TownNameAr,
    DateTimeOffset LastVisitAt);

/// <summary>
/// The customers the signed-in user visited most recently, each once, latest first. Only the caller's own
/// visits count (the user comes from the token); deleted visits and archived customers are left out.
/// </summary>
public sealed class RecentCustomersService(IAppDbContext db, ICurrentUser currentUser)
{
    public const int DefaultLimit = 6;
    public const int MaxLimit = 20;

    public async Task<IReadOnlyList<RecentCustomerDto>> ListAsync(int? limit, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var take = Math.Clamp(limit ?? DefaultLimit, 1, MaxLimit);

        var latest = await db.Visits.AsNoTracking()
            .Where(v => v.UserId == me && v.ArchivedAt == null && v.Customer!.ArchivedAt == null)
            .GroupBy(v => v.CustomerId)
            .Select(g => new { CustomerId = g.Key, LastVisitAt = g.Max(v => v.CheckInAt) })
            .OrderByDescending(x => x.LastVisitAt)
            .ThenBy(x => x.CustomerId)
            .Take(take)
            .ToListAsync(cancellationToken);
        if (latest.Count == 0)
        {
            return [];
        }

        var ids = latest.Select(x => x.CustomerId).ToList();
        var customers = await db.Customers.AsNoTracking()
            .Where(c => ids.Contains(c.Id))
            .Select(c => new
            {
                c.Id,
                c.Type,
                c.Name,
                c.NameAr,
                c.Location,
                c.GeofenceRadiusMeters,
                c.Phone,
                c.Address,
                c.Landmark,
                c.TerritoryId,
                TownName = db.Territories.Where(t => t.Id == c.TerritoryId).Select(t => t.Name).FirstOrDefault(),
                TownNameAr = db.Territories.Where(t => t.Id == c.TerritoryId).Select(t => t.NameAr).FirstOrDefault(),
            })
            .ToDictionaryAsync(c => c.Id, cancellationToken);

        return latest
            .Where(x => customers.ContainsKey(x.CustomerId))
            .Select(x =>
            {
                var c = customers[x.CustomerId];
                return new RecentCustomerDto(c.Id, c.Type, c.Name, c.NameAr, c.Location?.Y, c.Location?.X, c.GeofenceRadiusMeters, c.Phone, c.Address,
                    c.Landmark, c.TerritoryId, c.TownName, c.TownNameAr, x.LastVisitAt);
            })
            .ToList();
    }
}
