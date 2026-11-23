using FluentValidation;
using OriginalPharma.Domain.Crm;
using OriginalPharma.Domain.Plans;

namespace OriginalPharma.Application.Plans;

/// <summary>Section <c>Plans</c> (environment: <c>Plans__WeekStartsOn</c>).</summary>
public sealed class PlanOptions
{
    public const string SectionName = "Plans";

    /// <summary>First day of a plan week (Egypt days). Saturday by default.</summary>
    public DayOfWeek WeekStartsOn { get; set; } = DayOfWeek.Saturday;
}

public static class PlanErrorCodes
{
    /// <summary>The week has already ended: plans are written for this week and later weeks.</summary>
    public const string WeekPast = "plan_week_past";

    /// <summary>The plan's status does not allow this (e.g. editing a submitted or approved plan).</summary>
    public const string StatusInvalid = "plan_status_invalid";

    /// <summary>Someone changed the plan since it was loaded.</summary>
    public const string Changed = "plan_changed";

    /// <summary>A day is outside the plan's week, or appears twice.</summary>
    public const string DayInvalid = "plan_day_invalid";

    /// <summary>The city does not exist, is archived, or is not a town.</summary>
    public const string CityInvalid = "plan_city_invalid";

    /// <summary>A customer is not on the rep's list (doctors) or in the rep's area (pharmacies).</summary>
    public const string CustomerInvalid = "plan_customer_invalid";

    /// <summary>An AM place is not one the rep can see (any town of their area, or on their list).</summary>
    public const string AmPlaceInvalid = "plan_am_place_invalid";

    /// <summary>A customer is in another city than the one chosen for that day.</summary>
    public const string CustomerCity = "plan_customer_city";

    /// <summary>A plan without any planned day cannot be submitted.</summary>
    public const string Empty = "plan_empty";

    /// <summary>Nobody in the rep's reporting line may review plans.</summary>
    public const string NoReviewer = "plan_no_reviewer";

    /// <summary>Returning a plan needs a note.</summary>
    public const string NoteRequired = "plan_note_required";

    /// <summary>Reviewers never review their own plan.</summary>
    public const string OwnPlan = "plan_own_review";
}

/// <param name="Visited">The rep completed a visit to this customer on the planned day.</param>
public sealed record WeeklyPlanCustomerDto(
    Guid CustomerId,
    CustomerType Type,
    string Name,
    string? NameAr,
    Guid? TownId,
    bool Visited);

/// <summary>Planned against done on one Egypt day.</summary>
/// <param name="Done">Completed visits that count for the plan: in the planned city or to a planned customer.</param>
/// <param name="Unplanned">Completed visits that day outside the plan (another city and not a planned customer, or a day off).</param>
/// <param name="PlannedCustomers">How many specific customers were planned.</param>
/// <param name="PlannedCustomersVisited">How many of them were visited that day.</param>
public sealed record WeeklyPlanDayProgressDto(
    DateOnly Day,
    int Target,
    int Done,
    int Unplanned,
    int PlannedCustomers,
    int PlannedCustomersVisited);

/// <param name="Customers">Doctors and pharmacies planned in the day's city.</param>
/// <param name="AmPlaces">Morning (AM) places, which may be in other towns than the day's city.</param>
public sealed record WeeklyPlanDayDto(
    DateOnly Day,
    Guid CityId,
    string CityName,
    string? CityNameAr,
    int TargetVisits,
    string? Note,
    IReadOnlyList<WeeklyPlanCustomerDto> Customers,
    IReadOnlyList<WeeklyPlanCustomerDto>? AmPlaces = null);

/// <summary>The whole week: what was planned, what was done and the visits outside the plan.</summary>
/// <param name="Days">All seven days of the week, planned or not.</param>
/// <param name="Percent">Done against planned, 0-100 (0 when nothing was planned).</param>
public sealed record WeeklyPlanProgressDto(
    int Planned,
    int Done,
    int Unplanned,
    int Percent,
    IReadOnlyList<WeeklyPlanDayProgressDto> Days);

/// <param name="FromStatus">Null for the plan's creation.</param>
public sealed record WeeklyPlanEventDto(
    Guid Id,
    WeeklyPlanStatus? FromStatus,
    WeeklyPlanStatus ToStatus,
    string ActorName,
    string? Note,
    DateTimeOffset CreatedAt);

