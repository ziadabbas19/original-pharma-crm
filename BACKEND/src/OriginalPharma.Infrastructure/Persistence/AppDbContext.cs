using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.EntityFrameworkCore.Storage;
using OriginalPharma.Application.Common;
using OriginalPharma.Domain.Audit;
using OriginalPharma.Domain.Catalog;
using OriginalPharma.Domain.Common;
using OriginalPharma.Domain.Crm;
using OriginalPharma.Domain.Expenses;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Domain.Notes;
using OriginalPharma.Domain.Notifications;
using OriginalPharma.Domain.Orders;
using OriginalPharma.Domain.Plans;
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
    public DbSet<UserAuditEntry> UserAuditEntries => Set<UserAuditEntry>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<UserSession> UserSessions => Set<UserSession>();
    public DbSet<ExpenseLine> ExpenseLines => Set<ExpenseLine>();
    public DbSet<ExpenseDay> ExpenseDays => Set<ExpenseDay>();
    public DbSet<RepTownExpenseDefault> RepTownExpenseDefaults => Set<RepTownExpenseDefault>();
    public DbSet<WeeklyPlan> WeeklyPlans => Set<WeeklyPlan>();
    public DbSet<WeeklyPlanDay> WeeklyPlanDays => Set<WeeklyPlanDay>();
    public DbSet<WeeklyPlanCustomer> WeeklyPlanCustomers => Set<WeeklyPlanCustomer>();
    public DbSet<WeeklyPlanEvent> WeeklyPlanEvents => Set<WeeklyPlanEvent>();
    public DbSet<RepNote> RepNotes => Set<RepNote>();
    public DbSet<UserHomeShortcuts> UserHomeShortcuts => Set<UserHomeShortcuts>();

    public Task<int> ExecuteSqlAsync(FormattableString sql, CancellationToken cancellationToken = default) =>
        Database.ExecuteSqlInterpolatedAsync(sql, cancellationToken);

    public async Task<IReadOnlyList<T>> QuerySqlAsync<T>(FormattableString sql, CancellationToken cancellationToken = default) =>
        await Database.SqlQuery<T>(sql).ToListAsync(cancellationToken);

    public Task<IDbContextTransaction> BeginTransactionAsync(CancellationToken cancellationToken = default) =>
        Database.BeginTransactionAsync(cancellationToken);
    public DbSet<Territory> Territories => Set<Territory>();

    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<Specialty> Specialties => Set<Specialty>();
    public DbSet<RepDoctor> RepDoctors => Set<RepDoctor>();
    public DbSet<DoctorAvailability> DoctorAvailability => Set<DoctorAvailability>();
    public DbSet<RepDay> RepDays => Set<RepDay>();
    public DbSet<RepVisitOrder> RepVisitOrder => Set<RepVisitOrder>();
    public DbSet<RepAmVisit> RepAmVisits => Set<RepAmVisit>();

    public DbSet<ProductLine> ProductLines => Set<ProductLine>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductImage> ProductImages => Set<ProductImage>();
    public DbSet<UserProductLine> UserProductLines => Set<UserProductLine>();

    public DbSet<CollectionMethod> CollectionMethods => Set<CollectionMethod>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderLine> OrderLines => Set<OrderLine>();
    public DbSet<OrderHistoryEntry> OrderHistory => Set<OrderHistoryEntry>();

    /// <summary>One-time seeding steps already applied to this database.</summary>
    public DbSet<SeedHistoryEntry> SeedHistory => Set<SeedHistoryEntry>();

    public DbSet<Visit> Visits => Set<Visit>();
    public DbSet<VisitPhoto> VisitPhotos => Set<VisitPhoto>();
    public DbSet<VisitFeedback> VisitFeedback => Set<VisitFeedback>();
    public DbSet<VisitFeedbackSeen> VisitFeedbackSeen => Set<VisitFeedbackSeen>();
    public DbSet<VisitFeedbackReply> VisitFeedbackReplies => Set<VisitFeedbackReply>();
    public DbSet<VisitProduct> VisitProducts => Set<VisitProduct>();

    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<AuditEntry> AuditEntries => Set<AuditEntry>();
    public DbSet<AppSetting> AppSettings => Set<AppSetting>();

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
        builder.HasSequence<long>(Infrastructure.Orders.OrderNumberGenerator.SequenceName);
        builder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        RefreshCustomerNameSearch();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        RefreshCustomerNameSearch();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    /// <summary>Every path that adds or renames a customer (forms, imports, seeding) keeps the search names in step.</summary>
    private void RefreshCustomerNameSearch()
    {
        foreach (var entry in ChangeTracker.Entries<Customer>())
        {
            if (entry.State is EntityState.Added or EntityState.Modified)
            {
                entry.Entity.RefreshNameSearch();
            }
        }
    }
}

/// <summary>A seeding step that ran once (demo data). Keeps the seeder from re-adding rows people deleted or renamed.</summary>
public sealed class SeedHistoryEntry
{
    public string Key { get; set; } = string.Empty;
    public DateTimeOffset AppliedAt { get; set; }
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
