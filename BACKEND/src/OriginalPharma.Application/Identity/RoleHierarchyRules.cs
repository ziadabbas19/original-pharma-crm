using System.Text;
using System.Text.RegularExpressions;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Application.Identity;

/// <summary>
/// Hierarchy rules shared by role and user administration. A lower level number means
/// more authority; a user's level is the lowest level among their roles.
/// </summary>
public static class RoleHierarchyRules
{
    /// <summary>Level of a user without roles: below everyone, outranks nobody.</summary>
    public const int NoRoleLevel = int.MaxValue;

    public static int BestLevel(IEnumerable<int> roleLevels) => roleLevels.DefaultIfEmpty(NoRoleLevel).Min();

    /// <summary>
    /// Whether someone at <paramref name="actorLevel"/> may create, rename, delete, edit or
    /// assign a role at <paramref name="targetLevel"/>: only roles strictly below their own,
    /// except that the top level (Admin) may also manage top-level roles.
    /// </summary>
    public static bool CanManage(int actorLevel, int targetLevel) =>
        actorLevel == Role.TopLevel || targetLevel > actorLevel;

    /// <summary>A manager must hold a role with a lower level number than the user's best role.</summary>
    public static bool Outranks(int managerLevel, int userLevel) => managerLevel < userLevel;

    /// <summary>Default level for a role created by someone at <paramref name="actorLevel"/>: just below them.</summary>
    public static int DefaultLevelBelow(int actorLevel) =>
        actorLevel >= Role.MaxLevel ? Role.MaxLevel : actorLevel + 1;

    /// <summary>True when <paramref name="held"/> covers <paramref name="requested"/> (own &lt; team &lt; territory &lt; all).</summary>
    public static bool Covers(PermissionScope? held, PermissionScope requested) => held is { } scope && scope >= requested;
}

/// <summary>Machine keys for roles created from the dashboard.</summary>
public static partial class RoleKeys
{
    private const int MaxBaseLength = Role.KeyMaxLength - 8; // room for a numeric suffix

    /// <summary>"Key account manager" -> "KeyAccountManager". Falls back to "Role…" when the name has no Latin letters.</summary>
    public static string FromName(string englishName)
    {
        var builder = new StringBuilder();
        foreach (var word in NonAlphanumeric().Split(englishName).Where(w => w.Length > 0))
        {
            builder.Append(char.ToUpperInvariant(word[0])).Append(word.AsSpan(1));
        }

        var key = builder.ToString();
        if (key.Length == 0 || !char.IsAsciiLetter(key[0]))
        {
            key = "Role" + key;
        }

        return key.Length > MaxBaseLength ? key[..MaxBaseLength] : key;
    }

    /// <summary>Adds 2, 3, … until the key is not taken (compared by normalized key).</summary>
    public static string MakeUnique(string baseKey, IReadOnlySet<string> takenNormalizedKeys)
    {
        var candidate = baseKey;
        for (var suffix = 2; takenNormalizedKeys.Contains(Role.NormalizeKey(candidate)); suffix++)
        {
            candidate = baseKey + suffix;
        }

        return candidate;
    }

    [GeneratedRegex("[^A-Za-z0-9]+")]
    private static partial Regex NonAlphanumeric();
}

public sealed record ReportingLink(Guid UserId, Guid ManagerId);

/// <summary>Checks on the manager chain (users.manager_id).</summary>
public static class ReportingLineRules
{
    /// <summary>True when making <paramref name="managerId"/> the manager of <paramref name="userId"/> closes a loop.</summary>
    public static bool CreatesCycle(IReadOnlyDictionary<Guid, Guid?> managers, Guid userId, Guid managerId)
    {
        var visited = new HashSet<Guid>();
        Guid? current = managerId;
        while (current is { } id && visited.Add(id))
        {
            if (id == userId)
            {
                return true;
            }

            current = managers.GetValueOrDefault(id);
        }

        return false;
    }

    /// <summary>
    /// Links that touch <paramref name="affected"/> (as user or as manager) where the manager
    /// does not outrank the user. Links elsewhere are ignored so old data never blocks
    /// unrelated changes.
    /// </summary>
    public static IReadOnlyList<ReportingLink> FindInvalidLinks(
        IReadOnlyDictionary<Guid, Guid?> managers,
        IReadOnlyDictionary<Guid, int> bestLevels,
        IReadOnlySet<Guid> affected)
    {
        var invalid = new List<ReportingLink>();
        foreach (var (userId, managerId) in managers)
        {
            if (managerId is not { } manager || (!affected.Contains(userId) && !affected.Contains(manager)))
            {
                continue;
            }

            var userLevel = bestLevels.GetValueOrDefault(userId, RoleHierarchyRules.NoRoleLevel);
            var managerLevel = bestLevels.GetValueOrDefault(manager, RoleHierarchyRules.NoRoleLevel);
            if (!RoleHierarchyRules.Outranks(managerLevel, userLevel))
            {
                invalid.Add(new ReportingLink(userId, manager));
            }
        }

        return invalid;
    }
}
