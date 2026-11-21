using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Infrastructure.Persistence.Configurations;

internal sealed class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.ToTable("users");
        builder.Property(u => u.FullName).HasMaxLength(200).IsRequired();
        builder.Property(u => u.PreferredLanguage).HasMaxLength(8).IsRequired();
        builder.Property(u => u.PermissionsVersion).HasDefaultValue(1);

        builder.HasOne(u => u.Manager).WithMany().HasForeignKey(u => u.ManagerId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(u => u.Territory).WithMany().HasForeignKey(u => u.TerritoryId).OnDelete(DeleteBehavior.SetNull);
        builder.Property(u => u.AvatarKey).HasMaxLength(32);
        builder.HasMany(u => u.ProductLines).WithOne(l => l.User).HasForeignKey(l => l.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(u => u.ManagerId);
        builder.HasIndex(u => u.TerritoryId);
    }
}

internal sealed class UserAuditEntryConfiguration : IEntityTypeConfiguration<UserAuditEntry>
{
    public void Configure(EntityTypeBuilder<UserAuditEntry> builder)
    {
        builder.ToTable("user_audit_entries");
        builder.Property(e => e.ActorName).HasMaxLength(200).IsRequired();
        builder.Property(e => e.Details).HasColumnType("jsonb").IsRequired();
        builder.Property(e => e.IpAddress).HasMaxLength(64);

        // No foreign key: the history outlives the account.
        builder.HasIndex(e => new { e.UserId, e.CreatedAt });
    }
}

