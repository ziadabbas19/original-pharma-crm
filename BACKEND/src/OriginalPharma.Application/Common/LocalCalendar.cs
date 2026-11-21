using Microsoft.Extensions.Options;
using OriginalPharma.Application.Stats;

namespace OriginalPharma.Application.Common;

/// <summary>
/// Days as people in Egypt count them (Stats:TimeZone, Africa/Cairo by default, daylight saving
/// included): which day an instant falls on, where a day starts and ends, and today.
/// </summary>
public sealed class LocalCalendar(IOptions<StatsOptions> options, TimeProvider time)
{
    private TimeZoneInfo? _zone;

    public TimeZoneInfo Zone => _zone ??= Find(options.Value.TimeZone);

    public DateOnly Today() => DayOf(time.GetUtcNow());

    public DateOnly DayOf(DateTimeOffset instant) => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(instant, Zone).DateTime);

    /// <summary>The first instant of the day. When daylight saving skips midnight, the day starts when the clock jumps.</summary>
    public DateTimeOffset StartOf(DateOnly day)
    {
        var local = day.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified);
        return new DateTimeOffset(local, Zone.GetUtcOffset(local)).ToUniversalTime();
    }

    /// <summary>[start, end) of the day in UTC.</summary>
    public (DateTimeOffset Start, DateTimeOffset End) Bounds(DateOnly day) => (StartOf(day), StartOf(day.AddDays(1)));

    public static DateOnly FirstOfMonth(DateOnly day) => new(day.Year, day.Month, 1);

    public static DateOnly LastOfMonth(DateOnly day) => new(day.Year, day.Month, DateTime.DaysInMonth(day.Year, day.Month));

    private static TimeZoneInfo Find(string id)
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(id);
        }
        catch (Exception ex) when (ex is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            return TimeZoneInfo.Utc;
        }
    }
}
