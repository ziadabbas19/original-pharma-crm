using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OriginalPharma.Domain.Catalog;
using OriginalPharma.Domain.Crm;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Domain.Orders;

namespace OriginalPharma.Infrastructure.Persistence.Configurations;

internal sealed class SpecialtyConfiguration : IEntityTypeConfiguration<Specialty>
{
    public void Configure(EntityTypeBuilder<Specialty> builder)
    {
        builder.ToTable("specialties");
        builder.Property(s => s.NameAr).HasMaxLength(Specialty.NameMaxLength).IsRequired();
        builder.Property(s => s.NameEn).HasMaxLength(Specialty.NameMaxLength).IsRequired();
    }
}

internal sealed class RepDoctorConfiguration : IEntityTypeConfiguration<RepDoctor>
{
    public void Configure(EntityTypeBuilder<RepDoctor> builder)
    {
        builder.ToTable("rep_doctors");
        builder.HasOne<User>().WithMany().HasForeignKey(r => r.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(r => new { r.UserId, r.CustomerId }).IsUnique();
        builder.HasIndex(r => r.CustomerId);
    }
}

internal sealed class ProductLineConfiguration : IEntityTypeConfiguration<ProductLine>
{
    public void Configure(EntityTypeBuilder<ProductLine> builder)
    {
        builder.ToTable("product_lines");
        builder.Property(l => l.NameAr).HasMaxLength(ProductLine.NameMaxLength).IsRequired();
        builder.Property(l => l.NameEn).HasMaxLength(ProductLine.NameMaxLength).IsRequired();
        builder.Property(l => l.Description).HasMaxLength(ProductLine.DescriptionMaxLength);
        builder.Property(l => l.DefaultDiscountPercent).HasPrecision(5, 2);
        builder.Property(l => l.MaxDiscountPercent).HasPrecision(5, 2);

        // Never cascade: deleting a line first clears it on its products (CatalogService), so the
        // products stay in the catalog as unassigned. Restrict guards against any other path.
        builder.HasMany(l => l.Products).WithOne(p => p.ProductLine).HasForeignKey(p => p.ProductLineId)
            .IsRequired(false).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class ProductConfiguration : IEntityTypeConfiguration<Product>
{
    public void Configure(EntityTypeBuilder<Product> builder)
    {
        builder.ToTable("products");
        builder.Property(p => p.NameAr).HasMaxLength(Product.NameMaxLength).IsRequired();
        builder.Property(p => p.NameEn).HasMaxLength(Product.NameMaxLength).IsRequired();
        builder.Property(p => p.Description).HasMaxLength(Product.DescriptionMaxLength);
        builder.Property(p => p.Price).HasPrecision(12, 2);
        builder.Property(p => p.DefaultDiscountPercent).HasPrecision(5, 2);
        builder.Property(p => p.MaxDiscountPercent).HasPrecision(5, 2);
        builder.Property(p => p.ImageKey).HasMaxLength(32);
        builder.HasIndex(p => new { p.ProductLineId, p.NameEn });
    }
}

internal sealed class UserProductLineConfiguration : IEntityTypeConfiguration<UserProductLine>
{
    public void Configure(EntityTypeBuilder<UserProductLine> builder)
    {
        builder.ToTable("user_product_lines");
        builder.HasKey(l => new { l.UserId, l.ProductLineId });
        builder.HasOne(l => l.ProductLine).WithMany().HasForeignKey(l => l.ProductLineId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(l => l.ProductLineId);
    }
}

internal sealed class CollectionMethodConfiguration : IEntityTypeConfiguration<CollectionMethod>
{
    public void Configure(EntityTypeBuilder<CollectionMethod> builder)
    {
        builder.ToTable("collection_methods");
        builder.Property(m => m.NameAr).HasMaxLength(CollectionMethod.NameMaxLength).IsRequired();
        builder.Property(m => m.NameEn).HasMaxLength(CollectionMethod.NameMaxLength).IsRequired();
    }
}

internal sealed class OrderConfiguration : IEntityTypeConfiguration<Order>
{
    public void Configure(EntityTypeBuilder<Order> builder)
    {
        builder.ToTable("orders", t => t.HasCheckConstraint(
            "ck_orders_collection_method",
            "(collection_method_id IS NOT NULL) <> (collection_method_other IS NOT NULL AND collection_method_other <> '')"));
        builder.Property(o => o.Number).HasMaxLength(Order.NumberMaxLength).IsRequired();
        builder.Property(o => o.PlaceName).HasMaxLength(Order.PlaceNameMaxLength).IsRequired();
        builder.Property(o => o.CollectionMethodOther).HasMaxLength(Order.OtherTextMaxLength);
        builder.Property(o => o.Notes).HasMaxLength(Order.NotesMaxLength);
        builder.Property(o => o.StatusReason).HasMaxLength(Order.ReasonMaxLength);
        builder.Property(o => o.DecidedByName).HasMaxLength(200);
        builder.Property(o => o.DeliveredByName).HasMaxLength(200);
        builder.Property(o => o.DeliveryNote).HasMaxLength(Order.ReasonMaxLength);
        builder.Property(o => o.Subtotal).HasPrecision(12, 2);
        builder.Property(o => o.DiscountTotal).HasPrecision(12, 2);
        builder.Property(o => o.Total).HasPrecision(12, 2);

        builder.HasOne<User>().WithMany().HasForeignKey(o => o.UserId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(o => o.Customer).WithMany().HasForeignKey(o => o.CustomerId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(o => o.CollectionMethod).WithMany().HasForeignKey(o => o.CollectionMethodId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(o => o.Lines).WithOne().HasForeignKey(l => l.OrderId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(o => o.History).WithOne().HasForeignKey(h => h.OrderId).OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(o => o.Number).IsUnique();

        // Idempotency: one order per (rep, client request id), so offline retries never duplicate.
        builder.HasIndex(o => new { o.UserId, o.ClientRequestId }).IsUnique();
        builder.HasIndex(o => o.VisitId);
        builder.HasIndex(o => new { o.UserId, o.OrderDate });
        builder.HasIndex(o => new { o.TerritoryId, o.OrderDate });
        builder.HasIndex(o => new { o.Status, o.OrderDate });
    }
}

internal sealed class OrderLineConfiguration : IEntityTypeConfiguration<OrderLine>
{
    public void Configure(EntityTypeBuilder<OrderLine> builder)
    {
        builder.ToTable("order_lines");
        builder.Property(l => l.ProductNameAr).HasMaxLength(Product.NameMaxLength).IsRequired();
        builder.Property(l => l.ProductNameEn).HasMaxLength(Product.NameMaxLength).IsRequired();
        builder.Property(l => l.UnitPrice).HasPrecision(12, 2);
        builder.Property(l => l.DiscountPercent).HasPrecision(5, 2);
        builder.Property(l => l.DiscountAmount).HasPrecision(12, 2);
        builder.Property(l => l.LineTotal).HasPrecision(12, 2);
        builder.HasOne<Product>().WithMany().HasForeignKey(l => l.ProductId).OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(l => l.OrderId);
        builder.HasIndex(l => l.ProductId);
    }
}

internal sealed class OrderHistoryConfiguration : IEntityTypeConfiguration<OrderHistoryEntry>
{
    public void Configure(EntityTypeBuilder<OrderHistoryEntry> builder)
    {
        builder.ToTable("order_history");
        builder.Property(h => h.ActorName).HasMaxLength(200).IsRequired();
        builder.Property(h => h.Reason).HasMaxLength(Order.ReasonMaxLength);
        builder.Property(h => h.InternalNote).HasMaxLength(Order.ReasonMaxLength);
        builder.HasIndex(h => new { h.OrderId, h.CreatedAt });
    }
}

internal sealed class SeedHistoryConfiguration : IEntityTypeConfiguration<SeedHistoryEntry>
{
    public void Configure(EntityTypeBuilder<SeedHistoryEntry> builder)
    {
        builder.ToTable("seed_history");
        builder.HasKey(e => e.Key);
        builder.Property(e => e.Key).HasMaxLength(100);
    }
}
