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
