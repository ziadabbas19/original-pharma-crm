using System.Security.Cryptography;
using Microsoft.Extensions.Options;

namespace OriginalPharma.Application.Common.Images;

public enum ImageFormat
{
    Jpeg = 1,
    Png = 2,
    WebP = 3,
}

/// <summary>What an image is for; decides the stored sizes.</summary>
public enum ImagePurpose
{
    /// <summary>Product pictures: kept in their own aspect ratio.</summary>
    Product = 1,

    /// <summary>Profile pictures: cropped to a centered square.</summary>
    Avatar = 2,
}

/// <summary>One stored size of an image.</summary>
/// <param name="Name">File suffix and URL segment ("display", "thumb").</param>
/// <param name="MaxSize">Longest side in pixels (both sides for square variants). Smaller images are never enlarged.</param>
/// <param name="Square">Center-crop to a square before resizing.</param>
/// <param name="Quality">WebP quality, 0-100.</param>
public sealed record ImageVariantSpec(string Name, int MaxSize, bool Square, int Quality);

public sealed record EncodedImage(string Variant, byte[] WebP, int Width, int Height);

/// <summary>Decodes, orients, resizes and re-encodes images (implemented with SkiaSharp in Infrastructure).</summary>
public interface IImageProcessor
{
    /// <summary>
    /// Produces one WebP per variant. Re-encoding drops all metadata (EXIF, GPS, ICC comments).
    /// Throws <see cref="BusinessRuleException"/> (<see cref="ImageErrorCodes.Invalid"/>) when the data cannot be decoded
    /// or is larger than <paramref name="maxPixels"/>.
    /// </summary>
    IReadOnlyList<EncodedImage> Process(byte[] data, IReadOnlyList<ImageVariantSpec> variants, long maxPixels);
}

public sealed class ImageOptions
{
    public const string SectionName = "Images";

    /// <summary>Largest accepted upload.</summary>
    public long MaxBytes { get; set; } = 5 * 1024 * 1024;

    /// <summary>Largest accepted width x height (guards against decompression bombs).</summary>
    public long MaxPixels { get; set; } = 40_000_000;
}

public static class ImageErrorCodes
{
    public const string Empty = "image_empty";
    public const string TooLarge = "image_too_large";
    public const string Unsupported = "image_type_unsupported";
    public const string Invalid = "image_invalid";
}

/// <summary>Recognises image files by their first bytes, whatever the declared content type says.</summary>
public static class ImageSignature
{
    public const int HeaderLength = 12;

    public static ImageFormat? Detect(ReadOnlySpan<byte> header)
    {
        if (header.Length >= 3 && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF)
        {
            return ImageFormat.Jpeg;
        }

        if (header.Length >= 8 && header[..8].SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }))
        {
            return ImageFormat.Png;
        }

        // RIFF....WEBP
        if (header.Length >= 12 && header[..4].SequenceEqual("RIFF"u8) && header[8..12].SequenceEqual("WEBP"u8))
        {
            return ImageFormat.WebP;
        }

        return null;
    }
}

/// <summary>
/// Shared upload pipeline for product pictures and profile pictures: size limit, file-signature
/// check, re-encode to WebP (which strips metadata), a display size and a thumbnail, stored under
/// a random key. Files are never overwritten: a new upload gets a new key, so the served files can
/// be cached forever.
/// </summary>
public sealed class ImageService(IFileStorage storage, IImageProcessor processor, IOptions<ImageOptions> options)
{
    public const string Display = "display";
    public const string Thumbnail = "thumb";

    private static readonly IReadOnlyList<ImageVariantSpec> ProductVariants =
    [
        new(Display, 1024, Square: false, Quality: 80),
        new(Thumbnail, 320, Square: false, Quality: 72),
    ];

    private static readonly IReadOnlyList<ImageVariantSpec> AvatarVariants =
    [
        new(Display, 512, Square: true, Quality: 80),
        new(Thumbnail, 128, Square: true, Quality: 75),
    ];

