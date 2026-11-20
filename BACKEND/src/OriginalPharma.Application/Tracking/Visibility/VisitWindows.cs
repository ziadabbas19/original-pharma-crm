using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Tracking.Integrity;
using OriginalPharma.Domain.Visits;

namespace OriginalPharma.Application.Tracking.Visibility;

/// <summary>From the start of a visit to its end, widened by the buffer on both sides.</summary>
public readonly record struct TimeWindow(DateTimeOffset From, DateTimeOffset To)
{
    public bool Contains(DateTimeOffset instant) => instant >= From && instant <= To;
}

/// <summary>The visit that makes a rep visible right now: in progress, or ended less than the buffer ago.</summary>
/// <param name="VisibleUntil">Null while the visit is in progress; otherwise its end plus the buffer.</param>
public sealed record CurrentVisit(
    Guid VisitId,
    Guid CustomerId,
    string CustomerName,
    string? CustomerNameAr,
    DateTimeOffset StartedAt,
    DateTimeOffset? EndedAt,
    DateTimeOffset? VisibleUntil);

/// <summary>What managers may see right now, from the location trust settings.</summary>
public sealed record VisibilityPolicy(LocationVisibility Mode, TimeSpan Buffer)
{
    public bool VisitOnly => Mode == LocationVisibility.VisitOnly;
}

/// <summary>
/// Visit windows of reps: in visit-only mode a manager may see a rep's position only inside them. Every
/// endpoint and live channel that shows positions to someone else filters with this; the rep's own data
/// and the integrity checks keep using the stored points internally.
/// </summary>
public sealed class VisitWindowService(IAppDbContext db, LocationTrustSettingsService trustSettings, TimeProvider time)
{
    public async Task<VisibilityPolicy> PolicyAsync(CancellationToken cancellationToken = default)
    {
        var settings = await trustSettings.GetAsync(cancellationToken);
        return new VisibilityPolicy(settings.Visibility, settings.VisitWindowBuffer);
    }

    /// <summary>Windows of the reps' visits that overlap [from, to] (archived visits are not visits any more).</summary>
    public async Task<IReadOnlyDictionary<Guid, IReadOnlyList<TimeWindow>>> WindowsAsync(
        IReadOnlyCollection<Guid> userIds,
        DateTimeOffset from,
        DateTimeOffset to,
        TimeSpan buffer,
        CancellationToken cancellationToken = default)
    {
        if (userIds.Count == 0)
        {
            return new Dictionary<Guid, IReadOnlyList<TimeWindow>>();
        }

        var ids = userIds.Distinct().ToArray();
        var now = time.GetUtcNow();
        var earliest = from - buffer;
        var latest = to + buffer;
        var visits = await db.Visits.AsNoTracking()
            .Where(v => ids.Contains(v.UserId) && v.ArchivedAt == null && v.CheckInAt <= latest &&
                        (v.CheckOutAt == null || v.CheckOutAt >= earliest))
            .Select(v => new { v.UserId, v.Status, v.CheckInAt, v.CheckOutAt })
            .ToListAsync(cancellationToken);

        return visits
            .GroupBy(v => v.UserId)
            .ToDictionary(
                g => g.Key,
                g => (IReadOnlyList<TimeWindow>)g
                    .Select(v => WindowOf(v.Status, v.CheckInAt, v.CheckOutAt, now, buffer))
                    .Where(w => w.To >= earliest)
                    .OrderBy(w => w.From)
                    .ToList());
    }

    /// <summary>For each rep: the visit that makes them visible now, if any.</summary>
    public async Task<IReadOnlyDictionary<Guid, CurrentVisit>> CurrentAsync(
        IReadOnlyCollection<Guid> userIds,
        TimeSpan buffer,
        CancellationToken cancellationToken = default)
    {
        if (userIds.Count == 0)
        {
            return new Dictionary<Guid, CurrentVisit>();
        }

        var ids = userIds.Distinct().ToArray();
        var now = time.GetUtcNow();
        var endedAfter = now - buffer;
        var rows = await db.Visits.AsNoTracking()
            .Where(v => ids.Contains(v.UserId) && v.ArchivedAt == null &&
                        (v.Status == VisitStatus.InProgress || (v.CheckOutAt != null && v.CheckOutAt >= endedAfter)))
            .Select(v => new
            {
                v.Id,
                v.UserId,
                v.CustomerId,
                v.Customer!.Name,
                v.Customer.NameAr,
                v.Status,
                v.CheckInAt,
                v.CheckOutAt,
            })
            .ToListAsync(cancellationToken);

        return rows
            .GroupBy(v => v.UserId)
            .ToDictionary(
                g => g.Key,
                g =>
                {
                    // A running visit wins over one that just ended.
                    var v = g.OrderByDescending(x => x.Status == VisitStatus.InProgress).ThenByDescending(x => x.CheckInAt).First();
                    var running = v.Status == VisitStatus.InProgress;
                    return new CurrentVisit(
                        v.Id, v.CustomerId, v.Name, v.NameAr, v.CheckInAt, running ? null : v.CheckOutAt,
                        running ? null : v.CheckOutAt + buffer);
                });
    }

    /// <summary>When each rep's latest visit ended (for "not on a visit since").</summary>
    public async Task<IReadOnlyDictionary<Guid, DateTimeOffset>> LastVisitEndAsync(
        IReadOnlyCollection<Guid> userIds,
        CancellationToken cancellationToken = default)
    {
        if (userIds.Count == 0)
        {
            return new Dictionary<Guid, DateTimeOffset>();
        }

        var ids = userIds.Distinct().ToArray();
        return await db.Visits.AsNoTracking()
            .Where(v => ids.Contains(v.UserId) && v.ArchivedAt == null && v.CheckOutAt != null)
            .GroupBy(v => v.UserId)
            .Select(g => new { UserId = g.Key, EndedAt = g.Max(v => v.CheckOutAt!.Value) })
            .ToDictionaryAsync(x => x.UserId, x => x.EndedAt, cancellationToken);
    }

    /// <summary>
    /// The visit window: check-in minus the buffer to check-out plus the buffer. A visit still running is open
    /// until now; a visit closed without a check-out time (cancelled) only covers its check-in.
    /// </summary>
    public static TimeWindow WindowOf(VisitStatus status, DateTimeOffset checkInAt, DateTimeOffset? checkOutAt, DateTimeOffset now, TimeSpan buffer)
    {
        var end = checkOutAt ?? (status == VisitStatus.InProgress ? now : checkInAt);
        return new TimeWindow(checkInAt - buffer, end + buffer);
    }

    public static bool Inside(IReadOnlyList<TimeWindow>? windows, DateTimeOffset instant) =>
        windows is not null && windows.Any(w => w.Contains(instant));
}
