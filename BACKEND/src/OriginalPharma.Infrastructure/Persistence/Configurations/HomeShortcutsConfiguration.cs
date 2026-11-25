using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Infrastructure.Persistence.Configurations;

internal sealed class UserHomeShortcutsConfiguration : IEntityTypeConfiguration<UserHomeShortcuts>
{
    public void Configure(EntityTypeBuilder<UserHomeShortcuts> builder)
    {
        builder.ToTable("user_home_shortcuts");
        builder.HasKey(s => s.UserId);
        builder.Property(s => s.UserId).ValueGeneratedNever();
        builder.Property(s => s.Keys).HasColumnType("jsonb").IsRequired();
        builder.HasOne<User>().WithOne().HasForeignKey<UserHomeShortcuts>(s => s.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}
