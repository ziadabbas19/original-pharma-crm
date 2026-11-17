using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using OriginalPharma.Api.Common;
using OriginalPharma.Application.Identity;

namespace OriginalPharma.Api.Modules.Identity;

/// <summary>The signed-in user's own account: password and profile picture. No permission needed.</summary>
[ApiController]
[Route("api/account")]
[Tags("Account")]
[Authorize]
public sealed class AccountController(AccountService accounts) : ControllerBase
{
    /// <summary>
    /// Change your password (current password required). Signs out your other sessions and clears
    /// the "must change password" flag. 422 <c>current_password_incorrect</c> or <c>password_policy</c>.
    /// </summary>
    [HttpPost("password")]
    [EnableRateLimiting(ApiSetup.PasswordRateLimit)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity, "application/problem+json")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request, CancellationToken cancellationToken)
    {
        await accounts.ChangePasswordAsync(request, cancellationToken);
        return NoContent();
    }

    /// <summary>Upload a profile picture (JPEG, PNG or WebP, max 5 MB). It is cropped to a square and stored as WebP.</summary>
    [HttpPut("avatar")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(ApiSetup.MaxImageRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = ApiSetup.MaxImageRequestBytes)]
    public async Task<AvatarDto> SetAvatar(IFormFile file, CancellationToken cancellationToken)
    {
        await using var stream = file.OpenReadStream();
        return await accounts.SetAvatarAsync(stream, cancellationToken);
    }

    [HttpDelete("avatar")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> RemoveAvatar(CancellationToken cancellationToken)
    {
        await accounts.RemoveAvatarAsync(cancellationToken);
        return NoContent();
    }
}
