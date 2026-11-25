using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using OriginalPharma.Api.Common;
using OriginalPharma.Application.Identity;

namespace OriginalPharma.Api.Modules.Identity;

/// <summary>The signed-in user's own account: password, profile picture and signed-in devices. No permission needed.</summary>
[ApiController]
[Route("api/account")]
[Tags("Account")]
[Authorize]
public sealed class AccountController(AccountService accounts, SessionService sessions, HomeShortcutsService shortcuts) : ControllerBase
{
    /// <summary>
    /// Your Home shortcuts in their order. <c>keys</c> is null until you save some (the app then shows the
    /// defaults of your role); keys the app no longer offers are left out.
    /// </summary>
    [HttpGet("home-shortcuts")]
    public Task<HomeShortcutsDto> GetHomeShortcuts(CancellationToken cancellationToken) =>
        shortcuts.GetAsync(cancellationToken);

    /// <summary>Save your Home shortcuts: at most 8 known keys, each once, in the order they are shown.</summary>
    [HttpPut("home-shortcuts")]
    public Task<HomeShortcutsDto> UpdateHomeShortcuts(UpdateHomeShortcutsRequest request, CancellationToken cancellationToken) =>
        shortcuts.UpdateAsync(request, cancellationToken);

    /// <summary>
    /// Change your password (current password required). Signs out your other sessions and clears
    /// the "must change password" flag. 422 <c>current_password_incorrect</c> or <c>password_policy</c>.
    /// </summary>
    [HttpPost("password")]
    [AllowWithTemporaryPassword]
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

    /// <summary>Devices you are signed in on, most recently used first. <c>isCurrent</c> marks this one.</summary>
    [HttpGet("sessions")]
    public Task<IReadOnlyList<UserSessionDto>> ListSessions(CancellationToken cancellationToken) =>
        sessions.ListMineAsync(cancellationToken);

    /// <summary>Sign one device out (a lost phone, or this one). Your other devices stay signed in.</summary>
    [HttpDelete("sessions/{sessionId:guid}")]
    [AllowWithTemporaryPassword]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> RevokeSession(Guid sessionId, CancellationToken cancellationToken)
    {
        await sessions.RevokeMineAsync(sessionId, cancellationToken);
        return NoContent();
    }
}
