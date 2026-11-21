using OriginalPharma.Domain.Common;

namespace OriginalPharma.Domain.Identity;

public enum TerritoryLevel
{
    Region = 1,

    /// <summary>A sales area: the unit reps and supervisors are assigned to. Made of towns.</summary>
    Area = 2,

    /// <summary>A town (or city district). Belongs to exactly one area; doctors are placed in a town.</summary>
    Town = 3,
}

/// <summary>
/// Geographic organisation tree: region -> area -> town. Users are assigned to a node
/// (reps to an area), and "territory" scope covers that node and everything under it.
/// </summary>
public class Territory : Entity
{
    public const int NameMaxLength = 200;
    public const int CodeMaxLength = 32;

    public string Code { get; set; } = string.Empty;

    /// <summary>English name.</summary>
    public string Name { get; set; } = string.Empty;

    public string? NameAr { get; set; }
    public TerritoryLevel Level { get; set; }

    public Guid? ParentId { get; set; }
    public Territory? Parent { get; set; }

    /// <summary>
    /// Daily expense of a rep working in this city (EGP; zero means none). The first visit of a day in
    /// the city creates an expense line with this amount.
    /// </summary>
    public decimal DefaultDailyExpense { get; set; }

    /// <summary>Deleted while doctors, orders or visits still point at it: hidden from pickers, kept for history.</summary>
    public DateTimeOffset? ArchivedAt { get; set; }
    public ICollection<Territory> Children { get; set; } = new List<Territory>();

    /// <summary>The level a child of this level must have (null for towns, which have no children).</summary>
    public static TerritoryLevel? ChildLevel(TerritoryLevel level) => level switch
    {
        TerritoryLevel.Region => TerritoryLevel.Area,
        TerritoryLevel.Area => TerritoryLevel.Town,
        _ => null,
    };
}
