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

/// <summary>One row of the dashboard visit list.</summary>
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
    int PhotoCount);

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
