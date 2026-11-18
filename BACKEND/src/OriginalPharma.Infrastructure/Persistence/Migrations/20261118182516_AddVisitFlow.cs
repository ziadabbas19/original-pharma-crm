using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OriginalPharma.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddVisitFlow : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "check_out_client_request_id",
                table: "visits",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "visit_id",
                table: "orders",
                type: "uuid",
                nullable: true);

            // Two check-ins at the same moment could leave a rep with two open visits before this rule:
            // the newest stays open and the older ones are closed as cancelled.
            migrationBuilder.Sql("""
                UPDATE visits AS older
                SET status = 3
                WHERE older.status = 1
                  AND older.archived_at IS NULL
                  AND EXISTS (
                      SELECT 1 FROM visits AS newer
                      WHERE newer.user_id = older.user_id
                        AND newer.status = 1
                        AND newer.archived_at IS NULL
                        AND (newer.check_in_at, newer.id) > (older.check_in_at, older.id));
                """);

            migrationBuilder.CreateIndex(
                name: "ux_visits_one_in_progress_per_user",
                table: "visits",
                column: "user_id",
                unique: true,
                filter: "status = 1 AND archived_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ix_orders_visit_id",
                table: "orders",
                column: "visit_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_visits_one_in_progress_per_user",
                table: "visits");

            migrationBuilder.DropIndex(
                name: "ix_orders_visit_id",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "check_out_client_request_id",
                table: "visits");

            migrationBuilder.DropColumn(
                name: "visit_id",
                table: "orders");
        }
    }
}
