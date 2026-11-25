using FluentValidation;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using OriginalPharma.Application.Catalog;
using OriginalPharma.Application.Common.Auditing;
using OriginalPharma.Application.Common.Images;
using OriginalPharma.Application.Common.Organization;
using OriginalPharma.Application.Common.Scoping;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Crm;
using OriginalPharma.Application.Expenses;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Lookups;
using OriginalPharma.Application.Notes;
using OriginalPharma.Application.Notifications;
using OriginalPharma.Application.Orders;
using OriginalPharma.Application.Plans;
using OriginalPharma.Application.Settings;
using OriginalPharma.Application.Stats;
using OriginalPharma.Application.Tracking;
using OriginalPharma.Application.Tracking.Anomalies;
using OriginalPharma.Application.Tracking.Integrity;
using OriginalPharma.Application.Tracking.Visibility;
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
        services.Configure<LocationTrustOptions>(configuration.GetSection(LocationTrustOptions.SectionName));
        services.Configure<VisitOptions>(configuration.GetSection(VisitOptions.SectionName));
        services.Configure<ImageOptions>(configuration.GetSection(ImageOptions.SectionName));
        services.Configure<StatsOptions>(configuration.GetSection(StatsOptions.SectionName));
        services.Configure<ExpenseOptions>(configuration.GetSection(ExpenseOptions.SectionName));
        services.Configure<PlanOptions>(configuration.GetSection(PlanOptions.SectionName));
        services.AddOptions<AuthSessionOptions>()
            .Bind(configuration.GetSection(AuthSessionOptions.SectionName))
            .Validate(o => o.SessionDays >= 1 && o.SessionMaxDays >= 1, "Auth__SessionDays and Auth__SessionMaxDays must be at least 1.");

        // Shared
        services.AddScoped<IOrgHierarchy, OrgHierarchy>();
        services.AddScoped<IDataScopeResolver, DataScopeResolver>();
        services.AddScoped<ImageService>();
        services.AddScoped<AuditTrail>();
        services.AddScoped<AuditLogService>();
        services.AddScoped<LocalCalendar>();
        services.AddScoped<NotificationService>();

        // Identity
        services.AddScoped<HierarchyGuard>();
        services.AddScoped<RoleService>();
        services.AddScoped<UserAdminService>();
        services.AddScoped<TerritoryService>();
        services.AddScoped<AccountService>();
        services.AddScoped<SessionService>();
        services.AddSingleton<ISessionRevocationList, SessionRevocationList>();

        // Expenses
        services.AddScoped<ExpenseService>();

        // Weekly plans
        services.AddScoped<PlanService>();

        // Private notes and their reminders
        services.AddScoped<NoteService>();
        services.AddScoped<NoteRemindersJob>();

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
        services.AddScoped<LocationTrustSettingsService>();
        services.AddScoped<IntegrityFlagService>();
        services.AddScoped<LocationIntegrityService>();
        services.AddScoped<DeviceSignalsRetentionJob>();
        services.AddScoped<VisitWindowService>();
        services.AddScoped<OutsideVisitPointsPurgeJob>();

        // Visits
        services.AddScoped<VisitService>();
        services.AddScoped<RepDayService>();

        // Statistics
        services.AddScoped<StatsService>();

        // Dashboard settings
        services.AddScoped<RepHomeSettingsService>();

        return services;
    }
}
