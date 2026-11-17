using OriginalPharma.Domain.Common;

namespace OriginalPharma.Domain.Identity;

public enum TerritoryLevel
{
    Region = 1,
    Area = 2,
    Territory = 3,
}

/// <summary>Geographic organisation tree: region -> area -> territory.</summary>
public class Territory : Entity
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? NameAr { get; set; }
    public TerritoryLevel Level { get; set; }

    public Guid? ParentId { get; set; }
    public Territory? Parent { get; set; }
    public ICollection<Territory> Children { get; set; } = new List<Territory>();
}
