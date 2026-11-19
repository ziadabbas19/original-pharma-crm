using Microsoft.Extensions.Hosting;

namespace OriginalPharma.Infrastructure;

public static class DeploymentEnvironment
{
    public const string Testing = "Testing";

    private static readonly string[] PlaceholderFragments =
    [
        "change-me", "changeme", "change_me", "replace", "placeholder", "example", "your-", "your_",
        "secret-key", "development", "password", "<", ">",
    ];

    /// <summary>Development and automated tests. Every other environment is treated as a live deployment.</summary>
    public static bool IsLocal(this IHostEnvironment environment) =>
        environment.IsDevelopment() || environment.IsEnvironment(Testing);

    /// <summary>A secret that still looks like a sample or development value.</summary>
    public static bool IsPlaceholder(string value) =>
        PlaceholderFragments.Any(f => value.Contains(f, StringComparison.OrdinalIgnoreCase));
}
