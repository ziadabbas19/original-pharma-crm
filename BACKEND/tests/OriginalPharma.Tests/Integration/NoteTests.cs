using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Notes;
using OriginalPharma.Domain.Notes;
using OriginalPharma.Domain.Notifications;
using OriginalPharma.Infrastructure.Identity;

namespace OriginalPharma.Tests.Integration;

/// <summary>Private notes with reminders: own data only, offline-safe creation and reminders that fire once.</summary>
[Collection(PostgresCollection.Name)]
public sealed class NoteTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>Reminder times are kept to the second.</summary>
    private static DateTimeOffset Whole(DateTimeOffset t) => new(t.UtcTicks - (t.UtcTicks % TimeSpan.TicksPerSecond), TimeSpan.Zero);

    private static Task<NoteDto> CreateAsync(TestDatabase db, Guid user, string body, DateTimeOffset? remindAt = null, int? before = null, Guid? key = null) =>
        db.As<NoteService, NoteDto>(user, s => s.CreateAsync(new CreateNoteRequest(key ?? Guid.NewGuid(), null, body, remindAt, before), Ct));

    private static Task<int> RunJobAsync(TestDatabase db) =>
        db.As<NoteRemindersJob, int>(Guid.Empty, j => j.RunAsync(Ct));

    private static Task<int> RemindersOfAsync(TestDatabase db, Guid noteId) =>
        db.DbAsync(c => c.Notifications.CountAsync(n => n.EntityId == noteId && n.Type == NotificationType.NoteReminder, Ct));

    private static Task<RepNote> RowAsync(TestDatabase db, Guid noteId) =>
        db.DbAsync(c => c.RepNotes.AsNoTracking().SingleAsync(n => n.Id == noteId, Ct));

    [Fact]
    public async Task Notes_are_strictly_the_owners_and_other_ids_answer_not_found()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var note = await CreateAsync(db, p.Rep, "Call the pharmacy", DateTimeOffset.UtcNow.AddHours(1), 0);

        // Not even the rep's own manager or the admin can open it.
        foreach (var other in new[] { p.RepEast, p.Supervisor, p.Admin })
        {
            await Assert.ThrowsAsync<NotFoundException>(() => db.As<NoteService, NoteDto>(other, s => s.GetAsync(note.Id, Ct)));
            await Assert.ThrowsAsync<NotFoundException>(() => db.As<NoteService, NoteDto>(other, s => s.UpdateAsync(note.Id, new UpdateNoteRequest(null, "mine now"), Ct)));
            await Assert.ThrowsAsync<NotFoundException>(() => db.As<NoteService, NoteDto>(other, s => s.MarkDoneAsync(note.Id, Ct)));
            await Assert.ThrowsAsync<NotFoundException>(() => db.As<NoteService, NoteDto>(other, s => s.ReopenAsync(note.Id, Ct)));
            await Assert.ThrowsAsync<NotFoundException>(() => db.As<NoteService, NoteDto>(other, s => s.SnoozeAsync(note.Id, new SnoozeNoteRequest(10), Ct)));
            await Assert.ThrowsAsync<NotFoundException>(() => db.As<NoteService>(other, s => s.DeleteAsync(note.Id, Ct)));
            var theirs = await db.As<NoteService, IReadOnlyList<NoteDto>>(other, s => s.ListAsync(NoteStatus.All, null, Ct));
            Assert.DoesNotContain(theirs, n => n.Id == note.Id);
        }

        var row = await RowAsync(db, note.Id);
        Assert.Equal("Call the pharmacy", row.Body);
        Assert.Null(row.DoneAt);

        // Any signed-in user has notes: no permission on the endpoints, only sign-in.
        var controller = typeof(Api.Modules.Notes.NotesController);
        Assert.NotNull(controller.GetCustomAttribute<AuthorizeAttribute>());
        Assert.Empty(controller.GetMethods().SelectMany(m => m.GetCustomAttributes<HasPermissionAttribute>()));
    }

    [Fact]
    public async Task Creating_twice_with_the_same_client_request_id_stores_one_note()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var key = Guid.NewGuid();

        var first = await CreateAsync(db, p.Rep, "Samples for Dr Hany", key: key);
        var again = await CreateAsync(db, p.Rep, "Samples for Dr Hany", key: key);
        var racing = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => CreateAsync(db, p.Rep, "Racing", key: Guid.Parse("00000000-0000-0000-0000-0000000000a1"))));

        Assert.Equal(first.Id, again.Id);
        Assert.Single(racing.Select(n => n.Id).Distinct());
        Assert.Equal(1, await db.DbAsync(c => c.RepNotes.CountAsync(n => n.ClientRequestId == key, Ct)));

        // The key is unique per user: another rep's phone may pick the same one.
        var other = await CreateAsync(db, p.RepEast, "Other rep", key: key);
        Assert.NotEqual(first.Id, other.Id);
    }

    [Fact]
    public async Task Notify_time_is_the_reminder_minus_the_chosen_minutes()
    {
        var at = new DateTimeOffset(2026, 12, 1, 9, 0, 0, TimeSpan.Zero);
        Assert.Equal(at, RepNote.ComputeNotifyAt(at, 0));
        Assert.Equal(at.AddMinutes(-15), RepNote.ComputeNotifyAt(at, 15));
        Assert.Equal(at.AddDays(-1), RepNote.ComputeNotifyAt(at, 1440));
        Assert.Equal(at, RepNote.ComputeNotifyAt(at, null));
        Assert.Null(RepNote.ComputeNotifyAt(null, 30));

        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var remindAt = Whole(DateTimeOffset.UtcNow.AddDays(2));

        var note = await CreateAsync(db, p.Rep, "Weekly meeting", remindAt, 60);
        Assert.Equal(remindAt.AddHours(-1), note.NotifyAt);
        Assert.Equal(60, note.RemindBeforeMinutes);

        var changed = await db.As<NoteService, NoteDto>(p.Rep, s => s.UpdateAsync(note.Id, new UpdateNoteRequest("Meeting", "Weekly meeting", remindAt, 1440), Ct));
        Assert.Equal(remindAt.AddDays(-1), changed.NotifyAt);

        var removed = await db.As<NoteService, NoteDto>(p.Rep, s => s.UpdateAsync(note.Id, new UpdateNoteRequest("Meeting", "Weekly meeting", null, 30), Ct));
        Assert.Null(removed.RemindAt);
        Assert.Null(removed.RemindBeforeMinutes);
        Assert.Null(removed.NotifyAt);

        // A notify time already in the past is accepted: it fires on the next run.
        var late = await CreateAsync(db, p.Rep, "Already late", DateTimeOffset.UtcNow.AddMinutes(10), 30);
        Assert.True(late.NotifyAt < DateTimeOffset.UtcNow);
        Assert.Equal(1, await RunJobAsync(db));
        Assert.Equal(1, await RemindersOfAsync(db, late.Id));

        // Out-of-range "before" values are refused by the request validator.
        var validator = new CreateNoteRequestValidator();
        Assert.False((await validator.ValidateAsync(new CreateNoteRequest(Guid.NewGuid(), null, "x", remindAt, -1), Ct)).IsValid);
        Assert.False((await validator.ValidateAsync(new CreateNoteRequest(Guid.NewGuid(), null, "x", remindAt, 10_081), Ct)).IsValid);
        Assert.False((await validator.ValidateAsync(new CreateNoteRequest(Guid.NewGuid(), " ", null), Ct)).IsValid);
        Assert.True((await validator.ValidateAsync(new CreateNoteRequest(Guid.NewGuid(), null, "x", remindAt, 10_080), Ct)).IsValid);
    }

    [Fact]
    public async Task Each_due_reminder_fires_exactly_once_even_when_two_runs_overlap()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var now = DateTimeOffset.UtcNow;
        var due = new List<NoteDto>();
        for (var i = 0; i < 40; i++)
        {
            due.Add(await CreateAsync(db, i % 2 == 0 ? p.Rep : p.RepEast, $"Due {i} " + new string('x', 200), now.AddMinutes(-i), 0));
        }

        var future = await CreateAsync(db, p.Rep, "Later", now.AddHours(3), 30);
        var noReminder = await CreateAsync(db, p.Rep, "Just a note");

        var counts = await Task.WhenAll(RunJobAsync(db), RunJobAsync(db), RunJobAsync(db));
        Assert.Equal(due.Count, counts.Sum());
        Assert.Equal(0, await RunJobAsync(db));

        foreach (var note in due)
        {
            Assert.Equal(1, await RemindersOfAsync(db, note.Id));
            Assert.NotNull((await RowAsync(db, note.Id)).NotifiedAt);
        }

        Assert.Equal(0, await RemindersOfAsync(db, future.Id));
        Assert.Equal(0, await RemindersOfAsync(db, noReminder.Id));

        // The notification goes to the owner, points at the note and carries the start of the text.
        var sample = await db.DbAsync(c => c.Notifications.SingleAsync(n => n.EntityId == due[0].Id, Ct));
        Assert.Equal(p.Rep, sample.UserId);
        var data = System.Text.Json.JsonDocument.Parse(sample.Data).RootElement;
        var excerpt = data.GetProperty("excerpt").GetString()!;
        Assert.StartsWith("Due 0 xxx", excerpt);
        Assert.Equal(NoteRemindersJob.ExcerptLength, excerpt.Length);
        Assert.Equal(System.Text.Json.JsonValueKind.String, data.GetProperty("remindAt").ValueKind);
        Assert.Contains(db.Published.Sent, s => s.UserId == p.RepEast && s.Notification.EntityId == due[1].Id);

        // Its time comes: it fires once.
        db.Clock.Advance(TimeSpan.FromHours(3));
        Assert.Equal(1, await RunJobAsync(db));
        Assert.Equal(1, await RemindersOfAsync(db, future.Id));
    }

    [Fact]
    public async Task Snooze_reopen_and_a_changed_reminder_let_it_fire_again_but_a_text_edit_does_not()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var remindAt = Whole(DateTimeOffset.UtcNow.AddMinutes(-1));
        var note = await CreateAsync(db, p.Rep, "Visit Dr Salma", remindAt, 0);
        Assert.Equal(1, await RunJobAsync(db));

        // Only the text changes: it does not fire again.
        await db.As<NoteService, NoteDto>(p.Rep, s => s.UpdateAsync(note.Id, new UpdateNoteRequest("Salma", "Visit Dr Salma at 5", remindAt, 0), Ct));
        Assert.NotNull((await RowAsync(db, note.Id)).NotifiedAt);
        Assert.Equal(0, await RunJobAsync(db));

        // Snooze 10 minutes: cleared, due again at now + 10 with no "before".
        var snoozed = await db.As<NoteService, NoteDto>(p.Rep, s => s.SnoozeAsync(note.Id, new SnoozeNoteRequest(10), Ct));
        Assert.Null(snoozed.NotifiedAt);
        Assert.Equal(0, snoozed.RemindBeforeMinutes);
        Assert.Equal(snoozed.RemindAt, snoozed.NotifyAt);
        Assert.InRange(snoozed.NotifyAt!.Value, DateTimeOffset.UtcNow.AddMinutes(9), DateTimeOffset.UtcNow.AddMinutes(11));
        Assert.Equal(0, await RunJobAsync(db));
        db.Clock.Advance(TimeSpan.FromMinutes(11));
        Assert.Equal(1, await RunJobAsync(db));
        Assert.Equal(2, await RemindersOfAsync(db, note.Id));

        // A changed reminder time clears it too.
        var moved = await db.As<NoteService, NoteDto>(p.Rep, s => s.UpdateAsync(note.Id, new UpdateNoteRequest("Salma", "Visit Dr Salma at 5", remindAt.AddMinutes(5), 0), Ct));
        Assert.Null(moved.NotifiedAt);
        Assert.Equal(1, await RunJobAsync(db));

        // Done, then reopened: cleared and fires again (its time has passed, so at once).
        await db.As<NoteService, NoteDto>(p.Rep, s => s.MarkDoneAsync(note.Id, Ct));
        var reopened = await db.As<NoteService, NoteDto>(p.Rep, s => s.ReopenAsync(note.Id, Ct));
        Assert.Null(reopened.DoneAt);
        Assert.Null(reopened.NotifiedAt);
        Assert.Equal(1, await RunJobAsync(db));
        Assert.Equal(4, await RemindersOfAsync(db, note.Id));

        // Deleting the note removes the reminders it raised.
        await db.As<NoteService>(p.Rep, s => s.DeleteAsync(note.Id, Ct));
        Assert.Equal(0, await RemindersOfAsync(db, note.Id));
        await Assert.ThrowsAsync<NotFoundException>(() => db.As<NoteService, NoteDto>(p.Rep, s => s.GetAsync(note.Id, Ct)));
    }

    [Fact]
    public async Task Done_notes_never_fire()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var past = await CreateAsync(db, p.Rep, "Done before its time", DateTimeOffset.UtcNow.AddMinutes(-5), 0);
        var later = await CreateAsync(db, p.Rep, "Done early", DateTimeOffset.UtcNow.AddMinutes(30), 15);
        await db.As<NoteService, NoteDto>(p.Rep, s => s.MarkDoneAsync(past.Id, Ct));
        await db.As<NoteService, NoteDto>(p.Rep, s => s.MarkDoneAsync(later.Id, Ct));

        // Snoozing a done note does not bring it back either.
        await db.As<NoteService, NoteDto>(p.Rep, s => s.SnoozeAsync(later.Id, new SnoozeNoteRequest(1), Ct));
        db.Clock.Advance(TimeSpan.FromHours(1));

        Assert.Equal(0, await RunJobAsync(db));
        Assert.Equal(0, await RemindersOfAsync(db, past.Id));
        Assert.Equal(0, await RemindersOfAsync(db, later.Id));

        var open = await db.As<NoteService, IReadOnlyList<NoteDto>>(p.Rep, s => s.ListAsync(NoteStatus.Open, null, Ct));
        var done = await db.As<NoteService, IReadOnlyList<NoteDto>>(p.Rep, s => s.ListAsync(NoteStatus.Done, "early", Ct));
        Assert.DoesNotContain(open, n => n.Id == past.Id || n.Id == later.Id);
        Assert.Equal([later.Id], done.Select(n => n.Id));
    }
}
