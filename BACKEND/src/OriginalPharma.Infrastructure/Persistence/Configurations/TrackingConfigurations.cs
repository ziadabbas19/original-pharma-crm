using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OriginalPharma.Domain.Common;
using OriginalPharma.Domain.Tracking;

namespace OriginalPharma.Infrastructure.Persistence.Configurations;

internal static class GeoColumn
{
    /// <summary>geography so distances are in metres.</summary>
    public const string Point = "geography (point, 4326)";
}

internal sealed class ShiftConfiguration : IEntityTypeConfiguration<Shift>
{
    public void Configure(EntityTypeBuilder<Shift> builder)
    {
        builder.ToTable("shifts");
        builder.Property(s => s.DeviceId).HasMaxLength(128).IsRequired();
        builder.Property(s => s.StartLocation).HasColumnType(GeoColumn.Point);
        builder.Property(s => s.EndLocation).HasColumnType(GeoColumn.Point);
        builder.Property(s => s.IntegrityVerdict).HasMaxLength(256);
        builder.HasIndex(s => new { s.UserId, s.Status });
        builder.HasIndex(s => new { s.Status, s.LastPointAt });
        builder.HasIndex(s => new { s.UserId, s.StartedAt });
    }
}

internal sealed class LocationPointConfiguration : IEntityTypeConfiguration<LocationPoint>
{
    public void Configure(EntityTypeBuilder<LocationPoint> builder)
    {
        builder.ToTable("location_points");
        builder.Property(p => p.Id).UseIdentityAlwaysColumn();
        builder.Property(p => p.DeviceId).HasMaxLength(128).IsRequired();
        builder.Property(p => p.Location).HasColumnType(GeoColumn.Point).IsRequired();
        builder.Property(p => p.TrustStatus).HasDefaultValue(LocationTrustStatus.Trusted).HasSentinel(0);
        builder.Property(p => p.TrustReason).HasMaxLength(64);
        builder.Property(p => p.ActivityType).HasMaxLength(32);
        builder.Property(p => p.DeviceSignals).HasColumnType("jsonb");
        builder.HasIndex(p => new { p.UserId, p.RecordedAt }).IsUnique();
        builder.HasIndex(p => p.ShiftId);
        builder.HasIndex(p => p.Location).HasMethod("gist");

        // Review page and retention job: only the few non-trusted points, and points that still hold signals.
        builder.HasIndex(p => new { p.UserId, p.RecordedAt }, "UntrustedPoints")
            .HasDatabaseName("ix_location_points_untrusted")
            .HasFilter("trust_status <> 1");
        builder.HasIndex(p => p.RecordedAt, "PointsWithDeviceSignals")
            .HasDatabaseName("ix_location_points_device_signals")
            .HasFilter("device_signals IS NOT NULL");
    }
}

internal sealed class TrackingFlagConfiguration : IEntityTypeConfiguration<TrackingFlag>
{
    public void Configure(EntityTypeBuilder<TrackingFlag> builder)
    {
        builder.ToTable("tracking_flags");
        builder.Property(f => f.Details).HasMaxLength(2000);
        builder.Property(f => f.ReviewNote).HasMaxLength(1000);
        builder.Property(f => f.Occurrences).HasDefaultValue(1).HasSentinel(0);
        builder.HasIndex(f => new { f.UserId, f.Status });
        builder.HasIndex(f => new { f.Status, f.CreatedAt });
        builder.HasIndex(f => new { f.UserId, f.CreatedAt });
        builder.HasIndex(f => f.VisitId).HasFilter("visit_id IS NOT NULL");
    }
}

internal sealed class AppSettingConfiguration : IEntityTypeConfiguration<AppSetting>
{
    public void Configure(EntityTypeBuilder<AppSetting> builder)
    {
        builder.ToTable("app_settings");
        builder.HasKey(s => s.Key);
        builder.Property(s => s.Key).HasMaxLength(64);
        builder.Property(s => s.Value).HasColumnType("jsonb").IsRequired();
    }
}

internal sealed class DeviceConfiguration : IEntityTypeConfiguration<Device>
{
    public void Configure(EntityTypeBuilder<Device> builder)
    {
        builder.ToTable("devices");
        builder.Property(d => d.DeviceId).HasMaxLength(128).IsRequired();
        builder.Property(d => d.PushToken).HasMaxLength(4096);
        builder.ComplexProperty(d => d.Health, HealthColumns.Configure);
        builder.HasIndex(d => new { d.UserId, d.DeviceId }).IsUnique();
    }
}

internal sealed class DeviceHealthReportConfiguration : IEntityTypeConfiguration<DeviceHealthReport>
{
    public void Configure(EntityTypeBuilder<DeviceHealthReport> builder)
    {
        builder.ToTable("device_health_reports");
        builder.Property(r => r.DeviceId).HasMaxLength(128).IsRequired();
        builder.ComplexProperty(r => r.Health, HealthColumns.Configure);
        builder.HasIndex(r => new { r.DeviceRecordId, r.ReportedAt });
        builder.HasOne<Device>().WithMany().HasForeignKey(r => r.DeviceRecordId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal static class HealthColumns
{
    public static void Configure(ComplexPropertyBuilder<DeviceHealthSnapshot> health)
    {
        health.Property(h => h.AppVersion).HasMaxLength(32);
        health.Property(h => h.Manufacturer).HasMaxLength(64);
        health.Property(h => h.Model).HasMaxLength(64);
        health.Property(h => h.OsVersion).HasMaxLength(32);
    }
}

internal sealed class TrackingConsentConfiguration : IEntityTypeConfiguration<TrackingConsent>
{
    public void Configure(EntityTypeBuilder<TrackingConsent> builder)
    {
        builder.ToTable("tracking_consents");
        builder.Property(c => c.ConsentVersion).HasMaxLength(32).IsRequired();
        builder.Property(c => c.DeviceId).HasMaxLength(128).IsRequired();
        builder.Property(c => c.Locale).HasMaxLength(8).IsRequired();
        builder.Property(c => c.IpAddress).HasMaxLength(64);
        builder.Property(c => c.UserAgent).HasMaxLength(512);
        builder.HasIndex(c => new { c.UserId, c.ConsentVersion });
    }
}
