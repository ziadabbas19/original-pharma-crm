using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OriginalPharma.Domain.Audit;
using OriginalPharma.Domain.Catalog;
using OriginalPharma.Domain.Crm;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Domain.Notifications;
using OriginalPharma.Domain.Visits;

namespace OriginalPharma.Infrastructure.Persistence.Configurations;

internal sealed class CustomerConfiguration : IEntityTypeConfiguration<Customer>
{
    public void Configure(EntityTypeBuilder<Customer> builder)
    {
        builder.ToTable("customers");
        builder.Property(c => c.Name).HasMaxLength(Customer.NameMaxLength).IsRequired();
        builder.Property(c => c.NameAr).HasMaxLength(Customer.NameMaxLength);
        builder.Property(c => c.Address).HasMaxLength(Customer.AddressMaxLength);
        builder.Property(c => c.Landmark).HasMaxLength(Customer.LandmarkMaxLength);
        builder.Property(c => c.QrCode).HasMaxLength(128);
        builder.Property(c => c.Phone).HasMaxLength(Customer.PhoneMaxLength);
        builder.Property(c => c.Notes).HasMaxLength(Customer.NotesMaxLength);
        builder.Property(c => c.Location).HasColumnType(GeoColumn.Point);
        builder.HasOne(c => c.Specialty).WithMany().HasForeignKey(c => c.SpecialtyId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Territory>().WithMany().HasForeignKey(c => c.TerritoryId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(c => c.Reps).WithOne(r => r.Customer).HasForeignKey(r => r.CustomerId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(c => c.Availability).WithOne().HasForeignKey(a => a.CustomerId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(c => c.TerritoryId);
        builder.HasIndex(c => c.SpecialtyId);
        builder.HasIndex(c => new { c.Type, c.Name });
        builder.HasIndex(c => c.Location).HasMethod("gist");

        // Search forms of the names: plain text, with text_pattern_ops so "starts with" can use the index.
        builder.Property(c => c.NameSearch).HasColumnType("text").HasDefaultValue(string.Empty).IsRequired();
        builder.Property(c => c.NameArSearch).HasColumnType("text");
        builder.HasIndex(c => c.NameSearch).HasOperators("text_pattern_ops");
        builder.HasIndex(c => c.NameArSearch).HasOperators("text_pattern_ops");
    }
}

internal sealed class DoctorAvailabilityConfiguration : IEntityTypeConfiguration<DoctorAvailability>
{
    public void Configure(EntityTypeBuilder<DoctorAvailability> builder)
    {
        builder.ToTable("doctor_availability", t =>
            t.HasCheckConstraint("ck_doctor_availability_times", "end_time > start_time"));
        builder.Property(a => a.Place).HasMaxLength(DoctorAvailability.PlaceMaxLength);

        // The day / time search filters on weekday first.
        builder.HasIndex(a => new { a.Weekday, a.StartTime });
        builder.HasIndex(a => a.CustomerId);
    }
}

internal sealed class RepDayConfiguration : IEntityTypeConfiguration<RepDay>
{
    public void Configure(EntityTypeBuilder<RepDay> builder)
    {
        builder.ToTable("rep_days");
        builder.HasKey(d => new { d.UserId, d.Day });
        builder.HasOne<User>().WithMany().HasForeignKey(d => d.UserId).OnDelete(DeleteBehavior.Cascade);

        // A town that was chosen for a day is archived, not deleted (like plan cities); null means the whole area.
        builder.HasOne<Territory>().WithMany().HasForeignKey(d => d.TerritoryId).OnDelete(DeleteBehavior.SetNull);
    }
}

internal sealed class RepVisitOrderConfiguration : IEntityTypeConfiguration<RepVisitOrder>
{
    public void Configure(EntityTypeBuilder<RepVisitOrder> builder)
    {
        builder.ToTable("rep_visit_order");
        builder.HasKey(o => new { o.UserId, o.Day, o.CustomerId });
        builder.HasOne<User>().WithMany().HasForeignKey(o => o.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<Customer>().WithMany().HasForeignKey(o => o.CustomerId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class RepAmVisitConfiguration : IEntityTypeConfiguration<RepAmVisit>
{
    public void Configure(EntityTypeBuilder<RepAmVisit> builder)
    {
        builder.ToTable("rep_am_visits");
        builder.HasKey(a => new { a.UserId, a.Day, a.CustomerId });
        builder.HasOne<User>().WithMany().HasForeignKey(a => a.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<Customer>().WithMany().HasForeignKey(a => a.CustomerId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class VisitConfiguration : IEntityTypeConfiguration<Visit>
{
    public void Configure(EntityTypeBuilder<Visit> builder)
    {
        builder.ToTable("visits");
        builder.Property(v => v.DeviceId).HasMaxLength(128).IsRequired();
        builder.Property(v => v.CheckInLocation).HasColumnType(GeoColumn.Point).IsRequired();
        builder.Property(v => v.CheckOutLocation).HasColumnType(GeoColumn.Point);
        builder.Property(v => v.Notes).HasMaxLength(2000);
        builder.Property(v => v.TrustReasons).HasDefaultValueSql("'{}'::text[]");
        builder.Property(v => v.CheckInSignalCodes).HasDefaultValueSql("'{}'::text[]");
        builder.Property(v => v.CheckOutSignalCodes).HasDefaultValueSql("'{}'::text[]");
        builder.Property(v => v.DriftSources).HasDefaultValueSql("'{}'::text[]");
        builder.Property(v => v.ClinicLocationOutcome).HasDefaultValue(ClinicLocationOutcome.Compared).HasSentinel(0);
        builder.HasOne(v => v.Customer).WithMany().HasForeignKey(v => v.CustomerId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(v => v.Photos).WithOne().HasForeignKey(p => p.VisitId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(v => v.Feedback).WithOne().HasForeignKey<VisitFeedback>(f => f.VisitId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(v => v.Products).WithOne().HasForeignKey(p => p.VisitId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(v => v.Replies).WithOne().HasForeignKey(r => r.VisitId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(v => new { v.UserId, v.CheckInAt });
        builder.HasIndex(v => new { v.UserId, v.Status });

        // A rep has at most one open visit, even when two check-ins arrive at the same moment.
        builder.HasIndex(v => v.UserId)
            .IsUnique()
            .HasFilter("status = 1 AND archived_at IS NULL")
            .HasDatabaseName("ux_visits_one_in_progress_per_user");
        builder.HasIndex(v => new { v.TerritoryId, v.CheckInAt });
        builder.HasIndex(v => v.CustomerId);

        // Location history of a doctor: earlier visits with a good fix, in time order.
        builder.HasIndex(v => new { v.CustomerId, v.CheckInAt });
    }
}

internal sealed class VisitFeedbackConfiguration : IEntityTypeConfiguration<VisitFeedback>
{
    public void Configure(EntityTypeBuilder<VisitFeedback> builder)
    {
        builder.ToTable("visit_feedback");
        builder.HasKey(f => f.VisitId);
        builder.Property(f => f.Text).HasMaxLength(VisitFeedback.TextMaxLength).IsRequired();
        builder.HasMany(f => f.SeenBy).WithOne().HasForeignKey(s => s.VisitId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(f => f.Category);
    }
}

internal sealed class VisitFeedbackSeenConfiguration : IEntityTypeConfiguration<VisitFeedbackSeen>
{
    public void Configure(EntityTypeBuilder<VisitFeedbackSeen> builder)
    {
        builder.ToTable("visit_feedback_seen");
        builder.HasKey(s => new { s.VisitId, s.UserId });
        builder.Property(s => s.UserName).HasMaxLength(200).IsRequired();
    }
}

internal sealed class VisitFeedbackReplyConfiguration : IEntityTypeConfiguration<VisitFeedbackReply>
{
    public void Configure(EntityTypeBuilder<VisitFeedbackReply> builder)
    {
        builder.ToTable("visit_feedback_replies");
        builder.Property(r => r.AuthorName).HasMaxLength(200).IsRequired();
        builder.Property(r => r.Text).HasMaxLength(VisitFeedbackReply.TextMaxLength).IsRequired();
        builder.HasIndex(r => new { r.VisitId, r.CreatedAt });
    }
}

internal sealed class VisitProductConfiguration : IEntityTypeConfiguration<VisitProduct>
{
    public void Configure(EntityTypeBuilder<VisitProduct> builder)
    {
        builder.ToTable("visit_products");
        builder.HasKey(p => new { p.VisitId, p.ProductId });
        builder.Property(p => p.Note).HasMaxLength(VisitProduct.NoteMaxLength);

        // A product discussed in a visit is "used": deleting it archives it instead.
        builder.HasOne<Product>().WithMany().HasForeignKey(p => p.ProductId).OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(p => p.ProductId);
    }
}

internal sealed class NotificationConfiguration : IEntityTypeConfiguration<Notification>
{
    public void Configure(EntityTypeBuilder<Notification> builder)
    {
        builder.ToTable("notifications");
        builder.Property(n => n.Data).HasColumnType("jsonb").IsRequired();
        builder.HasOne<User>().WithMany().HasForeignKey(n => n.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(n => new { n.UserId, n.CreatedAt });
        builder.HasIndex(n => new { n.UserId, n.ReadAt });
        builder.HasIndex(n => new { n.UserId, n.EntityId });
    }
}

internal sealed class AuditEntryConfiguration : IEntityTypeConfiguration<AuditEntry>
{
    public void Configure(EntityTypeBuilder<AuditEntry> builder)
    {
        builder.ToTable("audit_entries");
        builder.Property(e => e.EntityType).HasMaxLength(50).IsRequired();
        builder.Property(e => e.ActorName).HasMaxLength(200).IsRequired();
        builder.Property(e => e.Details).HasColumnType("jsonb").IsRequired();

        // No foreign keys: the trail outlives the rows it describes.
        builder.HasIndex(e => new { e.EntityType, e.EntityId, e.CreatedAt });
        builder.HasIndex(e => e.CreatedAt);
    }
}

internal sealed class VisitPhotoConfiguration : IEntityTypeConfiguration<VisitPhoto>
{
    public void Configure(EntityTypeBuilder<VisitPhoto> builder)
    {
        builder.ToTable("visit_photos");
        builder.Property(p => p.StoragePath).HasMaxLength(512).IsRequired();
        builder.Property(p => p.ContentType).HasMaxLength(64).IsRequired();
    }
}
