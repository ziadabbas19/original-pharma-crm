using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Hangfire;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.HostFiltering;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using OriginalPharma.Api.Modules.Tracking;
using OriginalPharma.Application.Notifications;
using OriginalPharma.Application.Tracking;
using OriginalPharma.Application.Tracking.Integrity;
using OriginalPharma.Infrastructure;
using OriginalPharma.Infrastructure.Persistence;
using StackExchange.Redis;

namespace OriginalPharma.Api.Common;

internal static class ApiSetup
{
    public const string CorsPolicy = "frontend";
    public const string AuthRateLimit = "auth";
    public const string PasswordRateLimit = "password";

    /// <summary>Image uploads are limited to 5 MB by the image service; this leaves room for the multipart envelope.</summary>
    public const long MaxImageRequestBytes = 6 * 1024 * 1024;

    /// <summary>The host Railway's deployment health check calls the container with.</summary>
    private const string PlatformHealthCheckHost = "healthcheck.railway.app";

    public static IServiceCollection AddApi(this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
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

        services.Configure<RefreshCookieSettings>(configuration.GetSection(RefreshCookieSettings.SectionName));
        services.AddDataProtectionKeys(configuration, environment);

        var origins = SettingList.Read(configuration.GetSection("Cors:AllowedOrigins"));
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

            // Password changes per signed-in user (falls back to the address): slows down guessing
            // the current password from a stolen session.
            o.AddPolicy(PasswordRateLimit, http => RateLimitPartition.GetFixedWindowLimiter(
                http.User.FindFirst("sub")?.Value ?? http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 5, Window = TimeSpan.FromMinutes(15) }));
        });

        // Only proxies on loopback are trusted unless the ForwardedHeaders section says otherwise.
        services.Configure<ForwardedHeadersOptions>(o => ForwardedHeadersSettings.Apply(o, configuration));

        if (!environment.IsLocal())
        {
            services.AddHsts(o =>
            {
                o.MaxAge = TimeSpan.FromDays(365);
                o.IncludeSubDomains = true;
            });
            services.AddHttpsRedirection(o => o.HttpsPort = 443);

            // AllowedHosts=* means "not configured": answer only on the public address.
            services.PostConfigure<HostFilteringOptions>(o =>
            {
                if (o.AllowedHosts.Contains("*") && Uri.TryCreate(configuration["App:PublicBaseUrl"], UriKind.Absolute, out var publicUrl))
                {
                    o.AllowedHosts = [publicUrl.Host, PlatformHealthCheckHost];
                }
            });
        }

        var signalR = services.AddSignalR()
            .AddJsonProtocol(o => ConfigureJson(o.PayloadSerializerOptions));
        if (configuration.GetValue<bool>("SignalR:UseRedisBackplane"))
        {
            signalR.AddStackExchangeRedis(configuration.GetConnectionString("Redis")!, o =>
                o.Configuration.ChannelPrefix = RedisChannel.Literal("op-signalr"));
        }

        services.AddSingleton<ITrackingNotifier, SignalRTrackingNotifier>();
        services.AddSingleton<INotificationPublisher, SignalRNotificationPublisher>();
        return services;
    }

    public static async Task InitializeAsync(this WebApplication app)
    {
        try
        {
            await app.Services.InitializeDatabaseAsync(app.Configuration.GetValue<bool>("Database:MigrateOnStartup"));
        }
        catch (Exception ex) when (app.Environment.IsLocal())
        {
            app.Logger.LogError(ex, "Database initialisation failed. Is PostgreSQL running? (podman compose up -d)");
        }

        try
        {
            var jobs = app.Services.GetRequiredService<IRecurringJobManager>();
            jobs.AddOrUpdate<TrackingLostMonitor>(
                "tracking-lost-monitor", monitor => monitor.RunAsync(CancellationToken.None), Cron.Minutely());
            jobs.AddOrUpdate<DeviceSignalsRetentionJob>(
                "device-signals-retention", job => job.RunAsync(CancellationToken.None), Cron.Daily(2));
            jobs.AddOrUpdate<OriginalPharma.Application.Tracking.Visibility.OutsideVisitPointsPurgeJob>(
                "outside-visit-points-purge", job => job.RunAsync(CancellationToken.None), Cron.Hourly(17));
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

    /// <summary>Public answer of a live deployment: up or not, nothing about what is behind it.</summary>
    public static Task WritePublicHealthAsync(HttpContext context, HealthReport report)
    {
        context.Response.ContentType = "application/json";
        return context.Response.WriteAsJsonAsync(new { status = report.Status.ToString() });
    }

    public static HealthCheckOptions HealthOptions(IHostEnvironment environment) => new()
    {
        ResponseWriter = environment.IsLocal() ? WriteHealthAsync : WritePublicHealthAsync,
    };

    private static void ConfigureJson(JsonSerializerOptions options)
    {
        options.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        options.NumberHandling = JsonNumberHandling.Strict; // numbers are numbers (keeps the OpenAPI types clean)
        options.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
    }
}
