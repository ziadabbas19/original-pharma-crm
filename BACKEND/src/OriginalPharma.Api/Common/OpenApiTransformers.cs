using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace OriginalPharma.Api.Common;

/// <summary>Document title and the Bearer (JWT) security scheme.</summary>
internal sealed class DocumentInfoTransformer : IOpenApiDocumentTransformer
{
    public const string BearerScheme = "Bearer";

    public Task TransformAsync(OpenApiDocument document, OpenApiDocumentTransformerContext context, CancellationToken cancellationToken)
    {
        document.Info = new OpenApiInfo
        {
            Title = "Original Pharma CRM API",
            Version = "v1",
        };

        document.Components ??= new OpenApiComponents();
        document.Components.SecuritySchemes ??= new Dictionary<string, IOpenApiSecurityScheme>();
        document.Components.SecuritySchemes[BearerScheme] = new OpenApiSecurityScheme
        {
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            Description = "Access token from /api/auth/login or /api/auth/refresh.",
        };

        document.Security ??= [];
        document.Security.Add(new OpenApiSecurityRequirement
        {
            [new OpenApiSecuritySchemeReference(BearerScheme, document)] = [],
        });

        return Task.CompletedTask;
    }
}

/// <summary>
/// Stable operation ids ("{controller}{Action}", e.g. "trackingPostLocations") so the
/// frontend hooks built from the document get readable names.
/// </summary>
internal sealed class OperationIdTransformer : IOpenApiOperationTransformer
{
    public Task TransformAsync(OpenApiOperation operation, OpenApiOperationTransformerContext context, CancellationToken cancellationToken)
    {
        if (context.Description.ActionDescriptor is ControllerActionDescriptor action)
        {
            var controller = action.ControllerName;
            operation.OperationId = char.ToLowerInvariant(controller[0]) + controller[1..] + action.ActionName;
        }

        return Task.CompletedTask;
    }
}
