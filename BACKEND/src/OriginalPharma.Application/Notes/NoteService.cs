using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Domain.Notes;
using OriginalPharma.Domain.Notifications;

namespace OriginalPharma.Application.Notes;

/// <summary>
/// Private notes with reminders. Every read and change is limited to the caller's own notes (the user
/// comes from the token, never from the request); another user's note is reported as not found.
/// </summary>
public sealed class NoteService(IAppDbContext db, ICurrentUser currentUser, TimeProvider time)
{
    public const int MaxListRows = 500;

    public async Task<IReadOnlyList<NoteDto>> ListAsync(NoteStatus status, string? search, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var query = db.RepNotes.AsNoTracking().Where(n => n.UserId == me);
        query = status switch
        {
            NoteStatus.Open => query.Where(n => n.DoneAt == null),
            NoteStatus.Done => query.Where(n => n.DoneAt != null),
            _ => query,
        };

        if (!string.IsNullOrWhiteSpace(search))
        {
            var text = search.Trim().ToLower();
            query = query.Where(n => (n.Title != null && n.Title.ToLower().Contains(text)) || n.Body.ToLower().Contains(text));
        }

        // Open notes first; among them the next reminder first, then notes without one (latest change first).
        var rows = await query
            .OrderBy(n => n.DoneAt != null)
            .ThenByDescending(n => n.DoneAt)
            .ThenBy(n => n.NotifyAt == null)
            .ThenBy(n => n.NotifyAt)
            .ThenByDescending(n => n.UpdatedAt)
            .Take(MaxListRows)
            .ToListAsync(cancellationToken);
        return rows.Select(ToDto).ToList();
    }

    public async Task<NoteDto> GetAsync(Guid id, CancellationToken cancellationToken = default) =>
        ToDto(await FindOwnAsync(id, tracked: false, cancellationToken));

    public async Task<NoteDto> CreateAsync(CreateNoteRequest request, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();

        // A retry of a note that already reached the server (offline outbox, lost response).
        if (await FindByClientRequestAsync(me, request.ClientRequestId, cancellationToken) is { } existing)
        {
            return ToDto(existing);
        }

        var now = time.GetUtcNow();
        var note = new RepNote
        {
            UserId = me,
            ClientRequestId = request.ClientRequestId,
            Title = Clean(request.Title),
            Body = request.Body?.Trim() ?? string.Empty,
            CreatedAt = now,
            UpdatedAt = now,
        };
        note.SetReminder(request.RemindAt?.ToUniversalTime(), request.RemindBeforeMinutes);
        db.RepNotes.Add(note);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // The same key arrived twice at the same moment and the other request won the unique index.
            var winner = await FindByClientRequestAsync(me, request.ClientRequestId, cancellationToken);
            if (winner is null)
            {
                throw;
            }

            return ToDto(winner);
        }

        return ToDto(note);
    }

    public async Task<NoteDto> UpdateAsync(Guid id, UpdateNoteRequest request, CancellationToken cancellationToken = default)
    {
        var note = await FindOwnAsync(id, tracked: true, cancellationToken);
        note.Title = Clean(request.Title);
        note.Body = request.Body?.Trim() ?? string.Empty;
        note.SetReminder(request.RemindAt?.ToUniversalTime(), request.RemindBeforeMinutes);
        note.UpdatedAt = time.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);
        return ToDto(note);
    }

    /// <summary>Deletes the note and the reminders it raised (they would point at nothing).</summary>
    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var note = await FindOwnAsync(id, tracked: true, cancellationToken);
        db.RepNotes.Remove(note);
        await db.SaveChangesAsync(cancellationToken);
        await db.Notifications
            .Where(n => n.UserId == note.UserId && n.EntityId == note.Id && n.Type == NotificationType.NoteReminder)
            .ExecuteDeleteAsync(cancellationToken);
    }

    public async Task<NoteDto> MarkDoneAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var note = await FindOwnAsync(id, tracked: true, cancellationToken);
        if (note.DoneAt is null)
        {
            var now = time.GetUtcNow();
            note.DoneAt = now;
            note.UpdatedAt = now;
            await db.SaveChangesAsync(cancellationToken);
        }

        return ToDto(note);
    }

    /// <summary>Back to open; its reminder may fire again (at once when its time has passed).</summary>
    public async Task<NoteDto> ReopenAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var note = await FindOwnAsync(id, tracked: true, cancellationToken);
        note.DoneAt = null;
        note.NotifiedAt = null;
        note.UpdatedAt = time.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);
        return ToDto(note);
    }

    /// <summary>Remind again in <see cref="SnoozeNoteRequest.Minutes"/> minutes, at that time.</summary>
    public async Task<NoteDto> SnoozeAsync(Guid id, SnoozeNoteRequest request, CancellationToken cancellationToken = default)
    {
        var note = await FindOwnAsync(id, tracked: true, cancellationToken);
        var now = time.GetUtcNow();
        note.RemindAt = now.AddMinutes(request.Minutes);
        note.RemindBeforeMinutes = 0;
        note.NotifyAt = note.RemindAt;
        note.NotifiedAt = null;
        note.UpdatedAt = now;
        await db.SaveChangesAsync(cancellationToken);
        return ToDto(note);
    }

    private async Task<RepNote> FindOwnAsync(Guid id, bool tracked, CancellationToken cancellationToken)
    {
        var me = currentUser.RequireUserId();
        var query = tracked ? db.RepNotes : db.RepNotes.AsNoTracking();
        return await query.SingleOrDefaultAsync(n => n.Id == id && n.UserId == me, cancellationToken)
               ?? throw new NotFoundException("Note", id);
    }

    private Task<RepNote?> FindByClientRequestAsync(Guid userId, Guid clientRequestId, CancellationToken cancellationToken) =>
        db.RepNotes.AsNoTracking().FirstOrDefaultAsync(n => n.UserId == userId && n.ClientRequestId == clientRequestId, cancellationToken);

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    internal static NoteDto ToDto(RepNote n) =>
        new(n.Id, n.ClientRequestId, n.Title, n.Body, n.RemindAt, n.RemindBeforeMinutes, n.NotifyAt, n.NotifiedAt, n.DoneAt, n.CreatedAt, n.UpdatedAt);
}
