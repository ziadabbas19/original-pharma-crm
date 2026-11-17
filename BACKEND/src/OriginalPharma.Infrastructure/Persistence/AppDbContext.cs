using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using OriginalPharma.Application.Common;
using OriginalPharma.Domain.Crm;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Domain.Tracking;
using OriginalPharma.Domain.Visits;

namespace OriginalPharma.Infrastructure.Persistence;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options)
    : IdentityDbContext<User, Role, Guid>(options), IAppDbContext
{
    public DbSet<Permission> Permissions => Set<Permission>();
    public DbSet<RolePermission> RolePermissions => Set<RolePermission>();
    public DbSet<UserPermissionOverride> UserPermissionOverrides => Set<UserPermissionOverride>();
    public DbSet<RoleAuditEntry> RoleAuditEntries => Set<RoleAuditEntry>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<Territory> Territories => Set<Territory>();

    public DbSet<Customer> Customers => Set<Customer>();

    public DbSet<Visit> Visits => Set<Visit>();
    public DbSet<VisitPhoto> VisitPhotos => Set<VisitPhoto>();

    public DbSet<Shift> Shifts => Set<Shift>();
    public DbSet<LocationPoint> LocationPoints => Set<LocationPoint>();
    public DbSet<TrackingFlag> TrackingFlags => Set<TrackingFlag>();
    public DbSet<Device> Devices => Set<Device>();
    public DbSet<DeviceHealthReport> DeviceHealthReports => Set<DeviceHealthReport>();
    public DbSet<TrackingConsent> TrackingConsents => Set<TrackingConsent>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.HasPostgresExtension("postgis");
        builder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
    }
}

internal static class AppDbContextOptions
{
    public static DbContextOptionsBuilder Configure(DbContextOptionsBuilder builder, string connectionString) =>
        builder
            .UseNpgsql(connectionString, npgsql =>
            {
                npgsql.UseNetTopologySuite();
                npgsql.MigrationsHistoryTable("__ef_migrations_history");
                npgsql.MigrationsAssembly(typeof(AppDbContext).Assembly.FullName);
            })
            .UseSnakeCaseNamingConvention();
}

/// <summary>Used by <c>dotnet ef</c>; no database connection is needed to add migrations.</summary>
internal sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var builder = new DbContextOptionsBuilder<AppDbContext>();
        AppDbContextOptions.Configure(builder, "Host=localhost;Database=original_pharma;Username=postgres");
        return new AppDbContext(builder.Options);
    }
}
