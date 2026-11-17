using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Application.Identity;

public sealed record PermissionDefinition(string Key, string Description)
{
    public string Resource => Key[..Key.IndexOf(':')];
    public string Action => Key[(Key.IndexOf(':') + 1)..];
}

/// <summary>
/// Base permission list. The seeder syncs this into the permissions table; roles
/// and their scopes are then managed from the dashboard.
/// Keep keys in sync with FRONTEND/src/lib/permissions.ts.
/// </summary>
public static class Permissions
{
    public static class Users
    {
        public const string Read = "users:read";
        public const string Manage = "users:manage";
    }

    public static class Roles
    {
        public const string Read = "roles:read";
        public const string Manage = "roles:manage";
    }

    public static class Territories
    {
        public const string Read = "territories:read";
        public const string Manage = "territories:manage";
    }

    public static class Customers
    {
        public const string Read = "customers:read";
        public const string Manage = "customers:manage";
    }

    public static class Visits
    {
        public const string Read = "visits:read";
        public const string Create = "visits:create";
        public const string Manage = "visits:manage";
    }

    public static class Tracking
    {
        /// <summary>Send own location, start/end shift, report device health.</summary>
        public const string Report = "tracking:report";

        /// <summary>See live positions/presence and open live view.</summary>
        public const string ViewLive = "tracking:view-live";

        public const string History = "tracking:history";
        public const string ReviewFlags = "tracking:review-flags";
    }

    public static class Devices
    {
        public const string Read = "devices:read";
    }

    public static class Reports
    {
        public const string Read = "reports:read";
    }

    public static IReadOnlyList<PermissionDefinition> All { get; } =
    [
        new(Users.Read, "View users"),
        new(Users.Manage, "Create and edit users, assign roles"),
        new(Roles.Read, "View roles and permissions"),
        new(Roles.Manage, "Create, rename and delete roles and change their permissions"),
        new(Territories.Read, "View territories"),
        new(Territories.Manage, "Edit territories"),
        new(Customers.Read, "View doctors and pharmacies"),
        new(Customers.Manage, "Edit doctors and pharmacies"),
        new(Visits.Read, "View visits"),
        new(Visits.Create, "Check in / check out of visits"),
        new(Visits.Manage, "Edit or cancel visits"),
        new(Tracking.Report, "Send own location and device health"),
        new(Tracking.ViewLive, "See live locations and request live view"),
        new(Tracking.History, "View location history"),
        new(Tracking.ReviewFlags, "Review tracking flags"),
        new(Devices.Read, "View device tracking health"),
        new(Reports.Read, "View reports"),
    ];

    public static bool IsKnown(string key) => All.Any(p => p.Key == key);
}

/// <summary>
/// Roles created on first run, by key. After that they are renamed and edited from the
/// dashboard; the seeder only adds roles that are missing and never overwrites edits.
/// </summary>
public static class DefaultRoles
{
    public const string Admin = "Admin";
    public const string SalesManager = "SalesManager";
    public const string AreaManager = "AreaManager";
    public const string Supervisor = "Supervisor";
    public const string Rep = "Rep";

    public sealed record RoleTemplate(
        string Key,
        string NameAr,
        string NameEn,
        string Description,
        int Level,
        IReadOnlyList<(string Key, PermissionScope Scope)> Grants);

    public static IReadOnlyList<RoleTemplate> Templates { get; } =
    [
        // Admin always receives every permission with scope All (enforced on startup).
        new(Admin, "مدير النظام", "System admin", "Full access", Role.TopLevel, []),
        new(SalesManager, "مدير المبيعات", "Sales manager", "Sales manager", 10, Grants(PermissionScope.All,
            Permissions.Users.Read, Permissions.Roles.Read, Permissions.Territories.Read,
            Permissions.Customers.Read, Permissions.Customers.Manage, Permissions.Visits.Read,
            Permissions.Tracking.ViewLive, Permissions.Tracking.History, Permissions.Tracking.ReviewFlags,
            Permissions.Devices.Read, Permissions.Reports.Read)),
        new(AreaManager, "مدير المنطقة", "Area manager", "Area manager", 20, Grants(PermissionScope.Territory,
            Permissions.Users.Read, Permissions.Territories.Read, Permissions.Customers.Read,
            Permissions.Customers.Manage, Permissions.Visits.Read, Permissions.Tracking.ViewLive,
            Permissions.Tracking.History, Permissions.Tracking.ReviewFlags, Permissions.Devices.Read,
            Permissions.Reports.Read)),
        new(Supervisor, "مشرف", "Supervisor", "Supervisor", 30,
        [
            .. Grants(PermissionScope.Team,
                Permissions.Users.Read, Permissions.Visits.Read, Permissions.Tracking.ViewLive,
                Permissions.Tracking.History, Permissions.Tracking.ReviewFlags, Permissions.Devices.Read,
                Permissions.Reports.Read),
            .. Grants(PermissionScope.Territory, Permissions.Territories.Read, Permissions.Customers.Read),
        ]),
        new(Rep, "مندوب طبي", "Medical rep", "Medical rep", 40,
        [
            .. Grants(PermissionScope.Own,
                Permissions.Visits.Read, Permissions.Visits.Create, Permissions.Tracking.Report,
                Permissions.Tracking.History, Permissions.Reports.Read),
            .. Grants(PermissionScope.Territory, Permissions.Customers.Read),
        ]),
    ];

    /// <summary>
    /// Admin is locked: it always holds every permission with scope All (which includes
    /// roles:manage and users:manage) and stays at the top level.
    /// </summary>
    public static bool HasLockedPermissions(string roleKey) => string.Equals(roleKey, Admin, StringComparison.OrdinalIgnoreCase);

    private static (string Key, PermissionScope Scope)[] Grants(PermissionScope scope, params string[] keys) =>
        keys.Select(k => (k, scope)).ToArray();
}
