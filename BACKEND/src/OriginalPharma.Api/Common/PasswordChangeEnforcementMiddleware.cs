using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Identity;

namespace OriginalPharma.Api.Common;

/// <summary>Marks an endpoint a signed-in user may call while their password is temporary.</summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class AllowWithTemporaryPasswordAttribute : Attribute;

/// <summary>
/// Until a temporary password is replaced, signed-in requests are refused with 403
/// <c>password_change_required</c>. Anonymous endpoints stay open (sign-in, session refresh, sign-out)
/// and so does the change-password endpoint. The flag is read with the user's cached permissions, so
/// a reset applies to access tokens that were already issued.
/// </summary>
internal sealed class PasswordChangeEnforcementMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(
        HttpContext context,
        ICurrentUser currentUser,
        IPermissionService permissions,
        IProblemDetailsService problemDetails)
    {
        var metadata = context.GetEndpoint()?.Metadata;
        if (metadata is null ||
            currentUser.UserId is not { } userId ||
            metadata.GetMetadata<IAllowAnonymous>() is not null ||
            metadata.GetMetadata<AllowWithTemporaryPasswordAttribute>() is not null)
        {
            await next(context);
            return;
        }

        var effective = await permissions.GetEffectivePermissionsAsync(userId, context.RequestAborted);
        if (!effective.MustChangePassword)
        {
            await next(context);
            return;
        }

        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = context,
            ProblemDetails = new ProblemDetails
            {
                Status = StatusCodes.Status403Forbidden,
                Title = "Change your temporary password to continue.",
                Extensions = { ["code"] = AccountErrorCodes.PasswordChangeRequired },
            },
        });
    }
}
