using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Expenses;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Lookups;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Tests.Integration;

/// <summary>
/// Each rep's own daily amount per town: it changes nothing for other reps, the town's amount stays the
/// fallback, and the automatic expense line of each rep uses that rep's amount.
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class RepTownExpenseDefaultTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static async Task<TownDto> TownAsync(TestDatabase db, Guid actor, Guid town) =>
        (await db.As<TerritoryService, List<TownDto>>(actor, s => s.ListExpenseDefaultsAsync(Ct))).Single(t => t.Id == town);

    private static Task<decimal> FallbackAsync(TestDatabase db, Guid town) =>
        db.DbAsync(c => c.Territories.Where(t => t.Id == town).Select(t => t.DefaultDailyExpense).SingleAsync(Ct));

    private static async Task<decimal?> AutoLineAsync(TestDatabase db, Guid rep, Guid town, DateTimeOffset at)
    {
        var area = await db.DbAsync(c => c.Users.Where(u => u.Id == rep).Select(u => u.TerritoryId).SingleAsync(Ct));
        await db.As<ExpenseService>(rep, s => s.EnsureAutoLineAsync(rep, area, at, town, Ct));
        return await db.DbAsync(c => c.ExpenseLines
            .Where(l => l.UserId == rep && l.CityId == town && l.ArchivedAt == null)
            .OrderByDescending(l => l.CreatedAt)
            .Select(l => (decimal?)l.Amount)
            .FirstOrDefaultAsync(Ct));
    }

    [Fact]
    public async Task A_reps_own_amount_changes_nothing_for_other_reps_and_the_town_keeps_its_amount()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var nasr = await DemoPeople.TerritoryAsync(db, "T-NSR");
        var dokki = await DemoPeople.TerritoryAsync(db, "T-DOK"); // Giza, outside both reps' area
        await db.GrantAsync(p.Admin, DefaultRoles.Rep, (Permissions.Expenses.Settings, PermissionScope.Own));
        await db.As<TerritoryService, TerritoryDto>(p.Admin, s => s.SetDefaultExpenseAsync(nasr, 50m, Ct));

        // Rep A sets 30 for Nasr City: theirs only.
        var mine = await db.As<TerritoryService, TownDto>(p.Rep, s => s.SetMyExpenseDefaultAsync(nasr, 30m, Ct));
        Assert.Equal((30m, true, (decimal?)50m), (mine.DefaultDailyExpense, mine.IsOwn, mine.FallbackAmount));
        Assert.Equal((30m, true), ((await TownAsync(db, p.Rep, nasr)).DefaultDailyExpense, (await TownAsync(db, p.Rep, nasr)).IsOwn));

        // Rep B still sees the town's amount, and the town keeps it.
        var other = await TownAsync(db, p.RepEast, nasr);
        Assert.Equal((50m, false, (decimal?)50m), (other.DefaultDailyExpense, other.IsOwn, other.FallbackAmount));
        Assert.Equal(50m, await FallbackAsync(db, nasr));

        // The town list used by the expense forms suggests each rep's own amount.
        Assert.Equal(30m, (await db.As<LookupService, List<TownDto>>(p.Rep, s => s.ListTownsAsync(Ct))).Single(t => t.Id == nasr).DefaultDailyExpense);
        Assert.Equal(50m, (await db.As<LookupService, List<TownDto>>(p.RepEast, s => s.ListTownsAsync(Ct))).Single(t => t.Id == nasr).DefaultDailyExpense);

        // An older app still calls the town's endpoint: with the "own" scope it sets the rep's own amount.
        var legacy = await db.As<TerritoryService, TerritoryDto>(p.Rep, s => s.SetDefaultExpenseAsync(nasr, 35m, Ct));
        Assert.Equal(35m, legacy.DefaultDailyExpense);
        Assert.Equal(50m, await FallbackAsync(db, nasr));
        Assert.Equal(50m, (await TownAsync(db, p.RepEast, nasr)).DefaultDailyExpense);

        // Outside the scope: refused, as for the town's amount.
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            db.As<TerritoryService, TownDto>(p.Rep, s => s.SetMyExpenseDefaultAsync(dokki, 10m, Ct)));

        // The admin screen keeps setting the town's amount and never writes a rep's row.
        await db.As<TerritoryService, TerritoryDto>(p.Admin, s => s.SetDefaultExpenseAsync(nasr, 60m, Ct));
        Assert.Equal(60m, await FallbackAsync(db, nasr));
        Assert.Equal(35m, (await TownAsync(db, p.Rep, nasr)).DefaultDailyExpense);
        Assert.Equal(60m, (await TownAsync(db, p.RepEast, nasr)).DefaultDailyExpense);
        Assert.Equal(1, await db.DbAsync(c => c.RepTownExpenseDefaults.CountAsync(Ct)));

        // "Use the default amount" removes the own amount.
        var cleared = await db.As<TerritoryService, TownDto>(p.Rep, s => s.ClearMyExpenseDefaultAsync(nasr, Ct));
        Assert.Equal((60m, false), (cleared.DefaultDailyExpense, cleared.IsOwn));
        Assert.Equal(0, await db.DbAsync(c => c.RepTownExpenseDefaults.CountAsync(Ct)));
    }

    [Fact]
    public async Task The_automatic_expense_line_uses_each_reps_own_amount_and_old_lines_keep_theirs()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var nasr = await DemoPeople.TerritoryAsync(db, "T-NSR");
        await db.GrantAsync(p.Admin, DefaultRoles.Rep, (Permissions.Expenses.Settings, PermissionScope.Own));
        await db.As<TerritoryService, TerritoryDto>(p.Admin, s => s.SetDefaultExpenseAsync(nasr, 50m, Ct));
        await db.As<TerritoryService, TownDto>(p.Rep, s => s.SetMyExpenseDefaultAsync(nasr, 30m, Ct));

        var yesterday = db.Clock.GetUtcNow().AddDays(-1);
        Assert.Equal(30m, await AutoLineAsync(db, p.Rep, nasr, yesterday));
        Assert.Equal(50m, await AutoLineAsync(db, p.RepEast, nasr, yesterday));

        // A new amount reaches only new lines.
        await db.As<TerritoryService, TownDto>(p.Rep, s => s.SetMyExpenseDefaultAsync(nasr, 42m, Ct));
        var lines = await db.DbAsync(c => c.ExpenseLines.Where(l => l.CityId == nasr).Select(l => new { l.UserId, l.Amount }).ToListAsync(Ct));
        Assert.Contains(lines, l => l.UserId == p.Rep && l.Amount == 30m);
        Assert.Equal(42m, await AutoLineAsync(db, p.Rep, nasr, db.Clock.GetUtcNow()));

        // Zero as the rep's own amount: no line for them, the others still get the town's amount.
        await db.As<TerritoryService, TownDto>(p.Rep, s => s.SetMyExpenseDefaultAsync(nasr, 0m, Ct));
        var twoDaysAgo = db.Clock.GetUtcNow().AddDays(-2);
        var area = await db.DbAsync(c => c.Users.Where(u => u.Id == p.Rep).Select(u => u.TerritoryId).SingleAsync(Ct));
        await db.As<ExpenseService>(p.Rep, s => s.EnsureAutoLineAsync(p.Rep, area, twoDaysAgo, nasr, Ct));
        Assert.Equal(2, await db.DbAsync(c => c.ExpenseLines.CountAsync(l => l.UserId == p.Rep && l.CityId == nasr, Ct)));
        Assert.Equal(50m, await AutoLineAsync(db, p.RepEast, nasr, twoDaysAgo));
    }
}
