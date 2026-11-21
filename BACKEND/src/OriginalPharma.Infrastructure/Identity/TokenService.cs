using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Infrastructure.Identity;

public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    public string Issuer { get; set; } = "original-pharma-api";
    public string Audience { get; set; } = "original-pharma-clients";

    /// <summary>HMAC key, at least 32 characters. Keep it in user secrets / environment, never in appsettings.</summary>
    public string SigningKey { get; set; } = string.Empty;

    public int AccessTokenMinutes { get; set; } = 15;

    public SymmetricSecurityKey GetSigningKey() => new(Encoding.UTF8.GetBytes(SigningKey));
}

public static class AppClaims
{
    public const string Subject = JwtRegisteredClaimNames.Sub;
    public const string Name = JwtRegisteredClaimNames.Name;
    public const string Email = JwtRegisteredClaimNames.Email;
    public const string Role = "role";

    /// <summary>Permissions version at the time the token was issued.</summary>
    public const string PermissionsVersion = "pv";

    /// <summary>Refresh-token family (session) the token was issued for.</summary>
    public const string SessionId = "sid";
}

internal sealed class TokenService(IOptions<JwtOptions> options, TimeProvider time)
{
    private static readonly JsonWebTokenHandler Handler = new();

    public (string Token, DateTimeOffset ExpiresAt) CreateAccessToken(User user, IEnumerable<string> roles, int permissionsVersion, Guid sessionId)
    {
        var settings = options.Value;
        var now = time.GetUtcNow();
        var expiresAt = now.AddMinutes(settings.AccessTokenMinutes);

        var claims = new List<Claim>
        {
            new(AppClaims.Subject, user.Id.ToString()),
            new(AppClaims.Name, user.FullName),
            new(AppClaims.Email, user.Email ?? string.Empty),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
            new(AppClaims.PermissionsVersion, permissionsVersion.ToString(), ClaimValueTypes.Integer32),
            new(AppClaims.SessionId, sessionId.ToString()),
        };
        claims.AddRange(roles.Select(r => new Claim(AppClaims.Role, r)));

        var token = Handler.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = settings.Issuer,
            Audience = settings.Audience,
            Subject = new ClaimsIdentity(claims),
            IssuedAt = now.UtcDateTime,
            NotBefore = now.UtcDateTime,
            Expires = expiresAt.UtcDateTime,
            SigningCredentials = new SigningCredentials(settings.GetSigningKey(), SecurityAlgorithms.HmacSha256),
        });

        return (token, expiresAt);
    }

    public static string NewRefreshToken() => Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(64));

    public static string Hash(string refreshToken) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(refreshToken)));
}
