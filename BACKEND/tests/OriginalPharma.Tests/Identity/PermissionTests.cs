using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using OriginalPharma.Application.Identity;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Infrastructure.Identity;

namespace OriginalPharma.Tests.Identity;

public class PermissionEvaluatorTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 16, 9, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Widest_scope_across_roles_wins()
    {
        var result = PermissionEvaluator.Evaluate(
            [new RoleGrant("visits:read", PermissionScope.Own), new RoleGrant("visits:read", PermissionScope.Team)],
            [],
            Now);

        Assert.Equal(PermissionScope.Team, result["visits:read"]);
    }

    [Fact]
    public void Grant_override_replaces_scope_and_adds_new_permissions()
    {
        var result = PermissionEvaluator.Evaluate(
            [new RoleGrant("visits:read", PermissionScope.All)],
            [
                new OverrideEntry("visits:read", true, PermissionScope.Own, null),
                new OverrideEntry("reports:read", true, PermissionScope.Team, null),
            ],
            Now);

        Assert.Equal(PermissionScope.Own, result["visits:read"]);
        Assert.Equal(PermissionScope.Team, result["reports:read"]);
    }

    [Fact]
    public void Deny_override_removes_permission_even_if_also_granted()
    {
        var result = PermissionEvaluator.Evaluate(
            [new RoleGrant("visits:create", PermissionScope.Own)],
            [
                new OverrideEntry("visits:create", true, PermissionScope.All, null),
                new OverrideEntry("visits:create", false, null, null),
            ],
            Now);

        Assert.False(result.ContainsKey("visits:create"));
    }

    [Fact]
    public void Expired_overrides_are_ignored()
    {
        var result = PermissionEvaluator.Evaluate(
            [new RoleGrant("visits:create", PermissionScope.Own)],
            [new OverrideEntry("visits:create", false, null, Now.AddMinutes(-1))],
            Now);

        Assert.Equal(PermissionScope.Own, result["visits:create"]);
    }

    [Fact]
    public void Catalog_keys_are_unique_and_well_formed()
    {
        var keys = Permissions.All.Select(p => p.Key).ToList();

        Assert.Equal(keys.Count, keys.Distinct().Count());
        Assert.All(keys, k => Assert.Matches("^[a-z-]+:[a-z-]+$", k));
    }

    [Fact]
    public void Default_role_grants_only_use_known_permissions()
    {
        var grants = DefaultRoles.Templates.SelectMany(t => t.Grants).Select(g => g.Key);

        Assert.All(grants, key => Assert.True(Permissions.IsKnown(key), key));
    }
}

public class PermissionAuthorizationHandlerTests
{
    [Theory]
    [InlineData("visits:create", true)]
    [InlineData("roles:manage", false)]
    public async Task Succeeds_only_when_user_has_the_permission(string required, bool expected)
    {
        var userId = Guid.NewGuid();
        var service = new FakePermissionService(new Dictionary<string, PermissionScope> { ["visits:create"] = PermissionScope.Own });
        var handler = new PermissionAuthorizationHandler(service);
        var user = new ClaimsPrincipal(new ClaimsIdentity([new Claim(AppClaims.Subject, userId.ToString())], "test"));
        var requirement = new PermissionRequirement(required);
        var context = new AuthorizationHandlerContext([requirement], user, null);

        await handler.HandleAsync(context);

        Assert.Equal(expected, context.HasSucceeded);
    }

    [Fact]
    public async Task Fails_without_subject_claim()
    {
        var handler = new PermissionAuthorizationHandler(new FakePermissionService(new Dictionary<string, PermissionScope> { ["visits:create"] = PermissionScope.All }));
        var context = new AuthorizationHandlerContext([new PermissionRequirement("visits:create")], new ClaimsPrincipal(new ClaimsIdentity()), null);

        await handler.HandleAsync(context);

        Assert.False(context.HasSucceeded);
    }

    private sealed class FakePermissionService(Dictionary<string, PermissionScope> scopes) : IPermissionService
    {
        public Task<EffectivePermissions> GetEffectivePermissionsAsync(Guid userId, CancellationToken cancellationToken = default) =>
            Task.FromResult(new EffectivePermissions(1, scopes));

        public Task<int> GetVersionAsync(Guid userId, CancellationToken cancellationToken = default) => Task.FromResult(1);

        public Task BumpVersionAsync(IReadOnlyCollection<Guid> userIds, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }
}
