using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OriginalPharma.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddUserSessions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "user_sessions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    client = table.Column<int>(type: "integer", nullable: false),
                    device_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    device_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    user_agent = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    is_background = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    last_used_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    absolute_expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by_ip = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    last_ip = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    revoked_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    revoked_reason = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_user_sessions", x => x.id);
                    table.ForeignKey(
                        name: "fk_user_sessions_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_user_sessions_user_id_device_id",
                table: "user_sessions",
                columns: new[] { "user_id", "device_id" });

            migrationBuilder.CreateIndex(
                name: "ix_user_sessions_user_id_revoked_at",
                table: "user_sessions",
                columns: new[] { "user_id", "revoked_at" });

            // Devices signed in before this release keep their session: one row per token family that
            // still has a usable token, started when the family's first token was issued. The 90 days
            // match the default Auth:SessionMaxDays.
            migrationBuilder.Sql("""
                INSERT INTO user_sessions (id, user_id, client, device_id, is_background, created_at, last_used_at,
                                           expires_at, absolute_expires_at, created_by_ip, last_ip)
                SELECT f.family_id, f.user_id, f.client, f.device_id, false, f.started, f.last_used,
                       f.expires, f.started + interval '90 days', f.ip, f.ip
                FROM (
                    SELECT family_id,
                           (array_agg(user_id))[1] AS user_id,
                           (array_agg(client ORDER BY created_at DESC))[1] AS client,
                           (array_agg(device_id ORDER BY created_at DESC))[1] AS device_id,
                           (array_agg(created_by_ip ORDER BY created_at))[1] AS ip,
                           MIN(created_at) AS started,
                           MAX(created_at) AS last_used,
                           MAX(expires_at) AS expires,
                           bool_or(revoked_at IS NULL AND expires_at > now()) AS usable
                    FROM refresh_tokens
                    GROUP BY family_id
                ) f
                WHERE f.usable;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "user_sessions");
        }
    }
}
