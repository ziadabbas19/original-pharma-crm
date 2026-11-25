using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OriginalPharma.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRepTownExpenseDefaults : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "rep_town_expense_defaults",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    territory_id = table.Column<Guid>(type: "uuid", nullable: false),
                    amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_rep_town_expense_defaults", x => new { x.user_id, x.territory_id });
                    table.ForeignKey(
                        name: "fk_rep_town_expense_defaults_asp_net_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_rep_town_expense_defaults_territories_territory_id",
                        column: x => x.territory_id,
                        principalTable: "territories",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_rep_town_expense_defaults_territory_id",
                table: "rep_town_expense_defaults",
                column: "territory_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "rep_town_expense_defaults");
        }
    }
}
