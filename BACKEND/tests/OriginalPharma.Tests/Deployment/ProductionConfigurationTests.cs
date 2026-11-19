using Microsoft.Extensions.Configuration;
using OriginalPharma.Api.Common;

namespace OriginalPharma.Tests.Deployment;

public sealed class ProductionConfigurationTests
{
    private static Dictionary<string, string?> Valid() => new()
    {
        ["ConnectionStrings:Postgres"] = "Host=db.internal;Port=5432;Database=crm;Username=crm;Password=Vq7mZt2pLx9sRk4n",
        ["ConnectionStrings:Redis"] = "cache.internal:6379,password=Hn3vXc8bQw1zTy6u",
        ["Jwt:SigningKey"] = "b7Rq2Lm9Xz4Tc1Vn8Kp5Sd3Hf6Jg0WyAe",
        ["Jwt:Issuer"] = "crm-api",
        ["Jwt:Audience"] = "crm-clients",
        ["App:PublicBaseUrl"] = "https://api.pharma.test",
        ["Cors:AllowedOrigins"] = "https://app.pharma.test,https://localhost",
        ["ForwardedHeaders:TrustAllProxies"] = "true",
        ["FileStorage:RootPath"] = "/data/uploads",
        ["Seed:AdminEmail"] = "owner@pharma.test",
        ["Seed:AdminPassword"] = "Vq7mZt2pLx9sRk4n",
    };

    private static IReadOnlyList<string> Problems(Action<Dictionary<string, string?>>? change = null)
    {
        var values = Valid();
        change?.Invoke(values);
        return ProductionConfiguration.FindProblems(new ConfigurationBuilder().AddInMemoryCollection(values).Build());
    }

    [Fact]
    public void A_complete_configuration_has_no_problems() => Assert.Empty(Problems());

    [Theory]
    [InlineData("ConnectionStrings:Postgres", "ConnectionStrings__Postgres")]
    [InlineData("ConnectionStrings:Redis", "ConnectionStrings__Redis")]
    [InlineData("Jwt:SigningKey", "Jwt__SigningKey")]
    [InlineData("Jwt:Issuer", "Jwt__Issuer")]
    [InlineData("Jwt:Audience", "Jwt__Audience")]
    [InlineData("App:PublicBaseUrl", "App__PublicBaseUrl")]
    [InlineData("Cors:AllowedOrigins", "Cors__AllowedOrigins")]
    [InlineData("ForwardedHeaders:TrustAllProxies", "ForwardedHeaders__TrustAllProxies")]
    [InlineData("FileStorage:RootPath", "FileStorage__RootPath")]
    public void A_missing_required_value_is_named_by_its_variable(string key, string variable) =>
        Assert.Contains(Problems(v => v.Remove(key)), p => p.Contains(variable, StringComparison.Ordinal));

