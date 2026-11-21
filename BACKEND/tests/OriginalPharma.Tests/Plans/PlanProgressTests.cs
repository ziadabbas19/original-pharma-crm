using OriginalPharma.Application.Common;
using OriginalPharma.Application.Plans;

namespace OriginalPharma.Tests.Plans;

public sealed class PlanProgressTests
{
    private static readonly DateOnly Saturday = new(2027, 2, 6);
    private static readonly Guid Nasr = Guid.NewGuid();
    private static readonly Guid Heliopolis = Guid.NewGuid();

    [Theory]
    [InlineData("2027-02-06", DayOfWeek.Saturday, "2027-02-06")]
    [InlineData("2027-02-12", DayOfWeek.Saturday, "2027-02-06")]
    [InlineData("2027-02-13", DayOfWeek.Saturday, "2027-02-13")]
    [InlineData("2027-02-06", DayOfWeek.Sunday, "2027-01-31")]
    [InlineData("2027-02-07", DayOfWeek.Sunday, "2027-02-07")]
    [InlineData("2027-02-08", DayOfWeek.Monday, "2027-02-08")]
    [InlineData("2027-01-01", DayOfWeek.Saturday, "2026-12-26")]
    public void A_week_starts_on_the_configured_day(string day, DayOfWeek first, string expected) =>
        Assert.Equal(DateOnly.Parse(expected), LocalCalendar.WeekStart(DateOnly.Parse(day), first));

    [Fact]
    public void Visits_count_in_the_planned_city_or_for_a_planned_customer_and_the_rest_apart()
    {
        var listed = Guid.NewGuid();
        var other = Guid.NewGuid();
        var planned = new[]
        {
            new PlannedDay(Saturday, Nasr, 4, [listed]),
            new PlannedDay(Saturday.AddDays(1), Nasr, 2, []),
        };
        var visits = new[]
        {
            new PlanVisit(Saturday, other, Nasr),
            new PlanVisit(Saturday, listed, Heliopolis), // a planned customer counts wherever they are
            new PlanVisit(Saturday, other, Heliopolis), // another city: outside the plan
            new PlanVisit(Saturday.AddDays(3), other, Nasr), // a day off
        };

        var progress = PlanProgress.Compute(Saturday, planned, visits);

        Assert.Equal(7, progress.Days.Count);
        Assert.Equal(new WeeklyPlanDayProgressDto(Saturday, 4, 2, 1, 1, 1), progress.Days[0]);
        Assert.Equal(new WeeklyPlanDayProgressDto(Saturday.AddDays(1), 2, 0, 0, 0, 0), progress.Days[1]);
        Assert.Equal(new WeeklyPlanDayProgressDto(Saturday.AddDays(3), 0, 0, 1, 0, 0), progress.Days[3]);
        Assert.Equal((6, 2, 2, 33), (progress.Planned, progress.Done, progress.Unplanned, progress.Percent));
    }

    [Theory]
    [InlineData(0, 0, 0)]
    [InlineData(3, 0, 0)]
    [InlineData(1, 8, 13)]
    [InlineData(1, 200, 1)]
    [InlineData(5, 10, 50)]
    [InlineData(12, 10, 100)]
    public void The_percentage_is_rounded_and_never_above_100(int done, int planned, int expected) =>
        Assert.Equal(expected, PlanProgress.Percent(done, planned));
}
