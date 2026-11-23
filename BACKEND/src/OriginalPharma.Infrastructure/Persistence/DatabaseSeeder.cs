using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Npgsql;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Images;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Tracking;
using OriginalPharma.Domain.Crm;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Domain.Orders;

namespace OriginalPharma.Infrastructure.Persistence;

public sealed class SeedOptions
{
    public const string SectionName = "Seed";

    public const int MinAdminPasswordLength = 12;

    public static readonly string AdminPasswordRule =
        $"Seed__AdminPassword must be at least {MinAdminPasswordLength} characters with upper case, lower case and a digit, and not a placeholder.";

    public string? AdminEmail { get; set; }

    /// <summary>
    /// Development: user secrets. Live deployments: the initial password of the first admin, who must
    /// replace it at first sign-in. It is only read while no admin exists, or for
    /// <see cref="ResetAdminPassword"/>.
    /// </summary>
    public string? AdminPassword { get; set; }

    /// <summary>
    /// "true": every start sets <see cref="AdminPassword"/> as a temporary password on the user with
    /// <see cref="AdminEmail"/>, clears its lockout and ends its sessions. For recovering a locked-out
    /// admin; remove it right after. Any other value (or none) leaves seeding unchanged. A string, so a
    /// mistyped value is ignored instead of failing the start.
    /// </summary>
    public string? ResetAdminPassword { get; set; }

    public string AdminFullName { get; set; } = "System Admin";

    /// <summary>
    /// Development only: territory tree (regions, areas, towns), demo users, a product catalog with
    /// drawn pictures, doctor lists and a few orders. Ignored outside Development and tests.
    /// </summary>
    public bool DemoData { get; set; }

    public static bool IsResetRequested(string? value) => bool.TryParse(value, out var reset) && reset;

    /// <summary>What a live deployment accepts as <see cref="AdminPassword"/>: <see cref="AdminPasswordRule"/>.</summary>
    public static bool IsStrongAdminPassword(string password) =>
        password.Length >= MinAdminPasswordLength && !DeploymentEnvironment.IsPlaceholder(password) &&
        password.Any(char.IsUpper) && password.Any(char.IsLower) && password.Any(char.IsDigit);
}

