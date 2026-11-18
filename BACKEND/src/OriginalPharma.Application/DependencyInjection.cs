using FluentValidation;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using OriginalPharma.Application.Catalog;
using OriginalPharma.Application.Common.Auditing;
using OriginalPharma.Application.Common.Images;
using OriginalPharma.Application.Common.Organization;
using OriginalPharma.Application.Common.Scoping;
using OriginalPharma.Application.Crm;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Lookups;
using OriginalPharma.Application.Notifications;
using OriginalPharma.Application.Orders;
using OriginalPharma.Application.Stats;
using OriginalPharma.Application.Tracking;
using OriginalPharma.Application.Tracking.Anomalies;
using OriginalPharma.Application.Visits;

namespace OriginalPharma.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services, IConfiguration configuration)
    {
        services.TryAddSingleton(TimeProvider.System);
        services.AddMemoryCache();
        services.AddValidatorsFromAssembly(typeof(DependencyInjection).Assembly, includeInternalTypes: true);

        services.Configure<TrackingOptions>(configuration.GetSection(TrackingOptions.SectionName));
        services.Configure<AnomalyDetectionOptions>(configuration.GetSection(AnomalyDetectionOptions.SectionName));
        services.Configure<VisitOptions>(configuration.GetSection(VisitOptions.SectionName));
        services.Configure<ImageOptions>(configuration.GetSection(ImageOptions.SectionName));
        services.Configure<StatsOptions>(configuration.GetSection(StatsOptions.SectionName));

        // Shared
        services.AddScoped<IOrgHierarchy, OrgHierarchy>();
        services.AddScoped<IDataScopeResolver, DataScopeResolver>();
        services.AddScoped<ImageService>();
        services.AddScoped<AuditTrail>();
        services.AddScoped<AuditLogService>();
        services.AddScoped<NotificationService>();

        // Identity
        services.AddScoped<HierarchyGuard>();
        services.AddScoped<RoleService>();
        services.AddScoped<UserAdminService>();
        services.AddScoped<TerritoryService>();
        services.AddScoped<AccountService>();

        // CRM and lookups
        services.AddScoped<CustomerService>();
        services.AddScoped<DoctorService>();
        services.AddScoped<LookupService>();

        // Catalog and orders
        services.AddScoped<ProductAccess>();
        services.AddScoped<CatalogService>();
        services.AddScoped<OrderService>();

        // Tracking
        services.AddSingleton<TrackingAnomalyDetector>();
        services.AddScoped<TrackingIngestService>();
        services.AddScoped<TrackingConfigService>();
        services.AddScoped<LiveViewService>();
        services.AddScoped<ShiftService>();
        services.AddScoped<DeviceHealthService>();
        services.AddScoped<ConsentService>();
        services.AddScoped<TrackingQueryService>();
        services.AddScoped<TrackingLostMonitor>();

        // Visits
        services.AddScoped<VisitService>();

        // Statistics
        services.AddScoped<StatsService>();

        return services;
    }
}