    public static readonly IReadOnlyList<string> Variants = [Display, Thumbnail];

    public long MaxBytes => options.Value.MaxBytes;

    /// <summary>Validates and stores an upload; returns the new image key.</summary>
    public async Task<string> StoreAsync(Stream content, ImagePurpose purpose, CancellationToken cancellationToken = default)
    {
        var data = await ReadLimitedAsync(content, options.Value.MaxBytes, cancellationToken);
        return await StoreAsync(data, purpose, cancellationToken);
    }

    public async Task<string> StoreAsync(byte[] data, ImagePurpose purpose, CancellationToken cancellationToken = default)
    {
        Validate(data, options.Value.MaxBytes);

        var encoded = processor.Process(data, purpose == ImagePurpose.Avatar ? AvatarVariants : ProductVariants, options.Value.MaxPixels);
        var key = NewKey();
        foreach (var image in encoded)
        {
            using var stream = new MemoryStream(image.WebP, writable: false);
            await storage.SaveAsAsync(stream, StoragePath(key, image.Variant), cancellationToken);
        }

        return key;
    }

    /// <summary>Removes every stored size of an image. Missing files are ignored.</summary>
    public async Task DeleteAsync(string? key, CancellationToken cancellationToken = default)
    {
        if (key is null || !IsValidKey(key))
        {
            return;
        }

        foreach (var variant in Variants)
        {
            await storage.DeleteAsync(StoragePath(key, variant), cancellationToken);
        }
    }

    public Task<Stream?> OpenAsync(string key, string variant, CancellationToken cancellationToken = default) =>
        IsValidKey(key) && Variants.Contains(variant)
            ? storage.OpenReadAsync(StoragePath(key, variant), cancellationToken)
            : Task.FromResult<Stream?>(null);

    /// <summary>Checks size and file signature. Throws <see cref="BusinessRuleException"/>.</summary>
    public static ImageFormat Validate(ReadOnlySpan<byte> data, long maxBytes)
    {
        if (data.Length == 0)
        {
            throw new BusinessRuleException(ImageErrorCodes.Empty, "The file is empty.");
        }

        if (data.Length > maxBytes)
        {
            throw TooLarge(maxBytes);
        }

        return ImageSignature.Detect(data[..Math.Min(data.Length, ImageSignature.HeaderLength)])
               ?? throw new BusinessRuleException(ImageErrorCodes.Unsupported, "Only JPEG, PNG or WebP images are accepted.");
    }

    /// <summary>32 lowercase hex characters (128 random bits).</summary>
    public static bool IsValidKey(string key) =>
        key.Length == 32 && key.All(c => char.IsAsciiDigit(c) || c is >= 'a' and <= 'f');

    public static string StoragePath(string key, string variant) => $"images/{key[..2]}/{key}-{variant}.webp";

    /// <summary>Relative URL the API serves the image at (see ImagesController).</summary>
    public static string? Url(string? key, string variant = Display) =>
        key is null ? null : $"/api/images/{key}/{variant}.webp";

    private static string NewKey() => Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(16));

    private static BusinessRuleException TooLarge(long maxBytes) =>
        new(ImageErrorCodes.TooLarge, $"Images must be {maxBytes / 1024 / 1024} MB or smaller.")
        {
            Details = new Dictionary<string, object?> { ["maxBytes"] = maxBytes },
        };

    private static async Task<byte[]> ReadLimitedAsync(Stream content, long maxBytes, CancellationToken cancellationToken)
    {
        using var buffer = new MemoryStream();
        var chunk = new byte[81920];
        int read;
        while ((read = await content.ReadAsync(chunk, cancellationToken)) > 0)
        {
            if (buffer.Length + read > maxBytes)
            {
                throw TooLarge(maxBytes);
            }

            buffer.Write(chunk, 0, read);
        }

        return buffer.ToArray();
    }
}
