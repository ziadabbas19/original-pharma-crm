namespace OriginalPharma.Domain.Visits;

/// <summary>
/// What a rep chose for one Egypt day: the area or town of the doctor visits. Created on the first read
/// of the day, prefilled from that day's weekly plan.
/// </summary>
public class RepDay
{
    public Guid UserId { get; set; }

    public DateOnly Day { get; set; }

    /// <summary>The town (or area) of today's doctor visits; null means the rep's whole area.</summary>
    public Guid? TerritoryId { get; set; }

    /// <summary>The rep confirmed or changed the area (otherwise it is only the plan's suggestion).</summary>
    public bool AreaChosen { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>The order a rep put their upcoming doctor visits in, for one Egypt day.</summary>
public class RepVisitOrder
{
    public Guid UserId { get; set; }

    public DateOnly Day { get; set; }

    public Guid CustomerId { get; set; }

    public int Position { get; set; }
}

/// <summary>An AM place (hospital) on a rep's morning list for one Egypt day, in the rep's order.</summary>
public class RepAmVisit
{
    public Guid UserId { get; set; }

    public DateOnly Day { get; set; }

    public Guid CustomerId { get; set; }

    public int Position { get; set; }

    /// <summary>When the rep means to be there (optional, Egypt time).</summary>
    public TimeOnly? PlannedTime { get; set; }
}
