using FluentValidation;

namespace OriginalPharma.Application.Common.Bulk;

/// <summary>What happened to one item of a bulk request (or would happen, for a dry run).</summary>
public enum BulkOutcome
{
    /// <summary>Removed for good.</summary>
    Deleted = 1,

    /// <summary>Hidden from lists and pickers but kept because other records use it.</summary>
    Archived = 2,

    Restored = 3,

    /// <summary>Changed (e.g. moved to another product line).</summary>
    Updated = 4,

    /// <summary>Refused; <see cref="BulkItemResult.Code"/> says why.</summary>
    Blocked = 5,
}

/// <param name="Code">Why the item was blocked (e.g. <c>last_admin</c>, <c>system_role</c>, <c>out_of_scope</c>).</param>
/// <param name="UsageCount">How many records use the item (the reason it is archived instead of deleted).</param>
public sealed record BulkItemResult(Guid Id, BulkOutcome Outcome, string? Code = null, int UsageCount = 0);

/// <param name="DryRun">Nothing was changed: the result says what a real request would do.</param>
public sealed record BulkResult(
    int Deleted,
    int Archived,
    int Restored,
    int Updated,
    int Blocked,
    bool DryRun,
    IReadOnlyList<BulkItemResult> Items)
{
    public static BulkResult From(IReadOnlyList<BulkItemResult> items, bool dryRun) => new(
        items.Count(i => i.Outcome == BulkOutcome.Deleted),
        items.Count(i => i.Outcome == BulkOutcome.Archived),
        items.Count(i => i.Outcome == BulkOutcome.Restored),
        items.Count(i => i.Outcome == BulkOutcome.Updated),
        items.Count(i => i.Outcome == BulkOutcome.Blocked),
        dryRun,
        items);

    /// <summary>Items that went through (not blocked).</summary>
    [System.Text.Json.Serialization.JsonIgnore]
    public int Done => Items.Count - Blocked;
}

/// <param name="DryRun">Only report what would happen (deleted, archived or blocked) without changing anything.</param>
public sealed record BulkDeleteRequest(IReadOnlyList<Guid> Ids, bool DryRun = false);

public sealed record BulkIdsRequest(IReadOnlyList<Guid> Ids);

/// <summary>Reasons an item of a bulk request is blocked. The apps translate each one.</summary>
public static class BulkCodes
{
    public const string NotFound = "not_found";
    public const string OutOfScope = "out_of_scope";
    public const string Self = "self_delete_forbidden";
    public const string LastAdmin = "last_admin";
    public const string SystemRole = "system_role";
    public const string RoleInUse = "role_in_use";
    public const string RoleLevelTooHigh = "role_level_too_high";
    public const string UserLevelTooHigh = "user_level_too_high";
    public const string UserHasReports = "user_has_reports";
    public const string HasChildren = "territory_has_children";
    public const string HasUsers = "territory_has_users";
    public const string NotArchived = "not_archived";
    public const string VisitInProgress = "visit_in_progress";
    public const string ParentArchived = "parent_archived";
}

public static class BulkLimits
{
    public const int MaxItems = 500;

    /// <summary>
    /// A dry run changes nothing, so a whole selection is judged at once: items that depend on each
    /// other (a territory and its towns, a manager and their reports) are forecast correctly.
    /// </summary>
    public const int MaxPreviewItems = 2000;
}

public sealed class BulkDeleteRequestValidator : AbstractValidator<BulkDeleteRequest>
{
    public BulkDeleteRequestValidator()
    {
        RuleFor(x => x.Ids).NotEmpty()
            .Must((request, ids) => ids is null || ids.Count <= Limit(request))
            .WithMessage(request => $"At most {Limit(request)} items at a time.");
        RuleForEach(x => x.Ids).NotEmpty();
    }

    private static int Limit(BulkDeleteRequest request) =>
        request.DryRun ? BulkLimits.MaxPreviewItems : BulkLimits.MaxItems;
}

public sealed class BulkIdsRequestValidator : AbstractValidator<BulkIdsRequest>
{
    public BulkIdsRequestValidator()
    {
        RuleFor(x => x.Ids).NotEmpty().Must(ids => ids is null || ids.Count <= BulkLimits.MaxItems)
            .WithMessage($"At most {BulkLimits.MaxItems} items at a time.");
        RuleForEach(x => x.Ids).NotEmpty();
    }
}
