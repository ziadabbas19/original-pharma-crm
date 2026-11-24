using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OriginalPharma.Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// Search forms of customer names (name_search, name_ar_search), filled for every existing row, and
    /// rep doctor lists completed: a doctor that is on nobody's list goes on the list of the user who
    /// added it. Plain SQL only (no extension), safe to run again.
    /// </summary>
    public partial class AddRepDoctorListsAndNameSearch : Migration
    {
        /// <summary>
        /// CustomerNameSearch.Normalize in SQL: lower case, Arabic diacritics and tatweel removed, letter
        /// forms unified, white space collapsed, a leading title dropped.
        /// </summary>
        public static string NormalizeSql(string column) => $$"""
            btrim(regexp_replace(
              btrim(regexp_replace(
                translate(regexp_replace(lower({{column}}), '[\u064B-\u065F\u0670\u0640]', '', 'g'), 'أإآٱىئةؤ', 'ااااييهو'),
                '\s+', ' ', 'g')),
              '^(دكتوره|دكتور|د|dr)(\s*[./]\s*|\s+)', ''))
            """;

        /// <summary>Fills the search columns of every customer (idempotent).</summary>
        public static string BackfillNameSearchSql => $"""
            UPDATE customers SET
              name_search = coalesce({NormalizeSql("name")}, ''),
              name_ar_search = CASE WHEN name_ar IS NULL OR name_ar ~ '^\s*$' THEN NULL ELSE {NormalizeSql("name_ar")} END;
            """;

        /// <summary>Doctors on nobody's list go on their creator's list (idempotent: never adds a pair twice).</summary>
        public const string BackfillRepDoctorsSql = """
            INSERT INTO rep_doctors (id, user_id, customer_id, assigned_at, assigned_by_id)
            SELECT gen_random_uuid(), c.created_by_id, c.id, c.created_at, c.created_by_id
            FROM customers c
            JOIN users u ON u.id = c.created_by_id AND u.is_active
            WHERE c.type = 1
              AND c.archived_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM rep_doctors r WHERE r.customer_id = c.id)
            ON CONFLICT (user_id, customer_id) DO NOTHING;
            """;

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "name_ar_search",
                table: "customers",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "name_search",
                table: "customers",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.Sql(BackfillNameSearchSql);
            migrationBuilder.Sql(BackfillRepDoctorsSql);

            migrationBuilder.CreateIndex(
                name: "ix_customers_name_ar_search",
                table: "customers",
                column: "name_ar_search")
                .Annotation("Npgsql:IndexOperators", new[] { "text_pattern_ops" });

            migrationBuilder.CreateIndex(
                name: "ix_customers_name_search",
                table: "customers",
                column: "name_search")
                .Annotation("Npgsql:IndexOperators", new[] { "text_pattern_ops" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_customers_name_ar_search",
                table: "customers");

            migrationBuilder.DropIndex(
                name: "ix_customers_name_search",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "name_ar_search",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "name_search",
                table: "customers");
        }
    }
}
