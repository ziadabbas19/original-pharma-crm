namespace OriginalPharma.Application.Plans;

/// <summary>A completed visit as the plan progress needs it: its Egypt day, the customer and the customer's town.</summary>
public sealed record PlanVisit(DateOnly Day, Guid CustomerId, Guid? TownId);

/// <summary>What one planned day asks for.</summary>
public sealed record PlannedDay(DateOnly Day, Guid CityId, int Target, IReadOnlyCollection<Guid> CustomerIds);

/// <summary>
/// Planned against done for one week. A completed visit counts for the plan when its day is planned and
/// the visit is in that day's city or to one of that day's customers; every other completed visit
/// (another city, or a day off) is counted apart as "not in the plan". The same rules are in
/// FRONTEND/src/features/plans/plan-progress.ts.
/// </summary>
public static class PlanProgress
{
    public static WeeklyPlanProgressDto Compute(DateOnly weekStart, IReadOnlyCollection<PlannedDay> planned, IReadOnlyCollection<PlanVisit> visits)
    {
        var byDay = planned.ToDictionary(d => d.Day);
        var days = new List<WeeklyPlanDayProgressDto>(7);
        for (var i = 0; i < 7; i++)
        {
            var day = weekStart.AddDays(i);
            var dayVisits = visits.Where(v => v.Day == day).ToList();
            if (!byDay.TryGetValue(day, out var plan))
            {
                days.Add(new WeeklyPlanDayProgressDto(day, 0, 0, dayVisits.Count, 0, 0));
                continue;
            }

            var listed = plan.CustomerIds.ToHashSet();
            var done = dayVisits.Count(v => v.TownId == plan.CityId || listed.Contains(v.CustomerId));
            var visited = listed.Count(id => dayVisits.Any(v => v.CustomerId == id));
            days.Add(new WeeklyPlanDayProgressDto(day, plan.Target, done, dayVisits.Count - done, listed.Count, visited));
        }

        var target = days.Sum(d => d.Target);
        var doneTotal = days.Sum(d => d.Done);
        return new WeeklyPlanProgressDto(target, doneTotal, days.Sum(d => d.Unplanned), Percent(doneTotal, target), days);
    }

    /// <summary>Done against planned, rounded, at most 100; 0 when nothing was planned.</summary>
    public static int Percent(int done, int planned) =>
        planned <= 0 ? 0 : (int)Math.Min(100, Math.Round(done * 100m / planned, MidpointRounding.AwayFromZero));
}
