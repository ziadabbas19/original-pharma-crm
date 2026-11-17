using Microsoft.AspNetCore.Identity;

namespace OriginalPharma.Domain.Identity;

/// <summary>
/// Roles are data, not code: admins create them from the dashboard, rename them and
/// attach permissions (with a scope) to them.
/// <para>
/// A role has two kinds of names. <see cref="Key"/> is the stable machine name used by
/// code, tokens and the API (e.g. <c>Admin</c>, <c>Rep</c>); it never changes after the
/// role is created. <see cref="NameAr"/> / <see cref="NameEn"/> are what people see and
/// can be edited at any time. Never compare display names in code.
/// </para>
/// </summary>
public class Role : IdentityRole<Guid>
{
    public const int KeyMaxLength = 64;
    public const int NameMaxLength = 100;
    public const int DescriptionMaxLength = 256;

    /// <summary>Highest authority. Only the Admin role sits here.</summary>
    public const int TopLevel = 0;

    public const int MaxLevel = 1000;

    public Role()
    {
        Id = Guid.CreateVersion7();
        ConcurrencyStamp = Guid.NewGuid().ToString();
    }

    public Role(string key) : this()
    {
        // Identity keeps the key in its Name/NormalizedName columns (mapped to "key" /
        // "normalized_key"), so UserManager role lookups and the JWT role claims use it.
        Name = key;
        NormalizedName = NormalizeKey(key);
    }

    /// <summary>Stable machine key. Stored in Identity's <c>Name</c> column; never renamed.</summary>
    public string Key => Name ?? string.Empty;

    public string NameAr { get; set; } = string.Empty;

    public string NameEn { get; set; } = string.Empty;

    public string? Description { get; set; }

    /// <summary>Seeded roles. They can be renamed and (except Admin) re-scoped, but never deleted.</summary>
    public bool IsSystem { get; set; }

    /// <summary>
    /// Position in the hierarchy; a lower number means more authority (Admin = 0).
    /// People can only manage roles, and assign roles, that sit strictly below their own.
    /// </summary>
    public int Level { get; set; }

    /// <summary>
    /// Highest discount (percent, per order line) the role's users may give. Null means no cap.
    /// A user with several roles gets the most generous one.
    /// </summary>
    public decimal? MaxDiscountPercent { get; set; }

    public ICollection<RolePermission> Permissions { get; set; } = new List<RolePermission>();

    public static string NormalizeKey(string key) => key.ToUpperInvariant();
}
