using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using OriginalPharma.Application.Common.Images;
using OriginalPharma.Application.Identity;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Infrastructure.Persistence;

public sealed class SeedOptions
{
    public const string SectionName = "Seed";

    public string? AdminEmail { get; set; }

    /// <summary>Set with user secrets. Without it no admin user is created.</summary>
    public string? AdminPassword { get; set; }

    public string AdminFullName { get; set; } = "System Admin";

    /// <summary>
    /// Development only: territory tree (regions, areas, towns), demo users, lookups, a product
    /// catalog with generated pictures, doctor lists and a few orders.
    /// </summary>
    public bool DemoData { get; set; }
}

/// <summary>
/// Idempotent seeding run on startup: permission catalog, default roles, the admin user and
/// (optionally) demo data. Nothing an admin edited is ever overwritten: roles only receive
/// template grants for permissions that are new to the catalog, and every demo step runs once
/// per database (<see cref="SeedHistoryEntry"/>), so deleted or renamed demo rows stay that way.
/// </summary>
internal sealed partial class DatabaseSeeder(
    AppDbContext db,
    UserManager<User> userManager,
    IPermissionService permissionService,
    ImageService images,
    IOptions<SeedOptions> options,
    TimeProvider time,
    ILogger<DatabaseSeeder> logger)
{
    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        await using (var transaction = await db.Database.BeginTransactionAsync(cancellationToken))
        {
            // One transaction: if the role step fails, the new permissions are not recorded as
            // added either, and the next start applies their default grants again.
            var added = await SyncPermissionsAsync(cancellationToken);
            var changedRoles = await EnsureRolesAsync(added, cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            var holders = await db.UserRoles.Where(ur => changedRoles.Contains(ur.RoleId)).Select(ur => ur.UserId).Distinct().ToListAsync(cancellationToken);
            await permissionService.BumpVersionAsync(holders, cancellationToken);
        }

        await EnsureAdminAsync(cancellationToken);

        if (options.Value.DemoData)
        {
            await SeedDemoDataAsync(cancellationToken);
        }
    }

    /// <summary>Adds missing permissions and refreshes descriptions. Returns the keys that were new.</summary>
    private async Task<HashSet<string>> SyncPermissionsAsync(CancellationToken cancellationToken)
    {
        var existing = await db.Permissions.ToDictionaryAsync(p => p.Key, cancellationToken);
        var added = new HashSet<string>(StringComparer.Ordinal);
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
            added.Add(definition.Key);
        }

        // TODO: decide how to retire permissions removed from the catalog (currently left in place).
        await db.SaveChangesAsync(cancellationToken);
        return added;
    }

    /// <summary>
    /// Creates seeded roles that are missing, matched by key. Existing roles keep every edit; they
    /// only receive their template's grants for permissions that were just added to the catalog
    /// (nobody can have edited those yet). Admin is kept locked: system role, top level, every
    /// permission with scope All. Returns the ids of roles whose grants changed.
    /// </summary>
    private async Task<HashSet<Guid>> EnsureRolesAsync(IReadOnlySet<string> addedPermissions, CancellationToken cancellationToken)
    {
        var permissionIds = await db.Permissions.ToDictionaryAsync(p => p.Key, p => p.Id, cancellationToken);
        var roles = await db.Roles.Include(r => r.Permissions).ToDictionaryAsync(r => r.NormalizedName!, cancellationToken);
        var changed = new HashSet<Guid>();

        foreach (var template in DefaultRoles.Templates)
        {
            var normalizedKey = Role.NormalizeKey(template.Key);
            if (roles.TryGetValue(normalizedKey, out var existing))
            {
                foreach (var (key, scope) in template.Grants.Where(g => addedPermissions.Contains(g.Key)))
                {
                    if (existing.Permissions.All(rp => rp.PermissionId != permissionIds[key]))
                    {
                        existing.Permissions.Add(new RolePermission { PermissionId = permissionIds[key], Scope = scope });
                        changed.Add(existing.Id);
                    }
                }

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

        // An ability that moved to its own key: every role (custom ones too) holding the old key gets
        // the new one with the same scope, once, when the key first appears.
        foreach (var definition in Permissions.All.Where(d => d.DerivedFrom is not null && addedPermissions.Contains(d.Key)))
        {
            var sourceId = permissionIds[definition.DerivedFrom!];
            var targetId = permissionIds[definition.Key];
            foreach (var role in roles.Values)
            {
                if (role.Permissions.FirstOrDefault(rp => rp.PermissionId == sourceId) is { } source &&
                    role.Permissions.All(rp => rp.PermissionId != targetId))
                {
                    role.Permissions.Add(new RolePermission { PermissionId = targetId, Scope = source.Scope });
                    changed.Add(role.Id);
                }
            }
        }

        var admin = roles[Role.NormalizeKey(DefaultRoles.Admin)];
        admin.IsSystem = true;
        admin.Level = Role.TopLevel;
        admin.MaxDiscountPercent = null;

        foreach (var (_, permissionId) in permissionIds)
        {
            var grant = admin.Permissions.FirstOrDefault(rp => rp.PermissionId == permissionId);
            if (grant is null)
            {
                admin.Permissions.Add(new RolePermission { PermissionId = permissionId, Scope = PermissionScope.All });
                changed.Add(admin.Id);
            }
            else if (grant.Scope != PermissionScope.All)
            {
                grant.Scope = PermissionScope.All;
                changed.Add(admin.Id);
            }
        }

        await db.SaveChangesAsync(cancellationToken);
        return changed;
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
