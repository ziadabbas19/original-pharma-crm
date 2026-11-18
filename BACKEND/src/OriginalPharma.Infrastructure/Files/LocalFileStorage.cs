using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using OriginalPharma.Application.Common;

namespace OriginalPharma.Infrastructure.Files;

public sealed class FileStorageOptions
{
    public const string SectionName = "FileStorage";

    /// <summary>
    /// Where uploads are kept. Absolute, or relative to the API content root. Empty means the
    /// per-user data folder (Linux: ~/.local/share/original-pharma/uploads), so development uploads
    /// never land inside the repository. Containers point it at a mounted volume.
    /// </summary>
    public string RootPath { get; set; } = string.Empty;

    public static string DefaultRoot() =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData, Environment.SpecialFolderOption.Create),
            "original-pharma", "uploads");
}

/// <summary>
/// Stores files on local disk (or a mounted volume). Fine for development and a single server.
/// TODO: S3-compatible / Azure Blob implementation for multi-server production.
/// </summary>
internal sealed class LocalFileStorage(IOptions<FileStorageOptions> options, IHostEnvironment environment) : IFileStorage
{
    private string Root
    {
        get
        {
            var configured = options.Value.RootPath;
            var root = string.IsNullOrWhiteSpace(configured)
                ? FileStorageOptions.DefaultRoot()
                : Path.IsPathRooted(configured) ? configured : Path.Combine(environment.ContentRootPath, configured);

            // "/data/uploads/" and "/data/uploads" are the same folder.
            return Path.TrimEndingDirectorySeparator(Path.GetFullPath(root));
        }
    }

    public async Task<string> SaveAsync(Stream content, string folder, string extension, CancellationToken cancellationToken = default)
    {
        var relative = $"{folder.Trim('/')}/{Guid.CreateVersion7():N}{extension}";
        await SaveAsAsync(content, relative, cancellationToken);
        return relative;
    }

    /// <summary>Writes to a temporary file first, so a reader never sees half a file.</summary>
    public async Task SaveAsAsync(Stream content, string storagePath, CancellationToken cancellationToken = default)
    {
        var fullPath = Resolve(storagePath) ?? throw new InvalidOperationException("Invalid storage path.");
        Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);

        var temporary = fullPath + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            await using (var file = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, useAsync: true))
            {
                await content.CopyToAsync(file, cancellationToken);
            }

            File.Move(temporary, fullPath, overwrite: true);
        }
        finally
        {
            if (File.Exists(temporary))
            {
                File.Delete(temporary);
            }
        }
    }

    public Task<Stream?> OpenReadAsync(string storagePath, CancellationToken cancellationToken = default)
    {
        var fullPath = Resolve(storagePath);
        return Task.FromResult<Stream?>(fullPath is not null && File.Exists(fullPath)
            ? new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true)
            : null);
    }

    public Task DeleteAsync(string storagePath, CancellationToken cancellationToken = default)
    {
        var fullPath = Resolve(storagePath);
        if (fullPath is not null && File.Exists(fullPath))
        {
            File.Delete(fullPath);
        }

        return Task.CompletedTask;
    }

    /// <summary>Returns null for paths that escape the storage root.</summary>
    private string? Resolve(string relative)
    {
        var root = Root;
        var full = Path.GetFullPath(Path.Combine(root, relative));
        return full.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.Ordinal) ? full : null;
    }
}
