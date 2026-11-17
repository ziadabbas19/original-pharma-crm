using Microsoft.EntityFrameworkCore;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Application.Common.Organization;

/// <summary>
/// In-memory copy of the territory tree for one request (it is small: regions, areas, towns).
/// Answers "which area is this town in" and "is this node under that one".
/// </summary>
public sealed class TerritoryTree
{
    private readonly Dictionary<Guid, (Guid? ParentId, TerritoryLevel Level)> _nodes;
    private readonly ILookup<Guid, Guid> _children;

    private TerritoryTree(Dictionary<Guid, (Guid? ParentId, TerritoryLevel Level)> nodes)
    {
        _nodes = nodes;
        _children = nodes.Where(n => n.Value.ParentId.HasValue).ToLookup(n => n.Value.ParentId!.Value, n => n.Key);
    }

    public static async Task<TerritoryTree> LoadAsync(IAppDbContext db, CancellationToken cancellationToken = default)
    {
        var rows = await db.Territories.AsNoTracking()
            .Select(t => new { t.Id, t.ParentId, t.Level })
            .ToListAsync(cancellationToken);
        return new TerritoryTree(rows.ToDictionary(r => r.Id, r => (r.ParentId, r.Level)));
    }

    public static TerritoryTree From(IEnumerable<(Guid Id, Guid? ParentId, TerritoryLevel Level)> nodes) =>
        new(nodes.ToDictionary(n => n.Id, n => (n.ParentId, n.Level)));

    public TerritoryLevel? LevelOf(Guid id) => _nodes.TryGetValue(id, out var node) ? node.Level : null;

    /// <summary>The area a node belongs to: itself for an area, the parent area for a town, null above or unknown.</summary>
    public Guid? AreaOf(Guid? id)
    {
        var current = id;
        var guard = 0;
        while (current is { } nodeId && _nodes.TryGetValue(nodeId, out var node) && guard++ < 16)
        {
            if (node.Level == TerritoryLevel.Area)
            {
                return nodeId;
            }

            if (node.Level < TerritoryLevel.Area)
            {
                return null;
            }

            current = node.ParentId;
        }

        return null;
    }

    /// <summary>True when <paramref name="nodeId"/> is <paramref name="ancestorId"/> or sits under it.</summary>
    public bool IsWithin(Guid? nodeId, Guid? ancestorId)
    {
        if (nodeId is null || ancestorId is null)
        {
            return false;
        }

        var current = nodeId;
        var guard = 0;
        while (current is { } id && guard++ < 16)
        {
            if (id == ancestorId)
            {
                return true;
            }

            current = _nodes.TryGetValue(id, out var node) ? node.ParentId : null;
        }

        return false;
    }

    /// <summary>
    /// True when <paramref name="townId"/> is outside the area of someone assigned to
    /// <paramref name="userTerritoryId"/>. A user assigned to a town counts as working in that
    /// town's area; a region-level user covers the whole region. Unknown values never warn.
    /// </summary>
    public bool IsOutsideArea(Guid? townId, Guid? userTerritoryId)
    {
        if (townId is null || userTerritoryId is null)
        {
            return false;
        }

        var area = AreaOf(userTerritoryId) ?? userTerritoryId;
        return !IsWithin(townId, area);
    }

    /// <summary>The node and every node under it.</summary>
    public IReadOnlyList<Guid> SelfAndDescendants(Guid id)
    {
        var result = new List<Guid> { id };
        for (var i = 0; i < result.Count; i++)
        {
            result.AddRange(_children[result[i]].Where(child => !result.Contains(child)));
        }

        return result;
    }
}
