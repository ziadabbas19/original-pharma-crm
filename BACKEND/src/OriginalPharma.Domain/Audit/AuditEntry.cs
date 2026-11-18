namespace OriginalPharma.Domain.Audit;

public enum AuditAction
{
    Created = 1,
    Updated = 2,

    /// <summary>Removed for good.</summary>
    Deleted = 3,

    /// <summary>Hidden from lists but kept for history (soft delete).</summary>
    Archived = 4,

    Restored = 5,

    /// <summary>Products moved to another line (or out of their line).</summary>
    Moved = 6,

    /// <summary>One bulk request: <see cref="AuditEntry.Count"/> items, details per outcome.</summary>
    BulkDelete = 7,

    BulkRestore = 8,
}

/// <summary>
/// Who changed what and when, for the data that has no history of its own (lookups, territories,
/// catalog, doctors, devices, and every delete, archive and restore). Roles, accounts and orders also
/// keep their own detailed trails. No foreign keys: entries outlive what they describe.
/// </summary>
public class AuditEntry
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    /// <summary>e.g. product, product_line, specialty, collection_method, territory, customer, user, role, order, visit, device.</summary>
    public string EntityType { get; set; } = string.Empty;

    /// <summary>Null for a bulk summary.</summary>
    public Guid? EntityId { get; set; }

    public AuditAction Action { get; set; }

    public Guid? ActorId { get; set; }
    public string ActorName { get; set; } = string.Empty;

    /// <summary>How many records the action touched (1 for single changes).</summary>
    public int Count { get; set; } = 1;

    /// <summary>JSON object: names, before/after values, per-outcome counts.</summary>
    public string Details { get; set; } = "{}";

    public DateTimeOffset CreatedAt { get; set; }
}
