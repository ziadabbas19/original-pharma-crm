using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OriginalPharma.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddArchivingFeedbackNotificationsDelivery : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "archived_at",
                table: "visits",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "archived_by_id",
                table: "visits",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "content_updated_at",
                table: "visits",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "archived_at",
                table: "users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "archived_by_id",
                table: "users",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "archived_at",
                table: "territories",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "archived_at",
                table: "specialties",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "product_line_id",
                table: "products",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "archived_at",
                table: "products",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "archived_by_id",
                table: "products",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "default_discount_percent",
                table: "products",
                type: "numeric(5,2)",
                precision: 5,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "max_discount_percent",
                table: "products",
                type: "numeric(5,2)",
                precision: 5,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "default_discount_percent",
                table: "product_lines",
                type: "numeric(5,2)",
                precision: 5,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "max_discount_percent",
                table: "product_lines",
                type: "numeric(5,2)",
                precision: 5,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "updated_at",
                table: "product_lines",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "archived_at",
                table: "orders",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "archived_by_id",
                table: "orders",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "decided_at",
                table: "orders",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "decided_by_id",
                table: "orders",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "decided_by_name",
                table: "orders",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "delivered_at",
                table: "orders",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "delivered_by_id",
                table: "orders",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "delivered_by_name",
                table: "orders",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "delivery",
                table: "orders",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "delivery_note",
                table: "orders",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "internal_note",
                table: "order_history",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "archived_at",
                table: "customers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "archived_by_id",
                table: "customers",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "archived_at",
                table: "collection_methods",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "audit_entries",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    entity_type = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    entity_id = table.Column<Guid>(type: "uuid", nullable: true),
                    action = table.Column<int>(type: "integer", nullable: false),
                    actor_id = table.Column<Guid>(type: "uuid", nullable: true),
                    actor_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    count = table.Column<int>(type: "integer", nullable: false),
                    details = table.Column<string>(type: "jsonb", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_audit_entries", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "notifications",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    type = table.Column<int>(type: "integer", nullable: false),
                    entity_id = table.Column<Guid>(type: "uuid", nullable: true),
                    data = table.Column<string>(type: "jsonb", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    read_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_notifications", x => x.id);
                    table.ForeignKey(
                        name: "fk_notifications_asp_net_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "visit_feedback",
                columns: table => new
                {
                    visit_id = table.Column<Guid>(type: "uuid", nullable: false),
                    text = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    category = table.Column<int>(type: "integer", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_visit_feedback", x => x.visit_id);
                    table.ForeignKey(
                        name: "fk_visit_feedback_visits_visit_id",
                        column: x => x.visit_id,
                        principalTable: "visits",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "visit_feedback_replies",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    visit_id = table.Column<Guid>(type: "uuid", nullable: false),
                    author_id = table.Column<Guid>(type: "uuid", nullable: false),
                    author_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    text = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_visit_feedback_replies", x => x.id);
                    table.ForeignKey(
                        name: "fk_visit_feedback_replies_visits_visit_id",
                        column: x => x.visit_id,
                        principalTable: "visits",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "visit_products",
                columns: table => new
                {
                    visit_id = table.Column<Guid>(type: "uuid", nullable: false),
                    product_id = table.Column<Guid>(type: "uuid", nullable: false),
                    note = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    sort_order = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_visit_products", x => new { x.visit_id, x.product_id });
                    table.ForeignKey(
                        name: "fk_visit_products_products_product_id",
                        column: x => x.product_id,
                        principalTable: "products",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_visit_products_visits_visit_id",
                        column: x => x.visit_id,
                        principalTable: "visits",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "visit_feedback_seen",
                columns: table => new
                {
                    visit_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    seen_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_visit_feedback_seen", x => new { x.visit_id, x.user_id });
                    table.ForeignKey(
                        name: "fk_visit_feedback_seen_visit_feedback_visit_id",
                        column: x => x.visit_id,
                        principalTable: "visit_feedback",
                        principalColumn: "visit_id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_visits_territory_id_check_in_at",
                table: "visits",
                columns: new[] { "territory_id", "check_in_at" });

            migrationBuilder.CreateIndex(
                name: "ix_shifts_user_id_started_at",
                table: "shifts",
                columns: new[] { "user_id", "started_at" });

            migrationBuilder.CreateIndex(
                name: "ix_audit_entries_created_at",
                table: "audit_entries",
                column: "created_at");

            migrationBuilder.CreateIndex(
                name: "ix_audit_entries_entity_type_entity_id_created_at",
                table: "audit_entries",
                columns: new[] { "entity_type", "entity_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_notifications_user_id_created_at",
                table: "notifications",
                columns: new[] { "user_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_notifications_user_id_entity_id",
                table: "notifications",
                columns: new[] { "user_id", "entity_id" });

            migrationBuilder.CreateIndex(
                name: "ix_notifications_user_id_read_at",
                table: "notifications",
                columns: new[] { "user_id", "read_at" });

            migrationBuilder.CreateIndex(
                name: "ix_visit_feedback_category",
                table: "visit_feedback",
                column: "category");

            migrationBuilder.CreateIndex(
                name: "ix_visit_feedback_replies_visit_id_created_at",
                table: "visit_feedback_replies",
                columns: new[] { "visit_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_visit_products_product_id",
                table: "visit_products",
                column: "product_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "audit_entries");

            migrationBuilder.DropTable(
                name: "notifications");

            migrationBuilder.DropTable(
                name: "visit_feedback_replies");

            migrationBuilder.DropTable(
                name: "visit_feedback_seen");

            migrationBuilder.DropTable(
                name: "visit_products");

            migrationBuilder.DropTable(
                name: "visit_feedback");

            migrationBuilder.DropIndex(
                name: "ix_visits_territory_id_check_in_at",
                table: "visits");

            migrationBuilder.DropIndex(
                name: "ix_shifts_user_id_started_at",
                table: "shifts");

            migrationBuilder.DropColumn(
                name: "archived_at",
                table: "visits");

            migrationBuilder.DropColumn(
                name: "archived_by_id",
                table: "visits");

            migrationBuilder.DropColumn(
                name: "content_updated_at",
                table: "visits");

            migrationBuilder.DropColumn(
                name: "archived_at",
                table: "users");

            migrationBuilder.DropColumn(
                name: "archived_by_id",
                table: "users");

            migrationBuilder.DropColumn(
                name: "archived_at",
                table: "territories");

            migrationBuilder.DropColumn(
                name: "archived_at",
                table: "specialties");

            migrationBuilder.DropColumn(
                name: "archived_at",
                table: "products");

            migrationBuilder.DropColumn(
                name: "archived_by_id",
                table: "products");

            migrationBuilder.DropColumn(
                name: "default_discount_percent",
                table: "products");

            migrationBuilder.DropColumn(
                name: "max_discount_percent",
                table: "products");

            migrationBuilder.DropColumn(
                name: "default_discount_percent",
                table: "product_lines");

            migrationBuilder.DropColumn(
                name: "max_discount_percent",
                table: "product_lines");

            migrationBuilder.DropColumn(
                name: "updated_at",
                table: "product_lines");

            migrationBuilder.DropColumn(
                name: "archived_at",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "archived_by_id",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "decided_at",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "decided_by_id",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "decided_by_name",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "delivered_at",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "delivered_by_id",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "delivered_by_name",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "delivery",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "delivery_note",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "internal_note",
                table: "order_history");

            migrationBuilder.DropColumn(
                name: "archived_at",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "archived_by_id",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "archived_at",
                table: "collection_methods");

            migrationBuilder.AlterColumn<Guid>(
                name: "product_line_id",
                table: "products",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);
        }
    }
}
