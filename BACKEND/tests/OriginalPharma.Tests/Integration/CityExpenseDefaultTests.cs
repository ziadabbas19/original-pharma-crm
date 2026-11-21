using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Auditing;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Lookups;
using OriginalPharma.Domain.Audit;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Tests.Integration;

/// <summary>
/// A city's default daily expense set by someone whose role was given expenses:settings (a rep, from the
/// phone): only the amount, only inside the scope, logged with the values before and after; nobody else.
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class CityExpenseDefaultTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task A_rep_given_only_the_expense_setting_changes_the_amount_of_their_towns_and_nothing_else()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var nasr = await DemoPeople.TerritoryAsync(db, "T-NSR");
        var dokki = await DemoPeople.TerritoryAsync(db, "T-DOK"); // Giza, outside the rep's area
        var before = await db.DbAsync(c => c.Territories.AsNoTracking().SingleAsync(t => t.Id == nasr, Ct));

        // Default roles: a rep has no say over the amounts.
        Assert.DoesNotContain((await db.RoleAsync(DefaultRoles.Rep)).Permissions, g => g.Key == Permissions.Expenses.Settings);
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            db.As<TerritoryService, TerritoryDto>(p.Rep, s => s.SetDefaultExpenseAsync(nasr, 99m, Ct)));
        Assert.Empty(await db.As<TerritoryService, List<TownDto>>(p.Rep, s => s.ListExpenseDefaultsAsync(Ct)));

        await db.GrantAsync(p.Admin, DefaultRoles.Rep, (Permissions.Expenses.Settings, PermissionScope.Own));
        var rep = await db.EffectivePermissionsAsync(p.Rep);
        Assert.False(rep.Has(Permissions.Territories.Manage));
        Assert.False(rep.Has(Permissions.Territories.Read));

        // The towns of the rep's own area, with their amounts.
        var towns = await db.As<TerritoryService, List<TownDto>>(p.Rep, s => s.ListExpenseDefaultsAsync(Ct));
        var eastCairo = await DemoPeople.TerritoryAsync(db, "A-CAI-E");
        Assert.NotEmpty(towns);
        Assert.All(towns, t => Assert.Equal(eastCairo, t.AreaId));
        Assert.Contains(towns, t => t.Id == nasr && t.DefaultDailyExpense == before.DefaultDailyExpense);
        Assert.DoesNotContain(towns, t => t.Id == dokki);

        var changed = await db.As<TerritoryService, TerritoryDto>(p.Rep, s => s.SetDefaultExpenseAsync(nasr, 72.5m, Ct));
        Assert.Equal(72.5m, changed.DefaultDailyExpense);
        var after = await db.DbAsync(c => c.Territories.AsNoTracking().SingleAsync(t => t.Id == nasr, Ct));
        Assert.Equal(
            (before.Name, before.NameAr, before.Code, before.ParentId, before.Level, before.ArchivedAt),
            (after.Name, after.NameAr, after.Code, after.ParentId, after.Level, after.ArchivedAt));
        Assert.Equal(72.5m, (await db.As<TerritoryService, List<TownDto>>(p.Rep, s => s.ListExpenseDefaultsAsync(Ct)))
            .Single(t => t.Id == nasr).DefaultDailyExpense);

        // Logged with the rep as the actor and the amounts before and after.
        var entry = await db.DbAsync(c => c.AuditEntries
            .Where(e => e.EntityType == AuditEntities.Territory && e.EntityId == nasr && e.Action == AuditAction.Updated)
            .OrderByDescending(e => e.CreatedAt).FirstAsync(Ct));
        Assert.Equal(p.Rep, entry.ActorId);
        using var details = JsonDocument.Parse(entry.Details);
        Assert.Equal(before.DefaultDailyExpense, details.RootElement.GetProperty("before").GetProperty("defaultDailyExpense").GetDecimal());
        Assert.Equal(72.5m, details.RootElement.GetProperty("after").GetProperty("defaultDailyExpense").GetDecimal());

        // Outside the area, and anything else about a town, stays out of reach.
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            db.As<TerritoryService, TerritoryDto>(p.Rep, s => s.SetDefaultExpenseAsync(dokki, 10m, Ct)));
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            db.As<TerritoryService, TerritoryDto>(p.Rep, s => s.UpdateAsync(nasr, new UpdateTerritoryRequest("Renamed", null, before.ParentId), Ct)));
        Assert.Equal(before.Name, await db.DbAsync(c => c.Territories.Where(t => t.Id == nasr).Select(t => t.Name).SingleAsync(Ct)));

        // The admin still sets any town, as before.
        var admin = await db.As<TerritoryService, TerritoryDto>(p.Admin, s => s.SetDefaultExpenseAsync(dokki, 55m, Ct));
        Assert.Equal(55m, admin.DefaultDailyExpense);
        Assert.Contains(await db.As<TerritoryService, List<TownDto>>(p.Admin, s => s.ListExpenseDefaultsAsync(Ct)), t => t.Id == dokki);
    }

    [Fact]
    public async Task The_territory_scope_reaches_every_town_under_the_callers_part_of_the_tree()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var heliopolis = await DemoPeople.TerritoryAsync(db, "T-HLP");
        var smouha = await DemoPeople.TerritoryAsync(db, "T-SMH"); // Alexandria

        // The supervisor role has no expense settings by default.
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            db.As<TerritoryService, TerritoryDto>(p.Supervisor, s => s.SetDefaultExpenseAsync(heliopolis, 40m, Ct)));

        await db.GrantAsync(p.Admin, DefaultRoles.AreaManager, (Permissions.Expenses.Settings, PermissionScope.Territory));
        Assert.Equal(40m, (await db.As<TerritoryService, TerritoryDto>(p.Area, s => s.SetDefaultExpenseAsync(heliopolis, 40m, Ct))).DefaultDailyExpense);
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            db.As<TerritoryService, TerritoryDto>(p.Area, s => s.SetDefaultExpenseAsync(smouha, 40m, Ct)));
    }
}
