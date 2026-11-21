using OriginalPharma.Domain.Common;

namespace OriginalPharma.Domain.Expenses;

public enum ExpenseSource
{
    /// <summary>Created by the first visit of the day in the city, with the city's default amount.</summary>
    Auto = 1,

    /// <summary>Added by the rep (or a manager) by hand.</summary>
    Manual = 2,
}

/// <summary>
/// One city's expense for a rep on one day (Egypt local day). The first visit in a city on a day
/// creates the automatic line once; the rep may change its amount, remove it or add lines by hand.
/// Removing archives the line, which also keeps the automatic line from coming back that day.
/// </summary>
public class ExpenseLine : Entity, IScopedEntity, IArchivable
{
    public const int NoteMaxLength = 500;

    public Guid UserId { get; set; }

    /// <summary>The rep's area when the line was created: data scopes follow it, as for visits.</summary>
    public Guid? TerritoryId { get; set; }

    public DateOnly Day { get; set; }

    /// <summary>The city (a town of the territory tree).</summary>
    public Guid CityId { get; set; }

    public decimal Amount { get; set; }

    /// <summary>The city's default amount when the automatic line was created; null for lines added by hand.</summary>
    public decimal? OriginalAmount { get; set; }

    public ExpenseSource Source { get; set; }

    public string? Note { get; set; }

    /// <summary>When the amount was last set on the device that made the change (latest edit wins).</summary>
    public DateTimeOffset? AmountChangedAt { get; set; }

    /// <summary>When the note was last set; kept apart so an amount edit never undoes a note.</summary>
    public DateTimeOffset? NoteChangedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public Guid? CreatedById { get; set; }
    public DateTimeOffset? UpdatedAt { get; set; }
    public Guid? UpdatedById { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }
    public Guid? ArchivedById { get; set; }

    /// <summary>An automatic line whose amount differs from the city's default.</summary>
    public bool IsEdited => Source == ExpenseSource.Auto && OriginalAmount is { } original && original != Amount;
}

/// <summary>The rep's general note for one day, and a manager's note on it.</summary>
public class ExpenseDay : Entity, IScopedEntity
{
    public Guid UserId { get; set; }
    public Guid? TerritoryId { get; set; }
    public DateOnly Day { get; set; }

    public string? Note { get; set; }
    public DateTimeOffset? NoteChangedAt { get; set; }
    public Guid? NoteUpdatedById { get; set; }

    public string? ManagerNote { get; set; }
    public DateTimeOffset? ManagerNoteChangedAt { get; set; }
    public Guid? ManagerNoteById { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
