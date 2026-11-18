using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Application.Identity;

/// <param name="DerivedFrom">
/// When the permission first appears in the catalog, every role (custom ones too) holding this
/// existing permission receives the new one with the same scope. Used when an ability that came
/// with the old permission moves to its own key, so nobody loses it.
/// </param>
public sealed record PermissionDefinition(string Key, string Description, string? DerivedFrom = null)
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

        /// <summary>Create accounts. The scope decides where the new user may be placed.</summary>
        public const string Create = "users:create";

        /// <summary>Set a temporary password for someone below you in the hierarchy.</summary>
        public const string ResetPassword = "users:reset-password";

        /// <summary>Delete users below you (archived when they have activity). Never yourself or the last admin.</summary>
        public const string Delete = "users:delete";

        /// <summary>Bring archived users back (they stay deactivated until edited).</summary>
        public const string Restore = "users:restore";
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

        /// <summary>Delete areas and towns (archived while doctors, orders or visits use them).</summary>
        public const string Delete = "territories:delete";

        public const string Restore = "territories:restore";
    }

    public static class Customers
    {
        /// <summary>See doctor lists (own list, team, territory or all) and customers.</summary>
        public const string Read = "customers:read";

        /// <summary>Edit doctor and pharmacy details.</summary>
        public const string Manage = "customers:manage";

        /// <summary>Add doctors to your own list (pick an existing doctor or create one) and remove them.</summary>
        public const string Create = "customers:create";

        /// <summary>Move or copy doctors between reps' lists.</summary>
        public const string Assign = "customers:assign";

        /// <summary>Delete doctors and pharmacies (archived when visits or orders point at them).</summary>
        public const string Delete = "customers:delete";

        public const string Restore = "customers:restore";
    }

    public static class Lookups
    {
        /// <summary>Specialties and collection methods.</summary>
        public const string Manage = "lookups:manage";

        /// <summary>Delete specialties and collection methods (archived while in use).</summary>
        public const string Delete = "lookups:delete";

        public const string Restore = "lookups:restore";
    }

    public static class Products
    {
        public const string Read = "products:read";

        /// <summary>Product lines, products, prices, stock, discounts, moving products between lines.</summary>
        public const string Manage = "products:manage";

        /// <summary>Delete product lines (their products stay, unassigned) and products (archived when used).</summary>
        public const string Delete = "products:delete";

        public const string Restore = "products:restore";
    }

    public static class Orders
    {
        /// <summary>Take orders for yourself; edit or cancel your own while they are submitted.</summary>
        public const string Create = "orders:create";

        public const string Read = "orders:read";

        /// <summary>Approve, reject, cancel and edit other people's orders (within scope).</summary>
        public const string Manage = "orders:manage";

        /// <summary>Mark approved orders as delivered (within scope).</summary>
        public const string Deliver = "orders:deliver";

        /// <summary>Delete orders (always archived: hidden from lists, kept for audit).</summary>
        public const string Delete = "orders:delete";

        public const string Restore = "orders:restore";
    }

    public static class Visits
    {
        public const string Read = "visits:read";
        public const string Create = "visits:create";
        public const string Manage = "visits:manage";

        /// <summary>Write feedback and the products discussed on your own visits.</summary>
        public const string Feedback = "visits:feedback";

        /// <summary>Delete visits (always archived: hidden from lists, kept for audit).</summary>
        public const string Delete = "visits:delete";

        public const string Restore = "visits:restore";
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

        /// <summary>Remove a device record (an old or replaced phone) with its health history.</summary>
        public const string Delete = "devices:delete";
    }

    public static class Reports
    {
        public const string Read = "reports:read";
    }

    public static class Stats
    {
        /// <summary>Statistics, aggregated on the server within the scope (own, team, territory, all).</summary>
        public const string Read = "stats:read";

        /// <summary>Download statistics tables as CSV.</summary>
        public const string Export = "stats:export";
    }

    public static class Audit
    {
        /// <summary>Activity log: edits, deletes, archives and restores.</summary>
        public const string Read = "audit:read";
    }

    public static IReadOnlyList<PermissionDefinition> All { get; } =
    [
        new(Users.Read, "View users"),
        new(Users.Manage, "Edit users, assign roles and product lines"),
        new(Users.Create, "Create user accounts"),
        new(Users.ResetPassword, "Reset other users' passwords"),
        new(Users.Delete, "Delete users (archived when they have activity)"),
        new(Users.Restore, "Restore archived users"),
        new(Roles.Read, "View roles and permissions"),
        new(Roles.Manage, "Create, rename and delete roles and change their permissions"),
        new(Territories.Read, "View territories"),
        new(Territories.Manage, "Manage areas and towns"),
        new(Territories.Delete, "Delete areas and towns (archived when in use)", DerivedFrom: Territories.Manage),
        new(Territories.Restore, "Restore archived areas and towns"),
        new(Customers.Read, "View doctors and pharmacies"),
        new(Customers.Manage, "Edit doctors and pharmacies"),
        new(Customers.Create, "Add doctors to own list"),
        new(Customers.Assign, "Move or copy doctors between reps"),
        new(Customers.Delete, "Delete doctors and pharmacies (archived when used)"),
        new(Customers.Restore, "Restore archived doctors and pharmacies"),
        new(Lookups.Manage, "Manage specialties and collection methods"),
        new(Lookups.Delete, "Delete specialties and collection methods (archived when in use)"),
        new(Lookups.Restore, "Restore archived specialties and collection methods"),
        new(Products.Read, "View product lines and products"),
        new(Products.Manage, "Manage product lines, products, prices, stock and discounts"),
        new(Products.Delete, "Delete product lines and products"),
        new(Products.Restore, "Restore archived products"),
        new(Orders.Create, "Take orders"),
        new(Orders.Read, "View orders"),
        new(Orders.Manage, "Approve, reject, cancel and edit orders"),
        new(Orders.Deliver, "Mark approved orders as delivered", DerivedFrom: Orders.Manage),
        new(Orders.Delete, "Delete orders (archived)"),
        new(Orders.Restore, "Restore archived orders"),
        new(Visits.Read, "View visits"),
        new(Visits.Create, "Check in / check out of visits"),
        new(Visits.Manage, "Edit or cancel visits"),
        new(Visits.Feedback, "Write visit feedback and products discussed"),
        new(Visits.Delete, "Delete visits (archived)"),
        new(Visits.Restore, "Restore archived visits"),
        new(Tracking.Report, "Send own location and device health"),
        new(Tracking.ViewLive, "See live locations and request live view"),
        new(Tracking.History, "View location history"),
        new(Tracking.ReviewFlags, "Review tracking flags"),
        new(Devices.Read, "View device tracking health"),
        new(Devices.Delete, "Remove device records"),
        new(Reports.Read, "View reports"),
        new(Stats.Read, "View statistics"),
        new(Stats.Export, "Export statistics as CSV"),
        new(Audit.Read, "View the activity log"),
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

    /// <summary>
    /// Default grants per role. They apply when a role is created, and when a permission first
    /// appears in the catalog (existing roles then receive the template's grant for it once).
    /// Grants admins already edited are never touched.
    /// </summary>
    public static IReadOnlyList<RoleTemplate> Templates { get; } =
    [
        // Admin always receives every permission with scope All (enforced on startup).
        new(Admin, "مدير النظام", "System admin", "Full access", Role.TopLevel, []),
        new(SalesManager, "مدير المبيعات", "Sales manager", "Sales manager", 10, Grants(PermissionScope.All,
            Permissions.Users.Read, Permissions.Users.ResetPassword, Permissions.Roles.Read, Permissions.Territories.Read,
            Permissions.Customers.Read, Permissions.Customers.Manage, Permissions.Customers.Assign, Permissions.Visits.Read,
            Permissions.Tracking.ViewLive, Permissions.Tracking.History, Permissions.Tracking.ReviewFlags,
            Permissions.Devices.Read, Permissions.Reports.Read, Permissions.Lookups.Manage,
            Permissions.Products.Read, Permissions.Products.Manage, Permissions.Orders.Read, Permissions.Orders.Manage,
            Permissions.Orders.Deliver, Permissions.Orders.Delete, Permissions.Orders.Restore,
            Permissions.Customers.Delete, Permissions.Customers.Restore, Permissions.Lookups.Delete, Permissions.Lookups.Restore,
            Permissions.Products.Delete, Permissions.Products.Restore, Permissions.Stats.Read, Permissions.Stats.Export,
            Permissions.Audit.Read)),
        new(AreaManager, "مدير المنطقة", "Area manager", "Area manager", 20,
        [
            .. Grants(PermissionScope.Territory,
                Permissions.Users.Read, Permissions.Users.ResetPassword, Permissions.Territories.Read, Permissions.Customers.Read,
                Permissions.Customers.Manage, Permissions.Customers.Assign, Permissions.Visits.Read, Permissions.Tracking.ViewLive,
                Permissions.Tracking.History, Permissions.Tracking.ReviewFlags, Permissions.Devices.Read,
                Permissions.Reports.Read, Permissions.Orders.Read, Permissions.Orders.Manage, Permissions.Orders.Deliver,
                Permissions.Orders.Delete, Permissions.Orders.Restore, Permissions.Customers.Delete, Permissions.Customers.Restore,
                Permissions.Stats.Read, Permissions.Stats.Export),
            .. Grants(PermissionScope.All, Permissions.Products.Read),
        ]),
        new(Supervisor, "مشرف", "Supervisor", "Supervisor", 30,
        [
            .. Grants(PermissionScope.Team,
                Permissions.Users.Read, Permissions.Users.ResetPassword, Permissions.Visits.Read, Permissions.Tracking.ViewLive,
                Permissions.Tracking.History, Permissions.Tracking.ReviewFlags, Permissions.Devices.Read,
                Permissions.Reports.Read, Permissions.Customers.Read, Permissions.Customers.Assign,
                Permissions.Orders.Read, Permissions.Orders.Manage, Permissions.Orders.Deliver,
                Permissions.Stats.Read, Permissions.Stats.Export),
            .. Grants(PermissionScope.Territory, Permissions.Territories.Read),
            .. Grants(PermissionScope.All, Permissions.Products.Read),
        ]),
        new(Rep, "مندوب طبي", "Medical rep", "Medical rep", 40,
        [
            .. Grants(PermissionScope.Own,
                Permissions.Visits.Read, Permissions.Visits.Create, Permissions.Tracking.Report,
                Permissions.Tracking.History, Permissions.Reports.Read, Permissions.Customers.Read,
                Permissions.Customers.Create, Permissions.Orders.Create, Permissions.Orders.Read,
                Permissions.Visits.Feedback, Permissions.Stats.Read),
            .. Grants(PermissionScope.All, Permissions.Products.Read),
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