/// <summary>
/// One rep's plan for one week. For a week without a saved plan, <paramref name="Id"/> is null and the
/// plan is an empty draft.
/// </summary>
/// <param name="Version">Send it back with a draft save: a plan changed meanwhile is refused (409 plan_changed).</param>
/// <param name="CanEdit">The caller may change the days (their own draft or returned plan, this week or later).</param>
/// <param name="CanSubmit">The caller may submit it now.</param>
/// <param name="CanReview">The caller may approve or return it.</param>
/// <param name="CanReopen">The caller may reopen it (approved plans).</param>
/// <param name="ReviewerName">The manager a submitted plan goes to; null when nobody can review it.</param>
public sealed record WeeklyPlanDto(
    Guid? Id,
    Guid UserId,
    string UserName,
    DateOnly WeekStart,
    DateOnly WeekEnd,
    WeeklyPlanStatus Status,
    int Version,
    string? ReviewNote,
    string? ReviewedByName,
    DateTimeOffset? ReviewedAt,
    DateTimeOffset? SubmittedAt,
    DateTimeOffset? UpdatedAt,
    IReadOnlyList<WeeklyPlanDayDto> Days,
    WeeklyPlanProgressDto Progress,
    IReadOnlyList<WeeklyPlanEventDto> History,
    bool CanEdit,
    bool CanSubmit,
    bool CanReview,
    bool CanReopen,
    string? ReviewerName,
    DateOnly Today,
    DateOnly CurrentWeekStart);

/// <summary>A plan in the managers' list.</summary>
public sealed record WeeklyPlanListItemDto(
    Guid Id,
    Guid UserId,
    string UserName,
    DateOnly WeekStart,
    DateOnly WeekEnd,
    WeeklyPlanStatus Status,
    int DaysPlanned,
    int Planned,
    DateTimeOffset? SubmittedAt,
    DateTimeOffset? ReviewedAt,
    string? ReviewedByName,
    DateTimeOffset UpdatedAt);

public sealed record WeeklyPlanPageDto(
    IReadOnlyList<WeeklyPlanListItemDto> Items,
    int Total,
    int Page,
    int PageSize);

/// <summary>Plans waiting for the caller's review (dashboard card).</summary>
public sealed record WeeklyPlanPendingDto(int Count);

/// <param name="Status">Only plans in this status.</param>
/// <param name="UserId">Only this rep.</param>
/// <param name="Week">Only the week this day belongs to.</param>
public sealed record WeeklyPlanQuery(
    WeeklyPlanStatus? Status = null,
    Guid? UserId = null,
    DateOnly? Week = null,
    int Page = 1,
    int PageSize = 20);

/// <param name="CustomerIds">Doctors and pharmacies in the day's city.</param>
/// <param name="AmPlaceIds">AM places for the morning, in any town of the rep's area (not limited to the city).</param>
public sealed record WeeklyPlanDayInput(
    DateOnly Day,
    Guid CityId,
    int TargetVisits,
    string? Note = null,
    IReadOnlyList<Guid>? CustomerIds = null,
    IReadOnlyList<Guid>? AmPlaceIds = null);

/// <summary>The whole week: the days sent replace every day saved before; a day left out is a day off.</summary>
/// <param name="Week">Any day of the week (it is moved to the first day of its week).</param>
/// <param name="Version">The version the change was made from; empty skips the check.</param>
public sealed record SaveWeeklyPlanRequest(
    DateOnly Week,
    IReadOnlyList<WeeklyPlanDayInput> Days,
    int? Version = null);

/// <param name="Note">Optional for approve and reopen; required to return a plan.</param>
public sealed record ReviewWeeklyPlanRequest(string? Note = null, int? Version = null);

public sealed record SubmitWeeklyPlanRequest(int? Version = null);

public sealed class SaveWeeklyPlanRequestValidator : AbstractValidator<SaveWeeklyPlanRequest>
{
    public SaveWeeklyPlanRequestValidator()
    {
        RuleFor(x => x.Days).NotNull().Must(d => d is null || d.Count <= 7).WithMessage("A week has at most 7 days.");
        RuleForEach(x => x.Days).ChildRules(day =>
        {
            day.RuleFor(d => d.CityId).NotEmpty().WithMessage("Choose a city.");
            day.RuleFor(d => d.TargetVisits).InclusiveBetween(0, WeeklyPlanDay.MaxTargetVisits);
            day.RuleFor(d => d.Note).MaximumLength(WeeklyPlanDay.NoteMaxLength);
            day.RuleFor(d => d.CustomerIds).Must(c => c is null || c.Count <= WeeklyPlanDay.MaxCustomers)
                .WithMessage($"At most {WeeklyPlanDay.MaxCustomers} customers a day.");
            day.RuleFor(d => d.AmPlaceIds).Must(c => c is null || c.Count <= WeeklyPlanDay.MaxAmPlaces)
                .WithMessage($"At most {WeeklyPlanDay.MaxAmPlaces} AM places a day.");
        });
    }
}

public sealed class ReviewWeeklyPlanRequestValidator : AbstractValidator<ReviewWeeklyPlanRequest>
{
    public ReviewWeeklyPlanRequestValidator()
    {
        RuleFor(x => x.Note).MaximumLength(WeeklyPlan.NoteMaxLength);
    }
}
