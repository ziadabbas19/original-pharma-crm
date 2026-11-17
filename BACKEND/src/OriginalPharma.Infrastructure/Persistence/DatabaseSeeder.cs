using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using OriginalPharma.Application.Identity;
using OriginalPharma.Domain.Common;
using OriginalPharma.Domain.Crm;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Infrastructure.Persistence;

public sealed class SeedOptions
{
    public const string SectionName = "Seed";

    public string? AdminEmail { get; set; }

    /// <summary>Set with user secrets. Without it no admin user is created.</summary>
    public string? AdminPassword { get; set; }

    public string AdminFullName { get; set; } = "System Admin";

    /// <summary>Development only: demo territory tree, managers, a rep and two customers.</summary>
    public bool DemoData { get; set; }
}

/// <summary>
/// Idempotent seeding run on startup: permission catalog, default roles, the
/// admin user and (optionally) demo data.
/// </summary>
internal sealed class DatabaseSeeder(
    AppDbContext db,
    UserManager<User> userManager,
    IPermissionService permissionService,
    IOptions<SeedOptions> options,
    TimeProvider time,
    ILogger<DatabaseSeeder> logger)
{
    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        await SyncPermissionsAsync(cancellationToken);
        await EnsureRolesAsync(cancellationToken);
        await EnsureAdminAsync(cancellationToken);

        if (options.Value.DemoData)
        {
            await SeedDemoDataAsync(cancellationToken);
        }
    }

    private async Task SyncPermissionsAsync(CancellationToken cancellationToken)
    {
        var existing = await db.Permissions.ToDictionaryAsync(p => p.Key, cancellationToken);
        foreach (var definition in Permissions.All)
        {
            if (existing.TryGetValue(definition.Key, out var permission))
            {
                permission.Description = definition.Description;
                continue;
            }

            db.Permissions.Add(new Permission
            {
                Key = definition.Key,
                Resource = definition.Resource,
                Action = definition.Action,
                Description = definition.Description,
            });
        }

        // TODO: decide how to retire permissions removed from the catalog (currently left in place).
        await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>
    /// Creates seeded roles that are missing, matched by key. Existing roles are never
    /// touched (admins rename them, change levels and permissions from the dashboard),
    /// except that Admin is kept locked: system role, top level, every permission with
    /// scope All.
    /// </summary>
    private async Task EnsureRolesAsync(CancellationToken cancellationToken)
    {
        var permissionIds = await db.Permissions.ToDictionaryAsync(p => p.Key, p => p.Id, cancellationToken);
        var roles = await db.Roles.Include(r => r.Permissions).ToDictionaryAsync(r => r.NormalizedName!, cancellationToken);

        foreach (var template in DefaultRoles.Templates)
        {
            var normalizedKey = Role.NormalizeKey(template.Key);
            if (roles.ContainsKey(normalizedKey))
            {
                continue;
            }

            var role = new Role(template.Key)
            {
                NameAr = template.NameAr,
                NameEn = template.NameEn,
                Description = template.Description,
                Level = template.Level,
                IsSystem = true,
            };
            foreach (var (key, scope) in template.Grants)
            {
                role.Permissions.Add(new RolePermission { PermissionId = permissionIds[key], Scope = scope });
            }

            db.Roles.Add(role);
            roles[normalizedKey] = role;
            logger.LogInformation("Created role {Role}", template.Key);
        }

        var admin = roles[Role.NormalizeKey(DefaultRoles.Admin)];
        admin.IsSystem = true;
        admin.Level = Role.TopLevel;

        var changed = false;
        foreach (var (_, permissionId) in permissionIds)
        {
            var grant = admin.Permissions.FirstOrDefault(rp => rp.PermissionId == permissionId);
            if (grant is null)
            {
                admin.Permissions.Add(new RolePermission { PermissionId = permissionId, Scope = PermissionScope.All });
                changed = true;
            }
            else if (grant.Scope != PermissionScope.All)
            {
                grant.Scope = PermissionScope.All;
                changed = true;
            }
        }

        await db.SaveChangesAsync(cancellationToken);

        if (changed)
        {
            var adminUsers = await db.UserRoles.Where(ur => ur.RoleId == admin.Id).Select(ur => ur.UserId).ToListAsync(cancellationToken);
            await permissionService.BumpVersionAsync(adminUsers, cancellationToken);
        }
    }

    private async Task EnsureAdminAsync(CancellationToken cancellationToken)
    {
        var settings = options.Value;
        if (string.IsNullOrWhiteSpace(settings.AdminEmail) || string.IsNullOrWhiteSpace(settings.AdminPassword))
        {
            logger.LogWarning("Seed:AdminEmail / Seed:AdminPassword not set; skipping admin user creation");
            return;
        }

        if (await userManager.FindByEmailAsync(settings.AdminEmail) is not null)
        {
            return;
        }

        await CreateUserAsync(settings.AdminEmail, settings.AdminFullName, DefaultRoles.Admin, null, null, "en");
        logger.LogInformation("Created admin user {Email}", settings.AdminEmail);
    }

    private async Task SeedDemoDataAsync(CancellationToken cancellationToken)
    {
        if (await db.Territories.AnyAsync(cancellationToken))
        {
            return;
        }

        var region = new Territory { Code = "R-CAI", Name = "Greater Cairo", NameAr = "القاهرة الكبرى", Level = TerritoryLevel.Region };
        var area = new Territory { Code = "A-CAI-E", Name = "East Cairo", NameAr = "شرق القاهرة", Level = TerritoryLevel.Area, Parent = region };
        var territory = new Territory { Code = "T-NSR", Name = "Nasr City", NameAr = "مدينة نصر", Level = TerritoryLevel.Territory, Parent = area };
        db.Territories.AddRange(region, area, territory);

        db.Customers.AddRange(
            new Customer
            {
                Type = CustomerType.Doctor,
                Name = "Dr. Demo Clinic",
                NameAr = "عيادة تجريبية",
                TerritoryId = territory.Id,
                Location = GeoFactory.Point(30.0561, 31.3301),
                GeofenceRadiusMeters = 150,
                QrCode = "DEMO-CLINIC-001",
                CreatedAt = time.GetUtcNow(),
            },
            new Customer
            {
                Type = CustomerType.Pharmacy,
                Name = "Demo Pharmacy",
                NameAr = "صيدلية تجريبية",
                TerritoryId = territory.Id,
                Location = GeoFactory.Point(30.0626, 31.3451),
                GeofenceRadiusMeters = 100,
                QrCode = "DEMO-PHARMACY-001",
                CreatedAt = time.GetUtcNow(),
            });

        await db.SaveChangesAsync(cancellationToken);

        var salesManager = await CreateUserAsync("sales.manager@demo.local", "Demo Sales Manager", DefaultRoles.SalesManager, null, region.Id, "en");
        var areaManager = await CreateUserAsync("area.manager@demo.local", "Demo Area Manager", DefaultRoles.AreaManager, salesManager?.Id, area.Id, "ar");
        var supervisor = await CreateUserAsync("supervisor@demo.local", "Demo Supervisor", DefaultRoles.Supervisor, areaManager?.Id, territory.Id, "ar");
        await CreateUserAsync("rep@demo.local", "Demo Rep", DefaultRoles.Rep, supervisor?.Id, territory.Id, "ar");

        logger.LogInformation("Seeded demo territories, users (*@demo.local, admin password) and customers");
    }

    private async Task<User?> CreateUserAsync(string email, string fullName, string roleKey, Guid? managerId, Guid? territoryId, string language)
    {
        var password = options.Value.AdminPassword;
        if (string.IsNullOrWhiteSpace(password))
        {
            return null;
        }

        var user = new User
        {
            Email = email,
            UserName = email,
            EmailConfirmed = true,
            FullName = fullName,
            ManagerId = managerId,
            TerritoryId = territoryId,
            PreferredLanguage = language,
            CreatedAt = time.GetUtcNow(),
        };

        var result = await userManager.CreateAsync(user, password);
        if (!result.Succeeded)
        {
            logger.LogError("Could not create {Email}: {Errors}", email, string.Join("; ", result.Errors.Select(e => e.Description)));
            return null;
        }

        await userManager.AddToRoleAsync(user, roleKey);
        return user;
    }
}

public static class DatabaseInitializer
{
    /// <summary>Applies migrations (optional) and runs the seeder.</summary>
    public static async Task InitializeDatabaseAsync(this IServiceProvider services, bool applyMigrations, CancellationToken cancellationToken = default)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        if (applyMigrations)
        {
            await db.Database.MigrateAsync(cancellationToken);
        }

        await scope.ServiceProvider.GetRequiredService<DatabaseSeeder>().SeedAsync(cancellationToken);
    }
}
