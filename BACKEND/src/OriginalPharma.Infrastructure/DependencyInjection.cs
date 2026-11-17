using System.Reflection;
using Hangfire;
using Hangfire.PostgreSql;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Caching.StackExchangeRedis;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Tracking;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Infrastructure.Files;
using OriginalPharma.Infrastructure.Identity;
using OriginalPharma.Infrastructure.Persistence;
using OriginalPharma.Infrastructure.Tracking;
using StackExchange.Redis;
using Role = OriginalPharma.Domain.Identity.Role;

namespace OriginalPharma.Infrastructure;

public static class DependencyInjection
{
    /// <summary>
    /// True while the build writes the OpenAPI document (the app is started
    /// without running). Skip anything that would connect to external services.
    /// </summary>
    public static bool IsWritingOpenApiDocument =>
        Assembly.GetEntryAssembly()?.GetName().Name == "GetDocument.Insider";

    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var postgres = configuration.GetConnectionString("Postgres") ?? string.Empty;
        var redis = RedisOptions(configuration.GetConnectionString("Redis") ?? "localhost:6379");

        // Persistence
        services.AddDbContext<AppDbContext>(o => AppDbContextOptions.Configure(o, postgres));
        services.AddScoped<IAppDbContext>(sp => sp.GetRequiredService<AppDbContext>());
        services.AddScoped<DatabaseSeeder>();
        services.Configure<SeedOptions>(configuration.GetSection(SeedOptions.SectionName));

        // Identity
        services.AddIdentityCore<User>(o =>
            {
                o.User.RequireUniqueEmail = true;
                o.Password.RequiredLength = 8;
                o.Password.RequireNonAlphanumeric = false;
                o.Lockout.AllowedForNewUsers = true;
                o.Lockout.MaxFailedAccessAttempts = 5;
                o.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
            })
            .AddRoles<Role>()
            .AddEntityFrameworkStores<AppDbContext>();

        var jwtOptions = services.AddOptions<JwtOptions>()
            .Bind(configuration.GetSection(JwtOptions.SectionName))
            .Validate(o => o.SigningKey.Length >= 32, "Jwt:SigningKey must be at least 32 characters. Set it with: dotnet user-secrets set \"Jwt:SigningKey\" \"<random value>\"");
        if (!IsWritingOpenApiDocument)
        {
            jwtOptions.ValidateOnStart();
        }

        services.AddSingleton<TokenService>();
        services.AddScoped<IAuthService, AuthService>();
        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUser, CurrentUser>();
        services.AddScoped<IPermissionService, PermissionService>();

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
        services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
            .Configure<IOptions<JwtOptions>>((bearer, jwt) =>
            {
                bearer.MapInboundClaims = false;
                bearer.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidIssuer = jwt.Value.Issuer,
                    ValidAudience = jwt.Value.Audience,
                    IssuerSigningKey = jwt.Value.GetSigningKey(),
                    ValidateIssuerSigningKey = true,
                    NameClaimType = AppClaims.Name,
                    RoleClaimType = AppClaims.Role,
                    ClockSkew = TimeSpan.FromSeconds(30),
                };
                bearer.Events = new JwtBearerEvents
                {
                    // Browsers cannot set headers on WebSocket requests; SignalR sends the token in the query string.
                    OnMessageReceived = context =>
                    {
                        var token = context.Request.Query["access_token"];
                        if (!string.IsNullOrEmpty(token) && context.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                        {
                            context.Token = token;
                        }

                        return Task.CompletedTask;
                    },
                };
            });

        services.AddAuthorization();
        services.AddSingleton<IAuthorizationPolicyProvider, PermissionPolicyProvider>();
        services.AddScoped<IAuthorizationHandler, PermissionAuthorizationHandler>();

        // Redis: latest positions, live view registry, permission versions
        services.AddSingleton<IConnectionMultiplexer>(_ => ConnectionMultiplexer.Connect(redis));
        services.AddStackExchangeRedisCache(o =>
        {
            o.ConfigurationOptions = redis.Clone();
            o.InstanceName = "op:";
        });

        // Tracking adapters
        services.AddSingleton<ILatestPositionStore, RedisLatestPositionStore>();
        services.AddSingleton<ILiveViewRegistry, RedisLiveViewRegistry>();
        services.AddSingleton<IIpGeolocationService, NullIpGeolocationService>();
        services.AddSingleton<IPlayIntegrityVerifier, PlayIntegrityVerifier>();
        services.AddSingleton<IPushNotificationSender, LoggingPushNotificationSender>();
        services.Configure<PlayIntegrityOptions>(configuration.GetSection(PlayIntegrityOptions.SectionName));

        // Files
        services.Configure<FileStorageOptions>(configuration.GetSection(FileStorageOptions.SectionName));
        services.AddSingleton<IFileStorage, LocalFileStorage>();

        // Background jobs
        if (!IsWritingOpenApiDocument)
        {
            services.AddHangfire(cfg => cfg
                .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
                .UseSimpleAssemblyNameTypeSerializer()
                .UseRecommendedSerializerSettings()
                .UsePostgreSqlStorage(
                    o => o.UseNpgsqlConnection(postgres),
                    new PostgreSqlStorageOptions { SchemaName = "hangfire", PrepareSchemaIfNecessary = true }));
            services.AddHangfireServer();
        }

        // Health
        services.AddHealthChecks()
            .AddDbContextCheck<AppDbContext>("postgres")
            .AddCheck<RedisHealthCheck>("redis");

        return services;
    }

    private static ConfigurationOptions RedisOptions(string connectionString)
    {
        var options = ConfigurationOptions.Parse(connectionString);
        options.AbortOnConnectFail = false; // start even if Redis is not up yet; it reconnects
        return options;
    }
}

internal sealed class RedisHealthCheck(IConnectionMultiplexer redis) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        try
        {
            var latency = await redis.GetDatabase().PingAsync();
            return HealthCheckResult.Healthy($"ping {latency.TotalMilliseconds:0} ms");
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy("Redis unreachable", ex);
        }
    }
}
