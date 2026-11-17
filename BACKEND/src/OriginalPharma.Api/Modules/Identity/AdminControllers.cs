using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using OriginalPharma.Application.Identity;
using OriginalPharma.Infrastructure.Identity;

namespace OriginalPharma.Api.Modules.Identity;

/// <summary>
/// Dynamic roles: created, renamed, re-levelled and deleted from the dashboard, with
/// permissions (and a scope) per role. Hierarchy rules are enforced in the services.
/// </summary>
[ApiController]
[Route("api/roles")]
[Tags("Roles")]
public sealed class RolesController(RoleService roles) : ControllerBase
{
    [HttpGet]
    [HasPermission(Permissions.Roles.Read)]
    public Task<IReadOnlyList<RoleDto>> List(CancellationToken cancellationToken) =>
        roles.ListRolesAsync(cancellationToken);

    [HttpGet("/api/permissions")]
    [HasPermission(Permissions.Roles.Read)]
    public Task<IReadOnlyList<PermissionDto>> ListPermissions(CancellationToken cancellationToken) =>
        roles.ListPermissionsAsync(cancellationToken);

    [HttpPost]
    [HasPermission(Permissions.Roles.Manage)]
    public Task<RoleDto> Create(CreateRoleRequest request, CancellationToken cancellationToken) =>
        roles.CreateRoleAsync(request, cancellationToken);

    /// <summary>Rename, describe and re-level a role. The key never changes.</summary>
    [HttpPut("{roleId:guid}")]
    [HasPermission(Permissions.Roles.Manage)]
    public Task<RoleDto> Update(Guid roleId, UpdateRoleRequest request, CancellationToken cancellationToken) =>
        roles.UpdateRoleAsync(roleId, request, cancellationToken);

    [HttpPut("{roleId:guid}/permissions")]
    [HasPermission(Permissions.Roles.Manage)]
    public Task<RoleDto> SetPermissions(Guid roleId, SetRolePermissionsRequest request, CancellationToken cancellationToken) =>
        roles.SetPermissionsAsync(roleId, request, cancellationToken);

    /// <summary>Delete a custom role. 409 <c>role_in_use</c> (with <c>userCount</c>) while users still hold it.</summary>
    [HttpDelete("{roleId:guid}")]
    [HasPermission(Permissions.Roles.Manage)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity, "application/problem+json")]
    public async Task<IActionResult> Delete(Guid roleId, CancellationToken cancellationToken)
    {
        await roles.DeleteRoleAsync(roleId, cancellationToken);
        return NoContent();
    }

    /// <summary>Move every user of this role to another role (used before deleting it).</summary>
    [HttpPost("{roleId:guid}/reassign")]
    [HasPermission(Permissions.Roles.Manage)]
    public Task<ReassignRoleUsersResult> ReassignUsers(Guid roleId, ReassignRoleUsersRequest request, CancellationToken cancellationToken) =>
        roles.ReassignUsersAsync(roleId, request, cancellationToken);

    /// <summary>Latest changes of a role, newest first.</summary>
    [HttpGet("{roleId:guid}/audit")]
    [HasPermission(Permissions.Roles.Read)]
    public async Task<IReadOnlyList<RoleAuditEntryDto>> GetAudit(
        Guid roleId,
        [FromServices] IValidator<RoleAuditQuery> validator,
        CancellationToken cancellationToken,
        [FromQuery] int limit = 20)
    {
        var query = new RoleAuditQuery(limit);
        await validator.ValidateAndThrowAsync(query, cancellationToken);
        return await roles.GetAuditAsync(roleId, query, cancellationToken);
    }
}

[ApiController]
[Route("api/users")]
[Tags("Users")]
public sealed class UsersController(UserAdminService users) : ControllerBase
{
    [HttpGet]
    [HasPermission(Permissions.Users.Read)]
    public Task<IReadOnlyList<UserListItemDto>> List(CancellationToken cancellationToken) =>
        users.ListAsync(cancellationToken);

    [HttpPost]
    [HasPermission(Permissions.Users.Manage)]
    public Task<UserListItemDto> Create(CreateUserRequest request, CancellationToken cancellationToken) =>
        users.CreateAsync(request, cancellationToken);

    /// <summary>Name, language, territory and manager.</summary>
    [HttpPut("{userId:guid}")]
    [HasPermission(Permissions.Users.Manage)]
    public Task<UserListItemDto> Update(Guid userId, UpdateUserRequest request, CancellationToken cancellationToken) =>
        users.UpdateAsync(userId, request, cancellationToken);

    [HttpPut("{userId:guid}/roles")]
    [HasPermission(Permissions.Users.Manage)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> SetRoles(Guid userId, SetUserRolesRequest request, CancellationToken cancellationToken)
    {
        await users.SetRolesAsync(userId, request, cancellationToken);
        return NoContent();
    }

    [HttpGet("{userId:guid}/permission-overrides")]
    [HasPermission(Permissions.Roles.Read)]
    public Task<IReadOnlyList<PermissionOverrideDto>> GetPermissionOverrides(Guid userId, CancellationToken cancellationToken) =>
        users.GetOverridesAsync(userId, cancellationToken);

    [HttpPut("{userId:guid}/permission-overrides")]
    [HasPermission(Permissions.Roles.Manage)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> SetPermissionOverrides(Guid userId, SetPermissionOverridesRequest request, CancellationToken cancellationToken)
    {
        await users.SetOverridesAsync(userId, request, cancellationToken);
        return NoContent();
    }
}

/// <summary>Territory tree (region, area, territory). Read-only for now.</summary>
[ApiController]
[Route("api/territories")]
[Tags("Territories")]
public sealed class TerritoriesController(TerritoryService territories) : ControllerBase
{
    [HttpGet]
    [HasPermission(Permissions.Territories.Read)]
    public Task<IReadOnlyList<TerritoryDto>> List(CancellationToken cancellationToken) =>
        territories.ListAsync(cancellationToken);
}
