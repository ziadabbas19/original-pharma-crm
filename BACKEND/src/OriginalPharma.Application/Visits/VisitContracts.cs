using FluentValidation;
using OriginalPharma.Domain.Crm;
using OriginalPharma.Domain.Visits;

namespace OriginalPharma.Application.Visits;

public sealed record CheckInRequest(
    Guid CustomerId,
    string DeviceId,
    double Lat,
    double Lng,
    double Accuracy,
    DateTimeOffset Timestamp,
    bool IsMock = false,
    string? QrPayload = null);

public sealed record CheckOutRequest(
    double Lat,
    double Lng,
    double Accuracy,
    DateTimeOffset Timestamp,
    bool IsMock = false,
    string? Notes = null);

public sealed record VisitPhotoDto(Guid Id, string ContentType, long SizeBytes, DateTimeOffset UploadedAt);

public sealed record VisitDto(
    Guid Id,
    Guid CustomerId,
    string? CustomerName,
    Guid UserId,
    VisitStatus Status,
    DateTimeOffset CheckInAt,
    double CheckInDistanceMeters,
    bool CheckInWithinGeofence,
    DateTimeOffset? CheckOutAt,
    double? CheckOutDistanceMeters,
    bool? CheckOutWithinGeofence,
    bool QrVerified,
    bool NeedsReview,
    IReadOnlyList<VisitPhotoDto> Photos);

/// <summary>One row of the visit lists (dashboard and rep app).</summary>
public sealed record VisitListItemDto(
    Guid Id,
    Guid UserId,
    string UserName,
    Guid CustomerId,
    string CustomerName,
    string? CustomerNameAr,
    CustomerType CustomerType,
    VisitStatus Status,
    DateTimeOffset CheckInAt,
    double CheckInDistanceMeters,
    bool CheckInWithinGeofence,
    DateTimeOffset? CheckOutAt,
    double? CheckOutDistanceMeters,
    bool? CheckOutWithinGeofence,
    bool QrVerified,
    bool NeedsReview,
    int PhotoCount,
    bool HasFeedback = false,
    VisitFeedbackCategory? FeedbackCategory = null,
    int ProductCount = 0,
    int ReplyCount = 0,
    DateTimeOffset? ArchivedAt = null);

public sealed record VisitFeedbackSeenDto(Guid UserId, string UserName, DateTimeOffset SeenAt);

public sealed record VisitFeedbackDto(
    string Text,
    VisitFeedbackCategory? Category,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    IReadOnlyList<VisitFeedbackSeenDto> SeenBy);

public sealed record VisitReplyDto(Guid Id, Guid AuthorId, string AuthorName, string Text, DateTimeOffset CreatedAt);

public sealed record VisitProductDto(
    Guid ProductId,
    string NameAr,
    string NameEn,
    string? ThumbnailUrl,
    Guid? ProductLineId,
    string? Note);

/// <summary>A visit with its feedback, replies and products, as the rep and their reporting line see it.</summary>
/// <param name="CanEditContent">The caller is the rep and the visit is still open for feedback and products.</param>
/// <param name="ContentEditableUntil">Until when the rep may change feedback and products (null while in progress).</param>
/// <param name="CanReply">The caller may answer the feedback (reporting line or a visits:read scope above own).</param>
public sealed record VisitDetailDto(
    Guid Id,
    Guid UserId,
    string RepName,
    Guid CustomerId,
    string CustomerName,
    string? CustomerNameAr,
    CustomerType CustomerType,
    VisitStatus Status,
    DateTimeOffset CheckInAt,
    DateTimeOffset? CheckOutAt,
    double CheckInDistanceMeters,
    bool CheckInWithinGeofence,
    double? CheckOutDistanceMeters,
    bool? CheckOutWithinGeofence,
    bool QrVerified,
    bool NeedsReview,
    string? Notes,
    int PhotoCount,
    VisitFeedbackDto? Feedback,
    IReadOnlyList<VisitReplyDto> Replies,
    IReadOnlyList<VisitProductDto> Products,
    bool CanEditContent,
    DateTimeOffset? ContentEditableUntil,
    bool CanReply,
    bool CanMarkSeen,
    DateTimeOffset? ArchivedAt);

