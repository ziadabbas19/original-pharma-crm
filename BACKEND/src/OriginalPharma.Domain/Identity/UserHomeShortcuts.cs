namespace OriginalPharma.Domain.Identity;

/// <summary>
/// The shortcuts one user put at the top of their phone Home, in their order. <see cref="Keys"/> is a JSON
/// array of catalog keys (see HomeShortcutCatalog). No row means the app shows the default set of the
/// user's role.
/// </summary>
public class UserHomeShortcuts
{
    public Guid UserId { get; set; }

    public string Keys { get; set; } = "[]";

    public DateTimeOffset UpdatedAt { get; set; }
}
