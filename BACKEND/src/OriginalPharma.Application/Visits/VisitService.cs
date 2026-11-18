using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using OriginalPharma.Application.Catalog;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Auditing;
using OriginalPharma.Application.Common.Bulk;
using OriginalPharma.Application.Common.Images;
using OriginalPharma.Application.Common.Organization;
using OriginalPharma.Application.Common.Scoping;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Notifications;
using OriginalPharma.Domain.Audit;
using OriginalPharma.Domain.Common;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Domain.Notifications;
using OriginalPharma.Domain.Tracking;
using OriginalPharma.Domain.Visits;

namespace OriginalPharma.Application.Visits;

/// <summary>
/// Visit check-in / check-out with geofence, photo and optional QR verification, plus the visit
/// content: the rep's feedback and the products discussed. Feedback is visible to the rep's
/// reporting line and to anyone whose visits:read scope covers the rep; the supervisor and the
/// manager above them are notified, can mark it seen and reply.
/// </summary>
public sealed class VisitService(
    IAppDbContext db,
    ICurrentUser currentUser,
    IDataScopeResolver scopeResolver,
    IPermissionService permissions,
    IOrgHierarchy hierarchy,
    ProductAccess productAccess,
    NotificationService notifications,
    AuditTrail audit,
    IFileStorage fileStorage,
    IOptions<VisitOptions> options,
    TimeProvider time)
{
    /// <summary>How many levels of the reporting line are notified of new feedback (supervisor and their manager).</summary>
    public const int FeedbackRecipientLevels = 2;

    private static readonly Dictionary<string, string> PhotoExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ["image/jpeg"] = ".jpg",
        ["image/png"] = ".png",
        ["image/webp"] = ".webp",
    };

    public async Task<VisitDto> CheckInAsync(CheckInRequest request, CancellationToken cancellationToken = default)
    {
        var userId = currentUser.RequireUserId();
        var settings = options.Value;
        var now = time.GetUtcNow();

        var shift = await db.Shifts
                        .Where(s => s.UserId == userId && s.Status == ShiftStatus.Active)
                        .OrderByDescending(s => s.StartedAt)
                        .FirstOrDefaultAsync(cancellationToken)
                    ?? throw new BusinessRuleException("no-active-shift", "Start your day before checking in to a visit.");

        if (await db.Visits.AnyAsync(v => v.UserId == userId && v.Status == VisitStatus.InProgress && v.ArchivedAt == null, cancellationToken))
        {
            throw new ConflictException("visit-in-progress", "Check out of the current visit first.");
        }

        var customer = await db.Customers.AsNoTracking().SingleOrDefaultAsync(c => c.Id == request.CustomerId && c.IsActive && c.ArchivedAt == null, cancellationToken)
                       ?? throw new NotFoundException("Customer", request.CustomerId);

        if (customer.Location is null)
        {
            throw new BusinessRuleException("customer-location-missing", "This customer has no saved location yet.");
        }

        if (request.Accuracy > settings.MaxAccuracyMeters)
        {
            throw new BusinessRuleException("accuracy-too-low", $"Location accuracy is {request.Accuracy:0} m. Move outdoors or wait for a better GPS fix.");
        }

        var geofence = GeofenceEvaluator.Evaluate(
            customer.Location.Y, customer.Location.X, customer.GeofenceRadiusMeters,
            request.Lat, request.Lng, request.Accuracy, settings.MaxAccuracyAllowanceMeters);

        if (!geofence.Inside && settings.RejectOutsideGeofence)
        {
            throw new BusinessRuleException("outside-geofence", $"You are {geofence.DistanceMeters:0} m away from this location (allowed {geofence.AllowedMeters:0} m).");
        }

        var qrVerified = false;
        if (!string.IsNullOrWhiteSpace(request.QrPayload))
        {
            qrVerified = QrVerifier.Matches(customer.QrCode, request.QrPayload);
            if (!qrVerified)
            {
                throw new BusinessRuleException("qr-mismatch", "The scanned code does not belong to this location.");
            }
        }

        var territoryId = await db.Users.Where(u => u.Id == userId).Select(u => u.TerritoryId).SingleAsync(cancellationToken);
        var visit = new Visit
        {
            UserId = userId,
            TerritoryId = territoryId,
            CustomerId = customer.Id,
            ShiftId = shift.Id,
            DeviceId = request.DeviceId,
            CheckInAt = request.Timestamp.ToUniversalTime(),
            CheckInReceivedAt = now,
            CheckInLocation = GeoFactory.Point(request.Lat, request.Lng),
            CheckInAccuracy = request.Accuracy,
            CheckInDistanceMeters = Math.Round(geofence.DistanceMeters, 1),
            CheckInWithinGeofence = geofence.Inside,
            CheckInIsMock = request.IsMock,
            QrVerified = qrVerified,
            NeedsReview = request.IsMock || !geofence.Inside,
        };
        db.Visits.Add(visit);

        if (request.IsMock || !geofence.Inside)
        {
            db.TrackingFlags.Add(new TrackingFlag
            {
                UserId = userId,
                TerritoryId = territoryId,
                ShiftId = shift.Id,
                Type = request.IsMock ? TrackingFlagType.MockLocation : TrackingFlagType.VisitOutsideGeofence,
                Score = request.IsMock ? 60 : 30,
                Signals = request.IsMock ? ["mock-location"] : ["outside-geofence"],
                Details = $"Visit check-in at {customer.Name}: {geofence.DistanceMeters:0} m from location.",
                CreatedAt = now,
            });
        }

        await db.SaveChangesAsync(cancellationToken);
        return ToDto(visit, customer.Name);
    }

    public async Task<VisitDto> CheckOutAsync(Guid visitId, CheckOutRequest request, CancellationToken cancellationToken = default)
    {
        var userId = currentUser.RequireUserId();
        var visit = await db.Visits.Include(v => v.Customer).Include(v => v.Photos)
                        .SingleOrDefaultAsync(v => v.Id == visitId && v.UserId == userId, cancellationToken)
                    ?? throw new NotFoundException("Visit", visitId);

        if (visit.Status != VisitStatus.InProgress)
        {
            throw new ConflictException("visit-not-in-progress", "This visit is already closed.");
        }

        var location = visit.Customer!.Location!;
        var geofence = GeofenceEvaluator.Evaluate(
            location.Y, location.X, visit.Customer.GeofenceRadiusMeters,
            request.Lat, request.Lng, request.Accuracy, options.Value.MaxAccuracyAllowanceMeters);

        // Leaving before checking out is normal (rep walks to the car), so check-out is never rejected.
        visit.Status = VisitStatus.Completed;
        visit.CheckOutAt = request.Timestamp.ToUniversalTime();
        visit.CheckOutReceivedAt = time.GetUtcNow();
        visit.CheckOutLocation = GeoFactory.Point(request.Lat, request.Lng);
        visit.CheckOutAccuracy = request.Accuracy;
        visit.CheckOutDistanceMeters = Math.Round(geofence.DistanceMeters, 1);
        visit.CheckOutWithinGeofence = geofence.Inside;
        visit.CheckOutIsMock = request.IsMock;
        visit.Notes = request.Notes;
        visit.NeedsReview |= request.IsMock;

        await db.SaveChangesAsync(cancellationToken);
        return ToDto(visit, visit.Customer.Name);
    }

    public async Task<VisitPhotoDto> AddPhotoAsync(Guid visitId, Stream content, string contentType, long length, CancellationToken cancellationToken = default)
    {
        var userId = currentUser.RequireUserId();
        if (!PhotoExtensions.TryGetValue(contentType, out var extension))
        {
            throw new BusinessRuleException("unsupported-photo-type", "Only JPEG, PNG or WebP photos are accepted.");
        }

        if (length <= 0 || length > options.Value.MaxPhotoBytes)
        {
            throw new BusinessRuleException("photo-too-large", $"Photo must be smaller than {options.Value.MaxPhotoBytes / 1024 / 1024} MB.");
        }

        var visit = await db.Visits.SingleOrDefaultAsync(v => v.Id == visitId && v.UserId == userId, cancellationToken)
                    ?? throw new NotFoundException("Visit", visitId);

        var path = await fileStorage.SaveAsync(content, $"visits/{visit.Id}", extension, cancellationToken);
        var photo = new VisitPhoto
        {
            VisitId = visit.Id,
            StoragePath = path,
            ContentType = contentType,
            SizeBytes = length,
            UploadedAt = time.GetUtcNow(),
        };
        db.VisitPhotos.Add(photo);
        await db.SaveChangesAsync(cancellationToken);

        return new VisitPhotoDto(photo.Id, photo.ContentType, photo.SizeBytes, photo.UploadedAt);
    }

    /// <summary>
    /// A visit with its content. Readable with a visits:read scope that covers the visit, or by anyone
    /// in the rep's reporting line.
    /// </summary>
    public async Task<VisitDetailDto> GetAsync(Guid visitId, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var visit = await LoadAsync(visitId, cancellationToken);
        var access = await AccessAsync(visit, me, cancellationToken);
        if (!access.CanRead)
        {
            throw new NotFoundException("Visit", visitId);
        }

        return await BuildDetailAsync(visit, me, access, cancellationToken);
    }

    /// <summary>
    /// Replaces the feedback and products of the caller's own visit (visits:feedback) while it is open:
    /// in progress, or within <see cref="VisitOptions.ContentEditHours"/> after check-out. A changed
    /// feedback is announced to the supervisor and their manager.
    /// </summary>
    public async Task<VisitDetailDto> UpdateContentAsync(Guid visitId, UpdateVisitContentRequest request, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var visit = await db.Visits
                        .Include(v => v.Customer)
                        .Include(v => v.Feedback).ThenInclude(f => f!.SeenBy)
                        .Include(v => v.Products)
                        .SingleOrDefaultAsync(v => v.Id == visitId && v.UserId == me, cancellationToken)
                    ?? throw new NotFoundException("Visit", visitId);
        var access = await AccessAsync(visit, me, cancellationToken);

        // A retry, or an edit queued offline before one that already arrived: nothing to do.
        if (request.ClientUpdatedAt is { } clientTime && visit.ContentUpdatedAt is { } applied && clientTime <= applied)
        {
            return await BuildDetailAsync(visit, me, access, cancellationToken);
        }

        if (!access.CanEditContent)
        {
            throw new BusinessRuleException(VisitErrorCodes.ContentClosed, "This visit can no longer be changed.");
        }

        var now = time.GetUtcNow();
        await ApplyProductsAsync(visit, request.Products, me, cancellationToken);
        var feedbackChanged = ApplyFeedback(visit, request.Feedback, now);
        visit.ContentUpdatedAt = request.ClientUpdatedAt?.ToUniversalTime() ?? now;

        await audit.AddAsync(AuditEntities.Visit, visit.Id, AuditAction.Updated, new
        {
            feedback = visit.Feedback is null ? null : new { visit.Feedback.Category, length = visit.Feedback.Text.Length },
            products = visit.Products.Select(p => p.ProductId).ToArray(),
        }, cancellationToken: cancellationToken);

        if (feedbackChanged && visit.Feedback is not null)
        {
            var repName = await NameOfAsync(me, cancellationToken);
            var chain = await hierarchy.GetManagerChainAsync(me, cancellationToken);
            foreach (var recipient in chain.Take(FeedbackRecipientLevels))
            {
                notifications.Queue(recipient, NotificationType.VisitFeedback, visit.Id, new
                {
                    visitId = visit.Id,
                    repName,
                    customerName = visit.Customer!.Name,
                    customerNameAr = visit.Customer.NameAr,
                    category = visit.Feedback.Category,
                    excerpt = Excerpt(visit.Feedback.Text),
                });
            }
        }

        await db.SaveChangesAsync(cancellationToken);
        await notifications.PublishQueuedAsync(cancellationToken);
        return await GetAsync(visit.Id, cancellationToken);
    }

    /// <summary>A short answer to the rep's feedback from someone in the reporting line (or with a wider visits:read scope).</summary>
    public async Task<VisitDetailDto> ReplyAsync(Guid visitId, VisitReplyRequest request, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var visit = await LoadAsync(visitId, cancellationToken);
        var access = await AccessAsync(visit, me, cancellationToken);
        if (!access.CanRead)
        {
            throw new NotFoundException("Visit", visitId);
        }

        if (!access.CanReply)
        {
            throw visit.Feedback is null
                ? new BusinessRuleException(VisitErrorCodes.NoFeedback, "There is no feedback to answer.")
                : new ForbiddenException("Only the rep's reporting line can answer this feedback.");
        }

        var now = time.GetUtcNow();
        var name = await NameOfAsync(me, cancellationToken);
        var reply = new VisitFeedbackReply { VisitId = visit.Id, AuthorId = me, AuthorName = name, Text = request.Text.Trim(), CreatedAt = now };
        db.VisitFeedbackReplies.Add(reply);
        MarkSeen(visit, me, name, now);
        notifications.Queue(visit.UserId, NotificationType.VisitFeedbackReply, visit.Id, new
        {
            visitId = visit.Id,
            authorName = name,
            customerName = visit.Customer!.Name,
            customerNameAr = visit.Customer.NameAr,
            excerpt = Excerpt(reply.Text),
        });
        await audit.AddAsync(AuditEntities.Visit, visit.Id, AuditAction.Updated, new { reply = reply.Id }, cancellationToken: cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        await notifications.MarkEntityReadAsync(me, visit.Id, cancellationToken);
        await notifications.PublishQueuedAsync(cancellationToken);
        return await GetAsync(visit.Id, cancellationToken);
    }

    /// <summary>The caller has read the feedback (also marks their notifications about it as read).</summary>
    public async Task<VisitDetailDto> MarkFeedbackSeenAsync(Guid visitId, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var visit = await LoadAsync(visitId, cancellationToken);
        var access = await AccessAsync(visit, me, cancellationToken);
        if (!access.CanRead)
        {
            throw new NotFoundException("Visit", visitId);
        }

        if (visit.Feedback is null)
        {
            throw new BusinessRuleException(VisitErrorCodes.NoFeedback, "There is no feedback on this visit.");
        }

        if (visit.UserId != me)
        {
            MarkSeen(visit, me, await NameOfAsync(me, cancellationToken), time.GetUtcNow());
            await db.SaveChangesAsync(cancellationToken);
        }

        await notifications.MarkEntityReadAsync(me, visit.Id, cancellationToken);
        return await GetAsync(visit.Id, cancellationToken);
    }

    /// <summary>
    /// Deletes visits (visits:delete within scope). Visits are history, so they are always archived
    /// (hidden from lists and statistics, kept for audit). A visit still in progress is refused.
    /// </summary>
    public async Task<BulkResult> DeleteManyAsync(BulkDeleteRequest request, CancellationToken cancellationToken = default)
    {
        var scope = await scopeResolver.ResolveAsync(Permissions.Visits.Delete, cancellationToken);
        return await ArchiveOrRestoreAsync(request.Ids, scope, archive: true, request.DryRun, cancellationToken);
    }

    public async Task<BulkResult> RestoreManyAsync(BulkIdsRequest request, CancellationToken cancellationToken = default)
    {
        var scope = await scopeResolver.ResolveAsync(Permissions.Visits.Restore, cancellationToken);
        return await ArchiveOrRestoreAsync(request.Ids, scope, archive: false, false, cancellationToken);
    }

    private async Task<BulkResult> ArchiveOrRestoreAsync(IReadOnlyList<Guid> requested, DataScope scope, bool archive, bool dryRun, CancellationToken cancellationToken)
    {
        var me = currentUser.RequireUserId();
        var ids = requested.Distinct().ToArray();
        var visits = await db.Visits.Where(v => ids.Contains(v.Id)).ToDictionaryAsync(v => v.Id, cancellationToken);
        var now = time.GetUtcNow();
        var results = new List<BulkItemResult>();
        foreach (var id in ids)
        {
            if (!visits.TryGetValue(id, out var visit))
            {
                results.Add(new BulkItemResult(id, BulkOutcome.Blocked, BulkCodes.NotFound));
                continue;
            }

            var code = !scope.Includes(visit.UserId, visit.TerritoryId) ? BulkCodes.OutOfScope
                : archive && visit.Status == VisitStatus.InProgress ? BulkCodes.VisitInProgress
                : !archive && visit.ArchivedAt is null ? BulkCodes.NotArchived
                : null;
            if (code is not null)
            {
                results.Add(new BulkItemResult(id, BulkOutcome.Blocked, code));
                continue;
            }

            results.Add(new BulkItemResult(id, archive ? BulkOutcome.Archived : BulkOutcome.Restored));
            if (dryRun)
            {
                continue;
            }

            visit.ArchivedAt = archive ? visit.ArchivedAt ?? now : null;
            visit.ArchivedById = archive ? visit.ArchivedById ?? me : null;
            await audit.AddAsync(AuditEntities.Visit, id, archive ? AuditAction.Archived : AuditAction.Restored,
                new { visit.UserId, visit.CustomerId, visit.CheckInAt }, cancellationToken: cancellationToken);
        }

        var result = BulkResult.From(results, dryRun);
        if (!dryRun && result.Done > 0)
        {
            await audit.AddBulkAsync(AuditEntities.Visit, archive ? AuditAction.BulkDelete : AuditAction.BulkRestore, result, cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
        }

        return result;
    }

    private async Task<Visit> LoadAsync(Guid visitId, CancellationToken cancellationToken) =>
        await db.Visits
            .Include(v => v.Customer)
            .Include(v => v.Feedback).ThenInclude(f => f!.SeenBy)
            .Include(v => v.Products)
            .Include(v => v.Replies)
            .SingleOrDefaultAsync(v => v.Id == visitId, cancellationToken)
        ?? throw new NotFoundException("Visit", visitId);

    private async Task<VisitAccess> AccessAsync(Visit visit, Guid me, CancellationToken cancellationToken)
    {
        var effective = await permissions.GetEffectivePermissionsAsync(me, cancellationToken);
        var readScope = await scopeResolver.ResolveAsync(Permissions.Visits.Read, cancellationToken);
        var inReadScope = readScope.Includes(visit.UserId, visit.TerritoryId);
        var inChain = visit.UserId != me && (await hierarchy.GetManagerChainAsync(visit.UserId, cancellationToken)).Contains(me);
        var isRep = visit.UserId == me;
        var live = visit.ArchivedAt is null;

        DateTimeOffset? editableUntil = visit.Status == VisitStatus.Completed && visit.CheckOutAt is { } checkOut
            ? checkOut.AddHours(options.Value.ContentEditHours)
            : null;
        var open = live && (visit.Status == VisitStatus.InProgress ||
                            (visit.Status == VisitStatus.Completed && editableUntil > time.GetUtcNow()));

        // Someone above the rep: the reporting line, or a visits:read scope wider than "own".
        var overseer = !isRep && (inChain || (inReadScope && readScope.Level > PermissionScope.Own));
        return new VisitAccess(
            CanRead: inReadScope || inChain || isRep,
            CanEditContent: isRep && open && effective.Has(Permissions.Visits.Feedback),
            EditableUntil: editableUntil,
            CanReply: overseer && live && visit.Feedback is not null);
    }

    private async Task<VisitDetailDto> BuildDetailAsync(Visit visit, Guid me, VisitAccess access, CancellationToken cancellationToken)
    {
        var repName = await NameOfAsync(visit.UserId, cancellationToken);
        var productIds = visit.Products.Select(p => p.ProductId).ToArray();
        var products = await db.Products.AsNoTracking()
            .Where(p => productIds.Contains(p.Id))
            .Select(p => new { p.Id, p.NameAr, p.NameEn, p.ImageKey, p.ProductLineId })
            .ToDictionaryAsync(p => p.Id, cancellationToken);
        var photoCount = await db.VisitPhotos.CountAsync(p => p.VisitId == visit.Id, cancellationToken);
        var feedback = visit.Feedback;

        return new VisitDetailDto(
            visit.Id, visit.UserId, repName, visit.CustomerId, visit.Customer?.Name ?? string.Empty, visit.Customer?.NameAr,
            visit.Customer?.Type ?? Domain.Crm.CustomerType.Doctor, visit.Status, visit.CheckInAt, visit.CheckOutAt,
            visit.CheckInDistanceMeters, visit.CheckInWithinGeofence, visit.CheckOutDistanceMeters, visit.CheckOutWithinGeofence,
            visit.QrVerified, visit.NeedsReview, visit.Notes, photoCount,
            feedback is null
                ? null
                : new VisitFeedbackDto(feedback.Text, feedback.Category, feedback.CreatedAt, feedback.UpdatedAt,
                    feedback.SeenBy.OrderBy(s => s.SeenAt).Select(s => new VisitFeedbackSeenDto(s.UserId, s.UserName, s.SeenAt)).ToList()),
            visit.Replies.OrderBy(r => r.CreatedAt).Select(r => new VisitReplyDto(r.Id, r.AuthorId, r.AuthorName, r.Text, r.CreatedAt)).ToList(),
            visit.Products.OrderBy(p => p.SortOrder)
                .Where(p => products.ContainsKey(p.ProductId))
                .Select(p =>
                {
                    var product = products[p.ProductId];
                    return new VisitProductDto(p.ProductId, product.NameAr, product.NameEn,
                        ImageService.Url(product.ImageKey, ImageService.Thumbnail), product.ProductLineId, p.Note);
                })
                .ToList(),
            access.CanEditContent,
            access.EditableUntil,
            access.CanReply,
            access.CanReply && feedback is not null && feedback.SeenBy.All(s => s.UserId != me),
            visit.ArchivedAt);
    }

    private async Task ApplyProductsAsync(Visit visit, IReadOnlyList<VisitProductInput> requested, Guid repId, CancellationToken cancellationToken)
    {
        var kept = visit.Products.Select(p => p.ProductId).ToHashSet();
        var newIds = requested.Select(p => p.ProductId).Where(id => !kept.Contains(id)).Distinct().ToArray();
        if (newIds.Length > 0)
        {
            var visibleLines = await productAccess.VisibleLineIdsAsync(repId, cancellationToken);
            var allowed = await ProductAccess.WhereVisible(db.Products.AsNoTracking(), visibleLines)
                .Where(p => newIds.Contains(p.Id) && p.IsActive && p.ArchivedAt == null)
                .Select(p => p.Id)
                .ToListAsync(cancellationToken);
            if (allowed.Count != newIds.Length)
            {
                throw new BusinessRuleException(VisitErrorCodes.ProductUnavailable, "One of the products is not available to you.")
                {
                    Details = new Dictionary<string, object?> { ["productId"] = newIds.Except(allowed).First() },
                };
            }
        }

        var byId = visit.Products.ToDictionary(p => p.ProductId);
        var wanted = requested.Select(p => p.ProductId).ToHashSet();
        foreach (var removed in visit.Products.Where(p => !wanted.Contains(p.ProductId)).ToList())
        {
            visit.Products.Remove(removed);
            db.VisitProducts.Remove(removed);
        }

        var order = 0;
        foreach (var input in requested)
        {
            var note = string.IsNullOrWhiteSpace(input.Note) ? null : input.Note.Trim();
            if (byId.TryGetValue(input.ProductId, out var existing))
            {
                existing.Note = note;
                existing.SortOrder = order++;
            }
            else
            {
                var row = new VisitProduct { VisitId = visit.Id, ProductId = input.ProductId, Note = note, SortOrder = order++ };
                visit.Products.Add(row);
                db.VisitProducts.Add(row);
            }
        }
    }

    /// <summary>Returns true when the feedback is new or its text or category changed (seen markers are reset then).</summary>
    private bool ApplyFeedback(Visit visit, VisitFeedbackInput? input, DateTimeOffset now)
    {
        if (input is null)
        {
            if (visit.Feedback is null)
            {
                return false;
            }

            db.VisitFeedback.Remove(visit.Feedback);
            visit.Feedback = null;
            return false;
        }

        var text = input.Text.Trim();
        if (visit.Feedback is null)
        {
            visit.Feedback = new VisitFeedback { VisitId = visit.Id, Text = text, Category = input.Category, CreatedAt = now, UpdatedAt = now };
            db.VisitFeedback.Add(visit.Feedback);
            return true;
        }

        if (visit.Feedback.Text == text && visit.Feedback.Category == input.Category)
        {
            return false;
        }

        visit.Feedback.Text = text;
        visit.Feedback.Category = input.Category;
        visit.Feedback.UpdatedAt = now;
        db.VisitFeedbackSeen.RemoveRange(visit.Feedback.SeenBy);
        visit.Feedback.SeenBy.Clear();
        return true;
    }

    private void MarkSeen(Visit visit, Guid userId, string name, DateTimeOffset now)
    {
        if (visit.Feedback is null || visit.Feedback.SeenBy.Any(s => s.UserId == userId))
        {
            return;
        }

        var seen = new VisitFeedbackSeen { VisitId = visit.Id, UserId = userId, UserName = name, SeenAt = now };
        visit.Feedback.SeenBy.Add(seen);
        db.VisitFeedbackSeen.Add(seen);
    }

    private async Task<string> NameOfAsync(Guid userId, CancellationToken cancellationToken) =>
        await db.Users.AsNoTracking().Where(u => u.Id == userId).Select(u => u.FullName).SingleOrDefaultAsync(cancellationToken) ?? string.Empty;

    private static string Excerpt(string text) => text.Length <= 140 ? text : text[..137] + "...";

    private sealed record VisitAccess(bool CanRead, bool CanEditContent, DateTimeOffset? EditableUntil, bool CanReply);

    /// <summary>Upper bound for one list response until the list gets server paging.</summary>
    public const int MaxListRows = 1000;

    private static readonly TimeSpan MaxListRange = TimeSpan.FromDays(31);

    /// <summary>Visits in the caller's visits:read scope, newest first. Defaults to the last 7 days.</summary>
    public async Task<IReadOnlyList<VisitListItemDto>> ListAsync(
        DateTimeOffset? from,
        DateTimeOffset? to,
        Guid? userId,
        VisitStatus? status,
        bool? needsReview,
        CancellationToken cancellationToken = default,
        bool mine = false,
        Guid? productId = null,
        Domain.Visits.VisitFeedbackCategory? feedbackCategory = null,
        bool? hasFeedback = null,
        bool archived = false)
    {
        var toUtc = (to ?? time.GetUtcNow()).ToUniversalTime();
        var fromUtc = (from ?? toUtc.AddDays(-7)).ToUniversalTime();
        if (toUtc <= fromUtc || toUtc - fromUtc > MaxListRange)
        {
            throw new BusinessRuleException("invalid-range", "Range must be positive and at most 31 days.");
        }

        var scope = await scopeResolver.ResolveAsync(Permissions.Visits.Read, cancellationToken);
        var query = db.Visits.AsNoTracking()
            .WhereInScope(scope)
            .Where(v => v.CheckInAt >= fromUtc && v.CheckInAt < toUtc)
            .Where(v => archived ? v.ArchivedAt != null : v.ArchivedAt == null);

        if (mine)
        {
            var me = currentUser.RequireUserId();
            query = query.Where(v => v.UserId == me);
        }

        if (productId is not null)
        {
            query = query.Where(v => v.Products.Any(p => p.ProductId == productId));
        }

        if (feedbackCategory is not null)
        {
            query = query.Where(v => v.Feedback != null && v.Feedback.Category == feedbackCategory);
        }

        if (hasFeedback is not null)
        {
            query = query.Where(v => (v.Feedback != null) == hasFeedback);
        }

        if (userId is not null)
        {
            query = query.Where(v => v.UserId == userId);
        }

        if (status is not null)
        {
            query = query.Where(v => v.Status == status);
        }

        if (needsReview is not null)
        {
            query = query.Where(v => v.NeedsReview == needsReview);
        }

        return await query
            .OrderByDescending(v => v.CheckInAt)
            .Take(MaxListRows)
            .Select(v => new VisitListItemDto(
                v.Id,
                v.UserId,
                db.Users.Where(u => u.Id == v.UserId).Select(u => u.FullName).FirstOrDefault() ?? string.Empty,
                v.CustomerId,
                v.Customer!.Name,
                v.Customer.NameAr,
                v.Customer.Type,
                v.Status,
                v.CheckInAt,
                v.CheckInDistanceMeters,
                v.CheckInWithinGeofence,
                v.CheckOutAt,
                v.CheckOutDistanceMeters,
                v.CheckOutWithinGeofence,
                v.QrVerified,
                v.NeedsReview,
                v.Photos.Count,
                v.Feedback != null,
                v.Feedback != null ? v.Feedback.Category : null,
                v.Products.Count,
                v.Replies.Count,
                v.ArchivedAt))
            .ToListAsync(cancellationToken);
    }

    private static VisitDto ToDto(Visit v, string? customerName) => new(
        v.Id, v.CustomerId, customerName, v.UserId, v.Status,
        v.CheckInAt, v.CheckInDistanceMeters, v.CheckInWithinGeofence,
        v.CheckOutAt, v.CheckOutDistanceMeters, v.CheckOutWithinGeofence,
        v.QrVerified, v.NeedsReview,
        v.Photos.Select(p => new VisitPhotoDto(p.Id, p.ContentType, p.SizeBytes, p.UploadedAt)).ToList());
}
