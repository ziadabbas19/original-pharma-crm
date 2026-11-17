using FluentValidation;
using Microsoft.Extensions.Options;

namespace OriginalPharma.Application.Tracking;

public sealed class LocationPointDtoValidator : AbstractValidator<LocationPointDto>
{
    public LocationPointDtoValidator()
    {
        RuleFor(x => x.Lat).InclusiveBetween(-90, 90);
        RuleFor(x => x.Lng).InclusiveBetween(-180, 180);
        RuleFor(x => x.Accuracy).GreaterThanOrEqualTo(0).LessThan(100_000);
        RuleFor(x => x.Timestamp).NotEmpty();
        RuleFor(x => x.BatteryLevel).InclusiveBetween(-1, 1).When(x => x.BatteryLevel.HasValue);
        RuleFor(x => x.Uuid).MaximumLength(64);
    }
}

public sealed class LocationBatchRequestValidator : AbstractValidator<LocationBatchRequest>
{
    public LocationBatchRequestValidator(IOptions<TrackingOptions> options, TimeProvider time)
    {
        RuleFor(x => x.DeviceId).NotEmpty().MaximumLength(128);
        RuleFor(x => x.Source).IsInEnum();
        RuleFor(x => x.Points).NotEmpty()
            .Must(p => p.Count <= options.Value.MaxPointsPerBatch)
            .WithMessage($"A batch can hold at most {options.Value.MaxPointsPerBatch} points.");
        RuleForEach(x => x.Points).SetValidator(new LocationPointDtoValidator());
        RuleForEach(x => x.Points)
            .Must(p => p.Timestamp > time.GetUtcNow().AddDays(-7))
            .WithMessage("Points older than 7 days are not accepted.");
    }
}

public sealed class TestPointRequestValidator : AbstractValidator<TestPointRequest>
{
    public TestPointRequestValidator()
    {
        RuleFor(x => x.DeviceId).NotEmpty().MaximumLength(128);
        RuleFor(x => x.Source).IsInEnum();
        RuleFor(x => x.Point).NotNull().SetValidator(new LocationPointDtoValidator());
    }
}

public sealed class StartShiftRequestValidator : AbstractValidator<StartShiftRequest>
{
    public StartShiftRequestValidator()
    {
        RuleFor(x => x.DeviceId).NotEmpty().MaximumLength(128);
        RuleFor(x => x.Source).IsInEnum();
        RuleFor(x => x.Lat).InclusiveBetween(-90, 90).When(x => x.Lat.HasValue);
        RuleFor(x => x.Lng).InclusiveBetween(-180, 180).When(x => x.Lng.HasValue);
        RuleFor(x => x.IntegrityToken).MaximumLength(8192);
    }
}

public sealed class EndShiftRequestValidator : AbstractValidator<EndShiftRequest>
{
    public EndShiftRequestValidator()
    {
        RuleFor(x => x.DeviceId).NotEmpty().MaximumLength(128);
        RuleFor(x => x.Lat).InclusiveBetween(-90, 90).When(x => x.Lat.HasValue);
        RuleFor(x => x.Lng).InclusiveBetween(-180, 180).When(x => x.Lng.HasValue);
    }
}

public sealed class DeviceHealthReportRequestValidator : AbstractValidator<DeviceHealthReportRequest>
{
    public DeviceHealthReportRequestValidator()
    {
        RuleFor(x => x.DeviceId).NotEmpty().MaximumLength(128);
        RuleFor(x => x.Source).IsInEnum();
        RuleFor(x => x.Platform).IsInEnum();
        RuleFor(x => x.Trigger).IsInEnum();
        RuleFor(x => x.LocationPermission).IsInEnum();
        RuleFor(x => x.NotificationPermission).IsInEnum();
        RuleFor(x => x.AppVersion).MaximumLength(32);
        RuleFor(x => x.Manufacturer).MaximumLength(64);
        RuleFor(x => x.Model).MaximumLength(64);
        RuleFor(x => x.OsVersion).MaximumLength(32);
        RuleFor(x => x.PushToken).MaximumLength(4096);
    }
}

public sealed class RecordConsentRequestValidator : AbstractValidator<RecordConsentRequest>
{
    public RecordConsentRequestValidator()
    {
        RuleFor(x => x.ConsentVersion).NotEmpty().MaximumLength(32);
        RuleFor(x => x.DeviceId).NotEmpty().MaximumLength(128);
        RuleFor(x => x.Platform).IsInEnum();
        RuleFor(x => x.Locale).NotEmpty().MaximumLength(8);
    }
}

public sealed class ReviewFlagRequestValidator : AbstractValidator<ReviewFlagRequest>
{
    public ReviewFlagRequestValidator()
    {
        RuleFor(x => x.Status).IsInEnum();
        RuleFor(x => x.Note).MaximumLength(1000);
    }
}
