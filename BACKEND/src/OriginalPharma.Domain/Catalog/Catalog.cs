using OriginalPharma.Domain.Common;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Domain.Catalog;

/// <summary>A group of products sold by the same reps (e.g. a cardiology line).</summary>
public class ProductLine : Entity
{
    public const int NameMaxLength = 150;
    public const int DescriptionMaxLength = 1000;

    public string NameAr { get; set; } = string.Empty;
    public string NameEn { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }

    public ICollection<Product> Products { get; set; } = new List<Product>();
}

public class Product : Entity
{
    public const int NameMaxLength = 200;
    public const int DescriptionMaxLength = 2000;

    public Guid ProductLineId { get; set; }
    public ProductLine? ProductLine { get; set; }

    public string NameAr { get; set; } = string.Empty;
    public string NameEn { get; set; } = string.Empty;
    public string? Description { get; set; }

    /// <summary>Unit price in Egyptian pounds.</summary>
    public decimal Price { get; set; }

    /// <summary>Units available. Orders warn above it but do not deduct it (yet).</summary>
    public int StockQuantity { get; set; }

    /// <summary>Stored image (see <c>ImageService</c>); null when the product has no picture.</summary>
    public string? ImageKey { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? UpdatedAt { get; set; }
}

/// <summary>A product line assigned to a user.</summary>
public class UserProductLine
{
    public Guid UserId { get; set; }
    public User? User { get; set; }

    public Guid ProductLineId { get; set; }
    public ProductLine? ProductLine { get; set; }
}
