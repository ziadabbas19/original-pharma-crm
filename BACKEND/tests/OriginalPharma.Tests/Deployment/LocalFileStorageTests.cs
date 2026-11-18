using System.Text;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using OriginalPharma.Infrastructure.Files;

namespace OriginalPharma.Tests.Deployment;

public sealed class LocalFileStorageTests : IDisposable
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private readonly string _parent = Path.Combine(Path.GetTempPath(), "op-storage-" + Guid.NewGuid().ToString("N"));

    private string Root => Path.Combine(_parent, "uploads");

    private sealed class Host : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Testing";
        public string ApplicationName { get; set; } = "tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private static LocalFileStorage Storage(string root) =>
        new(Options.Create(new FileStorageOptions { RootPath = root }), new Host());

    private static MemoryStream Content(string text = "image") => new(Encoding.UTF8.GetBytes(text));

    [Theory]
    [InlineData("")]
    [InlineData("/")]
    public async Task A_trailing_slash_on_the_root_changes_nothing(string suffix)
    {
        var storage = Storage(Root + suffix);

        var path = await storage.SaveAsync(Content(), "visits/abc", ".png", Ct);
        await using var stream = await storage.OpenReadAsync(path, Ct);

        Assert.NotNull(stream);
        Assert.StartsWith(Root + Path.DirectorySeparatorChar, Directory.GetFiles(Root, "*.png", SearchOption.AllDirectories).Single(), StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("../outside.txt")]
    [InlineData("images/../../outside.txt")]
    [InlineData("../uploads-sibling/outside.txt")]
    public async Task Paths_outside_the_root_are_refused(string path)
    {
        Directory.CreateDirectory(Path.Combine(_parent, "uploads-sibling"));
        await File.WriteAllTextAsync(Path.Combine(_parent, "outside.txt"), "private", Ct);
        await File.WriteAllTextAsync(Path.Combine(_parent, "uploads-sibling", "outside.txt"), "private", Ct);
        var storage = Storage(Root);

        Assert.Null(await storage.OpenReadAsync(path, Ct));
        await storage.DeleteAsync(path, Ct);
        await Assert.ThrowsAsync<InvalidOperationException>(() => storage.SaveAsAsync(Content(), path, Ct));

        Assert.Equal("private", await File.ReadAllTextAsync(Path.GetFullPath(Path.Combine(Root, path)), Ct));
    }

    [Fact]
    public async Task An_absolute_path_is_refused()
    {
        var outside = Path.Combine(_parent, "absolute.txt");
        Directory.CreateDirectory(_parent);
        await File.WriteAllTextAsync(outside, "private", Ct);

        Assert.Null(await Storage(Root).OpenReadAsync(outside, Ct));
    }

    public void Dispose()
    {
        if (Directory.Exists(_parent))
        {
            Directory.Delete(_parent, recursive: true);
        }
    }
}
