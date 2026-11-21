using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Plans;
using OriginalPharma.Domain.Plans;
using OriginalPharma.Infrastructure.Identity;

namespace OriginalPharma.Api.Modules.Plans;

/// <summary>
/// Weekly plans. A rep reads and writes their own (plans:read-own, plans:write-own) and submits them to
/// their manager; managers read the plans in their scope (plans:read) and approve, return or reopen them
/// (plans:review). Every action checks whose plan it is; the attributes only keep out people with none
/// of these permissions.
/// </summary>
[ApiController]
[Route("api/plans")]
[Tags("Plans")]
[Authorize]
public sealed class PlansController(PlanService plans) : ControllerBase
{
    /// <summary>Your plan for the week of <c>week</c> (any day of it; this week when empty), or an empty draft.</summary>
    [HttpGet("mine")]
    public Task<WeeklyPlanDto> Mine(CancellationToken cancellationToken, [FromQuery] DateOnly? week = null) =>
        plans.GetMineAsync(week, cancellationToken);

    /// <summary>
    /// Save your draft for a week: the days sent replace the saved ones. This week and later weeks only.
    /// 409 <c>plan_status_invalid</c> once submitted or approved; 409 <c>plan_changed</c> when <c>version</c> is stale.
    /// </summary>
    [HttpPut("mine")]
    [HasPermission(Permissions.Plans.WriteOwn)]
    [ProducesResponseType<WeeklyPlanDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity, "application/problem+json")]
    public Task<WeeklyPlanDto> SaveDraft(SaveWeeklyPlanRequest request, CancellationToken cancellationToken) =>
        plans.SaveDraftAsync(request, cancellationToken);

    /// <summary>Send your plan to your manager. 422 <c>plan_no_reviewer</c> when nobody can review it.</summary>
    [HttpPost("{id:guid}/submit")]
    [HasPermission(Permissions.Plans.WriteOwn)]
    [ProducesResponseType<WeeklyPlanDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity, "application/problem+json")]
    public Task<WeeklyPlanDto> Submit(Guid id, SubmitWeeklyPlanRequest request, CancellationToken cancellationToken) =>
        plans.SubmitAsync(id, request, cancellationToken);

    /// <summary>Plans of the reps in your scope, filtered by status, rep and week, one page at a time.</summary>
    [HttpGet]
    [HasPermission(Permissions.Plans.Read)]
    public Task<WeeklyPlanPageDto> List(
        CancellationToken cancellationToken,
        [FromQuery] WeeklyPlanStatus? status = null,
        [FromQuery] Guid? userId = null,
        [FromQuery] DateOnly? week = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20) =>
        plans.ListAsync(new WeeklyPlanQuery(status, userId, week, page, pageSize), cancellationToken);

    /// <summary>How many submitted plans wait for your review (dashboard).</summary>
    [HttpGet("pending-count")]
    [HasPermission(Permissions.Plans.Review)]
    public Task<WeeklyPlanPendingDto> PendingCount(CancellationToken cancellationToken) =>
        plans.PendingAsync(cancellationToken);

    /// <summary>One plan with its days, planned against done, and its history.</summary>
    [HttpGet("{id:guid}")]
    public Task<WeeklyPlanDto> Get(Guid id, CancellationToken cancellationToken) =>
        plans.GetAsync(id, cancellationToken);

    /// <summary>Approve a submitted plan (optional note). It is then locked for the rep.</summary>
    [HttpPost("{id:guid}/approve")]
    [HasPermission(Permissions.Plans.Review)]
    [ProducesResponseType<WeeklyPlanDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict, "application/problem+json")]
    public Task<WeeklyPlanDto> Approve(Guid id, ReviewWeeklyPlanRequest request, CancellationToken cancellationToken) =>
        plans.ApproveAsync(id, request, cancellationToken);

    /// <summary>Return a submitted plan for changes. The note is required.</summary>
    [HttpPost("{id:guid}/return")]
    [HasPermission(Permissions.Plans.Review)]
    [ProducesResponseType<WeeklyPlanDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity, "application/problem+json")]
    public Task<WeeklyPlanDto> Return(Guid id, ReviewWeeklyPlanRequest request, CancellationToken cancellationToken) =>
        plans.ReturnAsync(id, request, cancellationToken);

    /// <summary>Reopen an approved plan: it goes back to the rep as returned (optional note).</summary>
    [HttpPost("{id:guid}/reopen")]
    [HasPermission(Permissions.Plans.Review)]
    [ProducesResponseType<WeeklyPlanDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict, "application/problem+json")]
    public Task<WeeklyPlanDto> Reopen(Guid id, ReviewWeeklyPlanRequest request, CancellationToken cancellationToken) =>
        plans.ReopenAsync(id, request, cancellationToken);
}
