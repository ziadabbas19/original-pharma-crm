namespace OriginalPharma.Domain.Identity;

/// <summary>How much data a permission reaches.</summary>
public enum PermissionScope
{
    /// <summary>Only records the user owns.</summary>
    Own = 1,

    /// <summary>The user's records plus everyone reporting to them (directly or indirectly).</summary>
    Team = 2,

    /// <summary>Everything in the user's territory and its child territories.</summary>
    Territory = 3,

    /// <summary>Everything.</summary>
    All = 4,
}

/// <summary>A permission in the form <c>resource:action</c>, e.g. <c>visits:create</c>.</summary>
public class Permission
{
    public int Id { get; set; }
    public string Key { get; set; } = string.Empty;
    public string Resource { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
}

public class RolePermission
{
    public Guid RoleId { get; set; }
    public Role? Role { get; set; }

    public int PermissionId { get; set; }
    public Permission? Permission { get; set; }

    public PermissionScope Scope { get; set; } = PermissionScope.Own;
}

/// <summary>
/// Per-user exception to what the user's roles grant. A grant sets the scope for
/// that permission; a deny removes it. Deny wins when both exist.
/// </summary>
public class UserPermissionOverride
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid UserId { get; set; }
    public User? User { get; set; }

    public int PermissionId { get; set; }
    public Permission? Permission { get; set; }

    public bool IsGranted { get; set; }

    /// <summary>Scope for grants. Ignored for denies.</summary>
    public PermissionScope? Scope { get; set; }

    public DateTimeOffset? ExpiresAt { get; set; }
    public string? Reason { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public Guid? CreatedById { get; set; }
}
