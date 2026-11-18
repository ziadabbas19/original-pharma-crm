using System.Net;
using System.Net.Mail;
using Npgsql;
using StackExchange.Redis;

namespace OriginalPharma.Api.Common;

/// <summary>
/// Startup checks for live deployments. Every problem is reported at once, by the name of the
/// environment variable to fix, and values are never echoed because they may be secrets.
/// </summary>
internal static class ProductionConfiguration
{
    private const int MinAdminPasswordLength = 12;
    private const int MinSigningKeyLength = 32;
    private const int MinDistinctSecretCharacters = 10;

    /// <summary>Origins the Android app's web view sends. Everything else must be a public HTTPS origin.</summary>
    private static readonly string[] NativeAppOrigins = ["https://localhost", "capacitor://localhost"];

    private static readonly string[] PlaceholderFragments =
    [
        "change-me", "changeme", "change_me", "replace", "placeholder", "example", "your-", "your_",
        "secret-key", "development", "password", "<", ">",
    ];

    public static IReadOnlyList<string> FindProblems(IConfiguration configuration)
    {
        var problems = new List<string>();
        CheckPostgres(configuration, problems);
        CheckRedis(configuration, problems);
        CheckJwt(configuration, problems);
        var publicHost = CheckPublicBaseUrl(configuration, problems);
        CheckCors(configuration, problems);
        CheckCookie(configuration, publicHost, problems);
        CheckForwardedHeaders(configuration, problems);
        CheckUploads(configuration, problems);
        CheckDataProtectionKeys(configuration, problems);
        CheckSeed(configuration, problems);
        CheckPort(configuration, problems);
        return problems;
    }

    /// <summary>Checks the folders on disk. Settings <see cref="FindProblems"/> already refuses are skipped.</summary>
    public static IEnumerable<string> FindFolderProblems(IConfiguration configuration)
    {
        if (configuration["FileStorage:RootPath"] is { Length: > 0 } uploads && Path.IsPathRooted(uploads) &&
            FindUploadFolderProblem(uploads) is { } uploadProblem)
        {
            yield return uploadProblem;
        }

        if (FindKeysSettingProblem(configuration) is null &&
            DataProtectionSetup.ResolveKeysPath(configuration) is { } keysPath &&
            FindKeysFolderProblem(keysPath) is { } keysProblem)
        {
            yield return keysProblem;
        }
    }

    /// <summary>The configured upload folder must exist (or be creatable) and accept files.</summary>
    public static string? FindUploadFolderProblem(string rootPath)
    {
        try
        {
            Directory.CreateDirectory(rootPath);
            CheckWritable(rootPath);
            return null;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return "FileStorage__RootPath: the folder is not writable by the API. Mount the data volume above it and give " +
                   "the container user access (on Railway set RAILWAY_RUN_UID=0).";
        }
    }

    /// <summary>The keys folder must be creatable, private to the API's user and accept files.</summary>
    public static string? FindKeysFolderProblem(string keysPath)
    {
        try
        {
            DataProtectionSetup.PrepareKeysFolder(keysPath);
            CheckWritable(keysPath);
            return null;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return "DataProtection__KeysPath: the keys folder cannot be created or written by the API. It defaults to a " +
                   "\"keys\" folder next to FileStorage__RootPath. Mount the data volume above both folders and give the " +
                   "container user access (on Railway set RAILWAY_RUN_UID=0).";
        }
    }

    public static string Format(IEnumerable<string> problems) =>
        "The API cannot start because the production configuration is incomplete:" + Environment.NewLine +
        string.Join(Environment.NewLine, problems.Select(p => "  - " + p)) + Environment.NewLine +
        "See docs/deployment.md for every variable.";

    private static void CheckPostgres(IConfiguration configuration, List<string> problems)
    {
        const string name = "ConnectionStrings__Postgres";
        var value = configuration.GetConnectionString("Postgres");
        if (string.IsNullOrWhiteSpace(value))
        {
            problems.Add($"{name} is required.");
            return;
        }

        NpgsqlConnectionStringBuilder builder;
        try
        {
            builder = new NpgsqlConnectionStringBuilder(value);
        }
        catch (ArgumentException)
        {
            problems.Add($"{name} is not a valid connection string (Host=...;Port=...;Database=...;Username=...;Password=...).");
            return;
        }

        if (string.IsNullOrWhiteSpace(builder.Host) || IsLoopback(builder.Host))
        {
            problems.Add($"{name} must point at the production database, not at this machine.");
        }

        if (string.IsNullOrWhiteSpace(builder.Password) || IsPlaceholder(builder.Password))
        {
            problems.Add($"{name} needs a real password.");
        }
    }

