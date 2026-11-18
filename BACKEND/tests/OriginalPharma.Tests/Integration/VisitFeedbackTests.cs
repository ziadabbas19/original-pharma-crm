using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Notifications;
using OriginalPharma.Application.Visits;
using OriginalPharma.Domain.Notifications;
using OriginalPharma.Domain.Visits;

namespace OriginalPharma.Tests.Integration;

[Collection(PostgresCollection.Name)]
public sealed class VisitFeedbackTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>The rep's newest demo visit (checked out today, so still open for feedback).</summary>
    private static Task<Visit> LatestVisitAsync(TestDatabase db, Guid rep) =>
        db.DbAsync(c => c.Visits.Where(v => v.UserId == rep).OrderByDescending(v => v.CheckInAt).FirstAsync(Ct));

    private static Task<VisitDetailDto> GetAsync(TestDatabase db, Guid actor, Guid visitId) =>
        db.As<VisitService, VisitDetailDto>(actor, s => s.GetAsync(visitId, Ct));

    private static Task<VisitDetailDto> UpdateAsync(TestDatabase db, Guid actor, Guid visitId, UpdateVisitContentRequest request) =>
        db.As<VisitService, VisitDetailDto>(actor, s => s.UpdateContentAsync(visitId, request, Ct));

    [Fact]
    public async Task Feedback_reaches_the_reporting_line_and_their_reply_reaches_the_rep()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var visit = await LatestVisitAsync(db, p.RepEast);
        var dermacalm = await DemoPeople.ProductAsync(db, "Dermacalm cream 50 g");
        var probiokid = await DemoPeople.ProductAsync(db, "Probiokid sachets, 10");
        var countsBefore = await db.DbAsync(c => c.Notifications.Where(n => n.Type == NotificationType.VisitFeedback)
            .GroupBy(n => n.UserId).ToDictionaryAsync(g => g.Key, g => g.Count(), Ct));

        var updated = await UpdateAsync(db, p.RepEast, visit.Id, new UpdateVisitContentRequest(
            new VisitFeedbackInput("Wants a cheaper pack size for students.", VisitFeedbackCategory.Request),
            [new VisitProductInput(dermacalm, "Showed the new leaflet"), new VisitProductInput(probiokid)],
            DateTimeOffset.UtcNow));
        Assert.Equal(VisitFeedbackCategory.Request, updated.Feedback!.Category);
        Assert.Equal([dermacalm, probiokid], updated.Products.Select(x => x.ProductId));
        Assert.Equal("Showed the new leaflet", updated.Products[0].Note);
        Assert.True(updated.CanEditContent);

        // Supervisor and area manager are told; the sales manager (third level) and other reps are not.
        var countsAfter = await db.DbAsync(c => c.Notifications.Where(n => n.Type == NotificationType.VisitFeedback)
            .GroupBy(n => n.UserId).ToDictionaryAsync(g => g.Key, g => g.Count(), Ct));
        int Added(Guid user) => countsAfter.GetValueOrDefault(user) - countsBefore.GetValueOrDefault(user);
        Assert.Equal((1, 1, 0, 0), (Added(p.Supervisor), Added(p.Area), Added(p.Sales), Added(p.Rep)));

        // Visible along the reporting line and to wider visits:read scopes; not to another rep.
        Assert.NotNull((await GetAsync(db, p.Supervisor, visit.Id)).Feedback);
        Assert.NotNull((await GetAsync(db, p.Area, visit.Id)).Feedback);
        Assert.NotNull((await GetAsync(db, p.Sales, visit.Id)).Feedback);
        await Assert.ThrowsAsync<NotFoundException>(() => GetAsync(db, p.Rep, visit.Id));

        // The supervisor marks it seen and answers; the rep is notified and sees both.
        var seen = await db.As<VisitService, VisitDetailDto>(p.Supervisor, s => s.MarkFeedbackSeenAsync(visit.Id, Ct));
        Assert.Contains(seen.Feedback!.SeenBy, x => x.UserId == p.Supervisor);
        Assert.False(seen.CanMarkSeen);
        var unread = await db.As<NotificationService, IReadOnlyList<NotificationDto>>(p.Supervisor, s => s.ListAsync(new NotificationQuery(UnreadOnly: true), Ct));
        Assert.DoesNotContain(unread, n => n.EntityId == visit.Id);

        await db.As<VisitService, VisitDetailDto>(p.Supervisor, s => s.ReplyAsync(visit.Id, new VisitReplyRequest("Noted, I will ask marketing."), Ct));
        var repView = await GetAsync(db, p.RepEast, visit.Id);
        Assert.Equal("Noted, I will ask marketing.", repView.Replies.Single(r => r.AuthorId == p.Supervisor).Text);
        Assert.False(repView.CanReply);
        var repInbox = await db.As<NotificationService, IReadOnlyList<NotificationDto>>(p.RepEast, s => s.ListAsync(new NotificationQuery(), Ct));
        Assert.Equal(NotificationType.VisitFeedbackReply, repInbox.First().Type);

        // Another rep cannot answer.
        await Assert.ThrowsAsync<NotFoundException>(() => db.As<VisitService, VisitDetailDto>(p.Rep, s => s.ReplyAsync(visit.Id, new VisitReplyRequest("Hi"), Ct)));

        // Changing the feedback clears the seen markers and tells the line again.
        var changed = await UpdateAsync(db, p.RepEast, visit.Id, new UpdateVisitContentRequest(
            new VisitFeedbackInput("Wants a cheaper pack size and samples.", VisitFeedbackCategory.Request), [new VisitProductInput(dermacalm)], DateTimeOffset.UtcNow.AddSeconds(5)));
        Assert.Empty(changed.Feedback!.SeenBy);
    }

    [Fact]
    public async Task Offline_retries_and_late_updates_never_overwrite_newer_content()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var visit = await LatestVisitAsync(db, p.Rep);
        var cardiolin = await DemoPeople.ProductAsync(db, "Cardiolin 5 mg, 30 tablets");
        var newer = DateTimeOffset.UtcNow;

        var first = new UpdateVisitContentRequest(new VisitFeedbackInput("Second thoughts", VisitFeedbackCategory.NeedsFollowUp), [new VisitProductInput(cardiolin)], newer);
        await UpdateAsync(db, p.Rep, visit.Id, first);
        var retry = await UpdateAsync(db, p.Rep, visit.Id, first);
        Assert.Equal("Second thoughts", retry.Feedback!.Text);

        var stale = await UpdateAsync(db, p.Rep, visit.Id, new UpdateVisitContentRequest(
            new VisitFeedbackInput("Old draft written offline"), [], newer.AddMinutes(-10)));
        Assert.Equal("Second thoughts", stale.Feedback!.Text);
        Assert.Single(stale.Products);
    }

    [Fact]
    public async Task Content_is_limited_to_the_reps_products_and_to_the_edit_window()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var visit = await LatestVisitAsync(db, p.Rep);
        var derma = await DemoPeople.ProductAsync(db, "Acnoclear gel 30 g"); // not one of the rep's lines

        var notMine = await Assert.ThrowsAsync<BusinessRuleException>(() => UpdateAsync(db, p.Rep, visit.Id,
            new UpdateVisitContentRequest(null, [new VisitProductInput(derma)])));
        Assert.Equal(VisitErrorCodes.ProductUnavailable, notMine.Code);

        // Someone else's visit is not found for the rep.
        var other = await LatestVisitAsync(db, p.RepEast);
        await Assert.ThrowsAsync<NotFoundException>(() => UpdateAsync(db, p.Rep, other.Id, new UpdateVisitContentRequest(null, [])));

        // Older than the 24 h window after check-out: closed.
        var old = await db.DbAsync(c => c.Visits.Where(v => v.UserId == p.Rep).OrderBy(v => v.CheckInAt).FirstAsync(Ct));
        var closed = await Assert.ThrowsAsync<BusinessRuleException>(() => UpdateAsync(db, p.Rep, old.Id,
            new UpdateVisitContentRequest(new VisitFeedbackInput("Late"), [], DateTimeOffset.UtcNow)));
        Assert.Equal(VisitErrorCodes.ContentClosed, closed.Code);
        Assert.False((await GetAsync(db, p.Rep, old.Id)).CanEditContent);

        // Products discussed can be used to filter the visit list.
        var cardiolin = await DemoPeople.ProductAsync(db, "Cardiolin 5 mg, 30 tablets");
        var filtered = await db.As<VisitService, IReadOnlyList<VisitListItemDto>>(p.Supervisor, s => s.ListAsync(
            DateTimeOffset.UtcNow.AddDays(-10), DateTimeOffset.UtcNow.AddDays(1), null, null, null, Ct, productId: cardiolin));
        Assert.NotEmpty(filtered);
        Assert.All(filtered, v => Assert.True(v.ProductCount > 0));
    }
}
