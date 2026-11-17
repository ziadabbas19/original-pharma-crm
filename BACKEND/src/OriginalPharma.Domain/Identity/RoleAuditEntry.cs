namespace OriginalPharma.Domain.Identity;

public enum RoleAuditAction
{
    Created = 1,

    /// <summary>Names, description or level changed.</summary>
    Updated = 2,

    PermissionsChanged = 3,
    Deleted = 4,

    /// <summary>Users moved from one role to another (written on both roles).</summary>
    UsersReassigned = 5,
}

/// <summary>
/// One change made to a role from the dashboard: who did it, when, and a before/after
/// list of what changed. Rows are kept after the role is deleted (no foreign key).
/// </summary>
public class RoleAuditEntry
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid RoleId { get; set; }

    /// <summary>Role key at the time of the change, so entries stay readable after a delete.</summary>
    public string RoleKey { get; set; } = string.Empty;

    public Guid? ActorId { get; set; }

    /// <summary>Actor's name at the time of the change.</summary>
    public string ActorName { get; set; } = string.Empty;

    public RoleAuditAction Action { get; set; }

    /// <summary>JSON array of <c>{ field, before, after }</c> objects.</summary>
    public string Changes { get; set; } = "[]";

    public DateTimeOffset CreatedAt { get; set; }
}
