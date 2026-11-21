using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using OriginalPharma.Domain.Audit;
using OriginalPharma.Domain.Catalog;
using OriginalPharma.Domain.Common;
using OriginalPharma.Domain.Crm;
using OriginalPharma.Domain.Expenses;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Domain.Notifications;
using OriginalPharma.Domain.Orders;
using OriginalPharma.Domain.Plans;
using OriginalPharma.Domain.Tracking;
using OriginalPharma.Domain.Visits;

namespace OriginalPharma.Application.Common;

/// <summary>Database access for use cases. Implemented by the EF Core context in Infrastructure.</summary>
public interface IAppDbContext
{
    DbSet<User> Users { get; }
    DbSet<Role> Roles { get; }
    DbSet<IdentityUserRole<Guid>> UserRoles { get; }
    DbSet<Permission> Permissions { get; }
    DbSet<RolePermission> RolePermissions { get; }
    DbSet<UserPermissionOverride> UserPermissionOverrides { get; }
    DbSet<RoleAuditEntry> RoleAuditEntries { get; }
    DbSet<UserAuditEntry> UserAuditEntries { get; }
    DbSet<RefreshToken> RefreshTokens { get; }
    DbSet<UserSession> UserSessions { get; }
    DbSet<Territory> Territories { get; }

    DbSet<Customer> Customers { get; }
    DbSet<Specialty> Specialties { get; }
    DbSet<RepDoctor> RepDoctors { get; }

    DbSet<ProductLine> ProductLines { get; }
    DbSet<Product> Products { get; }
    DbSet<UserProductLine> UserProductLines { get; }

    DbSet<CollectionMethod> CollectionMethods { get; }
    DbSet<Order> Orders { get; }
    DbSet<OrderLine> OrderLines { get; }
    DbSet<OrderHistoryEntry> OrderHistory { get; }

    DbSet<ExpenseLine> ExpenseLines { get; }
    DbSet<ExpenseDay> ExpenseDays { get; }

    DbSet<WeeklyPlan> WeeklyPlans { get; }
    DbSet<WeeklyPlanDay> WeeklyPlanDays { get; }
    DbSet<WeeklyPlanCustomer> WeeklyPlanCustomers { get; }
    DbSet<WeeklyPlanEvent> WeeklyPlanEvents { get; }

    DbSet<Visit> Visits { get; }
    DbSet<VisitPhoto> VisitPhotos { get; }
    DbSet<VisitFeedback> VisitFeedback { get; }
    DbSet<VisitFeedbackSeen> VisitFeedbackSeen { get; }
    DbSet<VisitFeedbackReply> VisitFeedbackReplies { get; }
    DbSet<VisitProduct> VisitProducts { get; }

    DbSet<Notification> Notifications { get; }
    DbSet<AuditEntry> AuditEntries { get; }
    DbSet<AppSetting> AppSettings { get; }

    DbSet<Shift> Shifts { get; }
    DbSet<LocationPoint> LocationPoints { get; }
    DbSet<TrackingFlag> TrackingFlags { get; }
    DbSet<Device> Devices { get; }
    DbSet<DeviceHealthReport> DeviceHealthReports { get; }
    DbSet<TrackingConsent> TrackingConsents { get; }

    /// <summary>
    /// Runs one SQL statement (values become parameters) for the few changes EF cannot express, such as
    /// an atomic "insert unless present". Returns the number of rows affected.
    /// </summary>
    Task<int> ExecuteSqlAsync(FormattableString sql, CancellationToken cancellationToken = default);

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}

/// <summary>The authenticated caller of the current request.</summary>
public interface ICurrentUser
{
    Guid? UserId { get; }
    bool IsAuthenticated { get; }
    string? IpAddress { get; }
    string? UserAgent { get; }

    /// <summary>Refresh-token family of the session that issued the access token (the "sid" claim).</summary>
    Guid? SessionId { get; }

    /// <summary>Returns the user id or throws <see cref="UnauthorizedException"/>.</summary>
    Guid RequireUserId();
}

/// <summary>Stores uploaded files (visit photos, processed images).</summary>
public interface IFileStorage
{
    /// <summary>Saves under a new random name.</summary>
    /// <returns>Storage path/key to persist on the entity.</returns>
    Task<string> SaveAsync(Stream content, string folder, string extension, CancellationToken cancellationToken = default);

    /// <summary>Saves under a name chosen by the caller (relative path inside the storage root).</summary>
    Task SaveAsAsync(Stream content, string storagePath, CancellationToken cancellationToken = default);

    Task<Stream?> OpenReadAsync(string storagePath, CancellationToken cancellationToken = default);

    /// <summary>Deletes the file if it exists. Never throws for a missing file.</summary>
    Task DeleteAsync(string storagePath, CancellationToken cancellationToken = default);
}
