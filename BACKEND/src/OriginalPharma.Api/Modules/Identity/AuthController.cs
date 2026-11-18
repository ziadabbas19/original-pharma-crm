using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using OriginalPharma.Api.Common;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Identity;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Api.Modules.Identity;

public sealed record BackgroundSessionRequest(string DeviceId);

/// <summary>
/// Login / refresh / logout for both clients:
/// <list type="bullet">
/// <item>Web: refresh token in an httpOnly cookie scoped to /api/auth (see <see cref="RefreshCookieSettings"/>).</item>
/// <item>Native: refresh token returned in the body; the app keeps it in secure storage.</item>
/// </list>
/// Access tokens are short-lived JWTs sent as "Authorization: Bearer".
/// </summary>
[ApiController]
[Route("api/auth")]
[Tags("Auth")]
public sealed class AuthController(
    IAuthService auth,
    ICurrentUser currentUser,
    IOptions<RefreshCookieSettings> cookieSettings,
    TimeProvider time) : ControllerBase
{
    public const string RefreshCookie = "op_refresh";
    private const string RefreshCookiePath = "/api/auth";

    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting(ApiSetup.AuthRateLimit)]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request, CancellationToken cancellationToken)
    {
        var tokens = await auth.LoginAsync(request, cancellationToken);
        return Deliver(tokens, request.Client);
    }

    [HttpPost("refresh")]
    [AllowAnonymous]
    [EnableRateLimiting(ApiSetup.AuthRateLimit)]
    public async Task<ActionResult<AuthResponse>> Refresh(
        [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] RefreshRequest? request,
        CancellationToken cancellationToken)
    {
        request ??= new RefreshRequest();
        var raw = request.Client == ClientKind.Native ? request.RefreshToken : Request.Cookies[RefreshCookie];
        if (string.IsNullOrWhiteSpace(raw))
        {
            throw new UnauthorizedException("invalid-refresh-token", "Session expired. Please sign in again.");
        }

        var tokens = await auth.RefreshAsync(raw, request.Client, request.DeviceId, cancellationToken);
        return Deliver(tokens, request.Client);
    }

    [HttpPost("logout")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Logout(
        [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] LogoutRequest? request,
        CancellationToken cancellationToken)
    {
        await auth.LogoutAsync(request?.RefreshToken ?? Request.Cookies[RefreshCookie], cancellationToken);
        Response.Cookies.Delete(RefreshCookie, CookieOptions(null));
        return NoContent();
    }

    [HttpGet("me")]
    [Authorize]
    public Task<MeResponse> Me(CancellationToken cancellationToken) =>
        auth.GetMeAsync(currentUser.RequireUserId(), cancellationToken);

    /// <summary>
    /// Issues a separate token pair for the native background location uploader.
    /// The app and the uploader each rotate their own refresh token, so they never
    /// invalidate each other.
    /// </summary>
    [HttpPost("background-session")]
    [Authorize]
    public async Task<ActionResult<AuthResponse>> BackgroundSession(BackgroundSessionRequest request, CancellationToken cancellationToken)
    {
        var tokens = await auth.CreateSessionAsync(currentUser.RequireUserId(), ClientKind.Native, request.DeviceId, cancellationToken);
        return Deliver(tokens, ClientKind.Native);
    }

    /// <summary>
    /// Refresh endpoint called by the native background location plugin (not by app code).
    /// Accepts JSON or form bodies with "refreshToken" or "refresh_token", and answers
    /// with both naming styles so the plugin's token parser finds the fields.
    /// </summary>
    [HttpPost("refresh-native")]
    [AllowAnonymous]
    [EnableRateLimiting(ApiSetup.AuthRateLimit)]
    [ApiExplorerSettings(IgnoreApi = true)]
    public async Task<IActionResult> RefreshNative(CancellationToken cancellationToken)
    {
        var (refreshToken, deviceId) = await ReadPluginRefreshRequestAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(refreshToken))
        {
            throw new UnauthorizedException("invalid-refresh-token", "Session expired. Please sign in again.");
        }

        var tokens = await auth.RefreshAsync(refreshToken, ClientKind.Native, deviceId, cancellationToken);
        var expiresIn = (int)Math.Max(0, (tokens.AccessTokenExpiresAt - time.GetUtcNow()).TotalSeconds);

        // TODO: confirm against the plugin's refresh documentation and drop the unused aliases.
        return Ok(new Dictionary<string, object>
        {
            ["accessToken"] = tokens.AccessToken,
            ["access_token"] = tokens.AccessToken,
            ["refreshToken"] = tokens.RefreshToken,
            ["refresh_token"] = tokens.RefreshToken,
            ["expiresIn"] = expiresIn,
            ["expires_in"] = expiresIn,
            ["expires"] = tokens.AccessTokenExpiresAt.ToUnixTimeSeconds(),
        });
    }

    private async Task<(string? RefreshToken, string? DeviceId)> ReadPluginRefreshRequestAsync(CancellationToken cancellationToken)
    {
        if (Request.HasFormContentType)
        {
            var form = await Request.ReadFormAsync(cancellationToken);
            var token = form["refreshToken"].FirstOrDefault() ?? form["refresh_token"].FirstOrDefault();
            return (token, form["deviceId"].FirstOrDefault());
        }

        if (Request.ContentLength is 0)
        {
            return (null, null);
        }

        try
        {
            using var json = await JsonDocument.ParseAsync(Request.Body, cancellationToken: cancellationToken);
            var root = json.RootElement;
            return (Read(root, "refreshToken") ?? Read(root, "refresh_token"), Read(root, "deviceId"));
        }
        catch (JsonException)
        {
            return (null, null);
        }

        static string? Read(JsonElement element, string name) =>
            element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
                ? value.GetString()
                : null;
    }

    private AuthResponse Deliver(AuthTokens tokens, ClientKind client)
    {
        var expiresIn = (int)Math.Max(0, (tokens.AccessTokenExpiresAt - time.GetUtcNow()).TotalSeconds);

        if (client == ClientKind.Web)
        {
            Response.Cookies.Append(RefreshCookie, tokens.RefreshToken, CookieOptions(tokens.RefreshTokenExpiresAt));
            return new AuthResponse(tokens.AccessToken, tokens.AccessTokenExpiresAt, expiresIn, null, null, tokens.User);
        }

        return new AuthResponse(tokens.AccessToken, tokens.AccessTokenExpiresAt, expiresIn, tokens.RefreshToken, tokens.RefreshTokenExpiresAt, tokens.User);
    }

    private CookieOptions CookieOptions(DateTimeOffset? expires) => new()
    {
        HttpOnly = true,
        Secure = cookieSettings.Value.Secure,
        SameSite = cookieSettings.Value.SameSite,
        Domain = string.IsNullOrWhiteSpace(cookieSettings.Value.Domain) ? null : cookieSettings.Value.Domain,
        Path = RefreshCookiePath,
        Expires = expires,
        IsEssential = true,
    };
}
