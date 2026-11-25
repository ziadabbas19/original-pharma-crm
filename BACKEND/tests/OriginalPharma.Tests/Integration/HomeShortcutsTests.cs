using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OriginalPharma.Application.Identity;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Tests.Integration;

/// <summary>Home shortcuts: each user's own list, only known keys, at most eight.</summary>
[Collection(PostgresCollection.Name)]
public sealed class HomeShortcutsTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static Task<HomeShortcutsDto> GetAsync(TestDatabase db, Guid user) =>
        db.As<HomeShortcutsService, HomeShortcutsDto>(user, s => s.GetAsync(Ct));

    private static Task<HomeShortcutsDto> SaveAsync(TestDatabase db, Guid user, params string[] keys) =>
        db.As<HomeShortcutsService, HomeShortcutsDto>(user, s => s.UpdateAsync(new UpdateHomeShortcutsRequest(keys), Ct));

    [Fact]
    public async Task Each_user_reads_and_changes_only_their_own_shortcuts()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);

        // Nothing saved yet: no list, so the app shows the defaults of the role.
        Assert.Null((await GetAsync(db, p.Rep)).Keys);

        var saved = await SaveAsync(db, p.Rep, "newOrder", "startVisit", "notes");
        Assert.Equal(["newOrder", "startVisit", "notes"], saved.Keys);
        Assert.NotNull(saved.UpdatedAt);

        // The other rep still has nothing, and saving theirs leaves the first rep's list alone.
        Assert.Null((await GetAsync(db, p.RepEast)).Keys);
        await SaveAsync(db, p.RepEast, "expenses");
        Assert.Equal(["newOrder", "startVisit", "notes"], (await GetAsync(db, p.Rep)).Keys);
        Assert.Equal(["expenses"], (await GetAsync(db, p.RepEast)).Keys);

        // Saving again replaces the list in its new order; an empty list is kept as empty.
        await SaveAsync(db, p.Rep, "notes", "newOrder");
        Assert.Equal(["notes", "newOrder"], (await GetAsync(db, p.Rep)).Keys);
        await SaveAsync(db, p.Rep);
        Assert.Equal([], (await GetAsync(db, p.Rep)).Keys);

        var rows = await db.DbAsync(c => c.UserHomeShortcuts.Select(s => s.UserId).ToListAsync(Ct));
        Assert.Equal(new[] { p.Rep, p.RepEast }.Order(), rows.Order());
    }

    [Fact]
    public async Task Unknown_repeated_or_more_than_eight_keys_are_refused()
    {
        var validator = new UpdateHomeShortcutsRequestValidator();
        static UpdateHomeShortcutsRequest Request(params string[] keys) => new(keys);
        var eight = HomeShortcutCatalog.Keys.Take(8).ToArray();

        Assert.True((await validator.ValidateAsync(Request(eight), Ct)).IsValid);
        Assert.True((await validator.ValidateAsync(Request(), Ct)).IsValid);
        Assert.False((await validator.ValidateAsync(Request("startVisit", "leaderboard"), Ct)).IsValid);
        Assert.False((await validator.ValidateAsync(Request("StartVisit"), Ct)).IsValid);
        Assert.False((await validator.ValidateAsync(Request("notes", "notes"), Ct)).IsValid);
        Assert.False((await validator.ValidateAsync(Request(HomeShortcutCatalog.Keys.Take(9).ToArray()), Ct)).IsValid);
        Assert.False((await validator.ValidateAsync(new UpdateHomeShortcutsRequest(null!), Ct)).IsValid);

        // The validator is the one the API runs on every request.
        await using var db = await postgres.CreateDatabaseAsync();
        var registered = await db.AsAsync(Guid.Empty, sp => Task.FromResult(sp.GetService<IValidator<UpdateHomeShortcutsRequest>>()));
        Assert.NotNull(registered);
    }

    [Fact]
    public async Task Keys_the_app_no_longer_offers_are_dropped_when_read()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        await db.DbAsync(c =>
        {
            c.UserHomeShortcuts.Add(new UserHomeShortcuts
            {
                UserId = p.Rep,
                Keys = """["startVisit","leaderboard","notes","startVisit"]""",
                UpdatedAt = DateTimeOffset.UtcNow,
            });
            return c.SaveChangesAsync(Ct);
        });

        Assert.Equal(["startVisit", "notes"], (await GetAsync(db, p.Rep)).Keys);
    }
}
