using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using OriginalPharma.Application.Common;

namespace OriginalPharma.Infrastructure.Files;

public sealed class FileStorageOptions
{
    public const string SectionName = "FileStorage";

    /// <summary>Absolute, or relative to the API content root.</summary>
    public string RootPath { get; set; } = "App_Data/uploads";
}

/// <summary>
/// Stores files on local disk. Fine for development and a single server.
/// TODO: S3-compatible / Azure Blob implementation for production.
/// </summary>
internal sealed class LocalFileStorage(IOptions<FileStorageOptions> options, IHostEnvironment environment) : IFileStorage
{
    private string Root => Path.GetFullPath(Path.IsPathRooted(options.Value.RootPath)
        ? options.Value.RootPath
        : Path.Combine(environment.ContentRootPath, options.Value.RootPath));

    public async Task<string> SaveAsync(Stream content, string folder, string extension, CancellationToken cancellationToken = default)
    {
        var relative = $"{folder.Trim('/')}/{Guid.CreateVersion7():N}{extension}";
        var fullPath = Resolve(relative) ?? throw new InvalidOperationException("Invalid storage path.");

        Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);
        await using var file = File.Create(fullPath);
        await content.CopyToAsync(file, cancellationToken);
        return relative;
    }

    public Task<Stream?> OpenReadAsync(string storagePath, CancellationToken cancellationToken = default)
    {
        var fullPath = Resolve(storagePath);
        return Task.FromResult<Stream?>(fullPath is not null && File.Exists(fullPath) ? File.OpenRead(fullPath) : null);
    }

    /// <summary>Returns null for paths that escape the storage root.</summary>
    private string? Resolve(string relative)
    {
        var root = Root;
        var full = Path.GetFullPath(Path.Combine(root, relative));
        return full.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.Ordinal) ? full : null;
    }
}
