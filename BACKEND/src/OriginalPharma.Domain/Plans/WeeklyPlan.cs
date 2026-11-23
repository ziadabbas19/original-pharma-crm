using OriginalPharma.Domain.Common;

namespace OriginalPharma.Domain.Plans;

public enum WeeklyPlanStatus
{
    /// <summary>The rep is still writing it; nobody else is told.</summary>
    Draft = 1,

    /// <summary>Sent to the rep's manager; the rep can no longer change it.</summary>
    Submitted = 2,

    /// <summary>Accepted by a reviewer. Locked for the rep; only a reviewer can reopen it.</summary>
    Approved = 3,

    /// <summary>Sent back to the rep (with a note) to change and submit again.</summary>
    Returned = 4,
}

/// <summary>
/// A rep's plan for one week (Egypt days; the first day of the week is the Plans:WeekStartsOn
/// setting). One plan per rep and week. Days the plan leaves out are days off.
/// </summary>
public class WeeklyPlan : Entity, IScopedEntity
{
    public const int NoteMaxLength = 500;

    public Guid UserId { get; set; }

    /// <summary>The rep's area when the plan was created: data scopes follow it, as for visits and expenses.</summary>
    public Guid? TerritoryId { get; set; }

    /// <summary>First day of the week.</summary>
    public DateOnly WeekStart { get; set; }

    public WeeklyPlanStatus Status { get; set; } = WeeklyPlanStatus.Draft;

    /// <summary>The latest reviewer note (approval, return or reopen). Cleared when the rep submits again.</summary>
    public string? ReviewNote { get; set; }

    public Guid? ReviewedById { get; set; }
    public DateTimeOffset? ReviewedAt { get; set; }
    public DateTimeOffset? SubmittedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    /// <summary>Raised by every change. Two changes made from the same version cannot both be saved.</summary>
    public int Version { get; set; } = 1;

    public ICollection<WeeklyPlanDay> Days { get; set; } = new List<WeeklyPlanDay>();
    public ICollection<WeeklyPlanEvent> Events { get; set; } = new List<WeeklyPlanEvent>();

    /// <summary>The rep may change the days and submit.</summary>
    public bool IsEditable => Status is WeeklyPlanStatus.Draft or WeeklyPlanStatus.Returned;
}

/// <summary>
/// One planned day: the city the rep works in, how many visits, and optionally whom. The AM places of
/// the morning are kept with the customers (they are told apart by the customer type) and may be in
/// other towns than the city.
/// </summary>
public class WeeklyPlanDay : Entity
{
    public const int NoteMaxLength = 500;
    public const int MaxTargetVisits = 100;
    public const int MaxCustomers = 100;
    public const int MaxAmPlaces = 20;

    public Guid PlanId { get; set; }

    public DateOnly Day { get; set; }

    /// <summary>The city (a town of the territory tree).</summary>
    public Guid CityId { get; set; }

    public int TargetVisits { get; set; }

    public string? Note { get; set; }

    public ICollection<WeeklyPlanCustomer> Customers { get; set; } = new List<WeeklyPlanCustomer>();
}

/// <summary>A doctor, pharmacy or AM place the rep means to visit on a planned day.</summary>
public class WeeklyPlanCustomer : Entity
{
    public Guid PlanDayId { get; set; }

    public Guid CustomerId { get; set; }

    /// <summary>Order the rep put them in.</summary>
    public int SortOrder { get; set; }
}

/// <summary>One status change of a plan: who, when, from which status to which, and the note.</summary>
public class WeeklyPlanEvent : Entity
{
    public Guid PlanId { get; set; }

    /// <summary>Null for the plan's creation.</summary>
    public WeeklyPlanStatus? FromStatus { get; set; }

    public WeeklyPlanStatus ToStatus { get; set; }

    public Guid? ActorId { get; set; }
    public string ActorName { get; set; } = string.Empty;

    public string? Note { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}
