using System.Text.Json;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Auditing;
using OriginalPharma.Domain.Audit;
using OriginalPharma.Domain.Common;

namespace OriginalPharma.Application.Settings;

/// <summary>The blocks the rep app can show on its Home screen.</summary>
public static class RepHomeSections
{
    public const string TodayProgress = "todayProgress";
    public const string UpcomingVisits = "upcomingVisits";
    public const string StartNextVisit = "startNextVisit";
    public const string WeeklySummary = "weeklySummary";
    public const string TargetsAndSales = "targetsAndSales";
    public const string ManagerAlerts = "managerAlerts";

    public static readonly IReadOnlyList<string> All =
        [TodayProgress, UpcomingVisits, StartNextVisit, WeeklySummary, TargetsAndSales, ManagerAlerts];
}

/// <param name="Key">One of <see cref="RepHomeSections.All"/>.</param>
public sealed record RepHomeSectionDto(string Key, bool Enabled);

/// <summary>Which Home blocks the rep app shows, in this order (every block listed once).</summary>
/// <param name="DailyVisitTarget">Visits a rep aims for per day: the "x / target" of the progress card.</param>
public sealed record RepHomeConfigDto(IReadOnlyList<RepHomeSectionDto> Sections, int DailyVisitTarget);

/// <param name="IsDefault">Nothing saved yet: these are the defaults.</param>
/// <param name="Defaults">What "Reset to defaults" restores.</param>
public sealed record RepHomeSettingsDto(
    IReadOnlyList<RepHomeSectionDto> Sections,
    int DailyVisitTarget,
    bool IsDefault,
    DateTimeOffset? UpdatedAt,
    string? UpdatedByName,
    RepHomeConfigDto Defaults);

public sealed record UpdateRepHomeSettingsRequest(IReadOnlyList<RepHomeSectionDto> Sections, int DailyVisitTarget);

public sealed class UpdateRepHomeSettingsRequestValidator : AbstractValidator<UpdateRepHomeSettingsRequest>
{
    public UpdateRepHomeSettingsRequestValidator()
    {
        RuleFor(x => x.Sections).NotNull()
            .Must(s => s is null || s.All(x => RepHomeSections.All.Contains(x.Key)))
            .WithMessage("Unknown Home section.")
            .Must(s => s is null || (s.Count == RepHomeSections.All.Count && s.Select(x => x.Key).Distinct().Count() == s.Count))
            .WithMessage("List every Home section exactly once.");
        RuleFor(x => x.DailyVisitTarget).InclusiveBetween(1, 50);
    }
}

/// <summary>
/// The rep Home layout chosen by an admin (Settings, Rep home), stored in app_settings under
/// <see cref="Key"/> as one JSON document. Every signed-in user can read it; settings:manage changes it.
/// </summary>
public sealed class RepHomeSettingsService(IAppDbContext db, ICurrentUser currentUser, AuditTrail audit, TimeProvider time)
{
    public const string Key = "rep-home";
    public const int DefaultDailyVisitTarget = 8;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>Today's progress, upcoming visits, the start button and manager alerts on; weekly summary and targets off.</summary>
    public static RepHomeConfigDto Defaults { get; } = new(
        [
            new(RepHomeSections.TodayProgress, true),
            new(RepHomeSections.UpcomingVisits, true),
            new(RepHomeSections.StartNextVisit, true),
            new(RepHomeSections.WeeklySummary, false),
            new(RepHomeSections.TargetsAndSales, false),
            new(RepHomeSections.ManagerAlerts, true),
        ],
        DefaultDailyVisitTarget);

    public async Task<RepHomeSettingsDto> GetAsync(CancellationToken cancellationToken = default)
    {
        currentUser.RequireUserId();
        var row = await db.AppSettings.AsNoTracking().SingleOrDefaultAsync(s => s.Key == Key, cancellationToken);
        return await ToDtoAsync(Parse(row) ?? Defaults, row, cancellationToken);
    }

    public async Task<RepHomeSettingsDto> UpdateAsync(UpdateRepHomeSettingsRequest request, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var row = await db.AppSettings.SingleOrDefaultAsync(s => s.Key == Key, cancellationToken);
        var before = Parse(row) ?? Defaults;
        var after = new RepHomeConfigDto(request.Sections.Select(s => new RepHomeSectionDto(s.Key, s.Enabled)).ToList(), request.DailyVisitTarget);

        if (row is null)
        {
            row = new AppSetting { Key = Key };
            db.AppSettings.Add(row);
        }

        row.Value = JsonSerializer.Serialize(after, Json);
        row.UpdatedAt = time.GetUtcNow();
        row.UpdatedById = me;
        await audit.AddAsync(AuditEntities.Settings, null, AuditAction.Updated, new { key = Key, before, after }, cancellationToken: cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return await ToDtoAsync(after, row, cancellationToken);
    }

    /// <summary>
    /// The saved document, made safe to show: unknown blocks are dropped and blocks added in a later version
    /// are appended with their default state. Unreadable JSON counts as nothing saved.
    /// </summary>
    internal static RepHomeConfigDto? Parse(AppSetting? row)
    {
        if (row is null)
        {
            return null;
        }

        RepHomeConfigDto? saved;
        try
        {
            saved = JsonSerializer.Deserialize<RepHomeConfigDto>(row.Value, Json);
        }
        catch (JsonException)
        {
            return null;
        }

        if (saved?.Sections is null)
        {
            return null;
        }

        var known = saved.Sections.Where(s => RepHomeSections.All.Contains(s.Key)).DistinctBy(s => s.Key).ToList();
        known.AddRange(Defaults.Sections.Where(d => known.All(k => k.Key != d.Key)));
        var target = saved.DailyVisitTarget is >= 1 and <= 50 ? saved.DailyVisitTarget : DefaultDailyVisitTarget;
        return new RepHomeConfigDto(known, target);
    }

    private async Task<RepHomeSettingsDto> ToDtoAsync(RepHomeConfigDto config, AppSetting? row, CancellationToken cancellationToken)
    {
        var updatedBy = row?.UpdatedById is { } id
            ? await db.Users.AsNoTracking().Where(u => u.Id == id).Select(u => u.FullName).SingleOrDefaultAsync(cancellationToken)
            : null;
        return new RepHomeSettingsDto(config.Sections, config.DailyVisitTarget, row is null, row?.UpdatedAt, updatedBy, Defaults);
    }
}
