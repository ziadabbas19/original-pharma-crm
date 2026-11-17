namespace OriginalPharma.Application.Common;

/// <summary>Base type for expected errors. The API turns these into ProblemDetails responses.</summary>
public abstract class AppException(string code, string message) : Exception(message)
{
    /// <summary>
    /// Stable machine-readable code the clients can switch on. Older codes are kebab-case
    /// (<c>not-found</c>); the role and hierarchy rules use snake_case (<c>role_level_too_high</c>).
    /// </summary>
    public string Code { get; } = code;

    /// <summary>Extra values copied into the ProblemDetails body (e.g. <c>userCount</c>).</summary>
    public IReadOnlyDictionary<string, object?>? Details { get; init; }
}

/// <summary>404</summary>
public sealed class NotFoundException(string resource, object key)
    : AppException("not-found", $"{resource} '{key}' was not found.");

/// <summary>401</summary>
public sealed class UnauthorizedException(string code, string message) : AppException(code, message);

/// <summary>403</summary>
public sealed class ForbiddenException : AppException
{
    public ForbiddenException(string message = "You do not have access to this resource.")
        : base("forbidden", message)
    {
    }

    /// <summary>A refusal with its own code, e.g. <c>self_edit_forbidden</c>.</summary>
    public ForbiddenException(string code, string message)
        : base(code, message)
    {
    }
}

/// <summary>409</summary>
public sealed class ConflictException(string code, string message) : AppException(code, message);

/// <summary>422: the request is valid but a business rule prevents it.</summary>
public sealed class BusinessRuleException(string code, string message) : AppException(code, message);
