using FluentValidation;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using OriginalPharma.Application.Common;

namespace OriginalPharma.Api.Common;

/// <summary>
/// Turns exceptions into RFC 7807 ProblemDetails with a stable "code" extension. Business-rule and
/// conflict messages are written for the person using the app, so they carry "safeToShow": clients may
/// show that title when they have no translation of the code. Other titles are for developers only.
/// </summary>
internal sealed class GlobalExceptionHandler(
    IProblemDetailsService problemDetailsService,
    IHostEnvironment environment,
    ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is OperationCanceledException && httpContext.RequestAborted.IsCancellationRequested)
        {
            return true; // client went away; nothing to write
        }

        ProblemDetails problem = exception switch
        {
            ValidationException validation => new ValidationProblemDetails(ToErrors(validation))
            {
                Status = StatusCodes.Status400BadRequest,
                Title = "One or more fields are invalid.",
            },
            AppException app => new ProblemDetails
            {
                Status = StatusFor(app),
                Title = app.Message,
            },
            BadHttpRequestException bad => new ProblemDetails
            {
                Status = bad.StatusCode,
                Title = "Bad request.",
            },
            _ => new ProblemDetails
            {
                Status = StatusCodes.Status500InternalServerError,
                Title = "An unexpected error occurred.",
            },
        };

        problem.Extensions["code"] = exception switch
        {
            ValidationException => "validation",
            AppException app => app.Code,
            BadHttpRequestException => "bad-request",
            _ => "server-error",
        };

        if (exception is BusinessRuleException or ConflictException)
        {
            problem.Extensions[SafeToShow] = true;
        }

        if (exception is AppException { Details: { } details })
        {
            foreach (var (key, value) in details)
            {
                problem.Extensions[key] = value;
            }
        }

        if (problem.Status >= 500)
        {
            logger.LogError(exception, "Unhandled exception for {Method} {Path}", httpContext.Request.Method, httpContext.Request.Path);
            if (environment.IsDevelopment())
            {
                problem.Detail = exception.ToString();
            }
        }

        httpContext.Response.StatusCode = problem.Status ?? StatusCodes.Status500InternalServerError;
        return await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = problem,
            Exception = exception,
        });
    }

    /// <summary>ProblemDetails extension marking a title that may be shown to end users.</summary>
    public const string SafeToShow = "safeToShow";

    private static int StatusFor(AppException exception) => exception switch
    {
        UnauthorizedException => StatusCodes.Status401Unauthorized,
        ForbiddenException => StatusCodes.Status403Forbidden,
        NotFoundException => StatusCodes.Status404NotFound,
        ConflictException => StatusCodes.Status409Conflict,
        BusinessRuleException => StatusCodes.Status422UnprocessableEntity,
        _ => StatusCodes.Status400BadRequest,
    };

    private static Dictionary<string, string[]> ToErrors(ValidationException exception) =>
        exception.Errors
            .GroupBy(e => CamelCasePath(e.PropertyName))
            .ToDictionary(g => g.Key, g => g.Select(e => e.ErrorMessage).Distinct().ToArray());

    /// <summary>"Points[0].Lat" -> "points[0].lat" so keys match the JSON the client sent.</summary>
    private static string CamelCasePath(string path) =>
        string.Join('.', path.Split('.').Select(segment =>
            segment.Length == 0 ? segment : char.ToLowerInvariant(segment[0]) + segment[1..]));
}
