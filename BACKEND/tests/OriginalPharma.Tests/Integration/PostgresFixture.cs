using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using OriginalPharma.Application;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Images;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Orders;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Infrastructure.Files;
using OriginalPharma.Infrastructure.Identity;
using OriginalPharma.Infrastructure.Orders;
using OriginalPharma.Infrastructure.Persistence;

namespace OriginalPharma.Tests.Integration;

[CollectionDefinition(Name)]
public sealed class PostgresCollection : ICollectionFixture<PostgresFixture>
{
    public const string Name = "postgres";
}

/// <summary>
/// Integration tests against a real PostgreSQL (the one from docker-compose). A template
/// database is migrated and seeded once (demo data included); every test gets its own
/// copy (CREATE DATABASE … TEMPLATE) and drops it afterwards.
/// <para>
/// Connection: <c>ORIGINALPHARMA_TEST_POSTGRES</c>, or the API's user secret
/// <c>ConnectionStrings:Postgres</c>. The user needs CREATEDB. Without a reachable server
/// the tests are skipped, not failed.
/// </para>
/// </summary>
public sealed class PostgresFixture : IAsyncLifetime
{
    public const string AdminEmail = "admin@test.local";

    /// <summary>Password of the seeded admin and demo users in the test databases.</summary>
    internal static readonly string Password = "Test-" + Guid.NewGuid().ToString("N")[..16];

    /// <summary>Uploaded files of all test databases; deleted at the end of the run.</summary>
    internal static readonly string FilesRoot = Path.Combine(Path.GetTempPath(), "op-test-files-" + Guid.NewGuid().ToString("N")[..12]);

    private NpgsqlConnectionStringBuilder? _server;
    private string? _template;

    public string? SkipReason { get; private set; }

    public async ValueTask InitializeAsync()
    {
        var configuration = new ConfigurationBuilder()
            .AddUserSecrets<Program>(optional: true)
            .AddEnvironmentVariables()
            .Build();
        var connectionString = configuration["ORIGINALPHARMA_TEST_POSTGRES"] ?? configuration.GetConnectionString("Postgres");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            SkipReason = "No PostgreSQL connection string (set ORIGINALPHARMA_TEST_POSTGRES or the API user secret ConnectionStrings:Postgres).";
            return;
        }

        _server = new NpgsqlConnectionStringBuilder(connectionString) { Pooling = false, Timeout = 5 };
        try
        {
            await ExecuteAsync("SELECT 1");
        }
        catch (Exception ex) when (ex is NpgsqlException or TimeoutException or System.Net.Sockets.SocketException)
        {
            SkipReason = $"PostgreSQL is not reachable ({ex.Message}). Start it with: podman compose up -d";
            return;
        }

        _template = "op_test_tpl_" + Guid.NewGuid().ToString("N")[..12];
        await ExecuteAsync($"CREATE DATABASE \"{_template}\"");

        await using (var services = BuildServices(ConnectionStringFor(_template)))
        {
            await using var scope = services.CreateAsyncScope();
            await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();
            await scope.ServiceProvider.GetRequiredService<DatabaseSeeder>().SeedAsync();
        }

