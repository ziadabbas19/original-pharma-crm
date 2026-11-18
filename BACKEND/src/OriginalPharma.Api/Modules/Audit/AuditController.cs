using Microsoft.AspNetCore.Mvc;
using OriginalPharma.Application.Common.Auditing;
using OriginalPharma.Application.Identity;
using OriginalPharma.Infrastructure.Identity;

namespace OriginalPharma.Api.Modules.Audit;

/// <summary>Activity log: who edited, deleted, archived or restored what, when and how many.</summary>
[ApiController]
[Route("api/audit")]
[Tags("Audit")]
public sealed class AuditController(AuditLogService log) : ControllerBase
{
    /// <summary>Newest first (at most 1000). Below scope "all" only entries made by people in the caller's scope.</summary>
    [HttpGet]
    [HasPermission(Permissions.Audit.Read)]
    public Task<IReadOnlyList<AuditEntryDto>> List([FromQuery] AuditQuery query, CancellationToken cancellationToken) =>
        log.ListAsync(query, cancellationToken);
}
