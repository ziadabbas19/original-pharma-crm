using Microsoft.Extensions.Hosting;

namespace OriginalPharma.Infrastructure;

public static class DeploymentEnvironment
{
    public const string Testing = "Testing";

    /// <summary>Development and automated tests. Every other environment is treated as a live deployment.</summary>
    public static bool IsLocal(this IHostEnvironment environment) =>
        environment.IsDevelopment() || environment.IsEnvironment(Testing);
}
