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

    public Guid? TerritoryId { get; set; }
    public Territory? Territory { get; set; }

    public bool IsActive { get; set; } = true;

    /// <summary>
    /// Incremented whenever the user's effective permissions may have changed
    /// (role permissions edited, roles assigned, overrides changed). Cached
    /// permission sets are keyed by this value, so a bump invalidates them.
    /// </summary>
    public int PermissionsVersion { get; set; } = 1;

    public DateTimeOffset CreatedAt { get; set; }
}
