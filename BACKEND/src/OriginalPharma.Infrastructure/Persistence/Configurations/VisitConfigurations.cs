using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OriginalPharma.Domain.Crm;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Domain.Visits;

namespace OriginalPharma.Infrastructure.Persistence.Configurations;

internal sealed class CustomerConfiguration : IEntityTypeConfiguration<Customer>
{
    public void Configure(EntityTypeBuilder<Customer> builder)
    {
        builder.ToTable("customers");
        builder.Property(c => c.Name).HasMaxLength(Customer.NameMaxLength).IsRequired();
        builder.Property(c => c.NameAr).HasMaxLength(Customer.NameMaxLength);
        builder.Property(c => c.Address).HasMaxLength(500);
        builder.Property(c => c.QrCode).HasMaxLength(128);
        builder.Property(c => c.Phone).HasMaxLength(Customer.PhoneMaxLength);
        builder.Property(c => c.Notes).HasMaxLength(Customer.NotesMaxLength);
        builder.Property(c => c.Location).HasColumnType(GeoColumn.Point);
        builder.HasOne(c => c.Specialty).WithMany().HasForeignKey(c => c.SpecialtyId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Territory>().WithMany().HasForeignKey(c => c.TerritoryId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(c => c.Reps).WithOne(r => r.Customer).HasForeignKey(r => r.CustomerId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(c => c.TerritoryId);
        builder.HasIndex(c => c.SpecialtyId);
        builder.HasIndex(c => new { c.Type, c.Name });
        builder.HasIndex(c => c.Location).HasMethod("gist");
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
        builder.HasOne(v => v.Customer).WithMany().HasForeignKey(v => v.CustomerId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(v => v.Photos).WithOne().HasForeignKey(p => p.VisitId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(v => new { v.UserId, v.CheckInAt });
        builder.HasIndex(v => new { v.UserId, v.Status });
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
