using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Application.Identity;

/// <summary>
/// Role lookups shared by the identity use cases. In queries, <c>Role.Name</c> is the
/// role key (Identity's column); <see cref="Role.Key"/> is the same value for code.
/// </summary>
public static class RoleQueries
{
    /// <summary>The user's roles with display names, highest authority first.</summary>
    public static Task<List<RoleSummaryDto>> GetRoleSummariesAsync(this IAppDbContext db, Guid userId, CancellationToken cancellationToken = default) =>
        db.UserRoles.AsNoTracking()
            .Where(ur => ur.UserId == userId)
            .Join(db.Roles, ur => ur.RoleId, r => r.Id, (_, r) => r)
            .OrderBy(r => r.Level).ThenBy(r => r.NameEn)
            .Select(r => new RoleSummaryDto(r.Id, r.Name!, r.NameAr, r.NameEn, r.Level))
            .ToListAsync(cancellationToken);

    /// <summary>Roles of many users at once, keyed by user id.</summary>
    public static async Task<ILookup<Guid, RoleSummaryDto>> GetRoleSummariesAsync(
        this IAppDbContext db,
        IReadOnlyCollection<Guid> userIds,
        CancellationToken cancellationToken = default)
    {
        var ids = userIds.ToArray();
        var rows = await db.UserRoles.AsNoTracking()
            .Where(ur => ids.Contains(ur.UserId))
            .Join(db.Roles, ur => ur.RoleId, r => r.Id, (ur, r) => new
            {
                ur.UserId,
                Role = new RoleSummaryDto(r.Id, r.Name!, r.NameAr, r.NameEn, r.Level),
            })
            .ToListAsync(cancellationToken);

        return rows
            .OrderBy(r => r.Role.Level).ThenBy(r => r.Role.NameEn)
            .ToLookup(r => r.UserId, r => r.Role);
    }

    public static IQueryable<Role> WithKey(this IQueryable<Role> roles, string key)
    {
        var normalized = Role.NormalizeKey(key);
        return roles.Where(r => r.NormalizedName == normalized);
    }
}

/// <summary>Builds audit entries for role changes.</summary>
internal static class RoleAudit
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static RoleAuditEntry Entry(Role role, Actor actor, RoleAuditAction action, IReadOnlyList<RoleAuditChangeDto> changes, DateTimeOffset at) =>
        new()
        {
            RoleId = role.Id,
            RoleKey = role.Key,
            ActorId = actor.Id,
            ActorName = actor.FullName,
            Action = action,
            Changes = JsonSerializer.Serialize(changes, Json),
            CreatedAt = at,
        };

    public static IReadOnlyList<RoleAuditChangeDto> ReadChanges(string json) =>
        JsonSerializer.Deserialize<List<RoleAuditChangeDto>>(json, Json) ?? [];

    /// <summary>One change per permission whose scope differs (null = no access).</summary>
    public static IEnumerable<RoleAuditChangeDto> DiffGrants(
        IReadOnlyDictionary<string, PermissionScope> before,
        IReadOnlyDictionary<string, PermissionScope> after)
    {
        foreach (var key in before.Keys.Union(after.Keys).Order(StringComparer.Ordinal))
        {
            var from = before.TryGetValue(key, out var b) ? ScopeName(b) : null;
            var to = after.TryGetValue(key, out var a) ? ScopeName(a) : null;
            if (from != to)
            {
                yield return new RoleAuditChangeDto("permission:" + key, from, to);
            }
        }
    }

    public static void AddIfChanged(List<RoleAuditChangeDto> changes, string field, string? before, string? after)
    {
        if (!string.Equals(before, after, StringComparison.Ordinal))
        {
            changes.Add(new RoleAuditChangeDto(field, before, after));
        }
    }

    /// <summary>Same spelling as the API's enum values ("own", "team", …).</summary>
    public static string ScopeName(PermissionScope scope) => JsonNamingPolicy.CamelCase.ConvertName(scope.ToString());
}
