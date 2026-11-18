using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Application.Identity;

public sealed record RoleGrant(string Key, PermissionScope Scope);

public sealed record OverrideEntry(string Key, bool IsGranted, PermissionScope? Scope, DateTimeOffset? ExpiresAt);

/// <summary>The permissions a user actually has, with the widest scope per permission.</summary>
public sealed class EffectivePermissions(int version, IReadOnlyDictionary<string, PermissionScope> scopes, bool mustChangePassword = false)
{
    public int Version { get; } = version;
    public IReadOnlyDictionary<string, PermissionScope> Scopes { get; } = scopes;

    /// <summary>The password is temporary: the API refuses everything except changing it and signing out.</summary>
    public bool MustChangePassword { get; } = mustChangePassword;

    public bool Has(string key) => Scopes.ContainsKey(key);

    public PermissionScope? ScopeOf(string key) => Scopes.TryGetValue(key, out var scope) ? scope : null;
}

/// <summary>
/// Merges role grants and per-user overrides:
/// <list type="number">
/// <item>Across roles, the widest scope wins.</item>
/// <item>A grant override replaces the scope (can widen or narrow it).</item>
/// <item>A deny override removes the permission and beats any grant.</item>
/// <item>Expired overrides are ignored.</item>
/// </list>
/// </summary>
public static class PermissionEvaluator
{
    public static Dictionary<string, PermissionScope> Evaluate(
        IEnumerable<RoleGrant> roleGrants,
        IEnumerable<OverrideEntry> overrides,
        DateTimeOffset now)
    {
        var result = new Dictionary<string, PermissionScope>(StringComparer.Ordinal);

        foreach (var grant in roleGrants)
        {
            if (!result.TryGetValue(grant.Key, out var existing) || grant.Scope > existing)
            {
                result[grant.Key] = grant.Scope;
            }
        }

        var active = overrides.Where(o => o.ExpiresAt is null || o.ExpiresAt > now).ToList();

        foreach (var grant in active.Where(o => o.IsGranted))
        {
            result[grant.Key] = grant.Scope ?? PermissionScope.Own;
        }

        foreach (var deny in active.Where(o => !o.IsGranted))
        {
            result.Remove(deny.Key);
        }

        return result;
    }
}

/// <summary>Loads and caches effective permissions; tracks the per-user permissions version.</summary>
public interface IPermissionService
{
    Task<EffectivePermissions> GetEffectivePermissionsAsync(Guid userId, CancellationToken cancellationToken = default);

    /// <summary>Current permissions version (cheap; served from cache).</summary>
    Task<int> GetVersionAsync(Guid userId, CancellationToken cancellationToken = default);

    /// <summary>Increment the version so every API instance reloads the users' permissions.</summary>
    Task BumpVersionAsync(IReadOnlyCollection<Guid> userIds, CancellationToken cancellationToken = default);
}
