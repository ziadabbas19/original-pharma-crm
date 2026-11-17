using System.Text;
using Microsoft.Extensions.Options;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Images;
using OriginalPharma.Infrastructure.Files;
using SkiaSharp;

namespace OriginalPharma.Tests.Images;

public sealed class ImageServiceTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public void Formats_are_recognised_by_signature()
    {
        Assert.Equal(ImageFormat.Jpeg, ImageSignature.Detect(Encode(SKEncodedImageFormat.Jpeg, 10, 10)));
        Assert.Equal(ImageFormat.Png, ImageSignature.Detect(Encode(SKEncodedImageFormat.Png, 10, 10)));
        Assert.Equal(ImageFormat.WebP, ImageSignature.Detect(Encode(SKEncodedImageFormat.Webp, 10, 10)));
        Assert.Null(ImageSignature.Detect("GIF89a......"u8));
        Assert.Null(ImageSignature.Detect("<svg xmlns="u8));
    }

    [Fact]
    public async Task A_script_named_like_an_image_is_refused()
    {
        var (service, _) = Create();
        var fake = Encoding.UTF8.GetBytes("<?php echo 'hello'; ?> pretending to be photo.jpg");

        var error = await Assert.ThrowsAsync<BusinessRuleException>(() => service.StoreAsync(fake, ImagePurpose.Product, Ct));
        Assert.Equal(ImageErrorCodes.Unsupported, error.Code);
    }

    [Fact]
    public async Task Files_over_five_megabytes_are_refused_while_reading()
    {
        var (service, storage) = Create();
        var big = new byte[5 * 1024 * 1024 + 1];
        Encode(SKEncodedImageFormat.Png, 10, 10).CopyTo(big, 0);

        var error = await Assert.ThrowsAsync<BusinessRuleException>(() => service.StoreAsync(new MemoryStream(big), ImagePurpose.Product, Ct));
        Assert.Equal(ImageErrorCodes.TooLarge, error.Code);
        Assert.Empty(storage.Files);
    }

    [Fact]
    public async Task A_truncated_image_is_refused()
    {
        var (service, _) = Create();
        var png = Encode(SKEncodedImageFormat.Png, 50, 50)[..40];

        var error = await Assert.ThrowsAsync<BusinessRuleException>(() => service.StoreAsync(png, ImagePurpose.Product, Ct));
        Assert.Equal(ImageErrorCodes.Invalid, error.Code);
    }

    [Fact]
    public async Task Product_images_get_a_display_size_and_a_thumbnail_as_webp_under_a_random_key()
    {
        var (service, storage) = Create();

        var key = await service.StoreAsync(Encode(SKEncodedImageFormat.Png, 3000, 2000), ImagePurpose.Product, Ct);

        Assert.True(ImageService.IsValidKey(key));
        Assert.Equal(2, storage.Files.Count);
        var display = Decode(storage.Files[ImageService.StoragePath(key, ImageService.Display)]);
        var thumb = Decode(storage.Files[ImageService.StoragePath(key, ImageService.Thumbnail)]);
        Assert.Equal((1024, 683), display);
        Assert.Equal((320, 213), thumb);
        Assert.All(storage.Files.Values, bytes => Assert.Equal(ImageFormat.WebP, ImageSignature.Detect(bytes)));

        var second = await service.StoreAsync(Encode(SKEncodedImageFormat.Png, 3000, 2000), ImagePurpose.Product, Ct);
        Assert.NotEqual(key, second);
    }

    [Fact]
    public async Task Avatars_are_cropped_square_and_small_images_are_not_enlarged()
    {
        var (service, storage) = Create();

        var key = await service.StoreAsync(Encode(SKEncodedImageFormat.Jpeg, 300, 200), ImagePurpose.Avatar, Ct);

        Assert.Equal((200, 200), Decode(storage.Files[ImageService.StoragePath(key, ImageService.Display)]));
        Assert.Equal((128, 128), Decode(storage.Files[ImageService.StoragePath(key, ImageService.Thumbnail)]));
    }

    [Fact]
    public async Task Metadata_is_stripped_and_the_exif_orientation_is_applied()
    {
        var (service, storage) = Create();
        var jpeg = WithExif(Encode(SKEncodedImageFormat.Jpeg, 200, 100), orientation: 6, description: "GPS 30.0444,31.2357 SECRET");

        var key = await service.StoreAsync(jpeg, ImagePurpose.Product, Ct);

        var display = storage.Files[ImageService.StoragePath(key, ImageService.Display)];
        Assert.Equal((100, 200), Decode(display)); // rotated upright
        Assert.DoesNotContain("SECRET", Encoding.Latin1.GetString(display));
        Assert.DoesNotContain("Exif", Encoding.Latin1.GetString(display));
    }

    [Fact]
    public async Task Huge_dimensions_are_refused_before_decoding()
    {
        var storage = new MemoryFileStorage();
        var service = new ImageService(storage, new SkiaImageProcessor(), Options.Create(new ImageOptions { MaxPixels = 1_000_000 }));

        var error = await Assert.ThrowsAsync<BusinessRuleException>(() =>
            service.StoreAsync(Encode(SKEncodedImageFormat.Png, 2000, 1000), ImagePurpose.Product, Ct));
        Assert.Equal(ImageErrorCodes.Invalid, error.Code);
    }

    private static (ImageService Service, MemoryFileStorage Storage) Create()
    {
        var storage = new MemoryFileStorage();
        return (new ImageService(storage, new SkiaImageProcessor(), Options.Create(new ImageOptions())), storage);
    }

    private static byte[] Encode(SKEncodedImageFormat format, int width, int height)
    {
        using var bitmap = new SKBitmap(width, height);
        using (var canvas = new SKCanvas(bitmap))
        {
            canvas.Clear(SKColors.SteelBlue);
            using var paint = new SKPaint { Color = SKColors.Orange };
            canvas.DrawRect(0, 0, width / 2f, height / 2f, paint);
        }

        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(format, 90);
        return data.ToArray();
    }

    private static (int Width, int Height) Decode(byte[] bytes)
    {
        using var bitmap = SKBitmap.Decode(bytes);
        return (bitmap.Width, bitmap.Height);
    }

    /// <summary>Inserts an APP1 Exif segment (orientation + image description) right after the JPEG SOI marker.</summary>
    private static byte[] WithExif(byte[] jpeg, ushort orientation, string description)
    {
        var text = Encoding.ASCII.GetBytes(description + "\0");
        var tiff = new List<byte>();
        tiff.AddRange("MM\0*"u8.ToArray());
        tiff.AddRange(BigEndian(8u));
        tiff.AddRange(BigEndian((ushort)2)); // two entries
        // ImageDescription (0x010E), ASCII, count, offset to the text after the IFD
        tiff.AddRange(BigEndian((ushort)0x010E));
        tiff.AddRange(BigEndian((ushort)2));
        tiff.AddRange(BigEndian((uint)text.Length));
        tiff.AddRange(BigEndian((uint)(8 + 2 + 2 * 12 + 4)));
        // Orientation (0x0112), SHORT, 1
        tiff.AddRange(BigEndian((ushort)0x0112));
        tiff.AddRange(BigEndian((ushort)3));
        tiff.AddRange(BigEndian(1u));
        tiff.AddRange(BigEndian(orientation));
        tiff.AddRange(new byte[2]);
        tiff.AddRange(BigEndian(0u)); // no next IFD
        tiff.AddRange(text);

        var payload = "Exif\0\0"u8.ToArray().Concat(tiff).ToArray();
        var segment = new List<byte> { 0xFF, 0xE1 };
        segment.AddRange(BigEndian((ushort)(payload.Length + 2)));
        segment.AddRange(payload);

        return [.. jpeg[..2], .. segment, .. jpeg[2..]];
    }

    private static byte[] BigEndian(ushort value) => [(byte)(value >> 8), (byte)value];

    private static byte[] BigEndian(uint value) => [(byte)(value >> 24), (byte)(value >> 16), (byte)(value >> 8), (byte)value];

    private sealed class MemoryFileStorage : IFileStorage
    {
        public Dictionary<string, byte[]> Files { get; } = [];

        public Task<string> SaveAsync(Stream content, string folder, string extension, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public async Task SaveAsAsync(Stream content, string storagePath, CancellationToken cancellationToken = default)
        {
            using var copy = new MemoryStream();
            await content.CopyToAsync(copy, cancellationToken);
            Files[storagePath] = copy.ToArray();
        }

        public Task<Stream?> OpenReadAsync(string storagePath, CancellationToken cancellationToken = default) =>
            Task.FromResult<Stream?>(Files.TryGetValue(storagePath, out var bytes) ? new MemoryStream(bytes) : null);

        public Task DeleteAsync(string storagePath, CancellationToken cancellationToken = default)
        {
            Files.Remove(storagePath);
            return Task.CompletedTask;
        }
    }
}
