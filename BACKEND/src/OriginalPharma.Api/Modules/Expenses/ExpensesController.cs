using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OriginalPharma.Application.Expenses;
using OriginalPharma.Application.Identity;
using OriginalPharma.Infrastructure.Identity;

namespace OriginalPharma.Api.Modules.Expenses;

/// <summary>
/// Daily expenses per city. A rep reads and changes their own (expenses:read-own, expenses:write-own);
/// managers read the reps in their scope (expenses:read) and change them (expenses:manage). Every
/// action checks who the expenses belong to; the attributes only keep out people with none of these.
/// </summary>
[ApiController]
[Route("api/expenses")]
[Tags("Expenses")]
[Authorize]
public sealed class ExpensesController(ExpenseService expenses) : ControllerBase
{
    /// <summary>One day of a rep (yourself when <c>userId</c> is empty): lines, total, notes and the month total.</summary>
    [HttpGet("day")]
    public Task<ExpenseDayDto> Day([FromQuery] DateOnly day, CancellationToken cancellationToken, [FromQuery] Guid? userId = null) =>
        expenses.GetDayAsync(day, userId, cancellationToken);

    /// <summary>A rep's calendar month (<c>month</c> = yyyy-MM): total, days, per city, per day and the statement.</summary>
    [HttpGet("month")]
    public Task<ExpenseMonthDto> Month([FromQuery] string month, CancellationToken cancellationToken, [FromQuery] Guid? userId = null) =>
        expenses.GetMonthAsync(month, userId, cancellationToken);

    /// <summary>Add a line by hand. 409 <c>expense_city_exists</c> when the day already has one for the city.</summary>
    [HttpPost("lines")]
    public Task<ExpenseLineDto> CreateLine(CreateExpenseLineRequest request, CancellationToken cancellationToken) =>
        expenses.CreateLineAsync(request, cancellationToken);

    /// <summary>Change a line's amount and/or note (each keeps its latest change when <c>changedAt</c> is given).</summary>
    [HttpPut("lines/{id:guid}")]
    public Task<ExpenseLineDto> UpdateLine(Guid id, UpdateExpenseLineRequest request, CancellationToken cancellationToken) =>
        expenses.UpdateLineAsync(id, request, cancellationToken);

    /// <summary>Remove a line (kept for the activity log; an automatic line does not come back that day).</summary>
    [HttpDelete("lines/{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> RemoveLine(Guid id, CancellationToken cancellationToken)
    {
        await expenses.RemoveLineAsync(id, cancellationToken);
        return NoContent();
    }

    /// <summary>The rep's note for a day (<c>note</c>) or a manager's note on it (<c>managerNote</c>).</summary>
    [HttpPut("days/{day}/note")]
    public Task<ExpenseDayDto> SetDayNote(DateOnly day, SetExpenseDayNoteRequest request, CancellationToken cancellationToken) =>
        expenses.SetDayNoteAsync(day, request, cancellationToken);

    /// <summary>Lines of the reps in scope between two days (at most 92), with totals per rep, city and day.</summary>
    [HttpGet]
    [HasPermission(Permissions.Expenses.Read)]
    public Task<ExpenseReportDto> Report(
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        CancellationToken cancellationToken,
        [FromQuery] Guid? userId = null,
        [FromQuery] Guid? cityId = null) =>
        expenses.ReportAsync(from, to, userId, cityId, cancellationToken);

    /// <summary>A calendar month (yyyy-MM) for everyone in scope: totals per rep (with the grand total), per city and per day.</summary>
    [HttpGet("month-report")]
    [HasPermission(Permissions.Expenses.Read)]
    public Task<ExpenseReportDto> MonthReport(
        [FromQuery] string month,
        CancellationToken cancellationToken,
        [FromQuery] Guid? userId = null,
        [FromQuery] Guid? cityId = null) =>
        expenses.MonthReportAsync(month, userId, cityId, cancellationToken);

    /// <summary>The lines of a range as CSV (UTF-8). <c>lang</c> = ar or en.</summary>
    [HttpGet("export")]
    [HasPermission(Permissions.Expenses.Read)]
    [Produces("text/csv")]
    [ProducesResponseType(typeof(Stream), StatusCodes.Status200OK, "text/csv")]
    public async Task<IActionResult> Export(
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        CancellationToken cancellationToken,
        [FromQuery] Guid? userId = null,
        [FromQuery] Guid? cityId = null,
        [FromQuery] string? lang = null)
    {
        var report = await expenses.ReportAsync(from, to, userId, cityId, cancellationToken);
        return File(ExpenseCsv.Lines(report, lang ?? "en"), "text/csv; charset=utf-8", $"expenses-{from:yyyyMMdd}-{to:yyyyMMdd}.csv");
    }

    /// <summary>
    /// Monthly statements as CSV: one rep (<c>userId</c>, yourself included), or every rep in your
    /// expenses:read scope with expenses that month.
    /// </summary>
    [HttpGet("statement")]
    [Produces("text/csv")]
    [ProducesResponseType(typeof(Stream), StatusCodes.Status200OK, "text/csv")]
    public async Task<IActionResult> Statement(
        [FromQuery] string month,
        CancellationToken cancellationToken,
        [FromQuery] Guid? userId = null,
        [FromQuery] string? lang = null)
    {
        var statements = await expenses.StatementsAsync(month, userId, cancellationToken);
        return File(ExpenseCsv.Statements(statements, lang ?? "en"), "text/csv; charset=utf-8", $"expenses-statement-{month}.csv");
    }
}
