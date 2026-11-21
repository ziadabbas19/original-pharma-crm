using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OriginalPharma.Domain.Expenses;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Infrastructure.Persistence.Configurations;

internal sealed class ExpenseLineConfiguration : IEntityTypeConfiguration<ExpenseLine>
{
    public void Configure(EntityTypeBuilder<ExpenseLine> builder)
    {
        builder.ToTable("expense_lines");
        builder.Property(l => l.Amount).HasPrecision(12, 2);
        builder.Property(l => l.OriginalAmount).HasPrecision(12, 2);
        builder.Property(l => l.Note).HasMaxLength(ExpenseLine.NoteMaxLength);
        builder.Ignore(l => l.IsEdited);

        // One automatic line per rep, day and city, archived ones included: a line the rep removed is
        // not created again by the day's later visits. ExpenseService inserts against this index.
        builder.HasIndex(l => new { l.UserId, l.Day, l.CityId })
            .IsUnique()
            .HasFilter("source = 1")
            .HasDatabaseName("ux_expense_lines_auto_per_day");
        builder.HasIndex(l => new { l.Day, l.UserId });
        builder.HasIndex(l => new { l.UserId, l.Day });

        builder.HasOne<User>().WithMany().HasForeignKey(l => l.UserId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Territory>().WithMany().HasForeignKey(l => l.CityId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class ExpenseDayConfiguration : IEntityTypeConfiguration<ExpenseDay>
{
    public void Configure(EntityTypeBuilder<ExpenseDay> builder)
    {
        builder.ToTable("expense_days");
        builder.Property(d => d.Note).HasMaxLength(ExpenseLine.NoteMaxLength);
        builder.Property(d => d.ManagerNote).HasMaxLength(ExpenseLine.NoteMaxLength);
        builder.HasIndex(d => new { d.UserId, d.Day }).IsUnique();
        builder.HasOne<User>().WithMany().HasForeignKey(d => d.UserId).OnDelete(DeleteBehavior.Restrict);
    }
}
