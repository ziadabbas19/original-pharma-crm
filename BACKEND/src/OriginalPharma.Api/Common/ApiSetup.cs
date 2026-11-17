using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Hangfire;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using OriginalPharma.Api.Modules.Tracking;
using OriginalPharma.Application.Tracking;
using OriginalPharma.Infrastructure.Persistence;
using StackExchange.Redis;

namespace OriginalPharma.Api.Common;

internal static class ApiSetup
{
    public const string CorsPolicy = "frontend";
    public const string AuthRateLimit = "auth";

    public static IServiceCollection AddApi(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<ValidationFilter>();
        services.AddControllers(o => o.Filters.AddService<ValidationFilter>())
            .AddJsonOptions(o => ConfigureJson(o.JsonSerializerOptions));
        services.ConfigureHttpJsonOptions(o => ConfigureJson(o.SerializerOptions));

        services.AddProblemDetails(o => o.CustomizeProblemDetails = ctx =>
            ctx.ProblemDetails.Extensions["traceId"] = ctx.HttpContext.TraceIdentifier);
        services.AddExceptionHandler<GlobalExceptionHandler>();

        services.AddOpenApi("v1", o =>
        {
            o.AddDocumentTransformer<DocumentInfoTransformer>();
            o.AddOperationTransformer<OperationIdTransformer>();
        });

        var origins = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
        services.AddCors(o => o.AddPolicy(CorsPolicy, policy => policy
            .WithOrigins(origins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials()
            .WithExposedHeaders(PermissionsVersionHeaderMiddleware.HeaderName)));

        services.AddRateLimiter(o =>
        {
            o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            o.AddPolicy(AuthRateLimit, http => RateLimitPartition.GetFixedWindowLimiter(
                http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                // Generous: many reps can share one carrier NAT address.
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 30, Window = TimeSpan.FromMinutes(1) }));
        });

        // Only proxies on loopback are trusted by default.
        // TODO: add KnownProxies / KnownNetworks for the production reverse proxy.
        services.Configure<ForwardedHeadersOptions>(o =>
            o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto);

        var signalR = services.AddSignalR()
            .AddJsonProtocol(o => ConfigureJson(o.PayloadSerializerOptions));
        if (configuration.GetValue<bool>("SignalR:UseRedisBackplane"))
        {
            signalR.AddStackExchangeRedis(configuration.GetConnectionString("Redis")!, o =>
                o.Configuration.ChannelPrefix = RedisChannel.Literal("op-signalr"));
        }

        services.AddSingleton<ITrackingNotifier, SignalRTrackingNotifier>();
        return services;
    }

    public static async Task InitializeAsync(this WebApplication app)
    {
        try
        {
            await app.Services.InitializeDatabaseAsync(app.Configuration.GetValue<bool>("Database:MigrateOnStartup"));
        }
        catch (Exception ex)
        {
            app.Logger.LogError(ex, "Database initialisation failed. Is PostgreSQL running? (podman compose up -d)");
        }

        try
        {
            app.Services.GetRequiredService<IRecurringJobManager>().AddOrUpdate<TrackingLostMonitor>(
                "tracking-lost-monitor", monitor => monitor.RunAsync(CancellationToken.None), Cron.Minutely());
        }
        catch (Exception ex)
        {
            app.Logger.LogError(ex, "Could not register recurring jobs");
        }
    }

    public static Task WriteHealthAsync(HttpContext context, HealthReport report)
    {
        context.Response.ContentType = "application/json";
        return context.Response.WriteAsJsonAsync(new
        {
            status = report.Status.ToString(),
            checks = report.Entries.ToDictionary(e => e.Key, e => new
            {
                status = e.Value.Status.ToString(),
                description = e.Value.Description,
                durationMs = Math.Round(e.Value.Duration.TotalMilliseconds),
            }),
        });
    }

    public static HealthCheckOptions HealthOptions => new() { ResponseWriter = WriteHealthAsync };

    private static void ConfigureJson(JsonSerializerOptions options)
    {
        options.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        options.NumberHandling = JsonNumberHandling.Strict; // numbers are numbers (keeps the OpenAPI types clean)
        options.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
    }
}
