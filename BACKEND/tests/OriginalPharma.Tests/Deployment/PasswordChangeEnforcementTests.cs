using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using OriginalPharma.Api.Common;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Identity;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Tests.Deployment;

public sealed class PasswordChangeEnforcementTests
{
    private sealed class Caller(Guid? userId) : ICurrentUser
    {
        public Guid? UserId => userId;
        public bool IsAuthenticated => userId.HasValue;
        public string? IpAddress => null;
        public string? UserAgent => null;
        public Guid? SessionId => null;
        public Guid RequireUserId() => userId ?? throw new UnauthorizedException("unauthenticated", "Sign in required.");
    }

    private sealed class Permissions(bool mustChange) : IPermissionService
    {
        public Task<EffectivePermissions> GetEffectivePermissionsAsync(Guid userId, CancellationToken cancellationToken = default) =>
            Task.FromResult(new EffectivePermissions(1, new Dictionary<string, PermissionScope>(), mustChange));

        public Task<int> GetVersionAsync(Guid userId, CancellationToken cancellationToken = default) => Task.FromResult(1);

        public Task BumpVersionAsync(IReadOnlyCollection<Guid> userIds, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private static async Task<(bool Reached, int Status)> SendAsync(bool signedIn, bool mustChange, params object[] endpointMetadata)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddProblemDetails();

        var context = new DefaultHttpContext { RequestServices = services.BuildServiceProvider() };
        context.Response.Body = new MemoryStream();
        context.User = new ClaimsPrincipal(new ClaimsIdentity());
        context.SetEndpoint(new Endpoint(_ => Task.CompletedTask, new EndpointMetadataCollection(endpointMetadata), "test"));

        var reached = false;
        var middleware = new PasswordChangeEnforcementMiddleware(_ =>
        {
            reached = true;
            return Task.CompletedTask;
        });
        await middleware.InvokeAsync(
            context,
            new Caller(signedIn ? Guid.NewGuid() : null),
            new Permissions(mustChange),
            context.RequestServices.GetRequiredService<IProblemDetailsService>());
        return (reached, context.Response.StatusCode);
    }

    [Fact]
    public async Task A_temporary_password_blocks_ordinary_endpoints()
    {
        var (reached, status) = await SendAsync(signedIn: true, mustChange: true, new AuthorizeAttribute());
        Assert.False(reached);
        Assert.Equal(StatusCodes.Status403Forbidden, status);
    }

    [Fact]
    public async Task The_change_password_endpoint_stays_open() =>
        Assert.True((await SendAsync(signedIn: true, mustChange: true, new AllowWithTemporaryPasswordAttribute())).Reached);

    [Fact]
    public async Task Anonymous_endpoints_such_as_sign_out_stay_open() =>
        Assert.True((await SendAsync(signedIn: true, mustChange: true, new AllowAnonymousAttribute())).Reached);

    [Fact]
    public async Task A_permanent_password_is_not_restricted() =>
        Assert.True((await SendAsync(signedIn: true, mustChange: false, new AuthorizeAttribute())).Reached);

    [Fact]
    public async Task Requests_without_a_user_are_left_to_authorization() =>
        Assert.True((await SendAsync(signedIn: false, mustChange: true, new AuthorizeAttribute())).Reached);
}
