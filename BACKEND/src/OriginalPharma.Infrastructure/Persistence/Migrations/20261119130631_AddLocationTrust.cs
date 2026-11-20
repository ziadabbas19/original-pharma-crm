using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OriginalPharma.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddLocationTrust : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<List<string>>(
                name: "trust_reasons",
                table: "visits",
                type: "text[]",
                nullable: false,
                defaultValueSql: "'{}'::text[]");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "last_seen_at",
                table: "tracking_flags",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "location_point_id",
                table: "tracking_flags",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "occurrences",
                table: "tracking_flags",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<Guid>(
                name: "visit_id",
                table: "tracking_flags",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "activity_confidence",
                table: "location_points",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "activity_type",
                table: "location_points",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "altitude",
                table: "location_points",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "device_signals",
                table: "location_points",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "device_time",
                table: "location_points",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "trust_reason",
                table: "location_points",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "trust_status",
                table: "location_points",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            // Existing points start trusted (column default) and take the status their stored anomaly
            // codes already imply: impossible movement is rejected, a mock fix or a synthetic-looking fix is
            // suspicious. Nothing is deleted. The heaviest reason wins, as at ingest.
            migrationBuilder.Sql("""
                UPDATE location_points SET trust_status = 3, trust_reason = 'teleport'
                WHERE 'teleport' = ANY(anomaly_codes);
                UPDATE location_points SET trust_status = 3, trust_reason = 'impossible-speed'
                WHERE trust_status = 1 AND 'impossible-speed' = ANY(anomaly_codes);
                UPDATE location_points SET trust_status = 2, trust_reason = 'mock-location'
                WHERE trust_status = 1 AND (is_mock OR 'mock-location' = ANY(anomaly_codes));
                UPDATE location_points SET trust_status = 2, trust_reason = 'future-timestamp'
                WHERE trust_status = 1 AND 'future-timestamp' = ANY(anomaly_codes);
                UPDATE location_points SET trust_status = 2, trust_reason = 'clock-drift'
                WHERE trust_status = 1 AND 'clock-drift' = ANY(anomaly_codes);
                UPDATE location_points SET trust_status = 2, trust_reason = 'perfect-accuracy'
                WHERE trust_status = 1 AND 'perfect-accuracy' = ANY(anomaly_codes);
                UPDATE location_points SET trust_status = 2, trust_reason = 'repeated-accuracy'
                WHERE trust_status = 1 AND 'repeated-accuracy' = ANY(anomaly_codes);
                """);

            migrationBuilder.CreateTable(
                name: "app_settings",
                columns: table => new
                {
                    key = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    value = table.Column<string>(type: "jsonb", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_by_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_app_settings", x => x.key);
                });

            migrationBuilder.CreateIndex(
                name: "ix_tracking_flags_user_id_created_at",
                table: "tracking_flags",
                columns: new[] { "user_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_tracking_flags_visit_id",
                table: "tracking_flags",
                column: "visit_id",
                filter: "visit_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_location_points_device_signals",
                table: "location_points",
                column: "recorded_at",
                filter: "device_signals IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_location_points_untrusted",
                table: "location_points",
                columns: new[] { "user_id", "recorded_at" },
                filter: "trust_status <> 1");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "app_settings");

            migrationBuilder.DropIndex(
                name: "ix_tracking_flags_user_id_created_at",
                table: "tracking_flags");

            migrationBuilder.DropIndex(
                name: "ix_tracking_flags_visit_id",
                table: "tracking_flags");

            migrationBuilder.DropIndex(
                name: "ix_location_points_device_signals",
                table: "location_points");

            migrationBuilder.DropIndex(
                name: "ix_location_points_untrusted",
                table: "location_points");

            migrationBuilder.DropColumn(
                name: "trust_reasons",
                table: "visits");

            migrationBuilder.DropColumn(
                name: "last_seen_at",
                table: "tracking_flags");

            migrationBuilder.DropColumn(
                name: "location_point_id",
                table: "tracking_flags");

            migrationBuilder.DropColumn(
                name: "occurrences",
                table: "tracking_flags");

            migrationBuilder.DropColumn(
                name: "visit_id",
                table: "tracking_flags");

            migrationBuilder.DropColumn(
                name: "activity_confidence",
                table: "location_points");

            migrationBuilder.DropColumn(
                name: "activity_type",
                table: "location_points");

            migrationBuilder.DropColumn(
                name: "altitude",
                table: "location_points");

            migrationBuilder.DropColumn(
                name: "device_signals",
                table: "location_points");

            migrationBuilder.DropColumn(
                name: "device_time",
                table: "location_points");

            migrationBuilder.DropColumn(
                name: "trust_reason",
                table: "location_points");

            migrationBuilder.DropColumn(
                name: "trust_status",
                table: "location_points");
        }
    }
}
