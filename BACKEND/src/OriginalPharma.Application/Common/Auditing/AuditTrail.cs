using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common.Bulk;
using OriginalPharma.Application.Common.Scoping;
using OriginalPharma.Domain.Audit;

namespace OriginalPharma.Application.Common.Auditing;

/// <summary>Entity names used in the activity log.</summary>
public static class AuditEntities
{
    public const string Product = "product";
    public const string ProductLine = "product_line";
    public const string Specialty = "specialty";
    public const string CollectionMethod = "collection_method";
    public const string Territory = "territory";
    public const string Customer = "customer";
    public const string User = "user";
    public const string Role = "role";
    public const string Order = "order";
    public const string Visit = "visit";
    public const string Device = "device";

    /// <summary>A suspicious-location flag (raised, acknowledged).</summary>
    public const string LocationFlag = "location_flag";

    /// <summary>A rep's expense line for one city and day.</summary>
    public const string Expense = "expense";

    /// <summary>The notes of a rep's expense day.</summary>
    public const string ExpenseDay = "expense_day";

    /// <summary>Settings edited from the dashboard (details name the key).</summary>
    public const string Settings = "settings";
}

/// <summary>
/// Writes the activity log (<see cref="AuditEntry"/>). Entries are added to the context and saved
/// together with the change they describe, so a change and its trail succeed or fail together.
/// </summary>
public sealed class AuditTrail(IAppDbContext db, ICurrentUser currentUser, TimeProvider time)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private (Guid? Id, string Name)? _actor;

    public async Task AddAsync(
        string entityType,
        Guid? entityId,
        AuditAction action,
        object? details = null,
        int count = 1,
        CancellationToken cancellationToken = default)
    {
        var (actorId, actorName) = await ActorAsync(cancellationToken);
        db.AuditEntries.Add(new AuditEntry
        {
            EntityType = entityType,
            EntityId = entityId,
            Action = action,
            ActorId = actorId,
            ActorName = actorName,
            Count = count,
            Details = JsonSerializer.Serialize(details ?? new { }, Json),
            CreatedAt = time.GetUtcNow(),
        });
    }

    /// <summary>One summary entry for a bulk request (who, what, when, how many per outcome).</summary>
    public Task AddBulkAsync(string entityType, AuditAction action, BulkResult result, CancellationToken cancellationToken = default) =>
        AddAsync(entityType, null, action, new
        {
            requested = result.Items.Count,
            result.Deleted,
            result.Archived,
            result.Restored,
            result.Updated,
            result.Blocked,
            ids = result.Items.Where(i => i.Outcome != BulkOutcome.Blocked).Select(i => i.Id).ToArray(),
            blockedItems = result.Items.Where(i => i.Outcome == BulkOutcome.Blocked).Select(i => new { i.Id, i.Code }).ToArray(),
        }, result.Done, cancellationToken);

    private async Task<(Guid? Id, string Name)> ActorAsync(CancellationToken cancellationToken)
    {
        if (_actor is { } cached)
        {
            return cached;
        }

        var id = currentUser.UserId;
        var name = id is { } userId
            ? await db.Users.AsNoTracking().Where(u => u.Id == userId).Select(u => u.FullName).SingleOrDefaultAsync(cancellationToken)
            : null;
        _actor = (id, name ?? "system");
        return _actor.Value;
    }
}

public sealed record AuditEntryDto(
    Guid Id,
    string EntityType,
    Guid? EntityId,
    AuditAction Action,
    Guid? ActorId,
    string ActorName,
    int Count,
    JsonElement Details,
    DateTimeOffset CreatedAt);

/// <param name="EntityType">Only this kind of record (product, order, user, ...).</param>
/// <param name="EntityId">Only entries about this record.</param>
public sealed record AuditQuery(string? EntityType = null, Guid? EntityId = null, AuditAction? Action = null, int Limit = 200);

/// <summary>Reads the activity log. Below scope "all" only entries made by people in the caller's scope.</summary>
public sealed class AuditLogService(IAppDbContext db, IDataScopeResolver scopes)
{
    public async Task<IReadOnlyList<AuditEntryDto>> ListAsync(AuditQuery query, CancellationToken cancellationToken = default)
    {
        var scope = await scopes.ResolveAsync(Identity.Permissions.Audit.Read, cancellationToken);
        var entries = db.AuditEntries.AsNoTracking();
        if (scope.Level != Domain.Identity.PermissionScope.All)
        {
            var actors = db.Users.VisibleUserIds(scope);
            entries = entries.Where(e => e.ActorId != null && actors.Contains(e.ActorId.Value));
        }

        if (!string.IsNullOrWhiteSpace(query.EntityType))
        {
            entries = entries.Where(e => e.EntityType == query.EntityType);
        }

        if (query.EntityId is { } entityId)
        {
            entries = entries.Where(e => e.EntityId == entityId);
        }

        if (query.Action is { } action)
        {
            entries = entries.Where(e => e.Action == action);
        }

        var rows = await entries
            .OrderByDescending(e => e.CreatedAt).ThenByDescending(e => e.Id)
            .Take(Math.Clamp(query.Limit, 1, 1000))
            .ToListAsync(cancellationToken);

        return rows
            .Select(e => new AuditEntryDto(
                e.Id, e.EntityType, e.EntityId, e.Action, e.ActorId, e.ActorName, e.Count,
                JsonDocument.Parse(e.Details).RootElement.Clone(), e.CreatedAt))
            .ToList();
    }
}
