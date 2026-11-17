using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OriginalPharma.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRoleManagement : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "normalized_name",
                table: "roles",
                newName: "normalized_key");

            migrationBuilder.RenameColumn(
                name: "name",
                table: "roles",
                newName: "key");

            migrationBuilder.AlterColumn<string>(
                name: "normalized_key",
                table: "roles",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(256)",
                oldMaxLength: 256,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "key",
                table: "roles",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(256)",
                oldMaxLength: 256,
                oldNullable: true);

            migrationBuilder.AddColumn<int>(
                name: "level",
                table: "roles",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "name_ar",
                table: "roles",
                type: "character varying(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "name_en",
                table: "roles",
                type: "character varying(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            // Roles created before this migration: show the key until someone renames them and
            // place them below the seeded roles. Seeded roles get their names and levels, and
            // all of them become system roles (renamable, not deletable).
            migrationBuilder.Sql("UPDATE roles SET name_ar = COALESCE(key, ''), name_en = COALESCE(key, ''), level = 50;");
            migrationBuilder.Sql("""
                UPDATE roles AS r
                SET name_ar = s.name_ar, name_en = s.name_en, level = s.level, is_system = TRUE
                FROM (VALUES
                    ('ADMIN', 'مدير النظام', 'System admin', 0),
                    ('SALESMANAGER', 'مدير المبيعات', 'Sales manager', 10),
                    ('AREAMANAGER', 'مدير المنطقة', 'Area manager', 20),
                    ('SUPERVISOR', 'مشرف', 'Supervisor', 30),
                    ('REP', 'مندوب طبي', 'Medical rep', 40)
                ) AS s(normalized_key, name_ar, name_en, level)
                WHERE r.normalized_key = s.normalized_key;
                """);

            migrationBuilder.CreateTable(
                name: "role_audit_entries",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    role_id = table.Column<Guid>(type: "uuid", nullable: false),
                    role_key = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    actor_id = table.Column<Guid>(type: "uuid", nullable: true),
                    actor_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    action = table.Column<int>(type: "integer", nullable: false),
                    changes = table.Column<string>(type: "jsonb", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_role_audit_entries", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_roles_level",
                table: "roles",
                column: "level");

            migrationBuilder.CreateIndex(
                name: "ix_role_audit_entries_role_id_created_at",
                table: "role_audit_entries",
                columns: new[] { "role_id", "created_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "role_audit_entries");

            migrationBuilder.DropIndex(
                name: "ix_roles_level",
                table: "roles");

            migrationBuilder.DropColumn(
                name: "level",
                table: "roles");

            migrationBuilder.DropColumn(
                name: "name_ar",
                table: "roles");

            migrationBuilder.DropColumn(
                name: "name_en",
                table: "roles");

            migrationBuilder.RenameColumn(
                name: "normalized_key",
                table: "roles",
                newName: "normalized_name");

            migrationBuilder.RenameColumn(
                name: "key",
                table: "roles",
                newName: "name");

            migrationBuilder.AlterColumn<string>(
                name: "normalized_name",
                table: "roles",
                type: "character varying(256)",
                maxLength: 256,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(64)",
                oldMaxLength: 64,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "name",
                table: "roles",
                type: "character varying(256)",
                maxLength: 256,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(64)",
                oldMaxLength: 64,
                oldNullable: true);
        }
    }
}
