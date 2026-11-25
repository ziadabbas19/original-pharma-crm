using FluentValidation;
using OriginalPharma.Domain.Notes;

namespace OriginalPharma.Application.Notes;

/// <summary>open: not done yet; done: marked done; all: both (open first).</summary>
public enum NoteStatus
{
    Open = 1,
    Done = 2,
    All = 3,
}

/// <param name="RemindAt">The time the reminder is about (null: no reminder).</param>
/// <param name="RemindBeforeMinutes">How long before <paramref name="RemindAt"/> the owner is notified (0 = at the time).</param>
/// <param name="NotifyAt">When the reminder fires: <paramref name="RemindAt"/> minus <paramref name="RemindBeforeMinutes"/>.</param>
/// <param name="NotifiedAt">When the reminder fired; null while it is still to come.</param>
public sealed record NoteDto(
    Guid Id,
    Guid ClientRequestId,
    string? Title,
    string Body,
    DateTimeOffset? RemindAt,
    int? RemindBeforeMinutes,
    DateTimeOffset? NotifyAt,
    DateTimeOffset? NotifiedAt,
    DateTimeOffset? DoneAt,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

/// <param name="ClientRequestId">Chosen by the app when the note is written: sending it again returns the same note.</param>
public sealed record CreateNoteRequest(
    Guid ClientRequestId,
    string? Title,
    string? Body,
    DateTimeOffset? RemindAt = null,
    int? RemindBeforeMinutes = null);

/// <summary>Replaces the note's text and reminder. A changed reminder fires again.</summary>
public sealed record UpdateNoteRequest(
    string? Title,
    string? Body,
    DateTimeOffset? RemindAt = null,
    int? RemindBeforeMinutes = null);

/// <param name="Minutes">The reminder becomes now plus this many minutes, notified at that time.</param>
public sealed record SnoozeNoteRequest(int Minutes);

internal static class NoteRules
{
    public static bool HasText(string? title, string? body) =>
        !string.IsNullOrWhiteSpace(title) || !string.IsNullOrWhiteSpace(body);
}

internal sealed class CreateNoteRequestValidator : AbstractValidator<CreateNoteRequest>
{
    public CreateNoteRequestValidator()
    {
        RuleFor(x => x.ClientRequestId).NotEmpty();
        RuleFor(x => x.Title).MaximumLength(RepNote.TitleMaxLength);
        RuleFor(x => x.Body).MaximumLength(RepNote.BodyMaxLength);
        RuleFor(x => x).Must(x => NoteRules.HasText(x.Title, x.Body))
            .WithName("body").WithMessage("Write a title or some text.");
        RuleFor(x => x.RemindBeforeMinutes).InclusiveBetween(0, RepNote.MaxRemindBeforeMinutes);
    }
}

internal sealed class UpdateNoteRequestValidator : AbstractValidator<UpdateNoteRequest>
{
    public UpdateNoteRequestValidator()
    {
        RuleFor(x => x.Title).MaximumLength(RepNote.TitleMaxLength);
        RuleFor(x => x.Body).MaximumLength(RepNote.BodyMaxLength);
        RuleFor(x => x).Must(x => NoteRules.HasText(x.Title, x.Body))
            .WithName("body").WithMessage("Write a title or some text.");
        RuleFor(x => x.RemindBeforeMinutes).InclusiveBetween(0, RepNote.MaxRemindBeforeMinutes);
    }
}

internal sealed class SnoozeNoteRequestValidator : AbstractValidator<SnoozeNoteRequest>
{
    public SnoozeNoteRequestValidator()
    {
        RuleFor(x => x.Minutes).InclusiveBetween(1, RepNote.MaxRemindBeforeMinutes);
    }
}
