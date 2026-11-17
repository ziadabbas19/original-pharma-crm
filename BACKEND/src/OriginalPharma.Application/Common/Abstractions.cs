using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using OriginalPharma.Domain.Crm;
using OriginalPharma.Domain.Identity;
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
    DbSet<RefreshToken> RefreshTokens { get; }
    DbSet<Territory> Territories { get; }

    DbSet<Customer> Customers { get; }

    DbSet<Visit> Visits { get; }
    DbSet<VisitPhoto> VisitPhotos { get; }

    DbSet<Shift> Shifts { get; }
    DbSet<LocationPoint> LocationPoints { get; }
    DbSet<TrackingFlag> TrackingFlags { get; }
    DbSet<Device> Devices { get; }
    DbSet<DeviceHealthReport> DeviceHealthReports { get; }
    DbSet<TrackingConsent> TrackingConsents { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}

/// <summary>The authenticated caller of the current request.</summary>
public interface ICurrentUser
{
    Guid? UserId { get; }
    bool IsAuthenticated { get; }
    string? IpAddress { get; }
    string? UserAgent { get; }

    /// <summary>Returns the user id or throws <see cref="UnauthorizedException"/>.</summary>
    Guid RequireUserId();
}

/// <summary>Stores uploaded files (visit photos).</summary>
public interface IFileStorage
{
    /// <returns>Storage path/key to persist on the entity.</returns>
    Task<string> SaveAsync(Stream content, string folder, string extension, CancellationToken cancellationToken = default);

    Task<Stream?> OpenReadAsync(string storagePath, CancellationToken cancellationToken = default);
}
