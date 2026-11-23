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
        ("PUT", "api/territories/{id:guid}", Permissions.Territories.Manage),
        ("PUT", "api/territories/{id:guid}/expense-default", Permissions.Expenses.Settings),
        ("GET", "api/territories/expense-defaults", Permissions.Expenses.Settings),
        ("POST", "api/product-lines/bulk-delete", Permissions.Products.Delete),
        ("POST", "api/products/bulk-delete", Permissions.Products.Delete),
        ("POST", "api/products/bulk-restore", Permissions.Products.Restore),
        ("POST", "api/products/move-to-line", Permissions.Products.Manage),
        ("POST", "api/products/{id:guid}/images", Permissions.Products.Manage),
        ("DELETE", "api/products/{id:guid}/images/{imageId:guid}", Permissions.Products.Manage),
        ("PUT", "api/products/{id:guid}/images/order", Permissions.Products.Manage),
        ("GET", "api/products/{id:guid}/images/{imageId:guid}", Permissions.Products.Read),
        ("GET", "api/rep-day/today", Permissions.Visits.Create),
        ("PUT", "api/rep-day/today/area", Permissions.Visits.Create),
        ("PUT", "api/rep-day/today/doctor-order", Permissions.Visits.Create),
        ("PUT", "api/rep-day/today/am-places", Permissions.Visits.Create),
        ("POST", "api/customers/bulk-delete", Permissions.Customers.Delete),
        ("POST", "api/customers/pharmacies", Permissions.Customers.CreatePharmacy),
        ("GET", "api/customers/pharmacy-towns", Permissions.Customers.CreatePharmacy),
        ("PUT", "api/customers/{id:guid}", Permissions.Customers.Manage),
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
        ("PUT", "api/settings/rep-home", Permissions.Settings.Manage),
        ("PUT", "api/settings/location-trust", Permissions.Settings.Manage),
        ("PUT", "api/plans/mine", Permissions.Plans.WriteOwn),
        ("POST", "api/plans/{id:guid}/submit", Permissions.Plans.WriteOwn),
        ("GET", "api/plans", Permissions.Plans.Read),
        ("GET", "api/plans/pending-count", Permissions.Plans.Review),
        ("POST", "api/plans/{id:guid}/approve", Permissions.Plans.Review),
        ("POST", "api/plans/{id:guid}/return", Permissions.Plans.Review),
        ("POST", "api/plans/{id:guid}/reopen", Permissions.Plans.Review),
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