public sealed record VisitFeedbackInput(string Text, VisitFeedbackCategory? Category = null);

public sealed record VisitProductInput(Guid ProductId, string? Note = null);

/// <summary>
/// The whole feedback and product list of a visit (replaces what was there). Sent through the rep
/// app's offline outbox; <paramref name="ClientUpdatedAt"/> is the device time of the edit, and an
/// update older than the last one applied is ignored, so retries and late deliveries are safe.
/// </summary>
/// <param name="Feedback">Null removes the feedback.</param>
public sealed record UpdateVisitContentRequest(
    VisitFeedbackInput? Feedback,
    IReadOnlyList<VisitProductInput> Products,
    DateTimeOffset? ClientUpdatedAt = null);

public sealed record VisitReplyRequest(string Text);

public static class VisitErrorCodes
{
    /// <summary>The edit window after check-out is over (or the visit was cancelled or deleted).</summary>
    public const string ContentClosed = "visit_content_closed";

    public const string ProductUnavailable = "visit_product_unavailable";
    public const string NoFeedback = "visit_no_feedback";
}

public sealed class UpdateVisitContentRequestValidator : AbstractValidator<UpdateVisitContentRequest>
{
    public UpdateVisitContentRequestValidator()
    {
        RuleFor(x => x.Products).NotNull().Must(p => p is null || p.Count <= 50).WithMessage("At most 50 products per visit.")
            .Must(p => p is null || p.Select(x => x.ProductId).Distinct().Count() == p.Count).WithMessage("Each product only once.");
        RuleForEach(x => x.Products).ChildRules(product =>
        {
            product.RuleFor(p => p.ProductId).NotEmpty();
            product.RuleFor(p => p.Note).MaximumLength(VisitProduct.NoteMaxLength);
        });
        RuleFor(x => x.Feedback!.Text).Must(t => !string.IsNullOrWhiteSpace(t)).WithMessage("Write the feedback, or remove it.")
            .MaximumLength(VisitFeedback.TextMaxLength).When(x => x.Feedback is not null);
        RuleFor(x => x.Feedback!.Category).IsInEnum().When(x => x.Feedback?.Category is not null);
    }
}

public sealed class VisitReplyRequestValidator : AbstractValidator<VisitReplyRequest>
{
    public VisitReplyRequestValidator()
    {
        RuleFor(x => x.Text).Must(t => !string.IsNullOrWhiteSpace(t)).WithMessage("Write a reply.")
            .MaximumLength(VisitFeedbackReply.TextMaxLength);
    }
}

public sealed class CheckInRequestValidator : AbstractValidator<CheckInRequest>
{
    public CheckInRequestValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.DeviceId).NotEmpty().MaximumLength(128);
        RuleFor(x => x.Lat).InclusiveBetween(-90, 90);
        RuleFor(x => x.Lng).InclusiveBetween(-180, 180);
        RuleFor(x => x.Accuracy).GreaterThanOrEqualTo(0);
        RuleFor(x => x.Timestamp).NotEmpty();
        RuleFor(x => x.QrPayload).MaximumLength(512);
    }
}

public sealed class CheckOutRequestValidator : AbstractValidator<CheckOutRequest>
{
    public CheckOutRequestValidator()
    {
        RuleFor(x => x.Lat).InclusiveBetween(-90, 90);
        RuleFor(x => x.Lng).InclusiveBetween(-180, 180);
        RuleFor(x => x.Accuracy).GreaterThanOrEqualTo(0);
        RuleFor(x => x.Timestamp).NotEmpty();
        RuleFor(x => x.Notes).MaximumLength(2000);
    }
}
