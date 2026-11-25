using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OriginalPharma.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddUserHomeShortcuts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "user_home_shortcuts",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    keys = table.Column<string>(type: "jsonb", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_user_home_shortcuts", x => x.user_id);
                    table.ForeignKey(
                        name: "fk_user_home_shortcuts_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "user_home_shortcuts");
        }
    }
}
