namespace OriginalPharma.Domain.Expenses;

/// <summary>
/// A rep's own daily expense amount for one town. When a rep has none, the town's
/// <see cref="Identity.Territory.DefaultDailyExpense"/> applies (the fallback). One row per (rep, town).
/// </summary>
public class RepTownExpenseDefault
{
    public Guid UserId { get; set; }

    /// <summary>The town.</summary>
    public Guid TerritoryId { get; set; }

    /// <summary>EGP. Zero: the rep's visits in that town add no expense line.</summary>
    public decimal Amount { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