    [Theory]
    [InlineData("Jwt:SigningKey", "change-me-change-me-change-me-change-me")]
    [InlineData("Jwt:SigningKey", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")]
    [InlineData("Jwt:SigningKey", "too-short")]
    [InlineData("ConnectionStrings:Postgres", "Host=db.internal;Database=crm;Username=crm;Password=change-me")]
    [InlineData("ConnectionStrings:Postgres", "Host=localhost;Database=crm;Username=crm;Password=Vq7mZt2pLx9sRk4n")]
    [InlineData("ConnectionStrings:Redis", "localhost:6379")]
    [InlineData("Seed:AdminPassword", "Password1234")]
    [InlineData("Seed:AdminPassword", "short1A")]
    [InlineData("Seed:AdminEmail", "admin@originalpharma.local")]
    [InlineData("Seed:DemoData", "true")]
    [InlineData("Auth:RefreshCookie:Secure", "false")]
    [InlineData("Auth:RefreshCookie:SameSite", "None")]
    [InlineData("Auth:RefreshCookie:Domain", "other.test")]
    [InlineData("FileStorage:RootPath", "uploads")]
    [InlineData("FileStorage:RootPath", "/")]
    [InlineData("PORT", "not-a-port")]
    public void Development_and_unsafe_values_are_refused(string key, string value) =>
        Assert.NotEmpty(Problems(v => v[key] = value));

    [Theory]
    [InlineData("*")]
    [InlineData("https://*.pharma.test")]
    [InlineData("http://app.pharma.test")]
    [InlineData("http://localhost:5173")]
    [InlineData("https://app.pharma.test/")]
    [InlineData("https://app.pharma.test/path")]
    [InlineData("https://localhost")] // the Android origin alone leaves the web app out
    public void Cors_accepts_only_exact_public_https_origins(string origin) =>
        Assert.NotEmpty(Problems(v => v["Cors:AllowedOrigins"] = origin));

    [Fact]
    public void The_android_origins_are_accepted_next_to_the_web_origin() =>
        Assert.Empty(Problems(v => v["Cors:AllowedOrigins"] = "https://app.pharma.test;https://localhost;capacitor://localhost"));

    [Fact]
    public void Known_proxy_networks_can_replace_trusting_every_proxy()
    {
        Assert.Empty(Problems(v =>
        {
            v.Remove("ForwardedHeaders:TrustAllProxies");
            v["ForwardedHeaders:KnownNetworks"] = "10.0.0.0/8";
        }));
        Assert.NotEmpty(Problems(v =>
        {
            v.Remove("ForwardedHeaders:TrustAllProxies");
            v["ForwardedHeaders:KnownNetworks"] = "not-a-network";
        }));
    }

    [Fact]
    public void The_admin_can_be_removed_from_the_environment_after_the_first_start() =>
        Assert.Empty(Problems(v =>
        {
            v.Remove("Seed:AdminEmail");
            v.Remove("Seed:AdminPassword");
        }));

    [Fact]
    public void A_password_reset_with_a_strong_password_is_accepted() =>
        Assert.Empty(Problems(v => v["Seed:ResetAdminPassword"] = "true"));

    [Theory]
    [InlineData("Seed:AdminEmail")]
    [InlineData("Seed:AdminPassword")]
    public void A_password_reset_needs_the_admin_email_and_password(string missing) =>
        Assert.Contains(Problems(v =>
        {
            v["Seed:ResetAdminPassword"] = "true";
            v.Remove(missing);
        }), p => p.Contains("Seed__ResetAdminPassword", StringComparison.Ordinal));

    [Theory]
    [InlineData("Short-1a")]
    [InlineData("recovery-pass-2026")]
    [InlineData("Change-Me-Admin-2026")]
    public void A_password_reset_refuses_a_weak_password(string password) =>
        Assert.Contains(Problems(v =>
        {
            v["Seed:ResetAdminPassword"] = "true";
            v["Seed:AdminPassword"] = password;
        }), p => p.StartsWith("Seed__AdminPassword", StringComparison.Ordinal));

    [Fact]
    public void Problems_never_repeat_secret_values()
    {
        const string secret = "change-me-Sup3rPrivateValue-change-me";
        var problems = Problems(v =>
        {
            v["Jwt:SigningKey"] = secret;
            v["Seed:AdminPassword"] = secret;
            v["ConnectionStrings:Postgres"] = $"Host=localhost;Password={secret}";
        });

        Assert.NotEmpty(problems);
        Assert.DoesNotContain(problems, p => p.Contains("Sup3rPrivateValue", StringComparison.Ordinal));
    }

    [Fact]
    public void An_unwritable_upload_folder_is_reported()
    {
        var file = Path.GetTempFileName();
        try
        {
            // A file where the folder should be: creating the folder fails for any user.
            Assert.NotNull(ProductionConfiguration.FindUploadFolderProblem(Path.Combine(file, "uploads")));
        }
        finally
        {
            File.Delete(file);
        }
    }

    [Fact]
    public void A_writable_upload_folder_is_created_and_left_clean()
    {
        var root = Path.Combine(Path.GetTempPath(), "op-upload-check-" + Guid.NewGuid().ToString("N"));
        try
        {
            Assert.Null(ProductionConfiguration.FindUploadFolderProblem(root));
            Assert.Empty(Directory.EnumerateFileSystemEntries(root));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }
}
