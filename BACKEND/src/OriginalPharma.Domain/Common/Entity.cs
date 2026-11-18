namespace OriginalPharma.Domain.Common;

/// <summary>Base type for aggregate/entity classes keyed by a time-ordered GUID.</summary>
public abstract class Entity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
}

/// <summary>
/// Data that belongs to a user and a territory. Used by scope filtering
/// (own / team / territory / all) when reading data.
/// </summary>
public interface IScopedEntity
{
    Guid UserId { get; }
    Guid? TerritoryId { get; }
}

/// <summary>
/// Records kept for history and reports. Deleting one archives it instead: it disappears from
/// lists and pickers, old records that point at it keep working, and it can be restored.
/// </summary>
public interface IArchivable
{
    DateTimeOffset? ArchivedAt { get; set; }
    Guid? ArchivedById { get; set; }
}

/// <summary>A small admin-managed list entry (specialty, collection method).</summary>
public interface ILookupItem
{
    Guid Id { get; }
    string NameAr { get; set; }
    string NameEn { get; set; }
    bool IsActive { get; set; }
    int SortOrder { get; set; }
    DateTimeOffset? ArchivedAt { get; set; }
}
