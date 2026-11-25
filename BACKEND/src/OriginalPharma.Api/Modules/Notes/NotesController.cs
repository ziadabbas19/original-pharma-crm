using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OriginalPharma.Application.Notes;

namespace OriginalPharma.Api.Modules.Notes;

/// <summary>
/// The caller's own private notes and reminders. Every signed-in user has them; nobody reads another
/// user's notes (their ids answer 404).
/// </summary>
[ApiController]
[Route("api/notes")]
[Tags("Notes")]
[Authorize]
public sealed class NotesController(NoteService notes) : ControllerBase
{
    /// <summary>Open notes by next reminder, done notes by when they were done (at most 500). <c>search</c> looks in title and text.</summary>
    [HttpGet]
    public Task<IReadOnlyList<NoteDto>> List(CancellationToken cancellationToken, [FromQuery] NoteStatus status = NoteStatus.Open, [FromQuery] string? search = null) =>
        notes.ListAsync(status, search, cancellationToken);

    [HttpGet("{id:guid}")]
    public Task<NoteDto> Get(Guid id, CancellationToken cancellationToken) =>
        notes.GetAsync(id, cancellationToken);

    /// <summary>Write a note. The same <c>clientRequestId</c> again returns the note already saved.</summary>
    [HttpPost]
    public Task<NoteDto> Create(CreateNoteRequest request, CancellationToken cancellationToken) =>
        notes.CreateAsync(request, cancellationToken);

    /// <summary>Change the text and the reminder (a changed reminder fires again).</summary>
    [HttpPut("{id:guid}")]
    public Task<NoteDto> Update(Guid id, UpdateNoteRequest request, CancellationToken cancellationToken) =>
        notes.UpdateAsync(id, request, cancellationToken);

    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await notes.DeleteAsync(id, cancellationToken);
        return NoContent();
    }

    [HttpPost("{id:guid}/done")]
    public Task<NoteDto> Done(Guid id, CancellationToken cancellationToken) =>
        notes.MarkDoneAsync(id, cancellationToken);

    /// <summary>Back to open; the reminder may fire again.</summary>
    [HttpPost("{id:guid}/reopen")]
    public Task<NoteDto> Reopen(Guid id, CancellationToken cancellationToken) =>
        notes.ReopenAsync(id, cancellationToken);

    /// <summary>Remind again in <c>minutes</c> (1 to 10080), at that time.</summary>
    [HttpPost("{id:guid}/snooze")]
    public Task<NoteDto> Snooze(Guid id, SnoozeNoteRequest request, CancellationToken cancellationToken) =>
        notes.SnoozeAsync(id, request, cancellationToken);
}