        // CREATE DATABASE … TEMPLATE needs the template to have no open connections.
        NpgsqlConnection.ClearAllPools();
    }

    public async ValueTask DisposeAsync()
    {
        if (_template is not null)
        {
            NpgsqlConnection.ClearAllPools();
            await ExecuteAsync($"DROP DATABASE IF EXISTS \"{_template}\" WITH (FORCE)");
        }

        if (Directory.Exists(FilesRoot))
        {
            Directory.Delete(FilesRoot, recursive: true);
        }
    }

    public async Task<TestDatabase> CreateDatabaseAsync()
    {
        if (SkipReason is not null)
        {
            Assert.Skip(SkipReason);
        }

        var name = "op_test_" + Guid.NewGuid().ToString("N")[..12];
        await ExecuteAsync($"CREATE DATABASE \"{name}\" TEMPLATE \"{_template}\"");
        return new TestDatabase(this, name, BuildServices(ConnectionStringFor(name)));
    }

    internal async Task DropDatabaseAsync(string name)
    {
        NpgsqlConnection.ClearAllPools();
        await ExecuteAsync($"DROP DATABASE IF EXISTS \"{name}\" WITH (FORCE)");
    }

    /// <summary>
    /// No pooling: EF keeps its own Npgsql data source per connection string, and pooled
    /// connections left on the template would block CREATE DATABASE … TEMPLATE.
    /// </summary>
    private string ConnectionStringFor(string database) =>
        new NpgsqlConnectionStringBuilder(_server!.ConnectionString) { Database = database, Pooling = false }.ConnectionString;

    private async Task ExecuteAsync(string sql)
    {
        var maintenance = new NpgsqlConnectionStringBuilder(_server!.ConnectionString) { Database = "postgres" };
        await using var connection = new NpgsqlConnection(maintenance.ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync();
    }

    /// <summary>The application and identity services, with an in-memory cache instead of Redis.</summary>
    private static ServiceProvider BuildServices(string connectionString)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Seed:AdminEmail"] = AdminEmail,
                ["Seed:AdminPassword"] = Password,
                ["Seed:DemoData"] = "true",
                ["FileStorage:RootPath"] = FilesRoot,
            })
            .Build();

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddApplication(configuration);
        services.AddDistributedMemoryCache();
        services.AddDbContext<AppDbContext>(o => AppDbContextOptions.Configure(o, connectionString));
        services.AddScoped<IAppDbContext>(sp => sp.GetRequiredService<AppDbContext>());
        services.AddIdentityCore<User>(o =>
            {
                o.User.RequireUniqueEmail = true;
                o.Password.RequiredLength = 8;
                o.Password.RequireNonAlphanumeric = false;
            })
            .AddRoles<Role>()
            .AddEntityFrameworkStores<AppDbContext>();
        services.AddScoped<IPermissionService, PermissionService>();
        services.AddScoped<TestCurrentUser>();
        services.AddScoped<ICurrentUser>(sp => sp.GetRequiredService<TestCurrentUser>());
        services.AddScoped<DatabaseSeeder>();
        services.Configure<SeedOptions>(configuration.GetSection(SeedOptions.SectionName));
        services.Configure<FileStorageOptions>(configuration.GetSection(FileStorageOptions.SectionName));
        services.AddSingleton<Microsoft.Extensions.Hosting.IHostEnvironment>(new TestHostEnvironment());
        services.AddSingleton<IFileStorage, LocalFileStorage>();
        services.AddSingleton<IImageProcessor, SkiaImageProcessor>();
        services.AddScoped<IOrderNumberGenerator, OrderNumberGenerator>();

        return services.BuildServiceProvider(new ServiceProviderOptions { ValidateScopes = true });
    }
}

/// <summary>The caller of one simulated request.</summary>
internal sealed class TestCurrentUser : ICurrentUser
{
    public Guid? UserId { get; set; }
    public bool IsAuthenticated => UserId.HasValue;
    public string? IpAddress => "127.0.0.1";
    public string? UserAgent => "tests";
    public Guid? SessionId { get; set; }

    public Guid RequireUserId() => UserId ?? throw new UnauthorizedException("unauthenticated", "Sign in required.");
}

/// <summary>One test's private copy of the seeded database. Each <c>AsAsync</c> call is one request.</summary>
public sealed class TestDatabase : IAsyncDisposable
{
    private readonly PostgresFixture _fixture;
    private readonly string _name;
    private readonly ServiceProvider _services;

