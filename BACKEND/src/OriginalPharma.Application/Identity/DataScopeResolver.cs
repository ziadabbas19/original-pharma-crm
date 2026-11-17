using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Organization;
using OriginalPharma.Application.Common.Scoping;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Application.Identity;

internal sealed class DataScopeResolver(
    ICurrentUser currentUser,
    IPermissionService permissions,
    IOrgHierarchy hierarchy) : IDataScopeResolver
{
    public async Task<DataScope> ResolveAsync(string permissionKey, CancellationToken cancellationToken = default)
    {
        var userId = currentUser.RequireUserId();
        var effective = await permissions.GetEffectivePermissionsAsync(userId, cancellationToken);

        return effective.ScopeOf(permissionKey) switch
        {
            PermissionScope.All => DataScope.All(userId),
            PermissionScope.Territory => DataScope.Territory(userId, await hierarchy.GetTerritoryScopeAsync(userId, cancellationToken)),
            PermissionScope.Team => DataScope.Team(userId, await hierarchy.GetSubordinateIdsAsync(userId, cancellationToken)),
            PermissionScope.Own => DataScope.Own(userId),
            _ => DataScope.Nothing(userId),
        };
    }
}
