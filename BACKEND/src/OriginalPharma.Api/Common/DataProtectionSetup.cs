using Microsoft.AspNetCore.DataProtection;
using OriginalPharma.Infrastructure;

namespace OriginalPharma.Api.Common;

/// <summary>
/// Where the Data Protection key ring lives. Live deployments keep it on the mounted data volume, in a
/// folder next to the uploads and never inside them, so a redeploy keeps the keys and the file endpoints
/// cannot reach them. Development stays on the framework's per-user folder.
/// </summary>
internal static class DataProtectionSetup
{
    /// <summary>Part of what protected data is bound to: changing it makes existing payloads unreadable.</summary>
    public const string ApplicationName = "OriginalPharma.Api";

    public const string KeysPathSetting = "DataProtection:KeysPath";

    private const string DefaultFolderName = "keys";

    private const UnixFileMode OwnerOnly = UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute;

    public static IServiceCollection AddDataProtectionKeys(this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        var dataProtection = services.AddDataProtection().SetApplicationName(ApplicationName);

        if (!environment.IsLocal() && !DependencyInjection.IsWritingOpenApiDocument && ResolveKeysPath(configuration) is { } keysPath)
        {
            dataProtection.PersistKeysToFileSystem(new DirectoryInfo(keysPath));
        }

        return services;
    }

    /// <summary>The configured folder, or <c>keys</c> next to the uploads folder. Null when neither is usable.</summary>
    public static string? ResolveKeysPath(IConfiguration configuration)
    {
        var configured = configuration[KeysPathSetting];
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return Normalize(configured);
        }

        var uploads = configuration["FileStorage:RootPath"];
        if (string.IsNullOrWhiteSpace(uploads) || !Path.IsPathRooted(uploads))
        {
            return null;
        }

        return Path.GetDirectoryName(Normalize(uploads)) is { } parent ? Path.Combine(parent, DefaultFolderName) : null;
    }

    /// <summary>True when the folders are the same or one contains the other.</summary>
    public static bool Overlaps(string first, string second)
    {
        var a = Normalize(first) + Path.DirectorySeparatorChar;
        var b = Normalize(second) + Path.DirectorySeparatorChar;
        return a.StartsWith(b, StringComparison.Ordinal) || b.StartsWith(a, StringComparison.Ordinal);
    }

    /// <summary>Creates the folder for the API's user alone, and tightens one that already exists.</summary>
    public static void PrepareKeysFolder(string keysPath)
    {
        if (OperatingSystem.IsWindows())
        {
            Directory.CreateDirectory(keysPath);
            return;
        }

        // The mode below would otherwise also apply to missing parents, and the uploads folder shares them.
        if (Path.GetDirectoryName(keysPath) is { } parent)
        {
            Directory.CreateDirectory(parent);
        }

        Directory.CreateDirectory(keysPath, OwnerOnly);
        File.SetUnixFileMode(keysPath, OwnerOnly);
    }

    private static string Normalize(string path) => Path.TrimEndingDirectorySeparator(Path.GetFullPath(path));
}
