using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OriginalPharma.Domain.Crm;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Domain.Plans;

namespace OriginalPharma.Infrastructure.Persistence.Configurations;

internal sealed class WeeklyPlanConfiguration : IEntityTypeConfiguration<WeeklyPlan>
{
    public void Configure(EntityTypeBuilder<WeeklyPlan> builder)
    {
        builder.ToTable("weekly_plans");
        builder.Property(p => p.ReviewNote).HasMaxLength(WeeklyPlan.NoteMaxLength);
        builder.Property(p => p.Version).IsConcurrencyToken();
        builder.Ignore(p => p.IsEditable);

        // One plan per rep and week.
        builder.HasIndex(p => new { p.UserId, p.WeekStart }).IsUnique();
        builder.HasIndex(p => new { p.Status, p.WeekStart });

        builder.HasOne<User>().WithMany().HasForeignKey(p => p.UserId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(p => p.Days).WithOne().HasForeignKey(d => d.PlanId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(p => p.Events).WithOne().HasForeignKey(e => e.PlanId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class WeeklyPlanDayConfiguration : IEntityTypeConfiguration<WeeklyPlanDay>
{
    public void Configure(EntityTypeBuilder<WeeklyPlanDay> builder)
    {
        builder.ToTable("weekly_plan_days", t =>
            t.HasCheckConstraint("ck_weekly_plan_days_target", $"target_visits BETWEEN 0 AND {WeeklyPlanDay.MaxTargetVisits}"));
        builder.Property(d => d.Note).HasMaxLength(WeeklyPlanDay.NoteMaxLength);
        builder.HasIndex(d => new { d.PlanId, d.Day }).IsUnique();

        // Towns that plans use are archived instead of deleted (TerritoryService counts them).
        builder.HasOne<Territory>().WithMany().HasForeignKey(d => d.CityId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(d => d.Customers).WithOne().HasForeignKey(c => c.PlanDayId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class WeeklyPlanCustomerConfiguration : IEntityTypeConfiguration<WeeklyPlanCustomer>
{
    public void Configure(EntityTypeBuilder<WeeklyPlanCustomer> builder)
    {
        builder.ToTable("weekly_plan_customers");
        builder.HasIndex(c => new { c.PlanDayId, c.CustomerId }).IsUnique();

        // A customer deleted for good (never visited, never ordered) simply leaves the plans it was on.
        builder.HasOne<Customer>().WithMany().HasForeignKey(c => c.CustomerId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class WeeklyPlanEventConfiguration : IEntityTypeConfiguration<WeeklyPlanEvent>
{
    public void Configure(EntityTypeBuilder<WeeklyPlanEvent> builder)
    {
        builder.ToTable("weekly_plan_events");
        builder.Property(e => e.ActorName).HasMaxLength(200);
        builder.Property(e => e.Note).HasMaxLength(WeeklyPlan.NoteMaxLength);
        builder.HasIndex(e => new { e.PlanId, e.CreatedAt });
    }
}
