using Microsoft.AspNetCore.Mvc;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Stats;
using OriginalPharma.Infrastructure.Identity;

namespace OriginalPharma.Api.Modules.Stats;

/// <summary>
/// Statistics aggregated on the server inside the caller's stats:read scope (own, team, territory, all).
/// The same filters apply to every section; the CSV export needs stats:export.
/// </summary>
[ApiController]
[Route("api/stats")]
[Tags("Stats")]
public sealed class StatsController(StatsService stats) : ControllerBase
{
    [HttpGet("orders")]
    [HasPermission(Permissions.Stats.Read)]
    public Task<OrderStatsDto> Orders([FromQuery] StatsQuery query, CancellationToken cancellationToken) =>
        stats.OrdersAsync(query, cancellationToken);

    [HttpGet("visits")]
    [HasPermission(Permissions.Stats.Read)]
    public Task<VisitStatsDto> Visits([FromQuery] StatsQuery query, CancellationToken cancellationToken) =>
        stats.VisitsAsync(query, cancellationToken);

    [HttpGet("doctors")]
    [HasPermission(Permissions.Stats.Read)]
    public Task<DoctorStatsDto> Doctors([FromQuery] StatsQuery query, CancellationToken cancellationToken) =>
        stats.DoctorsAsync(query, cancellationToken);

    [HttpGet("reps")]
    [HasPermission(Permissions.Stats.Read)]
    public Task<RepStatsDto> Reps([FromQuery] StatsQuery query, CancellationToken cancellationToken) =>
        stats.RepsAsync(query, cancellationToken);

    [HttpGet("catalog")]
    [HasPermission(Permissions.Stats.Read)]
    public Task<CatalogStatsDto> Catalog([FromQuery] StatsQuery query, CancellationToken cancellationToken) =>
        stats.CatalogAsync(query, cancellationToken);

    /// <summary>One table of a section as CSV (UTF-8). <c>section</c>: orders, visits, doctors, reps, catalog; <c>lang</c>: ar or en.</summary>
    [HttpGet("export")]
    [HasPermission(Permissions.Stats.Export)]
    [Produces("text/csv")]
    [ProducesResponseType(typeof(Stream), StatusCodes.Status200OK, "text/csv")]
    public async Task<IActionResult> Export(
        [FromQuery] StatsSection section,
        [FromQuery] string table,
        [FromQuery] StatsQuery query,
        [FromQuery] string? lang,
        CancellationToken cancellationToken)
    {
        if (!StatsCsv.Tables.TryGetValue(section, out var tables) || !tables.Contains(table))
        {
            throw new BusinessRuleException("stats_table_unknown", $"Unknown table '{table}'.");
        }

        object data = section switch
        {
            StatsSection.Orders => await stats.OrdersAsync(query, cancellationToken),
            StatsSection.Visits => await stats.VisitsAsync(query, cancellationToken),
            StatsSection.Doctors => await stats.DoctorsAsync(query, cancellationToken),
            StatsSection.Reps => await stats.RepsAsync(query, cancellationToken),
            _ => await stats.CatalogAsync(query, cancellationToken),
        };
        var csv = StatsCsv.Build(data, table, lang ?? "en");
        return File(csv, "text/csv; charset=utf-8", $"{section.ToString().ToLowerInvariant()}-{table}-{DateTime.UtcNow:yyyyMMdd-HHmm}.csv");
    }
}
