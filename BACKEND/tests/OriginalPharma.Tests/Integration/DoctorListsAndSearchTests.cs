using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Crm;
using OriginalPharma.Application.Identity;
using OriginalPharma.Domain.Crm;
using OriginalPharma.Infrastructure.Persistence.Migrations;

namespace OriginalPharma.Tests.Integration;

/// <summary>Rep doctor lists seen by managers, the forgiving name search and the day / time search.</summary>
[Collection(PostgresCollection.Name)]
public sealed class DoctorListsAndSearchTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static Task<IReadOnlyList<DoctorDto>> ListAsync(TestDatabase db, Guid actor, DoctorQuery query) =>
        db.As<DoctorService, IReadOnlyList<DoctorDto>>(actor, s => s.ListAsync(query, Ct));

    private static async Task<string[]> Names(TestDatabase db, Guid actor, DoctorQuery query) =>
        (await ListAsync(db, actor, query)).Select(d => d.Name).ToArray();

    /// <summary>Adds a doctor; the search tests add look-alike names on purpose, so the duplicate warning is confirmed.</summary>
    private static Task<DoctorDto> CreateAsync(TestDatabase db, Guid actor, string name, string? nameAr, Guid town, Guid specialty, params DoctorSlotInput[] slots) =>
        db.As<DoctorService, DoctorDto>(actor, s => s.CreateAsync(new CreateDoctorRequest(name, nameAr, town, specialty, Availability: slots, DuplicateConfirmed: true), Ct));

    [Fact]
    public async Task A_rep_sees_only_their_own_list_and_managers_open_the_lists_below_them()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var giza = await DemoPeople.TerritoryAsync(db, "A-GIZ");
        var outsider = (await db.UsersAsync(p.Admin, s => s.CreateAsync(new CreateUserRequest(
            "rep.giza@test.local", "Giza Rep", PostgresFixture.Password, [DefaultRoles.Rep], p.Sales, giza), Ct))).User.Id;

        var mine = await ListAsync(db, p.Rep, new DoctorQuery(Mine: true));
        Assert.Equal(mine.Select(d => d.Id), (await ListAsync(db, p.Rep, new DoctorQuery(ListOf: p.Rep))).Select(d => d.Id));
        Assert.All(mine, d => Assert.True(d.OnMyList));

        // A rep never opens another rep's list.
        await Assert.ThrowsAsync<ForbiddenException>(() => ListAsync(db, p.Rep, new DoctorQuery(ListOf: p.RepEast)));
        await Assert.ThrowsAsync<ForbiddenException>(() => ListAsync(db, p.RepEast, new DoctorQuery(ListOf: p.Rep)));

        // The supervisor opens the lists of the team; the old repId parameter means the same.
        var eastList = await ListAsync(db, p.Supervisor, new DoctorQuery(ListOf: p.RepEast));
        Assert.Equal(3, eastList.Count);
        Assert.Equal(eastList.Select(d => d.Id), (await ListAsync(db, p.Supervisor, new DoctorQuery(RepId: p.RepEast))).Select(d => d.Id));
        Assert.Equal(mine.Select(d => d.Id), (await ListAsync(db, p.Area, new DoctorQuery(ListOf: p.Rep))).Select(d => d.Id));

        // Outside the subtree or the territory: refused. Above the caller: refused even with scope "all".
        await Assert.ThrowsAsync<ForbiddenException>(() => ListAsync(db, p.Supervisor, new DoctorQuery(ListOf: outsider)));
        await Assert.ThrowsAsync<ForbiddenException>(() => ListAsync(db, p.Area, new DoctorQuery(ListOf: outsider)));
        await Assert.ThrowsAsync<ForbiddenException>(() => ListAsync(db, p.Supervisor, new DoctorQuery(ListOf: p.Area)));
        await Assert.ThrowsAsync<ForbiddenException>(() => ListAsync(db, p.Sales, new DoctorQuery(ListOf: p.Admin)));
        Assert.Empty(await ListAsync(db, p.Sales, new DoctorQuery(ListOf: outsider)));
        await Assert.ThrowsAsync<NotFoundException>(() => ListAsync(db, p.Admin, new DoctorQuery(ListOf: Guid.NewGuid())));

        // A doctor a manager adds for a rep goes on that rep's list; "added by" stays the manager.
        var nasr = await DemoPeople.TerritoryAsync(db, "T-NSR");
        var cardiology = await DemoPeople.SpecialtyAsync(db, "Cardiology");
        var forEast = await db.As<DoctorService, DoctorDto>(p.Supervisor, s =>
            s.CreateAsync(new CreateDoctorRequest("Dr. Given Away", null, nasr, cardiology, RepId: p.RepEast), Ct));
        Assert.Equal(p.Supervisor, forEast.CreatedById);
        Assert.Contains(await ListAsync(db, p.RepEast, new DoctorQuery(Mine: true)), d => d.Id == forEast.Id);
        Assert.DoesNotContain(await ListAsync(db, p.Supervisor, new DoctorQuery(Mine: true)), d => d.Id == forEast.Id);

        // Taking a doctor off the list never deletes it.
        await db.As<DoctorService>(p.RepEast, s => s.RemoveFromMyListAsync(forEast.Id, Ct));
        Assert.DoesNotContain(await ListAsync(db, p.RepEast, new DoctorQuery(Mine: true)), d => d.Id == forEast.Id);
        Assert.Contains(await ListAsync(db, p.Sales, new DoctorQuery(Unassigned: true)), d => d.Id == forEast.Id);
    }

    [Fact]
    public async Task The_name_search_forgives_spelling_and_lists_the_closest_names_first()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var nasr = await DemoPeople.TerritoryAsync(db, "T-NSR");
        var cardiology = await DemoPeople.SpecialtyAsync(db, "Cardiology");
        await CreateAsync(db, p.Rep, "عبد الأحمدي", null, nasr, cardiology); // contains
        await CreateAsync(db, p.Rep, "محمد أحمد", null, nasr, cardiology); // a word starts with it
        await CreateAsync(db, p.Rep, "د. أحمد", null, nasr, cardiology); // the whole name
        // "Dr. Ahmed Fathy" / "د. أحمد فتحي" (demo) starts with it.
        string[] expected = ["د. أحمد", "Dr. Ahmed Fathy", "محمد أحمد", "عبد الأحمدي"];

        foreach (var text in new[] { "احمد", "أحمد", "إحمد", "د. احمد", "  أحمـــد " })
        {
            Assert.Equal(expected, await Names(db, p.Rep, new DoctorQuery(Mine: true, Search: text)));
        }

        // The same search in a manager's view of the rep's list, in everything a manager sees, and paged.
        Assert.Equal(expected, await Names(db, p.Supervisor, new DoctorQuery(ListOf: p.Rep, Search: "احمد")));
        Assert.Equal(expected, await Names(db, p.Sales, new DoctorQuery(Search: "احمد")));
        Assert.Equal(expected[..2], await Names(db, p.Rep, new DoctorQuery(Mine: true, Search: "احمد", Page: 1, PageSize: 2)));
        Assert.Equal(expected[2..], await Names(db, p.Rep, new DoctorQuery(Mine: true, Search: "احمد", Page: 2, PageSize: 2)));

        // English names, a leading title, phone numbers; the other rep's list stays apart.
        Assert.Equal(["Dr. Ahmed Fathy"], await Names(db, p.Rep, new DoctorQuery(Mine: true, Search: "DR. AHMED")));
        Assert.Equal(["Dr. Ahmed Fathy"], await Names(db, p.Rep, new DoctorQuery(Mine: true, Search: "01001234501")));
        Assert.Empty(await Names(db, p.RepEast, new DoctorQuery(Mine: true, Search: "محمد أحمد")));

        // The directory (add an existing doctor) and the pharmacy list use the same rules.
        var directory = await db.As<DoctorService, IReadOnlyList<DoctorDto>>(p.RepEast, s => s.SearchDirectoryAsync("إحمد", null, null, Ct));
        Assert.Equal(expected, directory.Select(d => d.Name));
        var pharmacy = await db.DbAsync(c => c.Customers.Where(x => x.Type == CustomerType.Pharmacy).OrderBy(x => x.Name).FirstAsync(Ct));
        var pharmacies = await db.As<CustomerService, IReadOnlyList<CustomerDto>>(p.Sales, s =>
            s.ListAsync(CustomerType.Pharmacy, pharmacy.Name.ToUpperInvariant(), cancellationToken: Ct));
        Assert.Equal(pharmacy.Id, pharmacies[0].Id);
    }

    [Fact]
    public async Task The_time_search_matches_overlapping_slots_and_combines_with_the_other_filters()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var nasr = await DemoPeople.TerritoryAsync(db, "T-NSR");
        var cardiology = await DemoPeople.SpecialtyAsync(db, "Cardiology");
        static DoctorSlotInput Sat(string start, string end) => new(DayOfWeek.Saturday, start, end);
        await CreateAsync(db, p.Rep, "Dr. Window One", null, nasr, cardiology, Sat("17:00", "18:00"));
        await CreateAsync(db, p.Rep, "Dr. Window Two", null, nasr, cardiology, Sat("17:00", "17:50"));
        await CreateAsync(db, p.Rep, "Dr. Window Three", null, nasr, cardiology, Sat("16:00", "17:45"));
        await CreateAsync(db, p.Rep, "Dr. Window Four", null, nasr, cardiology, new DoctorSlotInput(DayOfWeek.Sunday, "17:00", "18:00"));

        DoctorQuery Query(string? from, string? to, DayOfWeek? weekday = DayOfWeek.Saturday) =>
            new(Mine: true, Search: "window", Weekday: weekday, TimeFrom: from, TimeTo: to);

        // 5:45 pm to 6:00 pm: the 5:00-6:00 and 5:00-5:50 doctors, not the one ending at 5:45.
        var found = await ListAsync(db, p.Rep, Query("17:45", "18:00"));
        Assert.Equal(["Dr. Window One", "Dr. Window Two"], found.Select(d => d.Name).Order());
        Assert.Equal(["Dr. Window Four", "Dr. Window One", "Dr. Window Two"], (await Names(db, p.Rep, Query("17:45", "18:00", weekday: null))).Order());
        Assert.Equal(["Dr. Window One", "Dr. Window Two"], (await Names(db, p.Rep, Query("17:45", null))).Order());
        Assert.Equal(["Dr. Window Three"], await Names(db, p.Rep, Query(null, "17:00")));
        Assert.Empty(await Names(db, p.Rep, Query("18:00", "19:00")));

        // The same search on a manager's view of the rep's list and on another rep's (empty) list.
        Assert.Equal(["Dr. Window One", "Dr. Window Two"],
            (await Names(db, p.Supervisor, Query("17:45", "18:00") with { Mine = false, ListOf = p.Rep })).Order());
        Assert.Empty(await Names(db, p.Supervisor, Query("17:45", "18:00") with { Mine = false, ListOf = p.RepEast }));
    }

    [Fact]
    public async Task Saved_customers_carry_search_names_that_match_the_migration_sql()
    {
        await using var db = await postgres.CreateDatabaseAsync();

        string[] samples =
        [
            "د. أحمد فتحي", "إحمد", "آمال", "مُحَمَّد", "محـــمد", "مصطفى", "فاطمة", "مؤمن", "هانئ", "د/ منى", "دكتورة منى",
            "دكتوراه", "Dr. Ahmed  Fathy", "DR Ahmed", "Drew Smith", "  a \t b  ", "د.", "د",
        ];
        // The migration's expression applied to a parameter ({0}), so the sample is never part of the SQL text.
        var normalize = "SELECT " + AddRepDoctorListsAndNameSearch.NormalizeSql("{0}") + " AS \"Value\"";
        foreach (var sample in samples)
        {
            var sql = await db.DbAsync(c => c.Database.SqlQueryRaw<string>(normalize, sample).SingleAsync(Ct));
            Assert.Equal(CustomerNameSearch.Normalize(sample), sql);
        }

        // The seeded rows were saved through the context: their search names are already there.
        var rows = await db.DbAsync(c => c.Customers.AsNoTracking().Select(x => new { x.Name, x.NameAr, x.NameSearch, x.NameArSearch }).ToListAsync(Ct));
        Assert.NotEmpty(rows);
        Assert.All(rows, r => Assert.Equal(
            (CustomerNameSearch.Normalize(r.Name), string.IsNullOrWhiteSpace(r.NameAr) ? null : CustomerNameSearch.Normalize(r.NameAr)),
            (r.NameSearch, r.NameArSearch)));
    }

    [Fact]
    public async Task The_backfill_puts_listless_doctors_on_their_creators_list_and_can_run_again()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var salma = await DemoPeople.DoctorAsync(db, "Dr. Salma Ibrahim"); // on nobody's list
        var omar = await DemoPeople.DoctorAsync(db, "Dr. Omar Khaled"); // on nobody's list, creator unknown
        var ahmed = await DemoPeople.DoctorAsync(db, "Dr. Ahmed Fathy"); // on the rep's list
        await db.DbAsync(c => c.Database.ExecuteSqlRawAsync(
            "UPDATE customers SET created_by_id = {0} WHERE id = {1}; UPDATE customers SET created_by_id = {2} WHERE id = {3}; " +
            "UPDATE customers SET name_search = '', name_ar_search = NULL;",
            [p.Rep, salma, p.RepEast, ahmed], Ct));
        var before = await db.DbAsync(c => c.RepDoctors.CountAsync(Ct));

        // Both steps exactly as the migration runs them; the result is the number of list rows added.
        Task<int> BackfillAsync() => db.DbAsync(async c =>
        {
            await c.Database.ExecuteSqlRawAsync(AddRepDoctorListsAndNameSearch.BackfillNameSearchSql, Ct);
            return await c.Database.ExecuteSqlRawAsync(AddRepDoctorListsAndNameSearch.BackfillRepDoctorsSql, Ct);
        });

        Assert.Equal(1, await BackfillAsync());
        Assert.Equal(0, await BackfillAsync());
        Assert.Equal(before + 1, await db.DbAsync(c => c.RepDoctors.CountAsync(Ct)));

        var lists = await db.DbAsync(c => c.RepDoctors.AsNoTracking()
            .Where(a => a.CustomerId == salma || a.CustomerId == omar || a.CustomerId == ahmed)
            .Select(a => new { a.CustomerId, a.UserId })
            .ToListAsync(Ct));
        Assert.Equal(p.Rep, Assert.Single(lists, a => a.CustomerId == salma).UserId);
        Assert.DoesNotContain(lists, a => a.CustomerId == omar);
        Assert.DoesNotContain(lists, a => a.CustomerId == ahmed && a.UserId == p.RepEast); // already on a list: left alone

        Assert.Contains(await Names(db, p.Rep, new DoctorQuery(Mine: true, Search: "سلمى ابراهيم")), n => n == "Dr. Salma Ibrahim");
    }
}
