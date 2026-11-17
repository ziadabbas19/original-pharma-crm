namespace OriginalPharma.Domain.Crm;

/// <summary>A doctor on a rep's personal list. One row per (rep, doctor) pair.</summary>
public class RepDoctor
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    /// <summary>The rep.</summary>
    public Guid UserId { get; set; }

    public Guid CustomerId { get; set; }
    public Customer? Customer { get; set; }

    public DateTimeOffset AssignedAt { get; set; }

    /// <summary>Who put the doctor on the list (the rep, or a manager assigning it).</summary>
    public Guid? AssignedById { get; set; }
}
