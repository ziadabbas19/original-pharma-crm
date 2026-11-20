using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OriginalPharma.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddVisitOnlyVisibility : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "outside_visit_window",
                table: "location_points",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "ix_location_points_outside_visit_window",
                table: "location_points",
                column: "recorded_at",
                filter: "outside_visit_window");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_location_points_outside_visit_window",
                table: "location_points");

            migrationBuilder.DropColumn(
                name: "outside_visit_window",
                table: "location_points");
        }
    }
}
