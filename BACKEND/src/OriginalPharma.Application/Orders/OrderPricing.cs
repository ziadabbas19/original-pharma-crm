namespace OriginalPharma.Application.Orders;

/// <summary>A line after pricing. Amounts are in EGP, rounded to piasters (2 decimals).</summary>
public sealed record PricedLine(
    Guid ProductId,
    int Quantity,
    decimal UnitPrice,
    decimal DiscountPercent,
    decimal Gross,
    decimal DiscountAmount,
    decimal LineTotal);

public sealed record OrderTotals(decimal Subtotal, decimal DiscountTotal, decimal Total);

/// <summary>Server-side order arithmetic. Clients only ever show these values.</summary>
public static class OrderPricing
{
    /// <summary>gross = quantity x unit price; discount = gross x percent / 100; total = gross - discount.</summary>
    public static PricedLine PriceLine(Guid productId, int quantity, decimal unitPrice, decimal discountPercent)
    {
        var gross = Round(quantity * unitPrice);
        var discount = Round(gross * discountPercent / 100m);
        return new PricedLine(productId, quantity, unitPrice, discountPercent, gross, discount, gross - discount);
    }

    public static OrderTotals Totals(IEnumerable<PricedLine> lines)
    {
        var list = lines.ToList();
        var subtotal = list.Sum(l => l.Gross);
        var discount = list.Sum(l => l.DiscountAmount);
        return new OrderTotals(subtotal, discount, subtotal - discount);
    }

    /// <summary>
    /// Discount cap of a user from the caps of their roles: no roles or any uncapped role means no
    /// cap; otherwise the most generous cap applies.
    /// </summary>
    public static decimal? EffectiveDiscountCap(IReadOnlyCollection<decimal?> roleCaps) =>
        roleCaps.Count == 0 || roleCaps.Any(c => c is null) ? null : roleCaps.Max();

    public static decimal Round(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);
}