/// <summary>
/// Idempotent seeding run on startup: permission catalog, default roles, lookups, the admin user and
/// (Development only) demo data. Nothing an admin edited is ever overwritten: roles only receive
/// template grants for permissions that are new to the catalog, and every demo step runs once
/// per database (<see cref="SeedHistoryEntry"/>), so deleted or renamed demo rows stay that way.
/// </summary>
internal sealed partial class DatabaseSeeder(
    AppDbContext db,
    UserManager<User> userManager,
    IPermissionService permissionService,
    ImageService images,
    IFileStorage files,
    IOptions<SeedOptions> options,
    IOptions<TrackingOptions> trackingOptions,
    TimeProvider time,
    IHostEnvironment environment,
    ILogger<DatabaseSeeder> logger)
{
    /// <summary>The key lookups were recorded under while they were part of the demo seed.</summary>
    private const string LegacyLookupsStep = "demo-lookups-v1";

    /// <summary>The step that gave the existing manager roles customers:create (adding doctors).</summary>
    internal const string DoctorCreateForManagersStep = "doctor-create-for-managers-v1";

    private static readonly JsonSerializerOptions AuditJson = new(JsonSerializerDefaults.Web);

    private static readonly (string En, string Ar)[] SpecialtySeeds =
    [
        ("Cardiology", "أمراض القلب"),
        ("Pediatrics", "طب الأطفال"),
        ("Internal medicine", "الباطنة"),
        ("Dermatology", "الجلدية"),
        ("Orthopedics", "العظام"),
        ("Obstetrics and gynecology", "النساء والتوليد"),
        ("ENT", "الأنف والأذن والحنجرة"),
        ("Ophthalmology", "الرمد"),
    ];

    private static readonly (string En, string Ar)[] CollectionMethodSeeds =
    [
        ("Cash", "نقدي"),
        ("Bank transfer", "تحويل بنكي"),
        ("Cheque", "شيك"),
        ("Post-dated cheque", "شيك آجل"),
        ("On account (credit)", "على الحساب (آجل)"),
    ];

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

        await RunOnceAsync(DoctorCreateForManagersStep, GrantDoctorCreateToManagersAsync, cancellationToken);

        if (!await db.SeedHistory.AnyAsync(e => e.Key == LegacyLookupsStep, cancellationToken))
        {
            await RunOnceAsync("lookups-v1", SeedLookupsAsync, cancellationToken);
        }

        await EnsureAdminAsync(cancellationToken);

        if (options.Value.DemoData && environment.IsLocal())
        {
            await SeedDemoDataAsync(cancellationToken);
        }
    }

    private async Task RunOnceAsync(string key, Func<CancellationToken, Task> step, CancellationToken cancellationToken)
    {
        if (await db.SeedHistory.AnyAsync(e => e.Key == key, cancellationToken))
        {
            return;
        }

        await step(cancellationToken);
        db.SeedHistory.Add(new SeedHistoryEntry { Key = key, AppliedAt = time.GetUtcNow() });
        await db.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Applied seed step {Step}", key);
    }

    /// <summary>
    /// Adding doctors used to be for reps only. In databases from before that, the existing Supervisor,
    /// AreaManager and SalesManager roles receive customers:create once, with their template's scope;
    /// a role an admin takes it away from later keeps it removed (the step does not run again).
    /// </summary>
    private async Task GrantDoctorCreateToManagersAsync(CancellationToken cancellationToken)
    {
        var permissionId = await db.Permissions.Where(p => p.Key == Permissions.Customers.Create).Select(p => p.Id).SingleAsync(cancellationToken);
        var changed = new List<Guid>();
        foreach (var template in DefaultRoles.Templates.Where(t => t.Key is DefaultRoles.Supervisor or DefaultRoles.AreaManager or DefaultRoles.SalesManager))
        {
            var normalizedKey = Role.NormalizeKey(template.Key);
            var role = await db.Roles.Include(r => r.Permissions).SingleOrDefaultAsync(r => r.NormalizedName == normalizedKey, cancellationToken);
            if (role is null || role.Permissions.Any(rp => rp.PermissionId == permissionId))
            {
                continue;
            }

            var scope = template.Grants.First(g => g.Key == Permissions.Customers.Create).Scope;
            role.Permissions.Add(new RolePermission { PermissionId = permissionId, Scope = scope });
            changed.Add(role.Id);
        }

        await db.SaveChangesAsync(cancellationToken);
        var holders = await db.UserRoles.Where(ur => changed.Contains(ur.RoleId)).Select(ur => ur.UserId).Distinct().ToListAsync(cancellationToken);
        await permissionService.BumpVersionAsync(holders, cancellationToken);
    }

    /// <summary>Doctor specialties and collection methods the forms need from day one.</summary>
    private async Task SeedLookupsAsync(CancellationToken cancellationToken)
    {
        var specialties = (await db.Specialties.Select(s => s.NameEn.ToLower()).ToListAsync(cancellationToken)).ToHashSet();
        var order = 0;
        foreach (var (en, ar) in SpecialtySeeds)
        {
            order += 10;
            if (!specialties.Contains(en.ToLowerInvariant()))
            {
                db.Specialties.Add(new Specialty { NameEn = en, NameAr = ar, SortOrder = order });
            }
        }

        var methods = (await db.CollectionMethods.Select(m => m.NameEn.ToLower()).ToListAsync(cancellationToken)).ToHashSet();
        order = 0;
        foreach (var (en, ar) in CollectionMethodSeeds)
        {
            order += 10;
            if (!methods.Contains(en.ToLowerInvariant()))
            {
                db.CollectionMethods.Add(new CollectionMethod { NameEn = en, NameAr = ar, SortOrder = order });
            }
        }

        await db.SaveChangesAsync(cancellationToken);
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

    /// <summary>
    /// Development creates the configured admin whenever it is missing. A live deployment only creates
    /// the first admin, with a password that must be changed, and refuses to start without one.
    /// <see cref="SeedOptions.ResetAdminPassword"/> resets the configured user first; when no user has
    /// that email, the rules above apply unchanged.
    /// </summary>
    private async Task EnsureAdminAsync(CancellationToken cancellationToken)
    {
        var settings = options.Value;
        var reset = SeedOptions.IsResetRequested(settings.ResetAdminPassword);
        if (reset && await ResetAdminPasswordAsync(settings, cancellationToken))
        {
            return;
        }

        var live = !environment.IsLocal();
        if (live && await AnyAdminExistsAsync(cancellationToken))
        {
            if (reset)
            {
                logger.LogWarning("Seed__ResetAdminPassword is set but no user has the Seed__AdminEmail address; nothing was reset and no second admin was created");
            }

            return;
        }

        if (string.IsNullOrWhiteSpace(settings.AdminEmail) || string.IsNullOrWhiteSpace(settings.AdminPassword))
        {
            if (live)
            {
                throw new InvalidOperationException(
                    "No administrator exists yet. Set Seed__AdminEmail and Seed__AdminPassword for the first start.");
            }

            logger.LogWarning("Seed:AdminEmail / Seed:AdminPassword not set; skipping admin user creation");
            return;
        }

        if (await userManager.FindByEmailAsync(settings.AdminEmail) is not null)
        {
            return;
        }

        var admin = await CreateUserAsync(settings.AdminEmail, settings.AdminFullName, DefaultRoles.Admin, null, null, "en", mustChangePassword: live);
        if (admin is null && live)
        {
            throw new InvalidOperationException(
                "The first administrator could not be created. Check Seed__AdminEmail and that Seed__AdminPassword meets the password policy.");
        }

        logger.LogInformation("Created admin user {Email}", settings.AdminEmail);
    }

    /// <summary>
    /// The configured password becomes a temporary one on the user with the configured email: lockout
    /// and failed sign-in count cleared, every session revoked, access tokens already issued restricted
    /// to changing the password. Returns false when no user has that email.
    /// </summary>
    private async Task<bool> ResetAdminPasswordAsync(SeedOptions settings, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(settings.AdminEmail) || string.IsNullOrWhiteSpace(settings.AdminPassword))
        {
            throw new InvalidOperationException("Seed__ResetAdminPassword=true needs Seed__AdminEmail and Seed__AdminPassword.");
        }

        if (!SeedOptions.IsStrongAdminPassword(settings.AdminPassword))
        {
            throw new InvalidOperationException(SeedOptions.AdminPasswordRule);
        }

        var user = await userManager.FindByEmailAsync(settings.AdminEmail);
        if (user is null)
        {
            return false;
        }

        foreach (var validator in userManager.PasswordValidators)
        {
            var check = await validator.ValidateAsync(userManager, user, settings.AdminPassword);
            if (!check.Succeeded)
            {
                throw new InvalidOperationException(
                    "Seed__AdminPassword breaks the password policy: " + string.Join(" ", check.Errors.Select(e => e.Description)));
            }
        }

        var now = time.GetUtcNow();
        int revokedSessions;
        await using (var transaction = await db.Database.BeginTransactionAsync(cancellationToken))
        {
            user.PasswordHash = userManager.PasswordHasher.HashPassword(user, settings.AdminPassword);
            user.MustChangePassword = true;
            user.LockoutEnd = null;
            user.AccessFailedCount = 0;
            var saved = await userManager.UpdateSecurityStampAsync(user); // also saves the changes above
            if (!saved.Succeeded)
            {
                throw new InvalidOperationException(
                    $"Could not reset the password of {settings.AdminEmail}: " + string.Join(" ", saved.Errors.Select(e => e.Description)));
            }

            var sessions = db.RefreshTokens.Where(t => t.UserId == user.Id && t.RevokedAt == null);
            var families = await sessions.Select(t => t.FamilyId).Distinct().ToListAsync(cancellationToken);
            var devices = await db.UserSessions.Where(s => s.UserId == user.Id && s.RevokedAt == null).Select(s => s.Id).ToListAsync(cancellationToken);
            revokedSessions = families.Union(devices).Count();
            await sessions.ExecuteUpdateAsync(s => s
                .SetProperty(t => t.RevokedAt, now)
                .SetProperty(t => t.RevokedReason, SessionRevokeReasons.PasswordReset), cancellationToken);
            await db.UserSessions.Where(s => s.UserId == user.Id && s.RevokedAt == null).ExecuteUpdateAsync(s => s
                .SetProperty(x => x.RevokedAt, now)
                .SetProperty(x => x.RevokedReason, SessionRevokeReasons.PasswordReset), cancellationToken);

            db.UserAuditEntries.Add(new UserAuditEntry
            {
                UserId = user.Id,
                Action = UserAuditAction.PasswordReset,
                Details = JsonSerializer.Serialize(new { source = "Seed__ResetAdminPassword", revokedSessions }, AuditJson),
                CreatedAt = now,
            });
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }

        await permissionService.BumpVersionAsync([user.Id], cancellationToken);
        logger.LogWarning(
            "Admin password for {Email} was reset from Seed__ResetAdminPassword ({Sessions} sessions signed out); remove Seed__ResetAdminPassword now",
            settings.AdminEmail, revokedSessions);
        return true;
    }

    private Task<bool> AnyAdminExistsAsync(CancellationToken cancellationToken)
    {
        var adminRole = Role.NormalizeKey(DefaultRoles.Admin);
        return db.UserRoles.AnyAsync(ur => db.Roles.Any(r => r.Id == ur.RoleId && r.NormalizedName == adminRole), cancellationToken);
    }

    private async Task<User?> CreateUserAsync(
        string email, string fullName, string roleKey, Guid? managerId, Guid? territoryId, string language, bool mustChangePassword = false)
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
            MustChangePassword = mustChangePassword,
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
    /// <summary>Arbitrary but fixed: the PostgreSQL advisory lock every API instance takes before touching the schema.</summary>
    private const long StartupLockKey = 7_203_114_560_218_001;

    private static readonly TimeSpan LockTimeout = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan LockRetryDelay = TimeSpan.FromSeconds(2);

    /// <summary>
    /// Applies migrations (optional) and runs the seeder, one instance at a time: an instance that
    /// starts while another is migrating waits here and then finds nothing left to do.
    /// </summary>
    public static async Task InitializeDatabaseAsync(this IServiceProvider services, bool applyMigrations, CancellationToken cancellationToken = default)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger(typeof(DatabaseInitializer));

        // Its own unpooled connection: the lock belongs to the session and ends with it, even after a crash.
        // CloneWith keeps the password, which the connection's own ConnectionString no longer shows.
        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        var unpooled = new NpgsqlConnectionStringBuilder(connection.ConnectionString) { Pooling = false }.ConnectionString;
        await using var lockConnection = connection.CloneWith(unpooled);
        await lockConnection.OpenAsync(cancellationToken);
        await AcquireStartupLockAsync(lockConnection, logger, cancellationToken);

        if (applyMigrations)
        {
            await db.Database.MigrateAsync(cancellationToken);
        }

        await scope.ServiceProvider.GetRequiredService<DatabaseSeeder>().SeedAsync(cancellationToken);
    }

    private static async Task AcquireStartupLockAsync(NpgsqlConnection connection, ILogger logger, CancellationToken cancellationToken)
    {
        await using var command = new NpgsqlCommand("SELECT pg_try_advisory_lock(@key)", connection);
        command.Parameters.AddWithValue("key", StartupLockKey);

        var waitingSince = DateTimeOffset.UtcNow;
        while (await command.ExecuteScalarAsync(cancellationToken) is not true)
        {
            if (DateTimeOffset.UtcNow - waitingSince > LockTimeout)
            {
                throw new TimeoutException($"Another instance held the database startup lock for more than {LockTimeout.TotalMinutes:0} minutes.");
            }

            logger.LogInformation("Another instance is initialising the database; waiting");
            await Task.Delay(LockRetryDelay, cancellationToken);
        }
    }
}
