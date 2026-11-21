namespace OriginalPharma.Domain.Identity;

public enum UserAuditAction
{
    Created = 1,
    PasswordChanged = 2,

    /// <summary>Someone else set a temporary password.</summary>
    PasswordReset = 3,

    ProductLinesChanged = 4,

    /// <summary>Name, language, territory or manager edited.</summary>
    Updated = 5,

    /// <summary>Deleted after activity: deactivated and hidden from lists.</summary>
    Archived = 6,

    Restored = 7,

    /// <summary>Removed for good (no activity). The audit rows stay.</summary>
    Deleted = 8,

    RolesChanged = 9,

    /// <summary>One signed-in device was signed out by the user or someone above them.</summary>
    SessionRevoked = 10,
}

/// <summary>
/// Account events (creation, password changes and resets, product line changes). Rows are
/// kept even if the user row goes away, so there is no foreign key.
/// </summary>
public class UserAuditEntry
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    /// <summary>The account the event is about.</summary>
    public Guid UserId { get; set; }

    public Guid? ActorId { get; set; }

    /// <summary>Actor's name at the time of the event.</summary>
    public string ActorName { get; set; } = string.Empty;

    public UserAuditAction Action { get; set; }

    /// <summary>JSON object with event details (never passwords).</summary>
    public string Details { get; set; } = "{}";

    public string? IpAddress { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}
