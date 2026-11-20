using FluentValidation;
using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Auditing;
using OriginalPharma.Application.Common.Scoping;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Tracking.Anomalies;
using OriginalPharma.Application.Visits;
using OriginalPharma.Domain.Audit;
using OriginalPharma.Domain.Tracking;
using OriginalPharma.Domain.Visits;

namespace OriginalPharma.Application.Tracking.Integrity;

/// <summary>The rep app noticed a fake (mock) location and tells the server.</summary>
/// <param name="DetectedAt">Device time of the first mock fix of the episode.</param>
public sealed record IntegrityEventReport(
    string DeviceId,
    DateTimeOffset DetectedAt,
    double? Lat = null,
    double? Lng = null,
    double? Accuracy = null,
    DeviceSignalsDto? DeviceSignals = null);

/// <param name="Merged">The report was added to an open flag instead of starting a new one.</param>
public sealed record IntegrityEventReportResult(Guid FlagId, bool Merged);

/// <summary>A suspicious-location event (a flag) for the review page.</summary>
/// <param name="LocationPointId">The point that shows the problem best; <paramref name="Lat"/>/<paramref name="Lng"/> are its position.</param>
/// <param name="VisitId">The visit the event is about, if any.</param>
public sealed record IntegrityEventDto(
    Guid Id,
    Guid UserId,
    string UserName,
    TrackingFlagType Type,
    TrackingFlagStatus Status,
    int Score,
    IReadOnlyList<string> Signals,
    string? Details,
    DateTimeOffset CreatedAt,
    DateTimeOffset? LastSeenAt,
    int Occurrences,
    long? LocationPointId,
    double? Lat,
    double? Lng,
    DateTimeOffset? PointRecordedAt,
    Guid? VisitId,
    string? CustomerName,
    string? CustomerNameAr,
    string? ReviewNote,
    DateTimeOffset? ReviewedAt,
    string? ReviewedByName);

/// <summary>A stored point with the evidence the checks used.</summary>
public sealed record IntegrityPointDto(
    long Id,
    double Lat,
    double Lng,
    double Accuracy,
    DateTimeOffset RecordedAt,
    DateTimeOffset? DeviceTime,
    bool IsMock,
    LocationTrustStatus TrustStatus,
    string? TrustReason,
    IReadOnlyList<string> Codes,
    double? Altitude,
    string? ActivityType,
    DeviceSignalsDto? DeviceSignals);

public sealed record IntegrityVisitDto(
    Guid Id,
    string CustomerName,
    string? CustomerNameAr,
    DateTimeOffset CheckInAt,
    DateTimeOffset? CheckOutAt,
    double CheckInDistanceMeters,
    double CheckInAccuracy,
    double? CheckOutDistanceMeters,
    bool CheckInIsMock,
    bool? CheckOutIsMock,
    IReadOnlyList<string> ReviewReasons);

/// <param name="Points">Suspicious and rejected points of the rep around the event (at most 200).</param>
public sealed record IntegrityEventDetailDto(IntegrityEventDto Event, IReadOnlyList<IntegrityPointDto> Points, IntegrityVisitDto? Visit);

public sealed record AcknowledgeIntegrityEventRequest(string Comment);

public sealed record ReasonCountDto(string Reason, int Count);

/// <summary>Counts for the dashboard, inside the caller's review scope.</summary>
public sealed record IntegritySummaryDto(
    DateTimeOffset From,
    DateTimeOffset To,
    int OpenEvents,
    int AcknowledgedEvents,
    int TotalEvents,
    int RepsFlagged,
    int SuspiciousPoints,
    int RejectedPoints,
    int MockPoints,
    int FlaggedVisits,
    IReadOnlyList<ReasonCountDto> TopReasons,
    MockLocationPolicy MockPolicy);

public sealed class IntegrityEventReportValidator : AbstractValidator<IntegrityEventReport>
{
    public IntegrityEventReportValidator(TimeProvider time)
    {
        RuleFor(x => x.DeviceId).NotEmpty().MaximumLength(128);
        RuleFor(x => x.DetectedAt).NotEmpty()
            .Must(at => at > time.GetUtcNow().AddDays(-7)).WithMessage("Events older than 7 days are not accepted.");
        RuleFor(x => x.Lat).InclusiveBetween(-90, 90).When(x => x.Lat.HasValue);
        RuleFor(x => x.Lng).InclusiveBetween(-180, 180).When(x => x.Lng.HasValue);
        RuleFor(x => x.Accuracy).GreaterThanOrEqualTo(0).When(x => x.Accuracy.HasValue);
    }
}

