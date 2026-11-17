using Microsoft.EntityFrameworkCore;

namespace OriginalPharma.Tests.Integration;

/// <summary>
/// The seeded demo hierarchy: sales manager (region) &lt;- area manager (East Cairo) &lt;- supervisor
/// &lt;- two reps (East Cairo). Rep sells the cardio and pediatric lines, the second rep pediatric and derma.
/// </summary>
internal sealed record DemoPeople(Guid Admin, Guid Sales, Guid Area, Guid Supervisor, Guid Rep, Guid RepEast)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public static async Task<DemoPeople> LoadAsync(TestDatabase db) => new(
        await db.UserIdAsync(PostgresFixture.AdminEmail),
        await db.UserIdAsync("sales.manager@demo.local"),
        await db.UserIdAsync("area.manager@demo.local"),
        await db.UserIdAsync("supervisor@demo.local"),
        await db.UserIdAsync("rep@demo.local"),
        await db.UserIdAsync("rep.east@demo.local"));

    public static Task<Guid> ProductAsync(TestDatabase db, string nameEn) =>
        db.DbAsync(c => c.Products.Where(p => p.NameEn == nameEn).Select(p => p.Id).SingleAsync(Ct));

    public static Task<Guid> LineAsync(TestDatabase db, string nameEn) =>
        db.DbAsync(c => c.ProductLines.Where(l => l.NameEn == nameEn).Select(l => l.Id).SingleAsync(Ct));

    public static Task<Guid> MethodAsync(TestDatabase db, string nameEn) =>
        db.DbAsync(c => c.CollectionMethods.Where(m => m.NameEn == nameEn).Select(m => m.Id).SingleAsync(Ct));

    public static Task<Guid> TerritoryAsync(TestDatabase db, string code) =>
        db.DbAsync(c => c.Territories.Where(t => t.Code == code).Select(t => t.Id).SingleAsync(Ct));

    public static Task<Guid> SpecialtyAsync(TestDatabase db, string nameEn) =>
        db.DbAsync(c => c.Specialties.Where(s => s.NameEn == nameEn).Select(s => s.Id).SingleAsync(Ct));

    public static Task<Guid> DoctorAsync(TestDatabase db, string name) =>
        db.DbAsync(c => c.Customers.Where(d => d.Name == name).Select(d => d.Id).SingleAsync(Ct));
}
