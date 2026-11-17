using FluentValidation;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using OriginalPharma.Application.Common.Organization;
using OriginalPharma.Application.Common.Scoping;
using OriginalPharma.Application.Crm;
using OriginalPharma.Application.Identity;
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

        // Shared
        services.AddScoped<IOrgHierarchy, OrgHierarchy>();
        services.AddScoped<IDataScopeResolver, DataScopeResolver>();

        // Identity
        services.AddScoped<HierarchyGuard>();
        services.AddScoped<RoleService>();
        services.AddScoped<UserAdminService>();
        services.AddScoped<TerritoryService>();

        // CRM
        services.AddScoped<CustomerService>();

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

        return services;
    }
}
