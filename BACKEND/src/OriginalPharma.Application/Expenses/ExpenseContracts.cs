using FluentValidation;
using OriginalPharma.Domain.Expenses;

namespace OriginalPharma.Application.Expenses;

/// <summary>Section <c>Expenses</c> (environment: <c>Expenses__EditableDays</c>, ...).</summary>
public sealed class ExpenseOptions
{
    public const string SectionName = "Expenses";

    /// <summary>How many days back (from today) a rep may still change their own expenses. Older days are read-only for them.</summary>
    public int EditableDays { get; set; } = 45;

    /// <summary>Largest amount accepted for one line (EGP).</summary>
    public decimal MaxAmount { get; set; } = 100_000m;
}

public static class ExpenseErrorCodes
{
    /// <summary>Expenses cannot be entered for a day that has not come yet.</summary>
    public const string FutureDay = "expense_future_day";

    /// <summary>The day is older than the editable window; a manager can still change it.</summary>
    public const string DayLocked = "expense_day_locked";

    /// <summary>The city does not exist (or is archived).</summary>
    public const string CityInvalid = "expense_city_invalid";

    /// <summary>The day already has a line for this city: change that one instead.</summary>
    public const string CityExists = "expense_city_exists";
}

/// <summary>auto: the city's default amount, untouched; edited: an automatic line whose amount was changed; manual: added by hand.</summary>
public enum ExpenseLineKind
{
    Auto = 1,
    Edited = 2,
    Manual = 3,
}

public sealed record ExpenseLineDto(
    Guid Id,
    Guid UserId,
    string UserName,
    DateOnly Day,
    Guid CityId,
    string CityName,
    string? CityNameAr,
    decimal Amount,
    decimal? OriginalAmount,
    ExpenseLineKind Kind,
    string? Note,
    DateTimeOffset CreatedAt,
    DateTimeOffset? UpdatedAt,
    string? UpdatedByName);

/// <param name="Total">Sum of the day's lines.</param>
/// <param name="MonthTotal">Sum of every line of the calendar month the day belongs to.</param>
/// <param name="CanEdit">The caller may add, change and remove lines on this day.</param>
/// <param name="CanEditNote">The caller may write the rep's note for this day.</param>
/// <param name="CanManage">The caller may write the manager's note (expenses:manage over this rep).</param>
/// <param name="EditableFrom">The oldest day the rep may still change themselves.</param>
public sealed record ExpenseDayDto(
    Guid UserId,
    string UserName,
    DateOnly Day,
    IReadOnlyList<ExpenseLineDto> Lines,
    decimal Total,
    string? Note,
    string? ManagerNote,
    string? ManagerNoteByName,
    decimal MonthTotal,
    bool CanEdit,
    bool CanEditNote,
    bool CanManage,
    DateOnly EditableFrom,
    DateOnly Today);

public sealed record ExpenseCityTotalDto(Guid CityId, string CityName, string? CityNameAr, decimal Total, int Days);

public sealed record ExpenseRepTotalDto(Guid UserId, string UserName, decimal Total, int Days);

/// <param name="HasNote">The rep or a manager wrote a note for the day.</param>
public sealed record ExpenseDayTotalDto(DateOnly Day, decimal Total, int LineCount, bool HasNote, bool HasEdited);

/// <summary>One day of a monthly statement: its lines, total and notes.</summary>
public sealed record ExpenseStatementDayDto(
    DateOnly Day,
    IReadOnlyList<ExpenseLineDto> Lines,
    decimal Total,
    string? Note,
    string? ManagerNote);

/// <summary>
/// One rep's calendar month (1st to last day, Egypt days): the month total, the days with expenses,
/// a breakdown by city and the statement (every day with lines or notes).
/// </summary>
public sealed record ExpenseMonthDto(
    Guid UserId,
    string UserName,
    string Month,
    DateOnly From,
    DateOnly To,
    decimal Total,
    int DaysWithExpenses,
    IReadOnlyList<ExpenseCityTotalDto> ByCity,
    IReadOnlyList<ExpenseDayTotalDto> ByDay,
    IReadOnlyList<ExpenseStatementDayDto> Days);

/// <summary>Expenses of everyone in the caller's scope over a range of days (or one month).</summary>
public sealed record ExpenseReportDto(
    DateOnly From,
    DateOnly To,
    decimal Total,
    IReadOnlyList<ExpenseLineDto> Lines,
    IReadOnlyList<ExpenseRepTotalDto> ByRep,
    IReadOnlyList<ExpenseCityTotalDto> ByCity,
    IReadOnlyList<ExpenseDayTotalDto> ByDay,
    bool Truncated);

/// <param name="Id">Optional client id: a retried request (offline queue) returns the line it created the first time.</param>
/// <param name="UserId">The rep (managers with expenses:manage); empty means yourself.</param>
/// <param name="ChangedAt">When the change was made on the device; the latest change of a line wins.</param>
public sealed record CreateExpenseLineRequest(
    DateOnly Day,
    Guid CityId,
    decimal Amount,
    string? Note = null,
    Guid? Id = null,
    Guid? UserId = null,
    DateTimeOffset? ChangedAt = null);

/// <param name="Amount">New amount; null leaves it.</param>
/// <param name="Note">New note; null leaves it, empty removes it.</param>
public sealed record UpdateExpenseLineRequest(decimal? Amount = null, string? Note = null, DateTimeOffset? ChangedAt = null);

/// <param name="Note">The rep's note; null leaves it, empty removes it.</param>
/// <param name="ManagerNote">A manager's note (expenses:manage); null leaves it, empty removes it.</param>
public sealed record SetExpenseDayNoteRequest(
    Guid? UserId = null,
    string? Note = null,
    string? ManagerNote = null,
    DateTimeOffset? ChangedAt = null);

public sealed record SetCityExpenseRequest(decimal DefaultDailyExpense);

public sealed class CreateExpenseLineRequestValidator : AbstractValidator<CreateExpenseLineRequest>
{
    public CreateExpenseLineRequestValidator()
    {
        RuleFor(x => x.CityId).NotEmpty();
        RuleFor(x => x.Amount).GreaterThanOrEqualTo(0).PrecisionScale(12, 2, ignoreTrailingZeros: true);
        RuleFor(x => x.Note).MaximumLength(ExpenseLine.NoteMaxLength);
    }
}

public sealed class UpdateExpenseLineRequestValidator : AbstractValidator<UpdateExpenseLineRequest>
{
    public UpdateExpenseLineRequestValidator()
    {
        RuleFor(x => x.Amount!.Value).GreaterThanOrEqualTo(0).PrecisionScale(12, 2, ignoreTrailingZeros: true)
            .When(x => x.Amount is not null).OverridePropertyName(nameof(UpdateExpenseLineRequest.Amount));
        RuleFor(x => x.Note).MaximumLength(ExpenseLine.NoteMaxLength);
    }
}

public sealed class SetExpenseDayNoteRequestValidator : AbstractValidator<SetExpenseDayNoteRequest>
{
    public SetExpenseDayNoteRequestValidator()
    {
        RuleFor(x => x.Note).MaximumLength(ExpenseLine.NoteMaxLength);
        RuleFor(x => x.ManagerNote).MaximumLength(ExpenseLine.NoteMaxLength);
    }
}

public sealed class SetCityExpenseRequestValidator : AbstractValidator<SetCityExpenseRequest>
{
    public SetCityExpenseRequestValidator()
    {
        RuleFor(x => x.DefaultDailyExpense).GreaterThanOrEqualTo(0).LessThanOrEqualTo(100_000m)
            .PrecisionScale(12, 2, ignoreTrailingZeros: true);
    }
}
