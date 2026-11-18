using FluentValidation;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Application.Stats;

/// <param name="From">First day (local date). Defaults to 29 days before <paramref name="To"/>.</param>
/// <param name="To">Last day, included. Defaults to today.</param>
/// <param name="RepId">Only this rep (must be inside the caller's scope to show anything).</param>
/// <param name="AreaId">Only this territory node and everything under it.</param>
/// <param name="LineId">Only orders and visits that involve products of this line.</param>
/// <param name="ProductId">Only orders and visits that involve this product.</param>
public sealed record StatsQuery(
    DateOnly? From = null,
    DateOnly? To = null,
    Guid? RepId = null,
    Guid? AreaId = null,
    Guid? LineId = null,
    Guid? ProductId = null);

/// <summary>The period and scope the numbers were computed for.</summary>
public sealed record StatsRange(DateOnly From, DateOnly To, PermissionScope Scope);

/// <summary>
/// One row of a breakdown table. <paramref name="Key"/> is an id or an enum value; names come in both
/// languages. <paramref name="Value"/> is money (EGP) for order tables; <paramref name="Quantity"/> is
/// units sold (products, lines) or doctors covered (doctor tables).
/// </summary>
public sealed record StatRow(string Key, string Name, string? NameAr, int Count, decimal Value = 0, decimal Quantity = 0);

public sealed record TrendPoint(DateOnly Date, int Count, decimal Value = 0);

public sealed record RepDayRow(Guid RepId, string RepName, DateOnly Date, int Count);

/// <param name="OrderCount">Orders in the period, every status.</param>
/// <param name="OrderValue">Total of submitted and approved orders (rejected and cancelled ones do not count).</param>
/// <param name="AverageOrderValue">OrderValue divided by the submitted and approved orders.</param>
/// <param name="DiscountTotal">Discounts given on submitted and approved orders.</param>
/// <param name="Delivered">Approved orders marked delivered.</param>
/// <param name="NotDelivered">Approved orders not delivered yet.</param>
public sealed record OrderStatsDto(
    StatsRange Range,
    int OrderCount,
    decimal OrderValue,
    decimal AverageOrderValue,
    decimal DiscountTotal,
    int Delivered,
    int NotDelivered,
    decimal DeliveredValue,
    IReadOnlyList<StatRow> ByStatus,
    IReadOnlyList<TrendPoint> Trend,
    IReadOnlyList<StatRow> TopProducts,
    IReadOnlyList<StatRow> TopLines,
    IReadOnlyList<StatRow> ByRep,
    IReadOnlyList<StatRow> ByArea,
    IReadOnlyList<StatRow> ByPlaceType,
    IReadOnlyList<StatRow> ByCollectionMethod);

/// <param name="Verified">Checked in inside the geofence and not marked for review.</param>
/// <param name="AveragePerRepDay">Visits per rep per day worked (days with at least one visit).</param>
/// <param name="DoctorsOnList">Active doctors on the lists of the reps in scope.</param>
/// <param name="DoctorsCovered">Of those, the doctors visited in the period.</param>
public sealed record VisitStatsDto(
    StatsRange Range,
    int VisitCount,
    int Verified,
    int Unverified,
    int Completed,
    decimal AveragePerRepDay,
    int DoctorsOnList,
    int DoctorsCovered,
    IReadOnlyList<TrendPoint> Trend,
    IReadOnlyList<RepDayRow> PerRepPerDay,
    IReadOnlyList<StatRow> ByRep,
    IReadOnlyList<StatRow> ProductsDiscussed,
    IReadOnlyList<StatRow> FeedbackByCategory);

/// <summary>Doctor coverage: Count = doctors on the lists, Quantity = doctors visited in the period.</summary>
public sealed record DoctorStatsDto(
    StatsRange Range,
    int OnLists,
    int Covered,
    int NotCovered,
    IReadOnlyList<StatRow> ByRep,
    IReadOnlyList<StatRow> ByTown,
    IReadOnlyList<StatRow> BySpecialty,
    IReadOnlyList<StatRow> NotVisited);

/// <param name="TrackingHours">Time between "start my day" and "end my day" inside the period.</param>
/// <param name="ActiveDays">Days with a working day started.</param>
public sealed record RepRankRow(
    Guid RepId,
    string Name,
    int Orders,
    decimal OrderValue,
    int Visits,
    int DoctorsCovered,
    decimal TrackingHours,
    int ActiveDays);

public sealed record RepStatsDto(StatsRange Range, IReadOnlyList<RepRankRow> Reps);

/// <param name="LowStock">Products at or below the threshold (Count = units in stock).</param>
public sealed record CatalogStatsDto(
    StatsRange Range,
    int LowStockThreshold,
    IReadOnlyList<StatRow> ProductsPerLine,
    IReadOnlyList<StatRow> LowStock,
    IReadOnlyList<StatRow> ActiveUsersByRole);

public enum StatsSection
{
    Orders = 1,
    Visits = 2,
    Doctors = 3,
    Reps = 4,
    Catalog = 5,
}

public sealed class StatsOptions
{
    public const string SectionName = "Stats";

    /// <summary>Time zone used to turn timestamps into days (visits per day, working days).</summary>
    public string TimeZone { get; set; } = "Africa/Cairo";

    public int LowStockThreshold { get; set; } = 10;

    /// <summary>Results are cached per user, permissions version and filters for this long.</summary>
    public int CacheSeconds { get; set; } = 60;

    public int MaxRangeDays { get; set; } = 366;
}

public sealed class StatsQueryValidator : AbstractValidator<StatsQuery>
{
    public StatsQueryValidator()
    {
        RuleFor(x => x).Must(x => x.From is null || x.To is null || x.From <= x.To)
            .OverridePropertyName("From").WithMessage("The start must be on or before the end.");
        RuleFor(x => x.RepId).NotEqual(Guid.Empty);
        RuleFor(x => x.AreaId).NotEqual(Guid.Empty);
        RuleFor(x => x.LineId).NotEqual(Guid.Empty);
        RuleFor(x => x.ProductId).NotEqual(Guid.Empty);
    }
}