    private static void CheckRedis(IConfiguration configuration, List<string> problems)
    {
        const string name = "ConnectionStrings__Redis";
        var value = configuration.GetConnectionString("Redis");
        if (string.IsNullOrWhiteSpace(value))
        {
            problems.Add($"{name} is required.");
            return;
        }

        try
        {
            var endpoints = ConfigurationOptions.Parse(value).EndPoints;
            if (endpoints.Count == 0 || endpoints.Any(e => e is DnsEndPoint { Host: var host } ? IsLoopback(host) : e is IPEndPoint { Address: var ip } && IPAddress.IsLoopback(ip)))
            {
                problems.Add($"{name} must point at the production Redis, not at this machine.");
            }
        }
        catch (ArgumentException)
        {
            problems.Add($"{name} is not a valid Redis connection string (host:port,password=...).");
        }
    }

    private static void CheckJwt(IConfiguration configuration, List<string> problems)
    {
        var key = configuration["Jwt:SigningKey"];
        if (string.IsNullOrWhiteSpace(key))
        {
            problems.Add("Jwt__SigningKey is required.");
        }
        else if (key.Length < MinSigningKeyLength)
        {
            problems.Add($"Jwt__SigningKey must be at least {MinSigningKeyLength} characters.");
        }
        else if (IsPlaceholder(key) || key.Distinct().Count() < MinDistinctSecretCharacters)
        {
            problems.Add("Jwt__SigningKey still has a development or placeholder value. Create one with: openssl rand -base64 48");
        }

        if (string.IsNullOrWhiteSpace(configuration["Jwt:Issuer"]))
        {
            problems.Add("Jwt__Issuer is required.");
        }

        if (string.IsNullOrWhiteSpace(configuration["Jwt:Audience"]))
        {
            problems.Add("Jwt__Audience is required.");
        }
    }

    /// <summary>Returns the public host, or null when the URL is unusable.</summary>
    private static string? CheckPublicBaseUrl(IConfiguration configuration, List<string> problems)
    {
        const string name = "App__PublicBaseUrl";
        var value = configuration["App:PublicBaseUrl"];
        if (string.IsNullOrWhiteSpace(value))
        {
            problems.Add($"{name} is required (the public HTTPS origin of the API).");
            return null;
        }

        if (!TryParseOrigin(value, out var uri) || uri.Scheme != Uri.UriSchemeHttps || IsLoopback(uri.Host))
        {
            problems.Add($"{name} must be a public HTTPS origin such as https://api.example.com, without a path.");
            return null;
        }

        return uri.Host;
    }

    private static void CheckCors(IConfiguration configuration, List<string> problems)
    {
        const string name = "Cors__AllowedOrigins";
        var origins = SettingList.Read(configuration.GetSection("Cors:AllowedOrigins"));
        if (origins.Length == 0)
        {
            problems.Add($"{name} is required (the web app origin, plus https://localhost for the Android app).");
            return;
        }

        foreach (var origin in origins.Where(o => !NativeAppOrigins.Contains(o, StringComparer.Ordinal)))
        {
            if (!TryParseOrigin(origin, out var uri) || uri.Scheme != Uri.UriSchemeHttps || IsLoopback(uri.Host))
            {
                problems.Add($"{name}: every entry must be an exact public HTTPS origin without a path or wildcard (found \"{origin}\").");
            }
        }

        if (origins.All(o => NativeAppOrigins.Contains(o, StringComparer.Ordinal)))
        {
            problems.Add($"{name} must include the web app origin.");
        }
    }

    private static void CheckCookie(IConfiguration configuration, string? publicHost, List<string> problems)
    {
        var section = configuration.GetSection(RefreshCookieSettings.SectionName);
        if (section["Secure"] is { } secure && !string.Equals(secure, bool.TrueString, StringComparison.OrdinalIgnoreCase))
        {
            problems.Add("Auth__RefreshCookie__Secure must stay true in production.");
        }

        if (section["SameSite"] is { } sameSite &&
            !sameSite.Equals(nameof(SameSiteMode.Strict), StringComparison.OrdinalIgnoreCase) &&
            !sameSite.Equals(nameof(SameSiteMode.Lax), StringComparison.OrdinalIgnoreCase))
        {
            problems.Add("Auth__RefreshCookie__SameSite must be Strict or Lax (the web app and the API share one domain).");
        }

        var domain = section["Domain"]?.Trim().TrimStart('.');
        if (!string.IsNullOrEmpty(domain) && publicHost is not null &&
            !publicHost.Equals(domain, StringComparison.OrdinalIgnoreCase) &&
            !publicHost.EndsWith("." + domain, StringComparison.OrdinalIgnoreCase))
        {
            problems.Add("Auth__RefreshCookie__Domain must be the API host or a parent domain of it.");
        }
    }

