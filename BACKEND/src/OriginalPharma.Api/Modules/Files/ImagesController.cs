using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;
using OriginalPharma.Application.Common.Images;

namespace OriginalPharma.Api.Modules.Files;

/// <summary>
/// Serves stored images (product pictures, profile pictures). The key is 128 random bits and a new
/// upload always gets a new key, so files never change: they are cached for a year and answered
/// with 304 when the browser already has them. URLs come from the API (imageUrl, avatarUrl, …).
/// </summary>
[ApiController]
[Route("api/images")]
[Tags("Images")]
[AllowAnonymous]
public sealed class ImagesController(ImageService images) : ControllerBase
{
    [HttpGet("{key:length(32)}/{variant}.webp")]
    [ProducesResponseType(typeof(Stream), StatusCodes.Status200OK, "image/webp")]
    [ProducesResponseType(StatusCodes.Status304NotModified)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(string key, string variant, CancellationToken cancellationToken)
    {
        var stream = await images.OpenAsync(key, variant, cancellationToken);
        if (stream is null)
        {
            return NotFound();
        }

        Response.Headers.CacheControl = "public, max-age=31536000, immutable";
        Response.Headers.XContentTypeOptions = "nosniff";
        return File(stream, "image/webp", lastModified: null, entityTag: new EntityTagHeaderValue($"\"{key}-{variant}\""));
    }
}
