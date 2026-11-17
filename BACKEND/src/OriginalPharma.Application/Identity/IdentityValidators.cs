using FluentValidation;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Application.Identity;

public sealed class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256);
        RuleFor(x => x.Password).NotEmpty().MaximumLength(256);
        RuleFor(x => x.Client).IsInEnum();
        RuleFor(x => x.DeviceId).MaximumLength(128);
    }
}

public sealed class CreateUserRequestValidator : AbstractValidator<CreateUserRequest>
{
    public CreateUserRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256);
        RuleFor(x => x.FullName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Password).NotEmpty().MinimumLength(8).MaximumLength(128);
        RuleFor(x => x.Roles).NotEmpty();
        RuleForEach(x => x.Roles).NotEmpty().MaximumLength(Role.KeyMaxLength);
        RuleFor(x => x.PreferredLanguage).Must(l => l is "ar" or "en").WithMessage("Language must be 'ar' or 'en'.");
    }
}

public sealed class CreateRoleRequestValidator : AbstractValidator<CreateRoleRequest>
{
    public CreateRoleRequestValidator()
    {
        RuleFor(x => x.NameAr).ValidRoleName();
        RuleFor(x => x.NameEn).ValidRoleName();
        RuleFor(x => x.Description).MaximumLength(Role.DescriptionMaxLength);
        RuleFor(x => x.Level).InclusiveBetween(Role.TopLevel, Role.MaxLevel);
        RuleFor(x => x.CopyFromRoleId).NotEqual(Guid.Empty);
    }
}

public sealed class UpdateRoleRequestValidator : AbstractValidator<UpdateRoleRequest>
{
    public UpdateRoleRequestValidator()
    {
        RuleFor(x => x.NameAr).ValidRoleName();
        RuleFor(x => x.NameEn).ValidRoleName();
        RuleFor(x => x.Description).MaximumLength(Role.DescriptionMaxLength);
        RuleFor(x => x.Level).InclusiveBetween(Role.TopLevel, Role.MaxLevel);
    }
}

public sealed class ReassignRoleUsersRequestValidator : AbstractValidator<ReassignRoleUsersRequest>
{
    public ReassignRoleUsersRequestValidator()
    {
        RuleFor(x => x.TargetRoleId).NotEmpty();
    }
}

public sealed class RoleAuditQueryValidator : AbstractValidator<RoleAuditQuery>
{
    public RoleAuditQueryValidator()
    {
        RuleFor(x => x.Limit).InclusiveBetween(1, 100);
    }
}

public sealed class UpdateUserRequestValidator : AbstractValidator<UpdateUserRequest>
{
    public UpdateUserRequestValidator()
    {
        RuleFor(x => x.FullName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.PreferredLanguage).Must(l => l is "ar" or "en").WithMessage("Language must be 'ar' or 'en'.");
        RuleFor(x => x.ManagerId).NotEqual(Guid.Empty);
        RuleFor(x => x.TerritoryId).NotEqual(Guid.Empty);
    }
}

public sealed class SetUserRolesRequestValidator : AbstractValidator<SetUserRolesRequest>
{
    public SetUserRolesRequestValidator()
    {
        RuleFor(x => x.Roles).NotEmpty().WithMessage("Select at least one role.");
        RuleForEach(x => x.Roles).NotEmpty().MaximumLength(Role.KeyMaxLength);
    }
}

public sealed class SetRolePermissionsRequestValidator : AbstractValidator<SetRolePermissionsRequest>
{
    public SetRolePermissionsRequestValidator()
    {
        RuleFor(x => x.Permissions).NotNull();
        RuleForEach(x => x.Permissions).ChildRules(p =>
        {
            p.RuleFor(g => g.Key).Must(Permissions.IsKnown).WithMessage("Unknown permission '{PropertyValue}'.");
            p.RuleFor(g => g.Scope).IsInEnum();
        });
    }
}

public sealed class SetPermissionOverridesRequestValidator : AbstractValidator<SetPermissionOverridesRequest>
{
    public SetPermissionOverridesRequestValidator()
    {
        RuleFor(x => x.Overrides).NotNull();
        RuleForEach(x => x.Overrides).ChildRules(o =>
        {
            o.RuleFor(e => e.Key).Must(Permissions.IsKnown).WithMessage("Unknown permission '{PropertyValue}'.");
            o.RuleFor(e => e.Scope).IsInEnum().When(e => e.Scope.HasValue);
            o.RuleFor(e => e.Reason).MaximumLength(256);
        });
    }
}

internal static class RoleValidationRules
{
    /// <summary>Display names: required, trimmed length within the column size.</summary>
    public static IRuleBuilderOptions<T, string> ValidRoleName<T>(this IRuleBuilder<T, string> rule) =>
        rule.Must(name => !string.IsNullOrWhiteSpace(name)).WithMessage("Name is required.")
            .Must(name => name is null || name.Trim().Length <= Role.NameMaxLength)
            .WithMessage($"Name must be at most {Role.NameMaxLength} characters.");
}
