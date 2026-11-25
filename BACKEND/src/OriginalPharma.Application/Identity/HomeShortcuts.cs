using System.Text.Json;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Application.Identity;

/// <summary>
/// The shortcut actions the phone Home can show. The app holds the icons, labels and the permission each
/// one needs (FRONTEND/src/features/home/shortcuts.ts); keep both lists in sync.
/// </summary>
public static class HomeShortcutCatalog
{
    public const int MaxShortcuts = 8;

    public static IReadOnlyList<string> Keys { get; } =
    [
        "startVisit",
        "todayPlan",
        "weeklyPlan",
        "newOrder",
        "orders",
        "newExpense",
        "expenses",
        "newNote",
        "notes",
        "addDoctor",
        "doctors",
        "pharmacies",
        "addPharmacy",
        "places",
        "products",
        "notifications",
        "statistics",
        "myVisits",
        "account",
        "trackingHealth",
        "management",
    ];

    public static bool IsKnown(string? key) => key is not null && Keys.Contains(key, StringComparer.Ordinal);
}

/// <param name="Keys">The saved shortcuts in their order; null when the user never saved any (the app shows its role's defaults).</param>
public sealed record HomeShortcutsDto(IReadOnlyList<string>? Keys, DateTimeOffset? UpdatedAt);

/// <param name="Keys">At most 8 catalog keys, each once, in the order they are shown. An empty list hides the grid.</param>
public sealed record UpdateHomeShortcutsRequest(IReadOnlyList<string> Keys);

public sealed class UpdateHomeShortcutsRequestValidator : AbstractValidator<UpdateHomeShortcutsRequest>
{
    public UpdateHomeShortcutsRequestValidator()
    {
        RuleFor(r => r.Keys).NotNull();
        RuleFor(r => r.Keys.Count).LessThanOrEqualTo(HomeShortcutCatalog.MaxShortcuts).When(r => r.Keys is not null)
            .OverridePropertyName(nameof(UpdateHomeShortcutsRequest.Keys));
        RuleFor(r => r.Keys).Must(keys => keys.Distinct(StringComparer.Ordinal).Count() == keys.Count)
            .When(r => r.Keys is not null).WithMessage("Each shortcut can be added once.");
        RuleForEach(r => r.Keys).Must(HomeShortcutCatalog.IsKnown).WithMessage("Unknown shortcut '{PropertyValue}'.");
    }
}

/// <summary>
/// The signed-in user's own Home shortcuts, kept on the server so they follow the user to another phone.
/// The user always comes from the token; nobody reads or changes another user's shortcuts.
/// </summary>
public sealed class HomeShortcutsService(IAppDbContext db, ICurrentUser currentUser, TimeProvider time)
{
    public async Task<HomeShortcutsDto> GetAsync(CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var row = await db.UserHomeShortcuts.AsNoTracking().SingleOrDefaultAsync(s => s.UserId == me, cancellationToken);
        return row is null ? new HomeShortcutsDto(null, null) : new HomeShortcutsDto(Parse(row.Keys), row.UpdatedAt);
    }

    public async Task<HomeShortcutsDto> UpdateAsync(UpdateHomeShortcutsRequest request, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var keys = request.Keys.ToList();
        var row = await db.UserHomeShortcuts.SingleOrDefaultAsync(s => s.UserId == me, cancellationToken);
        if (row is null)
        {
            row = new UserHomeShortcuts { UserId = me };
            db.UserHomeShortcuts.Add(row);
        }

        row.Keys = JsonSerializer.Serialize(keys);
        row.UpdatedAt = time.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);
        return new HomeShortcutsDto(keys, row.UpdatedAt);
    }

    /// <summary>
    /// The saved list made safe to show: keys no longer in the catalog and repeats are dropped, at most
    /// <see cref="HomeShortcutCatalog.MaxShortcuts"/> are kept. Unreadable JSON reads as an empty list.
    /// </summary>
    internal static IReadOnlyList<string> Parse(string json)
    {
        string[]? saved;
        try
        {
            saved = JsonSerializer.Deserialize<string[]>(json);
        }
        catch (JsonException)
        {
            saved = null;
        }

        return (saved ?? [])
            .Where(HomeShortcutCatalog.IsKnown)
            .Distinct(StringComparer.Ordinal)
            .Take(HomeShortcutCatalog.MaxShortcuts)
            .ToList();
    }
}
