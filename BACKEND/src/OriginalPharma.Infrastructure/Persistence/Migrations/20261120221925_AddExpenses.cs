using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OriginalPharma.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddExpenses : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "default_daily_expense",
                table: "territories",
                type: "numeric(12,2)",
                precision: 12,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.CreateTable(
                name: "expense_days",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    territory_id = table.Column<Guid>(type: "uuid", nullable: true),
                    day = table.Column<DateOnly>(type: "date", nullable: false),
                    note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    note_changed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    note_updated_by_id = table.Column<Guid>(type: "uuid", nullable: true),
                    manager_note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    manager_note_changed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    manager_note_by_id = table.Column<Guid>(type: "uuid", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_expense_days", x => x.id);
                    table.ForeignKey(
                        name: "fk_expense_days_asp_net_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "expense_lines",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    territory_id = table.Column<Guid>(type: "uuid", nullable: true),
                    day = table.Column<DateOnly>(type: "date", nullable: false),
                    city_id = table.Column<Guid>(type: "uuid", nullable: false),
                    amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    original_amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    source = table.Column<int>(type: "integer", nullable: false),
                    note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    amount_changed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    note_changed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by_id = table.Column<Guid>(type: "uuid", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    updated_by_id = table.Column<Guid>(type: "uuid", nullable: true),
                    archived_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    archived_by_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_expense_lines", x => x.id);
                    table.ForeignKey(
                        name: "fk_expense_lines_asp_net_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_expense_lines_territories_city_id",
                        column: x => x.city_id,
                        principalTable: "territories",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_expense_days_user_id_day",
                table: "expense_days",
                columns: new[] { "user_id", "day" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_expense_lines_city_id",
                table: "expense_lines",
                column: "city_id");

            migrationBuilder.CreateIndex(
                name: "ix_expense_lines_day_user_id",
                table: "expense_lines",
                columns: new[] { "day", "user_id" });

            migrationBuilder.CreateIndex(
                name: "ix_expense_lines_user_id_day",
                table: "expense_lines",
                columns: new[] { "user_id", "day" });

            migrationBuilder.CreateIndex(
                name: "ux_expense_lines_auto_per_day",
                table: "expense_lines",
                columns: new[] { "user_id", "day", "city_id" },
                unique: true,
                filter: "source = 1");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "expense_days");

            migrationBuilder.DropTable(
                name: "expense_lines");

            migrationBuilder.DropColumn(
                name: "default_daily_expense",
                table: "territories");
        }
    }
}
