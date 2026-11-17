using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Application.Identity;

public sealed record LoginRequest(string Email, string Password, ClientKind Client = ClientKind.Web, string? DeviceId = null);

/// <summary>Web clients send no body token (the cookie is used); native clients send the token.</summary>
public sealed record RefreshRequest(string? RefreshToken = null, ClientKind Client = ClientKind.Web, string? DeviceId = null);

public sealed record LogoutRequest(string? RefreshToken = null);

/// <summary>A role as shown next to a user: key for code, localized names for people, level for the hierarchy.</summary>
public sealed record RoleSummaryDto(Guid Id, string Key, string NameAr, string NameEn, int Level);

public sealed record UserProfileDto(
    Guid Id,
    string Email,
    string FullName,
    string PreferredLanguage,
    IReadOnlyList<RoleSummaryDto> Roles,
    Guid? ManagerId,
    Guid? TerritoryId);

public sealed record PermissionGrantDto(string Key, PermissionScope Scope);

/// <summary>Result of login/refresh before the API decides between cookie and body delivery.</summary>
public sealed record AuthTokens(
    string AccessToken,
    DateTimeOffset AccessTokenExpiresAt,
    string RefreshToken,
    DateTimeOffset RefreshTokenExpiresAt,
    UserProfileDto User);

public sealed record AuthResponse(
    string AccessToken,
    DateTimeOffset ExpiresAt,
    int ExpiresIn,
    string? RefreshToken,
    DateTimeOffset? RefreshTokenExpiresAt,
    UserProfileDto User);

public sealed record MeResponse(UserProfileDto User, IReadOnlyList<PermissionGrantDto> Permissions, int PermissionsVersion);

public sealed record PermissionDto(string Key, string Resource, string Action, string Description);

/// <param name="Key">Stable machine key; never changes. Show <paramref name="NameAr"/> / <paramref name="NameEn"/> to people.</param>
/// <param name="Level">Hierarchy position; lower number = more authority.</param>
/// <param name="PermissionsLocked">True for Admin: it always holds every permission with scope All.</param>
public sealed record RoleDto(
    Guid Id,
    string Key,
    string NameAr,
    string NameEn,
    string? Description,
    bool IsSystem,
    int Level,
    bool PermissionsLocked,
    int UserCount,
    IReadOnlyList<PermissionGrantDto> Permissions);

/// <param name="Level">Defaults to just below the creator's own level.</param>
/// <param name="CopyFromRoleId">Start with the permissions of this role.</param>
public sealed record CreateRoleRequest(
    string NameAr,
    string NameEn,
    string? Description = null,
    int? Level = null,
    Guid? CopyFromRoleId = null);

public sealed record UpdateRoleRequest(string NameAr, string NameEn, string? Description, int Level);

public sealed record SetRolePermissionsRequest(IReadOnlyList<PermissionGrantDto> Permissions);

/// <summary>Moves every user of a role to another role (used before deleting it).</summary>
public sealed record ReassignRoleUsersRequest(Guid TargetRoleId);

public sealed record ReassignRoleUsersResult(int MovedCount);

public sealed record RoleAuditQuery(int Limit = 20);

/// <summary>
/// One field of an audited change. Fields: <c>nameAr</c>, <c>nameEn</c>, <c>description</c>,
/// <c>level</c>, <c>permission:&lt;key&gt;</c> (scope or null), <c>copiedFrom</c> (role key),
/// <c>reassign</c> (source role key -> target role key), <c>userCount</c>. The other role's
/// names at the time are kept in <c>copiedFromName</c>, <c>sourceName</c> and <c>targetName</c>
/// (Arabic in before, English in after).
/// </summary>
public sealed record RoleAuditChangeDto(string Field, string? Before, string? After);

public sealed record RoleAuditEntryDto(
    Guid Id,
    Guid RoleId,
    string RoleKey,
    RoleAuditAction Action,
    Guid? ActorId,
    string ActorName,
    IReadOnlyList<RoleAuditChangeDto> Changes,
    DateTimeOffset CreatedAt);

public sealed record UserListItemDto(
    Guid Id,
    string Email,
    string FullName,
    IReadOnlyList<RoleSummaryDto> Roles,
    Guid? ManagerId,
    Guid? TerritoryId,
    bool IsActive,
    string? TerritoryName = null,
    string? TerritoryNameAr = null,
    string? ManagerName = null,
    string PreferredLanguage = "ar");

/// <param name="Roles">Role keys.</param>
public sealed record CreateUserRequest(
    string Email,
    string FullName,
    string Password,
    IReadOnlyList<string> Roles,
    Guid? ManagerId = null,
    Guid? TerritoryId = null,
    string PreferredLanguage = "ar");

/// <summary>Profile and reporting line of an existing user (roles and overrides have their own endpoints).</summary>
public sealed record UpdateUserRequest(
    string FullName,
    Guid? ManagerId,
    Guid? TerritoryId,
    string PreferredLanguage = "ar");

/// <param name="Roles">Role keys.</param>
public sealed record SetUserRolesRequest(IReadOnlyList<string> Roles);

public sealed record PermissionOverrideDto(string Key, bool IsGranted, PermissionScope? Scope, DateTimeOffset? ExpiresAt, string? Reason);

public sealed record SetPermissionOverridesRequest(IReadOnlyList<PermissionOverrideDto> Overrides);

public interface IAuthService
{
    Task<AuthTokens> LoginAsync(LoginRequest request, CancellationToken cancellationToken = default);

    Task<AuthTokens> RefreshAsync(string refreshToken, ClientKind client, string? deviceId, CancellationToken cancellationToken = default);

    Task LogoutAsync(string? refreshToken, CancellationToken cancellationToken = default);

    /// <summary>
    /// Starts a separate session (new refresh token family) for an already signed-in user.
    /// Used by the native background uploader so it never rotates the app's own tokens.
    /// </summary>
    Task<AuthTokens> CreateSessionAsync(Guid userId, ClientKind client, string? deviceId, CancellationToken cancellationToken = default);

    Task<MeResponse> GetMeAsync(Guid userId, CancellationToken cancellationToken = default);
}
