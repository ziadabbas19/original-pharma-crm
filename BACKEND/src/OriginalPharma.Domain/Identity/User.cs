using Microsoft.AspNetCore.Identity;

namespace OriginalPharma.Domain.Identity;

public class User : IdentityUser<Guid>
{
    public User()
    {
        Id = Guid.CreateVersion7();
        SecurityStamp = Guid.NewGuid().ToString();
    }

    public string FullName { get; set; } = string.Empty;

    /// <summary>"ar" or "en".</summary>
    public string PreferredLanguage { get; set; } = "ar";

    /// <summary>
    /// Direct manager (rep -> supervisor -> area manager -> sales manager). The manager must
    /// hold a role with a lower level number than this user's best role, and the chain may
    /// not loop. "team" scope means everyone below a user in this chain.
    /// </summary>
    public Guid? ManagerId { get; set; }
    public User? Manager { get; set; }

    /// <summary>The territory node the user works in (reps and supervisors: their area).</summary>
    public Guid? TerritoryId { get; set; }
    public Territory? Territory { get; set; }

    /// <summary>
    /// Set for accounts created or reset by someone else: the temporary password must be
    /// replaced before the apps let the user continue. Cleared by a password change.
    /// </summary>
    public bool MustChangePassword { get; set; }

    /// <summary>Stored profile picture (see <c>ImageService</c>); null when none is set.</summary>
    public string? AvatarKey { get; set; }

    /// <summary>Product lines the user sells. Reps only see and order products from these lines.</summary>
    public ICollection<Catalog.UserProductLine> ProductLines { get; set; } = new List<Catalog.UserProductLine>();

    public bool IsActive { get; set; } = true;

    /// <summary>
    /// Incremented whenever the user's effective permissions may have changed
    /// (role permissions edited, roles assigned, overrides changed). Cached
    /// permission sets are keyed by this value, so a bump invalidates them.
    /// </summary>
    public int PermissionsVersion { get; set; } = 1;

    public DateTimeOffset CreatedAt { get; set; }
}