internal sealed class RoleConfiguration : IEntityTypeConfiguration<Role>
{
    public void Configure(EntityTypeBuilder<Role> builder)
    {
        builder.ToTable("roles");

        // Identity's Name/NormalizedName hold the stable role key (see Role.Key).
        builder.Ignore(r => r.Key);
        builder.Property(r => r.Name).HasColumnName("key").HasMaxLength(Role.KeyMaxLength);
        builder.Property(r => r.NormalizedName).HasColumnName("normalized_key").HasMaxLength(Role.KeyMaxLength);

        builder.Property(r => r.NameAr).HasMaxLength(Role.NameMaxLength).IsRequired();
        builder.Property(r => r.NameEn).HasMaxLength(Role.NameMaxLength).IsRequired();
        builder.Property(r => r.Description).HasMaxLength(Role.DescriptionMaxLength);
        builder.Property(r => r.MaxDiscountPercent).HasPrecision(5, 2);
        builder.HasIndex(r => r.Level);
        builder.HasMany(r => r.Permissions).WithOne(rp => rp.Role).HasForeignKey(rp => rp.RoleId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class RoleAuditEntryConfiguration : IEntityTypeConfiguration<RoleAuditEntry>
{
    public void Configure(EntityTypeBuilder<RoleAuditEntry> builder)
    {
        builder.ToTable("role_audit_entries");
        builder.Property(e => e.RoleKey).HasMaxLength(Role.KeyMaxLength).IsRequired();
        builder.Property(e => e.ActorName).HasMaxLength(200).IsRequired();
        builder.Property(e => e.Changes).HasColumnType("jsonb").IsRequired();

        // No foreign key to roles: the history outlives a deleted role.
        builder.HasIndex(e => new { e.RoleId, e.CreatedAt });
    }
}

internal sealed class IdentityTablesConfiguration :
    IEntityTypeConfiguration<IdentityUserRole<Guid>>,
    IEntityTypeConfiguration<IdentityUserClaim<Guid>>,
    IEntityTypeConfiguration<IdentityUserLogin<Guid>>,
    IEntityTypeConfiguration<IdentityUserToken<Guid>>,
    IEntityTypeConfiguration<IdentityRoleClaim<Guid>>
{
    public void Configure(EntityTypeBuilder<IdentityUserRole<Guid>> builder) => builder.ToTable("user_roles");
    public void Configure(EntityTypeBuilder<IdentityUserClaim<Guid>> builder) => builder.ToTable("user_claims");
    public void Configure(EntityTypeBuilder<IdentityUserLogin<Guid>> builder) => builder.ToTable("user_logins");
    public void Configure(EntityTypeBuilder<IdentityUserToken<Guid>> builder) => builder.ToTable("user_tokens");
    public void Configure(EntityTypeBuilder<IdentityRoleClaim<Guid>> builder) => builder.ToTable("role_claims");
}

internal sealed class PermissionConfiguration : IEntityTypeConfiguration<Permission>
{
    public void Configure(EntityTypeBuilder<Permission> builder)
    {
        builder.ToTable("permissions");
        builder.Property(p => p.Key).HasMaxLength(100).IsRequired();
        builder.Property(p => p.Resource).HasMaxLength(50).IsRequired();
        builder.Property(p => p.Action).HasMaxLength(50).IsRequired();
        builder.Property(p => p.Description).HasMaxLength(256);
        builder.HasIndex(p => p.Key).IsUnique();
    }
}

internal sealed class RolePermissionConfiguration : IEntityTypeConfiguration<RolePermission>
{
    public void Configure(EntityTypeBuilder<RolePermission> builder)
    {
        builder.ToTable("role_permissions");
        builder.HasKey(rp => new { rp.RoleId, rp.PermissionId });
        builder.HasOne(rp => rp.Permission).WithMany().HasForeignKey(rp => rp.PermissionId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class UserPermissionOverrideConfiguration : IEntityTypeConfiguration<UserPermissionOverride>
{
    public void Configure(EntityTypeBuilder<UserPermissionOverride> builder)
    {
        builder.ToTable("user_permission_overrides");
        builder.Property(o => o.Reason).HasMaxLength(256);
        builder.HasOne(o => o.User).WithMany().HasForeignKey(o => o.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(o => o.Permission).WithMany().HasForeignKey(o => o.PermissionId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(o => new { o.UserId, o.PermissionId });
    }
}

internal sealed class RefreshTokenConfiguration : IEntityTypeConfiguration<RefreshToken>
{
    public void Configure(EntityTypeBuilder<RefreshToken> builder)
    {
        builder.ToTable("refresh_tokens");
        builder.Property(t => t.TokenHash).HasMaxLength(128).IsRequired();
        builder.Property(t => t.DeviceId).HasMaxLength(128);
        builder.Property(t => t.CreatedByIp).HasMaxLength(64);
        builder.Property(t => t.RevokedReason).HasMaxLength(64);
        builder.HasIndex(t => t.TokenHash).IsUnique();
        builder.HasIndex(t => t.FamilyId);
        builder.HasIndex(t => t.UserId);
        builder.HasOne(t => t.User).WithMany().HasForeignKey(t => t.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class UserSessionConfiguration : IEntityTypeConfiguration<UserSession>
{
    public void Configure(EntityTypeBuilder<UserSession> builder)
    {
        builder.ToTable("user_sessions");
        builder.Property(s => s.DeviceId).HasMaxLength(128);
        builder.Property(s => s.DeviceName).HasMaxLength(UserSession.DeviceNameMaxLength);
        builder.Property(s => s.UserAgent).HasMaxLength(UserSession.UserAgentMaxLength);
        builder.Property(s => s.CreatedByIp).HasMaxLength(64);
        builder.Property(s => s.LastIp).HasMaxLength(64);
        builder.Property(s => s.RevokedReason).HasMaxLength(64);
        builder.HasIndex(s => new { s.UserId, s.RevokedAt });
        builder.HasIndex(s => new { s.UserId, s.DeviceId });
        builder.HasOne(s => s.User).WithMany().HasForeignKey(s => s.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class TerritoryConfiguration : IEntityTypeConfiguration<Territory>
{
    public void Configure(EntityTypeBuilder<Territory> builder)
    {
        builder.ToTable("territories");
        builder.Property(t => t.Code).HasMaxLength(Territory.CodeMaxLength).IsRequired();
        builder.Property(t => t.Name).HasMaxLength(Territory.NameMaxLength).IsRequired();
        builder.Property(t => t.NameAr).HasMaxLength(Territory.NameMaxLength);
        builder.Property(t => t.DefaultDailyExpense).HasPrecision(12, 2).HasDefaultValue(0m);
        builder.HasIndex(t => t.Code).IsUnique();
        builder.HasOne(t => t.Parent).WithMany(t => t.Children).HasForeignKey(t => t.ParentId).OnDelete(DeleteBehavior.Restrict);
    }
}
