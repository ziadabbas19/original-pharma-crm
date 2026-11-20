using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OriginalPharma.Application.Settings;
using OriginalPharma.Domain.Common;

namespace OriginalPharma.Tests.Integration;

/// <summary>The admin-chosen layout of the rep app's Home screen.</summary>
[Collection(PostgresCollection.Name)]
public sealed class RepHomeSettingsTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static UpdateRepHomeSettingsRequest Request(int target, params (string Key, bool Enabled)[] sections) =>
        new(sections.Select(s => new RepHomeSectionDto(s.Key, s.Enabled)).ToList(), target);

    [Fact]
    public async Task Until_an_admin_saves_it_everyone_gets_the_defaults()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);

        var settings = await db.As<RepHomeSettingsService, RepHomeSettingsDto>(p.Rep, s => s.GetAsync(Ct));

        Assert.True(settings.IsDefault);
        Assert.Equal(8, settings.DailyVisitTarget);
        Assert.Equal(RepHomeSections.All, settings.Sections.Select(s => s.Key));
        Assert.Equal(
            [RepHomeSections.TodayProgress, RepHomeSections.UpcomingVisits, RepHomeSections.StartNextVisit, RepHomeSections.ManagerAlerts],
            settings.Sections.Where(s => s.Enabled).Select(s => s.Key));
        Assert.Equal(settings.Sections, settings.Defaults.Sections);
    }

    [Fact]
    public async Task An_admin_saves_the_order_and_the_switches_and_the_rep_reads_them()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);

        var saved = await db.As<RepHomeSettingsService, RepHomeSettingsDto>(p.Admin, s => s.UpdateAsync(Request(
            6,
            (RepHomeSections.StartNextVisit, true),
            (RepHomeSections.ManagerAlerts, false),
            (RepHomeSections.TodayProgress, true),
            (RepHomeSections.WeeklySummary, true),
            (RepHomeSections.UpcomingVisits, false),
            (RepHomeSections.TargetsAndSales, false)), Ct));
        Assert.False(saved.IsDefault);
        Assert.Equal("System Admin", saved.UpdatedByName);

        var read = await db.As<RepHomeSettingsService, RepHomeSettingsDto>(p.Rep, s => s.GetAsync(Ct));

        Assert.Equal(6, read.DailyVisitTarget);
        Assert.Equal(
            [RepHomeSections.StartNextVisit, RepHomeSections.TodayProgress, RepHomeSections.WeeklySummary],
            read.Sections.Where(s => s.Enabled).Select(s => s.Key));
        Assert.Equal(RepHomeSections.StartNextVisit, read.Sections[0].Key);
        var audit = await db.DbAsync(c => c.AuditEntries.Where(a => a.EntityType == "settings").Select(a => a.Details).ToListAsync(Ct));
        Assert.Contains(audit, details => details.Contains("rep-home"));
    }

    [Fact]
    public async Task Missing_duplicate_or_unknown_sections_are_refused()
    {
        var validator = new UpdateRepHomeSettingsRequestValidator();
        var all = RepHomeSections.All.Select(k => (k, true)).ToArray();

        Assert.True((await validator.ValidateAsync(Request(8, all), Ct)).IsValid);
        Assert.False((await validator.ValidateAsync(Request(8, all[..^1]), Ct)).IsValid);
        Assert.False((await validator.ValidateAsync(Request(8, [.. all[..^1], (RepHomeSections.TodayProgress, false)]), Ct)).IsValid);
        Assert.False((await validator.ValidateAsync(Request(8, [.. all[..^1], ("leaderboard", true)]), Ct)).IsValid);
        Assert.False((await validator.ValidateAsync(Request(0, all), Ct)).IsValid);
        Assert.False((await validator.ValidateAsync(Request(51, all), Ct)).IsValid);

        // The validator is the one the API runs on every request.
        await using var db = await postgres.CreateDatabaseAsync();
        var registered = await db.AsAsync(Guid.Empty, sp => Task.FromResult(sp.GetService<IValidator<UpdateRepHomeSettingsRequest>>()));
        Assert.NotNull(registered);
    }

    [Fact]
    public async Task A_document_from_another_version_is_read_safely()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        await db.DbAsync(async c =>
        {
            c.AppSettings.Add(new AppSetting
            {
                Key = RepHomeSettingsService.Key,
                Value = """{"sections":[{"key":"managerAlerts","enabled":true},{"key":"oldBlock","enabled":true},{"key":"todayProgress","enabled":false}],"dailyVisitTarget":500}""",
                UpdatedAt = DateTimeOffset.UtcNow,
            });
            return await c.SaveChangesAsync(Ct);
        });

        var read = await db.As<RepHomeSettingsService, RepHomeSettingsDto>(p.Rep, s => s.GetAsync(Ct));

        Assert.Equal(RepHomeSections.ManagerAlerts, read.Sections[0].Key);
        Assert.False(read.Sections[1].Enabled);
        Assert.DoesNotContain(read.Sections, s => s.Key == "oldBlock");
        Assert.Equal(RepHomeSections.All.Count, read.Sections.Count);
        Assert.Equal(RepHomeSettingsService.DefaultDailyVisitTarget, read.DailyVisitTarget);

        await db.DbAsync(async c =>
        {
            var row = await c.AppSettings.SingleAsync(s => s.Key == RepHomeSettingsService.Key, Ct);
            row.Value = """{"sections":5}""";
            return await c.SaveChangesAsync(Ct);
        });
        Assert.Equal(RepHomeSettingsService.Defaults.Sections, (await db.As<RepHomeSettingsService, RepHomeSettingsDto>(p.Rep, s => s.GetAsync(Ct))).Sections);
    }
}