    private static void CheckForwardedHeaders(IConfiguration configuration, List<string> problems)
    {
        var section = configuration.GetSection(ForwardedHeadersSettings.SectionName);
        var proxies = SettingList.Read(section.GetSection("KnownProxies"));
        var networks = SettingList.Read(section.GetSection("KnownNetworks"));

        if (!section.GetValue<bool>("TrustAllProxies") && proxies.Length == 0 && networks.Length == 0)
        {
            problems.Add("ForwardedHeaders__TrustAllProxies=true or ForwardedHeaders__KnownNetworks is required: without it " +
                         "every request appears to come from the proxy and sign-in rate limiting is shared by all users.");
        }

        if (proxies.Any(p => !IPAddress.TryParse(p, out _)))
        {
            problems.Add("ForwardedHeaders__KnownProxies must be a comma-separated list of IP addresses.");
        }

        if (networks.Any(n => !IPNetwork.TryParse(n, out _)))
        {
            problems.Add("ForwardedHeaders__KnownNetworks must be a comma-separated list of CIDR ranges.");
        }

        if (section["ForwardLimit"] is { } limit && (!int.TryParse(limit, out var hops) || hops < 1))
        {
            problems.Add("ForwardedHeaders__ForwardLimit must be 1 or more.");
        }
    }

    private static void CheckUploads(IConfiguration configuration, List<string> problems)
    {
        var root = configuration["FileStorage:RootPath"];
        if (string.IsNullOrWhiteSpace(root))
        {
            problems.Add("FileStorage__RootPath is required (the uploads folder on the mounted data volume).");
        }
        else if (!IsFolderBelowRoot(root))
        {
            problems.Add("FileStorage__RootPath must be an absolute path to a folder below the file system root.");
        }
    }

    private static void CheckDataProtectionKeys(IConfiguration configuration, List<string> problems)
    {
        if (FindKeysSettingProblem(configuration) is { } problem)
        {
            problems.Add(problem);
        }
    }

    private static string? FindKeysSettingProblem(IConfiguration configuration)
    {
        var configured = configuration[DataProtectionSetup.KeysPathSetting];
        if (!string.IsNullOrWhiteSpace(configured) && !IsFolderBelowRoot(configured))
        {
            return "DataProtection__KeysPath must be an absolute path to a folder below the file system root.";
        }

        var uploads = configuration["FileStorage:RootPath"];
        return !string.IsNullOrWhiteSpace(uploads) && IsFolderBelowRoot(uploads) &&
               DataProtectionSetup.ResolveKeysPath(configuration) is { } keysPath &&
               DataProtectionSetup.Overlaps(keysPath, uploads)
            ? "DataProtection__KeysPath must be a separate folder outside FileStorage__RootPath, so the file endpoints can never reach the keys."
            : null;
    }

    private static bool IsFolderBelowRoot(string path) =>
        Path.IsPathRooted(path) && Path.TrimEndingDirectorySeparator(Path.GetFullPath(path)) != Path.GetPathRoot(path);

    private static void CheckWritable(string folder)
    {
        var probe = Path.Combine(folder, $".write-check-{Guid.NewGuid():N}");
        File.WriteAllText(probe, string.Empty);
        File.Delete(probe);
    }

    private static void CheckSeed(IConfiguration configuration, List<string> problems)
    {
        if (configuration.GetValue<bool>("Seed:DemoData"))
        {
            problems.Add("Seed__DemoData must not be enabled in production.");
        }

        var email = configuration["Seed:AdminEmail"];
        var password = configuration["Seed:AdminPassword"];
        if (string.IsNullOrWhiteSpace(email) != string.IsNullOrWhiteSpace(password))
        {
            problems.Add("Seed__AdminEmail and Seed__AdminPassword must be set together.");
        }

        if (!string.IsNullOrWhiteSpace(email) &&
            (!MailAddress.TryCreate(email, out var address) ||
             address.Host.EndsWith(".local", StringComparison.OrdinalIgnoreCase) ||
             address.Host.EndsWith("example.com", StringComparison.OrdinalIgnoreCase)))
        {
            problems.Add("Seed__AdminEmail must be a real mailbox.");
        }

        if (!string.IsNullOrWhiteSpace(password) &&
            (password.Length < MinAdminPasswordLength || IsPlaceholder(password) ||
             !password.Any(char.IsUpper) || !password.Any(char.IsLower) || !password.Any(char.IsDigit)))
        {
            problems.Add($"Seed__AdminPassword must be at least {MinAdminPasswordLength} characters with upper case, lower case and a digit, and not a placeholder.");
        }
    }

    private static void CheckPort(IConfiguration configuration, List<string> problems)
    {
        if (configuration["PORT"] is { Length: > 0 } port && (!int.TryParse(port, out var number) || number is < 1 or > 65535))
        {
            problems.Add("PORT must be a port number.");
        }
    }

    private static bool TryParseOrigin(string value, out Uri uri) =>
        Uri.TryCreate(value, UriKind.Absolute, out uri!) &&
        !value.Contains('*') &&
        !value.EndsWith('/') &&
        uri.AbsolutePath == "/" &&
        uri.Query.Length == 0 &&
        uri.Fragment.Length == 0 &&
        uri.UserInfo.Length == 0;

    private static bool IsLoopback(string host) =>
        host.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
        (IPAddress.TryParse(host.Trim('[', ']'), out var ip) && IPAddress.IsLoopback(ip));

    private static bool IsPlaceholder(string value) =>
        PlaceholderFragments.Any(f => value.Contains(f, StringComparison.OrdinalIgnoreCase));
}
