using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OriginalPharma.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddWeeklyPlans : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "weekly_plans",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    territory_id = table.Column<Guid>(type: "uuid", nullable: true),
                    week_start = table.Column<DateOnly>(type: "date", nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false),
                    review_note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    reviewed_by_id = table.Column<Guid>(type: "uuid", nullable: true),
                    reviewed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    submitted_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    version = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_weekly_plans", x => x.id);
                    table.ForeignKey(
                        name: "fk_weekly_plans_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "weekly_plan_days",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    plan_id = table.Column<Guid>(type: "uuid", nullable: false),
                    day = table.Column<DateOnly>(type: "date", nullable: false),
                    city_id = table.Column<Guid>(type: "uuid", nullable: false),
                    target_visits = table.Column<int>(type: "integer", nullable: false),
                    note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_weekly_plan_days", x => x.id);
                    table.CheckConstraint("ck_weekly_plan_days_target", "target_visits BETWEEN 0 AND 100");
                    table.ForeignKey(
                        name: "fk_weekly_plan_days_territories_city_id",
                        column: x => x.city_id,
                        principalTable: "territories",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_weekly_plan_days_weekly_plans_plan_id",
                        column: x => x.plan_id,
                        principalTable: "weekly_plans",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "weekly_plan_events",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    plan_id = table.Column<Guid>(type: "uuid", nullable: false),
                    from_status = table.Column<int>(type: "integer", nullable: true),
                    to_status = table.Column<int>(type: "integer", nullable: false),
                    actor_id = table.Column<Guid>(type: "uuid", nullable: true),
                    actor_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_weekly_plan_events", x => x.id);
                    table.ForeignKey(
                        name: "fk_weekly_plan_events_weekly_plans_plan_id",
                        column: x => x.plan_id,
                        principalTable: "weekly_plans",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "weekly_plan_customers",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    plan_day_id = table.Column<Guid>(type: "uuid", nullable: false),
                    customer_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_weekly_plan_customers", x => x.id);
                    table.ForeignKey(
                        name: "fk_weekly_plan_customers_customers_customer_id",
                        column: x => x.customer_id,
                        principalTable: "customers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_weekly_plan_customers_weekly_plan_days_plan_day_id",
                        column: x => x.plan_day_id,
                        principalTable: "weekly_plan_days",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_weekly_plan_customers_customer_id",
                table: "weekly_plan_customers",
                column: "customer_id");

            migrationBuilder.CreateIndex(
                name: "ix_weekly_plan_customers_plan_day_id_customer_id",
                table: "weekly_plan_customers",
                columns: new[] { "plan_day_id", "customer_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_weekly_plan_days_city_id",
                table: "weekly_plan_days",
                column: "city_id");

            migrationBuilder.CreateIndex(
                name: "ix_weekly_plan_days_plan_id_day",
                table: "weekly_plan_days",
                columns: new[] { "plan_id", "day" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_weekly_plan_events_plan_id_created_at",
                table: "weekly_plan_events",
                columns: new[] { "plan_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_weekly_plans_status_week_start",
                table: "weekly_plans",
                columns: new[] { "status", "week_start" });

            migrationBuilder.CreateIndex(
                name: "ix_weekly_plans_user_id_week_start",
                table: "weekly_plans",
                columns: new[] { "user_id", "week_start" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "weekly_plan_customers");

            migrationBuilder.DropTable(
                name: "weekly_plan_events");

            migrationBuilder.DropTable(
                name: "weekly_plan_days");

            migrationBuilder.DropTable(
                name: "weekly_plans");
        }
    }
}
