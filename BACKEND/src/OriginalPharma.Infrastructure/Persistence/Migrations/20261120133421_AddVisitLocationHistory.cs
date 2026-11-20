using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OriginalPharma.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddVisitLocationHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "check_in_device_time",
                table: "visits",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "check_in_good_fix",
                table: "visits",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<List<string>>(
                name: "check_in_signal_codes",
                table: "visits",
                type: "text[]",
                nullable: false,
                defaultValueSql: "'{}'::text[]");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "check_out_device_time",
                table: "visits",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<List<string>>(
                name: "check_out_signal_codes",
                table: "visits",
                type: "text[]",
                nullable: false,
                defaultValueSql: "'{}'::text[]");

            migrationBuilder.AddColumn<double>(
                name: "clinic_distance_meters",
                table: "visits",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "clinic_location_outcome",
                table: "visits",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<List<string>>(
                name: "drift_sources",
                table: "visits",
                type: "text[]",
                nullable: false,
                defaultValueSql: "'{}'::text[]");

            migrationBuilder.AddColumn<bool>(
                name: "location_drift",
                table: "visits",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<double>(
                name: "median_distance_meters",
                table: "visits",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "nearest_visit_distance_meters",
                table: "visits",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "previous_visit_distance_meters",
                table: "visits",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "previous_visit_id",
                table: "visits",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "reference_visit_count",
                table: "visits",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<double>(
                name: "since_previous_visit_seconds",
                table: "visits",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "location_accuracy_meters",
                table: "customers",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "location_captured_at",
                table: "customers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "location_captured_by_id",
                table: "customers",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "location_source",
                table: "customers",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "location_visit_id",
                table: "customers",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_visits_customer_id_check_in_at",
                table: "visits",
                columns: new[] { "customer_id", "check_in_at" });

            // Visits recorded before this change were measured against the saved location; demo visits of
            // customers that still have none were not.
            migrationBuilder.Sql("""
                UPDATE visits v SET clinic_distance_meters = v.check_in_distance_meters
                FROM customers c WHERE c.id = v.customer_id AND c.location IS NOT NULL;
                UPDATE visits v SET clinic_location_outcome = 3
                FROM customers c WHERE c.id = v.customer_id AND c.location IS NULL;
                """);

            // Earlier check-ins become references for new visits only when nothing was wrong with their fix
            // (the default weak-fix limit of 100 m; the setting of that day is not known) and they were
            // recorded at the saved location.
            migrationBuilder.Sql("""
                UPDATE visits v SET check_in_good_fix = TRUE
                FROM customers c
                WHERE c.id = v.customer_id AND c.location IS NOT NULL
                  AND NOT v.check_in_is_mock AND v.check_in_accuracy <= 100 AND NOT ('low-trust' = ANY(v.trust_reasons))
                  AND ST_DWithin(v.check_in_location, c.location, c.geofence_radius_meters + 50);
                """);

            // Until now only managers could save a location.
            migrationBuilder.Sql("""
                UPDATE customers SET location_source = 1, location_captured_at = COALESCE(updated_at, created_at)
                WHERE location IS NOT NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_visits_customer_id_check_in_at",
                table: "visits");

            migrationBuilder.DropColumn(
                name: "check_in_device_time",
                table: "visits");

            migrationBuilder.DropColumn(
                name: "check_in_good_fix",
                table: "visits");

            migrationBuilder.DropColumn(
                name: "check_in_signal_codes",
                table: "visits");

            migrationBuilder.DropColumn(
                name: "check_out_device_time",
                table: "visits");

            migrationBuilder.DropColumn(
                name: "check_out_signal_codes",
                table: "visits");

            migrationBuilder.DropColumn(
                name: "clinic_distance_meters",
                table: "visits");

            migrationBuilder.DropColumn(
                name: "clinic_location_outcome",
                table: "visits");

            migrationBuilder.DropColumn(
                name: "drift_sources",
                table: "visits");

            migrationBuilder.DropColumn(
                name: "location_drift",
                table: "visits");

            migrationBuilder.DropColumn(
                name: "median_distance_meters",
                table: "visits");

            migrationBuilder.DropColumn(
                name: "nearest_visit_distance_meters",
                table: "visits");

            migrationBuilder.DropColumn(
                name: "previous_visit_distance_meters",
                table: "visits");

            migrationBuilder.DropColumn(
                name: "previous_visit_id",
                table: "visits");

            migrationBuilder.DropColumn(
                name: "reference_visit_count",
                table: "visits");

            migrationBuilder.DropColumn(
                name: "since_previous_visit_seconds",
                table: "visits");

            migrationBuilder.DropColumn(
                name: "location_accuracy_meters",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "location_captured_at",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "location_captured_by_id",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "location_source",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "location_visit_id",
                table: "customers");
        }
    }
}
