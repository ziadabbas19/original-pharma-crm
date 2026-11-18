using System.Diagnostics;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Text;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using OriginalPharma.Api.Common;
using OriginalPharma.Api.Modules.Files;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Images;
using OriginalPharma.Infrastructure.Files;

namespace OriginalPharma.Tests.Deployment;

[UnsupportedOSPlatform("windows")]
public sealed class DataProtectionKeysTests : IDisposable
{
    private const string Purpose = "deployment-tests";
    private const string KeyFileContent = "private-key-material";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private readonly string _data = Path.Combine(Path.GetTempPath(), "op-keys-" + Guid.NewGuid().ToString("N"));

    private string Uploads => Path.Combine(_data, "uploads");

    private string Keys => Path.Combine(_data, "keys");

    private static IConfiguration Settings(params (string Key, string? Value)[] values) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(values.Select(v => new KeyValuePair<string, string?>(v.Key, v.Value)))
            .Build();

    /// <summary>A host wired the way the API is, with its own content root.</summary>
    private WebApplication Host(string environment = "Production", string? keysPath = null)
    {
        var contentRoot = Path.Combine(_data, "hosts", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(contentRoot);

        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = environment,
            ContentRootPath = contentRoot,
        });
        builder.Logging.ClearProviders();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["FileStorage:RootPath"] = Uploads,
            [DataProtectionSetup.KeysPathSetting] = keysPath,
        });
        builder.Services.AddApi(builder.Configuration, builder.Environment);
        return builder.Build();
    }

    private static IDataProtector Protector(WebApplication host) =>
        host.Services.GetRequiredService<IDataProtectionProvider>().CreateProtector(Purpose);

    [Fact]
    public async Task Keys_are_written_to_the_configured_path()
    {
        var configured = Path.Combine(_data, "elsewhere", "ring");
        Assert.Null(ProductionConfiguration.FindKeysFolderProblem(configured));
        await using var host = Host(keysPath: configured);

        Protector(host).Protect("payload");

        Assert.Single(Directory.GetFiles(configured, "key-*.xml"));
    }

    [Fact]
    public async Task Without_a_setting_the_keys_go_next_to_the_uploads_folder()
    {
        Assert.Null(ProductionConfiguration.FindKeysFolderProblem(Keys));
        await using var host = Host();

        Protector(host).Protect("payload");

        Assert.Single(Directory.GetFiles(Keys, "key-*.xml"));
        Assert.False(Directory.Exists(Uploads) && Directory.EnumerateFileSystemEntries(Uploads, "*.xml", SearchOption.AllDirectories).Any());
    }

    [Theory]
    [InlineData("/var/lib/original-pharma/uploads", "/var/lib/original-pharma/keys")]
    [InlineData("/var/lib/original-pharma/uploads/", "/var/lib/original-pharma/keys")]
    public void The_default_folder_is_a_sibling_of_the_uploads_folder(string uploads, string expected) =>
        Assert.Equal(expected, DataProtectionSetup.ResolveKeysPath(Settings(("FileStorage:RootPath", uploads))));

    [Fact]
    public async Task A_second_host_reads_the_same_keys_and_unprotects_data_from_the_first()
    {
        Assert.Null(ProductionConfiguration.FindKeysFolderProblem(Keys));

        string protectedPayload;
        await using (var first = Host())
        {
            protectedPayload = Protector(first).Protect("survives a redeploy");
        }

        var keyFiles = Directory.GetFiles(Keys, "key-*.xml");

        await using var second = Host();

        Assert.Equal("survives a redeploy", Protector(second).Unprotect(protectedPayload));
        Assert.Equal(keyFiles, Directory.GetFiles(Keys, "key-*.xml"));
    }

    [Fact]
    public async Task Development_keeps_the_default_key_location()
    {
        await using var host = Host("Development", keysPath: Keys);

        var options = host.Services.GetRequiredService<IOptions<KeyManagementOptions>>().Value;

        Assert.Null(options.XmlRepository);
        Assert.False(Directory.Exists(Keys));
    }

    [Fact]
    public async Task Every_environment_uses_the_same_application_name()
    {
        await using var host = Host("Development");

        var options = host.Services.GetRequiredService<IOptions<DataProtectionOptions>>().Value;

        Assert.Equal(DataProtectionSetup.ApplicationName, options.ApplicationDiscriminator);
    }

    [Fact]
    public void A_new_keys_folder_is_private_to_the_api_user()
    {
        Assert.Null(ProductionConfiguration.FindKeysFolderProblem(Keys));

        Assert.Equal(UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute, File.GetUnixFileMode(Keys));
        Assert.Empty(Directory.EnumerateFileSystemEntries(Keys));
    }

    [Fact]
    public void An_existing_keys_folder_is_tightened()
    {
        Directory.CreateDirectory(Keys);
        File.SetUnixFileMode(Keys, (UnixFileMode)0b111_101_101);

        Assert.Null(ProductionConfiguration.FindKeysFolderProblem(Keys));

        Assert.Equal(UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute, File.GetUnixFileMode(Keys));
    }

    [Fact]
    public void Missing_parent_folders_do_not_take_the_private_mode()
    {
        var ordinary = Directory.CreateDirectory(Path.Combine(Path.GetTempPath(), "op-keys-mode-" + Guid.NewGuid().ToString("N")));
        try
        {
            Assert.Null(ProductionConfiguration.FindKeysFolderProblem(Keys));

            Assert.Equal(File.GetUnixFileMode(ordinary.FullName), File.GetUnixFileMode(_data));
        }
        finally
        {
            ordinary.Delete();
        }
    }

    [Fact]
    public void An_unwritable_keys_folder_is_reported_by_its_variable()
    {
        Directory.CreateDirectory(_data);
        var file = Path.Combine(_data, "not-a-folder");
        File.WriteAllText(file, string.Empty);

        // A file where the folder should be: creating the folder fails for any user.
        var problem = ProductionConfiguration.FindKeysFolderProblem(Path.Combine(file, "keys"));

        Assert.NotNull(problem);
        Assert.Contains("DataProtection__KeysPath", problem, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("/data/uploads/keys")]
    [InlineData("/data/uploads")]
    [InlineData("/data/uploads/")]
    [InlineData("/data/other/../uploads/keys")]
    [InlineData("/data")]
    public void Keys_overlapping_the_uploads_folder_are_refused(string keysPath)
    {
        var problems = ProductionConfiguration.FindProblems(Settings(
            ("FileStorage:RootPath", "/data/uploads"),
            (DataProtectionSetup.KeysPathSetting, keysPath)));

        Assert.Contains(problems, p => p.Contains("DataProtection__KeysPath must be a separate folder", StringComparison.Ordinal));
    }

    [Fact]
    public void An_uploads_folder_named_keys_cannot_share_the_default_folder()
    {
        var problems = ProductionConfiguration.FindProblems(Settings(("FileStorage:RootPath", "/data/keys")));

        Assert.Contains(problems, p => p.Contains("DataProtection__KeysPath must be a separate folder", StringComparison.Ordinal));
    }

    [Theory]
    [InlineData("keys")]
    [InlineData("./keys")]
    [InlineData("/")]
    public void Keys_paths_must_be_absolute_folders_below_the_root(string keysPath)
    {
        var problems = ProductionConfiguration.FindProblems(Settings(
            ("FileStorage:RootPath", "/data/uploads"),
            (DataProtectionSetup.KeysPathSetting, keysPath)));

        Assert.Contains(problems, p => p.Contains("DataProtection__KeysPath must be an absolute path", StringComparison.Ordinal));
    }

    [Fact]
    public void A_refused_keys_path_is_never_created()
    {
        var inside = Path.Combine(Uploads, "keys");

        var problems = ProductionConfiguration.FindFolderProblems(Settings(
            ("FileStorage:RootPath", Uploads),
            (DataProtectionSetup.KeysPathSetting, inside))).ToList();

        Assert.Empty(problems);
        Assert.False(Directory.Exists(inside));
    }

    [Fact]
    public async Task The_api_refuses_to_start_when_the_keys_folder_cannot_be_written()
    {
        Directory.CreateDirectory(_data);
        var file = Path.Combine(_data, "not-a-folder");
        await File.WriteAllTextAsync(file, string.Empty, Ct);

        var (exitCode, output) = await RunApiAsync(Path.Combine(file, "keys"));

        Assert.Equal(1, exitCode);
        Assert.Contains("DataProtection__KeysPath: the keys folder cannot be created or written", output, StringComparison.Ordinal);
        Assert.DoesNotContain("Jwt__SigningKey", output, StringComparison.Ordinal);
    }

    /// <summary>Starts the real API with an otherwise complete production configuration.</summary>
    private async Task<(int ExitCode, string Output)> RunApiAsync(string keysPath)
    {
        var dotnet = Path.GetFullPath(Path.Combine(RuntimeEnvironment.GetRuntimeDirectory(), "..", "..", "..", "dotnet"));
        var start = new ProcessStartInfo(dotnet)
        {
            WorkingDirectory = _data,
            RedirectStandardError = true,
            RedirectStandardOutput = true,
        };
        start.ArgumentList.Add(Path.Combine(AppContext.BaseDirectory, "OriginalPharma.Api.dll"));

        start.Environment["ASPNETCORE_ENVIRONMENT"] = "Production";
        start.Environment["ConnectionStrings__Postgres"] = "Host=db.internal;Port=5432;Database=crm;Username=crm;Password=Vq7mZt2pLx9sRk4n";
        start.Environment["ConnectionStrings__Redis"] = "cache.internal:6379,password=Hn3vXc8bQw1zTy6u";
        start.Environment["Jwt__SigningKey"] = "b7Rq2Lm9Xz4Tc1Vn8Kp5Sd3Hf6Jg0WyAe";
        start.Environment["Jwt__Issuer"] = "crm-api";
        start.Environment["Jwt__Audience"] = "crm-clients";
        start.Environment["App__PublicBaseUrl"] = "https://api.pharma.test";
        start.Environment["Cors__AllowedOrigins"] = "https://app.pharma.test,https://localhost";
        start.Environment["ForwardedHeaders__TrustAllProxies"] = "true";
        start.Environment["FileStorage__RootPath"] = Uploads;
        start.Environment["DataProtection__KeysPath"] = keysPath;

        using var process = Process.Start(start)!;
        var standardError = process.StandardError.ReadToEndAsync(Ct);
        var standardOutput = process.StandardOutput.ReadToEndAsync(Ct);

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(Ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(60));
        try
        {
            await process.WaitForExitAsync(timeout.Token);
        }
        catch (OperationCanceledException)
        {
            process.Kill(entireProcessTree: true);
            throw;
        }

        return (process.ExitCode, await standardError + await standardOutput);
    }

    [Theory]
    [InlineData("/api/images/{0}/display.webp")]
    [InlineData("/api/images/..%2Fkeys%2Fkey-1/display.webp")]
    [InlineData("/api/images/..%2F..%2Fkeys%2Fkey-1.xml/display.webp")]
    [InlineData("/api/images/%2e%2e%2fkeys%2fkey-1.xml%00aaaaaaaaaaa/display.webp")]
    [InlineData("/api/images/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/..%2F..%2F..%2Fkeys%2Fkey-1.xml")]
    [InlineData("/api/images/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/%2e%2e%2f%2e%2e%2f%2e%2e%2fkeys%2fkey-1.xml.webp")]
    [InlineData("/api/images/../../keys/key-1.xml")]
    [InlineData("/keys/key-1.xml")]
    [InlineData("/uploads/../keys/key-1.xml")]
    [InlineData("/key-1.xml")]
    public async Task The_image_endpoint_cannot_serve_the_keys_folder(string target)
    {
        await using var server = await ImageServerAsync();

        // Exactly 32 characters, the length the route accepts, pointing at the keys folder.
        var response = await SendAsync(server, string.Format(target, Uri.EscapeDataString("../keys/key-1.xml".PadRight(32, 'a'))));

        Assert.DoesNotContain(KeyFileContent, response, StringComparison.Ordinal);
        Assert.DoesNotContain("HTTP/1.1 200", response, StringComparison.Ordinal);
    }

    [Fact]
    public async Task The_image_endpoint_still_serves_stored_images()
    {
        await using var server = await ImageServerAsync();

        var response = await SendAsync(server, $"/api/images/{StoredImageKey}/display.webp");

        Assert.Contains("HTTP/1.1 200", response, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("../keys/key-1.xml")]
    [InlineData("visits/../../keys/key-1.xml")]
    [InlineData("images/ab/../../../keys/key-1.xml")]
    public async Task File_storage_cannot_reach_the_keys_folder(string path)
    {
        WriteKeyFile();
        var storage = new LocalFileStorage(Options.Create(new FileStorageOptions { RootPath = Uploads }), new TestEnvironment(_data));

        Assert.Null(await storage.OpenReadAsync(path, Ct));

        await storage.DeleteAsync(path, Ct);
        await Assert.ThrowsAsync<InvalidOperationException>(() => storage.SaveAsAsync(new MemoryStream([1]), path, Ct));
        Assert.Equal(KeyFileContent, await File.ReadAllTextAsync(Path.Combine(Keys, "key-1.xml"), Ct));
    }

    private const string StoredImageKey = "abcdefabcdefabcdefabcdefabcdefab";

    private void WriteKeyFile()
    {
        Directory.CreateDirectory(Keys);
        Directory.CreateDirectory(Uploads);
        File.WriteAllText(Path.Combine(Keys, "key-1.xml"), KeyFileContent);
    }

    /// <summary>The real image controller and file storage over HTTP, on the production folder layout.</summary>
    private async Task<WebApplication> ImageServerAsync()
    {
        WriteKeyFile();
        var stored = Path.Combine(Uploads, ImageService.StoragePath(StoredImageKey, ImageService.Display));
        Directory.CreateDirectory(Path.GetDirectoryName(stored)!);
        await File.WriteAllTextAsync(stored, "stored-image", Ct);

        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Testing", ContentRootPath = _data });
        builder.Logging.ClearProviders();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Services.Configure<FileStorageOptions>(o => o.RootPath = Uploads);
        builder.Services.AddSingleton<IFileStorage, LocalFileStorage>();
        builder.Services.AddSingleton<IImageProcessor, SkiaImageProcessor>();
        builder.Services.AddSingleton<ImageService>();
        builder.Services.AddControllers().AddApplicationPart(typeof(ImagesController).Assembly);

        var app = builder.Build();
        app.MapControllers();
        await app.StartAsync(Ct);
        return app;
    }

    /// <summary>Written by hand: HTTP clients clean up "..", and these targets must reach the server as they are.</summary>
    private static async Task<string> SendAsync(WebApplication server, string target)
    {
        var address = new Uri(server.Urls.First());
        using var client = new TcpClient();
        await client.ConnectAsync(address.Host, address.Port, Ct);
        await using var stream = client.GetStream();

        var request = $"GET {target} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n";
        await stream.WriteAsync(Encoding.ASCII.GetBytes(request), Ct);

        using var reader = new StreamReader(stream, Encoding.UTF8);
        return await reader.ReadToEndAsync(Ct);
    }

    private sealed class TestEnvironment(string contentRoot) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Testing";
        public string ApplicationName { get; set; } = "tests";
        public string ContentRootPath { get; set; } = contentRoot;
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = new Microsoft.Extensions.FileProviders.NullFileProvider();
    }

    public void Dispose()
    {
        if (Directory.Exists(_data))
        {
            Directory.Delete(_data, recursive: true);
        }
    }
}
