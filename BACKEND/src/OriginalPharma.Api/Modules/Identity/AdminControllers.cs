using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using OriginalPharma.Application.Common.Bulk;
using OriginalPharma.Application.Expenses;
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

    /// <summary>Delete several custom roles; each is checked like a single delete (system role, level, users holding it).</summary>
    [HttpPost("bulk-delete")]
    [HasPermission(Permissions.Roles.Manage)]
    public Task<BulkResult> BulkDelete(BulkDeleteRequest request, CancellationToken cancellationToken) =>
        roles.DeleteManyAsync(request, cancellationToken);

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
public sealed class UsersController(UserAdminService users, AccountService accounts, SessionService sessions) : ControllerBase
{
    /// <param name="archived">Only archived (deleted) users (true), otherwise only users that are not archived.</param>
    [HttpGet]
    [HasPermission(Permissions.Users.Read)]
    public Task<IReadOnlyList<UserListItemDto>> List(CancellationToken cancellationToken, [FromQuery] bool archived = false) =>
        users.ListAsync(archived, cancellationToken);

    /// <summary>
    /// Delete users: never yourself, the last active admin, someone at or above your level, outside your
    /// scope, or someone people still report to. Users with activity are archived (deactivated, signed out).
    /// </summary>
    [HttpPost("bulk-delete")]
    [HasPermission(Permissions.Users.Delete)]
    public Task<BulkResult> BulkDelete(BulkDeleteRequest request, CancellationToken cancellationToken) =>
        users.DeleteManyAsync(request, cancellationToken);

    /// <summary>Restore archived users (they can sign in again).</summary>
    [HttpPost("bulk-restore")]
    [HasPermission(Permissions.Users.Restore)]
    public Task<BulkResult> BulkRestore(BulkIdsRequest request, CancellationToken cancellationToken) =>
        users.RestoreManyAsync(request, cancellationToken);

    /// <summary>
    /// Create an account (users:create). Leave <c>password</c> empty to have a temporary password
    /// generated; it is returned once in <c>temporaryPassword</c>. The user must change it on first sign-in.
    /// </summary>
    [HttpPost]
    [HasPermission(Permissions.Users.Create)]
    public Task<CreatedUserDto> Create(CreateUserRequest request, CancellationToken cancellationToken) =>
        users.CreateAsync(request, cancellationToken);

    /// <summary>Roles the caller may give to a new user (strictly below their own level).</summary>
    [HttpGet("assignable-roles")]
    [HasPermission(Permissions.Users.Create)]
    public Task<IReadOnlyList<RoleSummaryDto>> AssignableRoles(CancellationToken cancellationToken) =>
        users.ListAssignableRolesAsync(cancellationToken);

    /// <summary>Product lines the user sells (reps only see and order products from these).</summary>
    [HttpPut("{userId:guid}/product-lines")]
    [HasPermission(Permissions.Users.Manage)]
    public Task<UserListItemDto> SetProductLines(Guid userId, SetUserProductLinesRequest request, CancellationToken cancellationToken) =>
        users.SetProductLinesAsync(userId, request, cancellationToken);

    /// <summary>
    /// Set a temporary password for a user below you (returned once). The user is signed out
    /// everywhere and must choose a new password on next sign-in.
    /// </summary>
    [HttpPost("{userId:guid}/reset-password")]
    [HasPermission(Permissions.Users.ResetPassword)]
    public Task<TemporaryPasswordDto> ResetPassword(Guid userId, ResetPasswordRequest request, CancellationToken cancellationToken) =>
        accounts.ResetPasswordAsync(userId, request, cancellationToken);

    /// <summary>Devices the user is signed in on (users:reset-password, the user in scope and below you).</summary>
    [HttpGet("{userId:guid}/sessions")]
    [HasPermission(Permissions.Users.ResetPassword)]
    public Task<IReadOnlyList<UserSessionDto>> ListSessions(Guid userId, CancellationToken cancellationToken) =>
        sessions.ListForUserAsync(userId, cancellationToken);

    /// <summary>Sign one of the user's devices out, for example a lost or stolen phone. Their other devices stay signed in.</summary>
    [HttpDelete("{userId:guid}/sessions/{sessionId:guid}")]
    [HasPermission(Permissions.Users.ResetPassword)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> RevokeSession(Guid userId, Guid sessionId, CancellationToken cancellationToken)
    {
        await sessions.RevokeForUserAsync(userId, sessionId, cancellationToken);
        return NoContent();
    }

    /// <summary>Account events (created, password changed or reset, product lines changed), newest first.</summary>
    [HttpGet("{userId:guid}/audit")]
    [HasPermission(Permissions.Users.Read)]
    public Task<IReadOnlyList<UserAuditEntryDto>> GetAudit(Guid userId, CancellationToken cancellationToken, [FromQuery] int limit = 20) =>
        accounts.GetAuditAsync(userId, limit, cancellationToken);

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

/// <summary>Territory tree: regions, areas (where reps work) and towns (where doctors are).</summary>
[ApiController]
[Route("api/territories")]
[Tags("Territories")]
public sealed class TerritoriesController(TerritoryService territories) : ControllerBase
{
    /// <param name="archived">Only archived nodes (true), otherwise only nodes that are not archived.</param>
    [HttpGet]
    [HasPermission(Permissions.Territories.Read)]
    public Task<IReadOnlyList<TerritoryDto>> List(CancellationToken cancellationToken, [FromQuery] bool archived = false) =>
        territories.ListAsync(archived, cancellationToken);

    /// <summary>Delete nodes: removed when unused, archived while doctors, orders or visits use them; blocked with active children or users.</summary>
    [HttpPost("bulk-delete")]
    [HasPermission(Permissions.Territories.Delete)]
    public Task<BulkResult> BulkDelete(BulkDeleteRequest request, CancellationToken cancellationToken) =>
        territories.DeleteManyAsync(request, cancellationToken);

    [HttpPost("bulk-restore")]
    [HasPermission(Permissions.Territories.Restore)]
    public Task<BulkResult> BulkRestore(BulkIdsRequest request, CancellationToken cancellationToken) =>
        territories.RestoreManyAsync(request, cancellationToken);

    /// <summary>Add a region, an area (under a region) or a town (under an area).</summary>
    [HttpPost]
    [HasPermission(Permissions.Territories.Manage)]
    public Task<TerritoryDto> Create(CreateTerritoryRequest request, CancellationToken cancellationToken) =>
        territories.CreateAsync(request, cancellationToken);

    /// <summary>Rename, change the code, or move a town to another area.</summary>
    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.Territories.Manage)]
    public Task<TerritoryDto> Update(Guid id, UpdateTerritoryRequest request, CancellationToken cancellationToken) =>
        territories.UpdateAsync(id, request, cancellationToken);

    /// <summary>A city's default daily expense in EGP (expenses:settings). Zero: visits there add no expense line.</summary>
    [HttpPut("{id:guid}/expense-default")]
    [HasPermission(Permissions.Expenses.Settings)]
    public Task<TerritoryDto> SetExpenseDefault(Guid id, SetCityExpenseRequest request, CancellationToken cancellationToken) =>
        territories.SetDefaultExpenseAsync(id, request.DefaultDailyExpense, cancellationToken);

    /// <summary>Delete one node (archived when used). 409 <c>territory_in_use</c> while it has active towns or users.</summary>
    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.Territories.Delete)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict, "application/problem+json")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await territories.DeleteAsync(id, cancellationToken);
        return NoContent();
    }
}