public sealed class AcknowledgeIntegrityEventRequestValidator : AbstractValidator<AcknowledgeIntegrityEventRequest>
{
    public AcknowledgeIntegrityEventRequestValidator()
    {
        RuleFor(x => x.Comment).Must(c => !string.IsNullOrWhiteSpace(c)).WithMessage("Write a comment.").MaximumLength(1000);
    }
}

/// <summary>
/// Suspicious location activity: the rep app's own reports, and the review page for supervisors
/// (tracking:review-suspicious, within their scope: team, territory or all).
/// </summary>
public sealed class LocationIntegrityService(
    IAppDbContext db,
    ICurrentUser currentUser,
    IDataScopeResolver scopeResolver,
    IntegrityFlagService flags,
    LocationTrustSettingsService trustSettings,
    AuditTrail audit,
    TimeProvider time)
{
    public const int MaxEvents = 500;
    private const int MaxPoints = 200;
    private static readonly TimeSpan MaxRange = TimeSpan.FromDays(31);

    /// <summary>The rep app saw a mock location. Raises (or extends) the rep's mock location flag.</summary>
    public async Task<IntegrityEventReportResult> ReportAsync(IntegrityEventReport report, CancellationToken cancellationToken = default)
    {
        var userId = currentUser.RequireUserId();
        var now = time.GetUtcNow();
        var detectedAt = report.DetectedAt.ToUniversalTime() > now ? now : report.DetectedAt.ToUniversalTime();
        var territoryId = await db.Users.Where(u => u.Id == userId).Select(u => u.TerritoryId).SingleAsync(cancellationToken);
        var shiftId = await db.Shifts
            .Where(s => s.UserId == userId && s.Status == ShiftStatus.Active)
            .OrderByDescending(s => s.StartedAt)
            .Select(s => (Guid?)s.Id)
            .FirstOrDefaultAsync(cancellationToken);

        var signals = report.DeviceSignals?.Sanitized();
        var deviceCodes = DeviceSignalCodes.From(signals);
        var score = Math.Min(100, AnomalyWeights.MockLocation + deviceCodes.Sum(WeightOf));
        var details = $"The app detected a fake location at {detectedAt:u}" +
                      (report.Lat is { } lat && report.Lng is { } lng ? $" near {lat:0.#####}, {lng:0.#####}." : ".") +
                      (DeviceSignalCodes.Describe(signals) is { } device ? " " + device : string.Empty);

        var outcome = await flags.RaiseAsync(new IntegrityFlagRequest(
            userId, territoryId, shiftId, TrackingFlagType.MockLocation, score,
            [AnomalyCodes.MockLocation, .. deviceCodes], details), cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        await flags.PublishAsync([outcome], cancellationToken);
        return new IntegrityEventReportResult(outcome.Flag.Id, !outcome.IsNew);
    }

    /// <summary>Suspicious-location events in the caller's scope, newest first (default: the last 7 days).</summary>
    public async Task<IReadOnlyList<IntegrityEventDto>> ListAsync(
        DateTimeOffset? from,
        DateTimeOffset? to,
        Guid? userId,
        string? reason,
        TrackingFlagStatus? status,
        TrackingFlagType? type,
        CancellationToken cancellationToken = default)
    {
        var (fromUtc, toUtc) = Range(from, to);
        var scope = await scopeResolver.ResolveAsync(Permissions.Tracking.ReviewSuspicious, cancellationToken);
        var query = Events(scope).Where(f => f.CreatedAt >= fromUtc && f.CreatedAt < toUtc);
        if (userId is not null)
        {
            query = query.Where(f => f.UserId == userId);
        }

        if (!string.IsNullOrWhiteSpace(reason))
        {
            query = query.Where(f => f.Signals.Contains(reason));
        }

        if (status is not null)
        {
            query = query.Where(f => f.Status == status);
        }

        if (type is not null)
        {
            query = query.Where(f => f.Type == type);
        }

        var rows = await query.OrderByDescending(f => f.CreatedAt).Take(MaxEvents).ToListAsync(cancellationToken);
        return await ToDtosAsync(rows, cancellationToken);
    }

    public async Task<IntegrityEventDetailDto> GetAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var scope = await scopeResolver.ResolveAsync(Permissions.Tracking.ReviewSuspicious, cancellationToken);
        var flag = await Events(scope).SingleOrDefaultAsync(f => f.Id == id, cancellationToken)
                   ?? throw new NotFoundException("Event", id);

        var windowFrom = flag.CreatedAt.AddMinutes(-30);
        var windowTo = (flag.LastSeenAt ?? flag.CreatedAt).AddMinutes(5);
        var points = await db.LocationPoints.AsNoTracking()
            .Where(p => p.UserId == flag.UserId &&
                        (p.Id == flag.LocationPointId ||
                         (p.RecordedAt >= windowFrom && p.RecordedAt <= windowTo && p.TrustStatus != LocationTrustStatus.Trusted)))
            .OrderBy(p => p.RecordedAt)
            .Take(MaxPoints)
            .ToListAsync(cancellationToken);

        IntegrityVisitDto? visit = null;
        if (flag.VisitId is { } visitId)
        {
            var v = await db.Visits.AsNoTracking()
                .Where(x => x.Id == visitId)
                .Select(x => new
                {
                    x.Id,
                    x.Customer!.Name,
                    x.Customer.NameAr,
                    x.CheckInAt,
                    x.CheckOutAt,
                    x.CheckInDistanceMeters,
                    x.CheckInAccuracy,
                    x.CheckOutDistanceMeters,
                    x.CheckInIsMock,
                    x.CheckOutIsMock,
                    x.CheckInWithinGeofence,
                    HasCheckOutLocation = x.CheckOutLocation != null,
                    x.TrustReasons,
                })
                .SingleOrDefaultAsync(cancellationToken);
            if (v is not null)
            {
                visit = new IntegrityVisitDto(
                    v.Id, v.Name, v.NameAr, v.CheckInAt, v.CheckOutAt, v.CheckInDistanceMeters, v.CheckInAccuracy,
                    v.CheckOutDistanceMeters, v.CheckInIsMock, v.CheckOutIsMock,
                    VisitReviewReasons.For(v.CheckInWithinGeofence, v.CheckInIsMock, v.CheckOutIsMock, v.CheckOutAt is not null, v.HasCheckOutLocation, v.TrustReasons));
            }
        }

        var dto = (await ToDtosAsync([flag], cancellationToken))[0];
        return new IntegrityEventDetailDto(
            dto,
            points.Select(p => new IntegrityPointDto(
                p.Id, p.Location.Y, p.Location.X, p.Accuracy, p.RecordedAt, p.DeviceTime, p.IsMock, p.TrustStatus, p.TrustReason,
                p.AnomalyCodes, p.Altitude, p.ActivityType, DeviceSignalsDto.FromJson(p.DeviceSignals))).ToList(),
            visit);
    }

    /// <summary>A reviewer has seen the event and leaves a comment. Confirmed or dismissed events stay as they are.</summary>
    public async Task<IntegrityEventDto> AcknowledgeAsync(Guid id, AcknowledgeIntegrityEventRequest request, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var scope = await scopeResolver.ResolveAsync(Permissions.Tracking.ReviewSuspicious, cancellationToken);
        var flag = await db.TrackingFlags.WhereInScope(scope)
                       .Where(f => IntegrityFlagService.IntegrityTypes.Contains(f.Type))
                       .SingleOrDefaultAsync(f => f.Id == id, cancellationToken)
                   ?? throw new NotFoundException("Event", id);

        if (flag.Status is not (TrackingFlagStatus.Open or TrackingFlagStatus.Acknowledged))
        {
            throw new ConflictException("event-already-reviewed", "This event was already confirmed or dismissed.");
        }

        var comment = request.Comment.Trim();
        flag.Status = TrackingFlagStatus.Acknowledged;
        flag.ReviewNote = comment;
        flag.ReviewedAt = time.GetUtcNow();
        flag.ReviewedById = me;
        await audit.AddAsync(AuditEntities.LocationFlag, flag.Id, AuditAction.Updated,
            new { repId = flag.UserId, status = flag.Status, comment }, cancellationToken: cancellationToken);
        await db.SaveChangesAsync(cancellationToken);

        return (await ToDtosAsync([flag], cancellationToken))[0];
    }

    /// <summary>Counts for the dashboard and statistics (default: today and the 6 days before).</summary>
    public async Task<IntegritySummaryDto> SummaryAsync(DateTimeOffset? from, DateTimeOffset? to, CancellationToken cancellationToken = default)
    {
        var (fromUtc, toUtc) = Range(from, to);
        var scope = await scopeResolver.ResolveAsync(Permissions.Tracking.ReviewSuspicious, cancellationToken);
        var settings = await trustSettings.GetAsync(cancellationToken);

        var events = await Events(scope)
            .Where(f => f.CreatedAt >= fromUtc && f.CreatedAt < toUtc)
            .Select(f => new { f.UserId, f.Status, f.Signals })
            .ToListAsync(cancellationToken);

        var points = await db.LocationPoints.AsNoTracking().WhereInScope(scope)
            .Where(p => p.RecordedAt >= fromUtc && p.RecordedAt < toUtc && (p.TrustStatus != LocationTrustStatus.Trusted || p.IsMock))
            .GroupBy(p => new { p.TrustStatus, p.IsMock })
            .Select(g => new { g.Key.TrustStatus, g.Key.IsMock, Count = g.Count() })
            .ToListAsync(cancellationToken);

        var flaggedVisits = await db.Visits.AsNoTracking().WhereInScope(scope)
            .CountAsync(v => v.ArchivedAt == null && v.NeedsReview && v.CheckInAt >= fromUtc && v.CheckInAt < toUtc, cancellationToken);

        return new IntegritySummaryDto(
            fromUtc,
            toUtc,
            events.Count(e => e.Status == TrackingFlagStatus.Open),
            events.Count(e => e.Status == TrackingFlagStatus.Acknowledged),
            events.Count,
            events.Select(e => e.UserId).Distinct().Count(),
            points.Where(p => p.TrustStatus == LocationTrustStatus.Suspicious).Sum(p => p.Count),
            points.Where(p => p.TrustStatus == LocationTrustStatus.Rejected).Sum(p => p.Count),
            points.Where(p => p.IsMock).Sum(p => p.Count),
            flaggedVisits,
            events.SelectMany(e => e.Signals).GroupBy(s => s)
                .Select(g => new ReasonCountDto(g.Key, g.Count()))
                .OrderByDescending(r => r.Count).ThenBy(r => r.Reason)
                .Take(8)
                .ToList(),
            settings.MockPolicy);
    }

    private IQueryable<TrackingFlag> Events(DataScope scope) =>
        db.TrackingFlags.AsNoTracking().WhereInScope(scope).Where(f => IntegrityFlagService.IntegrityTypes.Contains(f.Type));

    private (DateTimeOffset From, DateTimeOffset To) Range(DateTimeOffset? from, DateTimeOffset? to)
    {
        var toUtc = (to ?? time.GetUtcNow()).ToUniversalTime();
        var fromUtc = (from ?? toUtc.AddDays(-7)).ToUniversalTime();
        if (toUtc <= fromUtc || toUtc - fromUtc > MaxRange)
        {
            throw new BusinessRuleException("invalid-range", "Range must be positive and at most 31 days.");
        }

        return (fromUtc, toUtc);
    }

    private async Task<IReadOnlyList<IntegrityEventDto>> ToDtosAsync(IReadOnlyList<TrackingFlag> rows, CancellationToken cancellationToken)
    {
        var userIds = rows.Select(f => f.UserId).Concat(rows.Where(f => f.ReviewedById != null).Select(f => f.ReviewedById!.Value)).Distinct().ToArray();
        var names = await db.Users.AsNoTracking().Where(u => userIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.FullName, cancellationToken);

        var pointIds = rows.Where(f => f.LocationPointId != null).Select(f => f.LocationPointId!.Value).Distinct().ToArray();
        var points = (await db.LocationPoints.AsNoTracking().Where(p => pointIds.Contains(p.Id))
                .Select(p => new { p.Id, p.Location, p.RecordedAt })
                .ToListAsync(cancellationToken))
            .ToDictionary(p => p.Id);

        var visitIds = rows.Where(f => f.VisitId != null).Select(f => f.VisitId!.Value).Distinct().ToArray();
        var visits = await db.Visits.AsNoTracking().Where(v => visitIds.Contains(v.Id))
            .Select(v => new { v.Id, v.Customer!.Name, v.Customer.NameAr })
            .ToDictionaryAsync(v => v.Id, cancellationToken);

        return rows.Select(f =>
            {
                var point = f.LocationPointId is { } pid && points.TryGetValue(pid, out var p) ? p : null;
                var visit = f.VisitId is { } vid && visits.TryGetValue(vid, out var v) ? v : null;
                return new IntegrityEventDto(
                    f.Id, f.UserId, names.GetValueOrDefault(f.UserId, string.Empty), f.Type, f.Status, f.Score, f.Signals, f.Details,
                    f.CreatedAt, f.LastSeenAt, f.Occurrences, f.LocationPointId, point?.Location.Y, point?.Location.X, point?.RecordedAt,
                    f.VisitId, visit?.Name, visit?.NameAr, f.ReviewNote, f.ReviewedAt,
                    f.ReviewedById is { } reviewer ? names.GetValueOrDefault(reviewer) : null);
            })
            .ToList();
    }

    private static int WeightOf(string code) => code switch
    {
        AnomalyCodes.MockAppSelected => AnomalyWeights.MockAppSelected,
        AnomalyCodes.Emulator => AnomalyWeights.Emulator,
        AnomalyCodes.RootedDevice => AnomalyWeights.RootedDevice,
        AnomalyCodes.SpoofingAppInstalled => AnomalyWeights.SpoofingAppInstalled,
        AnomalyCodes.AutoTimeOff => AnomalyWeights.AutoTimeOff,
        _ => AnomalyWeights.LocationAccessory,
    };
}
