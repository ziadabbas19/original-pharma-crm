using OriginalPharma.Application.Orders;
using OriginalPharma.Domain.Orders;

namespace OriginalPharma.Tests.Orders;

public sealed class OrderPricingTests
{
    [Fact]
    public void Line_total_is_quantity_times_price_minus_the_percentage_discount()
    {
        var line = OrderPricing.PriceLine(Guid.NewGuid(), quantity: 3, unitPrice: 86.50m, discountPercent: 10m);

        Assert.Equal(259.50m, line.Gross);
        Assert.Equal(25.95m, line.DiscountAmount);
        Assert.Equal(233.55m, line.LineTotal);
    }

    [Fact]
    public void Amounts_are_rounded_to_piasters_half_away_from_zero()
    {
        // 7 x 1.15 = 8.05; 8.05 x 2.5% = 0.20125 -> 0.20
        var line = OrderPricing.PriceLine(Guid.NewGuid(), 7, 1.15m, 2.5m);
        Assert.Equal(0.20m, line.DiscountAmount);
        Assert.Equal(7.85m, line.LineTotal);

        // 1 x 0.25 x 50% = 0.125 -> 0.13
        Assert.Equal(0.13m, OrderPricing.PriceLine(Guid.NewGuid(), 1, 0.25m, 50m).DiscountAmount);
    }

    [Fact]
    public void Order_totals_add_up_the_lines()
    {
        var lines = new[]
        {
            OrderPricing.PriceLine(Guid.NewGuid(), 20, 86.50m, 5m),
            OrderPricing.PriceLine(Guid.NewGuid(), 10, 124.00m, 0m),
            OrderPricing.PriceLine(Guid.NewGuid(), 1, 99.99m, 100m),
        };

        var totals = OrderPricing.Totals(lines);

        Assert.Equal(1730m + 1240m + 99.99m, totals.Subtotal);
        Assert.Equal(86.50m + 99.99m, totals.DiscountTotal);
        Assert.Equal(totals.Subtotal - totals.DiscountTotal, totals.Total);
        Assert.Equal(lines.Sum(l => l.LineTotal), totals.Total);
    }

    [Theory]
    [InlineData(new double[0], null)]
    [InlineData(new double[] { 10 }, 10.0)]
    [InlineData(new double[] { 5, 12.5 }, 12.5)]
    public void Discount_cap_is_the_most_generous_role_cap(double[] caps, double? expected)
    {
        var cap = OrderPricing.EffectiveDiscountCap(caps.Select(c => (decimal?)c).ToList());
        Assert.Equal(expected is null ? null : (decimal?)expected, cap);
    }

    [Fact]
    public void A_role_without_cap_lifts_the_cap()
    {
        Assert.Null(OrderPricing.EffectiveDiscountCap([10m, null]));
    }

    [Fact]
    public void Order_numbers_carry_the_year_and_six_digits()
    {
        Assert.Equal("ORD-2026-000123", OrderService.FormatNumber(123, new DateTimeOffset(2026, 3, 1, 0, 0, 0, TimeSpan.Zero)));
        Assert.Equal("ORD-2027-1234567", OrderService.FormatNumber(1_234_567, new DateTimeOffset(2027, 1, 1, 0, 0, 0, TimeSpan.Zero)));
    }

    [Theory]
    [InlineData(true, null, true)]
    [InlineData(false, "Cash on delivery", true)]
    [InlineData(true, "Cash on delivery", false)]
    [InlineData(false, null, false)]
    [InlineData(false, "   ", false)]
    public void Exactly_one_collection_method_is_required(bool pickMethod, string? other, bool valid)
    {
        var request = Request(pickMethod ? Guid.NewGuid() : null, other);

        Assert.Equal(valid, OrderInputRules.HasExactlyOneCollectionMethod(request));
        var result = new CreateOrderRequestValidator().Validate(request);
        Assert.Equal(valid, result.IsValid);
        if (!valid)
        {
            Assert.Contains(result.Errors, e => e.PropertyName == "CollectionMethodId");
        }
    }

    [Fact]
    public void Validator_refuses_bad_lines()
    {
        var product = Guid.NewGuid();
        var duplicate = Request(Guid.NewGuid(), null) with { Lines = [new(product, 1), new(product, 2)] };
        var badDiscount = Request(Guid.NewGuid(), null) with { Lines = [new(product, 1, 100.5m)] };
        var zeroQuantity = Request(Guid.NewGuid(), null) with { Lines = [new(product, 0)] };
        var noLines = Request(Guid.NewGuid(), null) with { Lines = [] };

        var validator = new CreateOrderRequestValidator();
        Assert.False(validator.Validate(duplicate).IsValid);
        Assert.False(validator.Validate(badDiscount).IsValid);
        Assert.False(validator.Validate(zeroQuantity).IsValid);
        Assert.False(validator.Validate(noLines).IsValid);
    }

    private static CreateOrderRequest Request(Guid? methodId, string? other) => new(
        Guid.NewGuid(), new DateOnly(2026, 11, 17), PlaceType.Pharmacy, "Al Shifa pharmacy",
        [new OrderLineInput(Guid.NewGuid(), 2, 5m)], CollectionMethodId: methodId, CollectionMethodOther: other);
}

public sealed class TerritoryTreeTests
{
    [Fact]
    public void Outside_area_compares_with_the_area_of_the_users_node()
    {
        Guid region = Guid.NewGuid(), east = Guid.NewGuid(), giza = Guid.NewGuid();
        Guid nasr = Guid.NewGuid(), heliopolis = Guid.NewGuid(), dokki = Guid.NewGuid();
        var tree = OriginalPharma.Application.Common.Organization.TerritoryTree.From(
        [
            (region, null, OriginalPharma.Domain.Identity.TerritoryLevel.Region),
            (east, region, OriginalPharma.Domain.Identity.TerritoryLevel.Area),
            (giza, region, OriginalPharma.Domain.Identity.TerritoryLevel.Area),
            (nasr, east, OriginalPharma.Domain.Identity.TerritoryLevel.Town),
            (heliopolis, east, OriginalPharma.Domain.Identity.TerritoryLevel.Town),
            (dokki, giza, OriginalPharma.Domain.Identity.TerritoryLevel.Town),
        ]);

        Assert.False(tree.IsOutsideArea(heliopolis, east));
        Assert.True(tree.IsOutsideArea(dokki, east));
        // Assigned to a town: the town's area counts.
        Assert.False(tree.IsOutsideArea(heliopolis, nasr));
        Assert.True(tree.IsOutsideArea(dokki, nasr));
        // A region covers all its areas; unknown values never warn.
        Assert.False(tree.IsOutsideArea(dokki, region));
        Assert.False(tree.IsOutsideArea(dokki, null));
        Assert.False(tree.IsOutsideArea(null, east));
    }
}