    internal TestDatabase(PostgresFixture fixture, string name, ServiceProvider services)
    {
        _fixture = fixture;
        _name = name;
        _services = services;
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>Runs <paramref name="action"/> in a fresh DI scope as <paramref name="actorId"/> (like one HTTP request).</summary>
    public async Task<T> AsAsync<T>(Guid actorId, Func<IServiceProvider, Task<T>> action)
    {
        await using var scope = _services.CreateAsyncScope();
        scope.ServiceProvider.GetRequiredService<TestCurrentUser>().UserId = actorId;
        return await action(scope.ServiceProvider);
    }

    public Task AsAsync(Guid actorId, Func<IServiceProvider, Task> action) =>
        AsAsync(actorId, async sp =>
        {
            await action(sp);
            return true;
        });

    /// <summary>Calls one application service as <paramref name="actorId"/> (one simulated request).</summary>
    public Task<T> As<TService, T>(Guid actorId, Func<TService, Task<T>> action)
        where TService : notnull =>
        AsAsync(actorId, sp => action(sp.GetRequiredService<TService>()));

    public Task As<TService>(Guid actorId, Func<TService, Task> action)
        where TService : notnull =>
        AsAsync(actorId, sp => action(sp.GetRequiredService<TService>()));

    /// <summary>Direct database access for test setup and checks.</summary>
    public async Task<T> DbAsync<T>(Func<AppDbContext, Task<T>> action)
    {
        await using var scope = _services.CreateAsyncScope();
        return await action(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    public Task<T> RolesAsync<T>(Guid actorId, Func<RoleService, Task<T>> action) =>
        AsAsync(actorId, sp => action(sp.GetRequiredService<RoleService>()));

    public Task UsersAsync(Guid actorId, Func<UserAdminService, Task> action) =>
        AsAsync(actorId, sp => action(sp.GetRequiredService<UserAdminService>()));

    public Task<T> UsersAsync<T>(Guid actorId, Func<UserAdminService, Task<T>> action) =>
        AsAsync(actorId, sp => action(sp.GetRequiredService<UserAdminService>()));

    public async Task<Guid> UserIdAsync(string email)
    {
        await using var scope = _services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var normalized = email.ToUpperInvariant();
        return await db.Users.Where(u => u.NormalizedEmail == normalized).Select(u => u.Id).SingleAsync(Ct);
    }

    public async Task<RoleDto> RoleAsync(string key)
    {
        await using var scope = _services.CreateAsyncScope();
        var roles = await scope.ServiceProvider.GetRequiredService<RoleService>().ListRolesAsync(Ct);
        return roles.Single(r => r.Key == key);
    }

    public async Task<IReadOnlyList<RoleDto>> AllRolesAsync()
    {
        await using var scope = _services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<RoleService>().ListRolesAsync(Ct);
    }

    public async Task<int> PermissionsVersionAsync(Guid userId)
    {
        await using var scope = _services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.Users.Where(u => u.Id == userId).Select(u => u.PermissionsVersion).SingleAsync(Ct);
    }

    /// <summary>Effective permissions as the next request of <paramref name="userId"/> would see them.</summary>
    public async Task<EffectivePermissions> EffectivePermissionsAsync(Guid userId)
    {
        await using var scope = _services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<IPermissionService>().GetEffectivePermissionsAsync(userId, Ct);
    }

    public async Task SeedAgainAsync()
    {
        await using var scope = _services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<DatabaseSeeder>().SeedAsync(Ct);
    }

    /// <summary>Admin adds grants to a role on top of what it has.</summary>
    public async Task GrantAsync(Guid adminId, string roleKey, params (string Key, PermissionScope Scope)[] extra)
    {
        var role = await RoleAsync(roleKey);
        var grants = role.Permissions
            .Where(p => extra.All(e => e.Key != p.Key))
            .Concat(extra.Select(e => new PermissionGrantDto(e.Key, e.Scope)))
            .ToList();
        await RolesAsync(adminId, s => s.SetPermissionsAsync(role.Id, new SetRolePermissionsRequest(grants), Ct));
    }

    public async ValueTask DisposeAsync()
    {
        await _services.DisposeAsync();
        await _fixture.DropDatabaseAsync(_name);
    }
}

internal sealed class TestHostEnvironment : Microsoft.Extensions.Hosting.IHostEnvironment
{
    public string EnvironmentName { get; set; } = "Testing";
    public string ApplicationName { get; set; } = "OriginalPharma.Tests";
    public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
    public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } =
        new Microsoft.Extensions.FileProviders.NullFileProvider();
}
