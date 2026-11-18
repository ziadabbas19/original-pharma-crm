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
    public DateTimeOffset? UpdatedAt { get; set; }

    /// <summary>Discount filled in when a product of the line is added to an order (percent). Null = none.</summary>
    public decimal? DefaultDiscountPercent { get; set; }

    /// <summary>Highest discount allowed on the line's products (percent). Null = no line limit.</summary>
    public decimal? MaxDiscountPercent { get; set; }

    public ICollection<Product> Products { get; set; } = new List<Product>();
}

public class Product : Entity, IArchivable
{
    public const int NameMaxLength = 200;
    public const int DescriptionMaxLength = 2000;

    /// <summary>
    /// The line the product belongs to. Null when the product is unassigned (its line was deleted, or it
    /// was never placed in one): only catalog and order managers see it until it is moved to a line.
    /// </summary>
    public Guid? ProductLineId { get; set; }
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

    /// <summary>Discount filled in when the product is added to an order (percent). Wins over the line's default.</summary>
    public decimal? DefaultDiscountPercent { get; set; }

    /// <summary>Highest discount allowed on this product (percent). The line limit and the role cap still apply.</summary>
    public decimal? MaxDiscountPercent { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? UpdatedAt { get; set; }

    public DateTimeOffset? ArchivedAt { get; set; }
    public Guid? ArchivedById { get; set; }
}

/// <summary>A product line assigned to a user.</summary>
public class UserProductLine
{
    public Guid UserId { get; set; }
    public User? User { get; set; }

    public Guid ProductLineId { get; set; }
    public ProductLine? ProductLine { get; set; }
}
