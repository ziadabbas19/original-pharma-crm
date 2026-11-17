using OriginalPharma.Application.Common;
using OriginalPharma.Application.Identity;

namespace OriginalPharma.Api.Common;

/// <summary>
/// Adds the caller's current permissions version to every API response. The
/// frontend compares it with the version it loaded and refetches /api/auth/me
/// when it changes, so dashboard edits apply within one request.
/// </summary>
internal sealed class PermissionsVersionHeaderMiddleware(RequestDelegate next)
{
    public const string HeaderName = "X-Permissions-Version";

    public async Task InvokeAsync(HttpContext context, ICurrentUser currentUser, IPermissionService permissions)
    {
        if (currentUser.UserId is { } userId && context.Request.Path.StartsWithSegments("/api"))
        {
            var version = (await permissions.GetVersionAsync(userId, context.RequestAborted)).ToString();

            // Written when the response starts, so 403s from authorization and ProblemDetails
            // responses (the exception handler clears headers) carry it too. A user who just
            // lost a permission learns about it from the very request that was refused.
            context.Response.OnStarting(() =>
            {
                context.Response.Headers[HeaderName] = version;
                return Task.CompletedTask;
            });
        }

        await next(context);
    }
}
