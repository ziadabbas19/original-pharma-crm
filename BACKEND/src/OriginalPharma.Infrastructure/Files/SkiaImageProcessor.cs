using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Images;
using SkiaSharp;

namespace OriginalPharma.Infrastructure.Files;

/// <summary>
/// SkiaSharp implementation of <see cref="IImageProcessor"/>. Decodes, applies the EXIF
/// orientation to the pixels, resizes and encodes WebP. Nothing from the original file except
/// pixels is written back, so metadata (camera, GPS, comments) is dropped.
/// </summary>
internal sealed class SkiaImageProcessor : IImageProcessor
{
    public IReadOnlyList<EncodedImage> Process(byte[] data, IReadOnlyList<ImageVariantSpec> variants, long maxPixels)
    {
        using var skData = SKData.CreateCopy(data);
        using var codec = SKCodec.Create(skData) ?? throw Invalid();
        var info = codec.Info;
        if (info.Width <= 0 || info.Height <= 0)
        {
            throw Invalid();
        }

        if ((long)info.Width * info.Height > maxPixels)
        {
            throw new BusinessRuleException(ImageErrorCodes.Invalid, "The image has too many pixels.")
            {
                Details = new Dictionary<string, object?> { ["maxPixels"] = maxPixels },
            };
        }

        using var decoded = SKBitmap.Decode(codec, new SKImageInfo(info.Width, info.Height, SKColorType.Rgba8888, SKAlphaType.Premul))
                            ?? throw Invalid();
        using var oriented = Orient(decoded, codec.EncodedOrigin);
        using var source = SKImage.FromBitmap(oriented);

        var result = new List<EncodedImage>(variants.Count);
        foreach (var variant in variants)
        {
            result.Add(Render(source, variant));
        }

        return result;
    }

    private static EncodedImage Render(SKImage source, ImageVariantSpec variant)
    {
        var crop = variant.Square
            ? SquareCrop(source.Width, source.Height)
            : SKRect.Create(0, 0, source.Width, source.Height);
        var scale = Math.Min(1.0, variant.MaxSize / (double)Math.Max(crop.Width, crop.Height));
        var width = Math.Max(1, (int)Math.Round(crop.Width * scale));
        var height = Math.Max(1, (int)Math.Round(crop.Height * scale));

        using var surface = SKSurface.Create(new SKImageInfo(width, height, SKColorType.Rgba8888, SKAlphaType.Premul))
                            ?? throw Invalid();
        surface.Canvas.Clear(SKColors.Transparent);
        // Mipmaps keep large reductions (a 4000 px photo to a 320 px thumbnail) free of aliasing.
        surface.Canvas.DrawImage(source, crop, SKRect.Create(0, 0, width, height), new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear));
        surface.Canvas.Flush();

        using var image = surface.Snapshot();
        using var encoded = image.Encode(SKEncodedImageFormat.Webp, variant.Quality) ?? throw Invalid();
        return new EncodedImage(variant.Name, encoded.ToArray(), width, height);
    }

    private static SKRect SquareCrop(int width, int height)
    {
        var side = Math.Min(width, height);
        return SKRect.Create((width - side) / 2f, (height - side) / 2f, side, side);
    }

    /// <summary>Returns a bitmap whose pixels are upright (EXIF orientation applied).</summary>
    private static SKBitmap Orient(SKBitmap source, SKEncodedOrigin origin)
    {
        float w = source.Width, h = source.Height;

        // x' = scaleX*x + skewX*y + transX, y' = skewY*x + scaleY*y + transY
        SKMatrix? matrix = origin switch
        {
            SKEncodedOrigin.TopRight => new SKMatrix(-1, 0, w, 0, 1, 0, 0, 0, 1),
            SKEncodedOrigin.BottomRight => new SKMatrix(-1, 0, w, 0, -1, h, 0, 0, 1),
            SKEncodedOrigin.BottomLeft => new SKMatrix(1, 0, 0, 0, -1, h, 0, 0, 1),
            SKEncodedOrigin.LeftTop => new SKMatrix(0, 1, 0, 1, 0, 0, 0, 0, 1),
            SKEncodedOrigin.RightTop => new SKMatrix(0, -1, h, 1, 0, 0, 0, 0, 1),
            SKEncodedOrigin.RightBottom => new SKMatrix(0, -1, h, -1, 0, w, 0, 0, 1),
            SKEncodedOrigin.LeftBottom => new SKMatrix(0, 1, 0, -1, 0, w, 0, 0, 1),
            _ => null,
        };

        if (matrix is not { } m)
        {
            return source.Copy();
        }

        var swap = origin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;
        var result = new SKBitmap(swap ? source.Height : source.Width, swap ? source.Width : source.Height, source.ColorType, source.AlphaType);
        using var canvas = new SKCanvas(result);
        using var image = SKImage.FromBitmap(source);
        canvas.SetMatrix(m);
        canvas.DrawImage(image, 0, 0, new SKSamplingOptions(SKFilterMode.Nearest));
        canvas.Flush();
        return result;
    }

    private static BusinessRuleException Invalid() =>
        new(ImageErrorCodes.Invalid, "The file could not be read as an image.");
}
