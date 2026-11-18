using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;
using OriginalPharma.Application.Identity;
using OriginalPharma.Infrastructure.Identity;

namespace OriginalPharma.Tests.Identity;

/// <summary>Every delete, restore and other bulk action is guarded by the matching permission on the API.</summary>
public sealed class EndpointPermissionTests
{
    private static readonly (string Method, string Route, string Permission)[] Expected =
    [
        ("POST", "api/lookups/specialties/bulk-delete", Permissions.Lookups.Delete),
        ("POST", "api/lookups/specialties/bulk-restore", Permissions.Lookups.Restore),
        ("POST", "api/lookups/collection-methods/bulk-delete", Permissions.Lookups.Delete),
        ("POST", "api/lookups/collection-methods/bulk-restore", Permissions.Lookups.Restore),
        ("POST", "api/territories/bulk-delete", Permissions.Territories.Delete),
        ("POST", "api/territories/bulk-restore", Permissions.Territories.Restore),
        ("DELETE", "api/territories/{id:guid}", Permissions.Territories.Delete),
        ("POST", "api/product-lines/bulk-delete", Permissions.Products.Delete),
        ("POST", "api/products/bulk-delete", Permissions.Products.Delete),
        ("POST", "api/products/bulk-restore", Permissions.Products.Restore),
        ("POST", "api/products/move-to-line", Permissions.Products.Manage),
        ("POST", "api/customers/bulk-delete", Permissions.Customers.Delete),
        ("POST", "api/customers/bulk-restore", Permissions.Customers.Restore),
        ("POST", "api/doctors/my-list/bulk-remove", Permissions.Customers.Create),
        ("POST", "api/users/bulk-delete", Permissions.Users.Delete),
        ("POST", "api/users/bulk-restore", Permissions.Users.Restore),
        ("POST", "api/roles/bulk-delete", Permissions.Roles.Manage),
        ("POST", "api/orders/bulk-delete", Permissions.Orders.Delete),
        ("POST", "api/orders/bulk-restore", Permissions.Orders.Restore),
        ("POST", "api/orders/{id:guid}/deliver", Permissions.Orders.Deliver),
        ("POST", "api/visits/bulk-delete", Permissions.Visits.Delete),
        ("POST", "api/visits/bulk-restore", Permissions.Visits.Restore),
        ("PUT", "api/visits/{visitId:guid}/content", Permissions.Visits.Feedback),
        ("POST", "api/tracking/monitor/devices/bulk-delete", Permissions.Devices.Delete),
        ("GET", "api/stats/orders", Permissions.Stats.Read),
        ("GET", "api/stats/export", Permissions.Stats.Export),
        ("GET", "api/audit", Permissions.Audit.Read),
    ];

    [Fact]
    public void Bulk_and_destructive_actions_require_their_permission()
    {
        var routes = typeof(Program).Assembly.GetTypes()
            .Where(t => typeof(ControllerBase).IsAssignableFrom(t) && !t.IsAbstract)
            .SelectMany(controller => controller.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
                .SelectMany(action => action.GetCustomAttributes<HttpMethodAttribute>().Select(http => (controller, action, http))))
            .Select(x => (
                Route: Combine(x.controller.GetCustomAttribute<RouteAttribute>()?.Template, x.http.Template),
                Permissions: x.action.GetCustomAttributes<HasPermissionAttribute>()
                    .Concat(x.controller.GetCustomAttributes<HasPermissionAttribute>())
                    .Select(a => a.Permission).ToList(),
                x.http.HttpMethods))
            .ToList();

        foreach (var (method, route, permission) in Expected)
        {
            var matches = routes.Where(r => r.Route == route && r.HttpMethods.Contains(method)).ToList();
            Assert.True(matches.Count == 1, $"Expected one {method} {route}, found {matches.Count}");
            Assert.Contains(permission, matches[0].Permissions);
        }

        // Notifications are the caller's own: any signed-in user, filtered on the server.
        Assert.NotNull(typeof(Api.Modules.Notifications.NotificationsController).GetCustomAttribute<AuthorizeAttribute>());
    }

    private static string Combine(string? controller, string? action) =>
        action is null ? controller ?? string.Empty
        : action.StartsWith('/') ? action.TrimStart('/')
        : $"{controller}/{action}";
}
