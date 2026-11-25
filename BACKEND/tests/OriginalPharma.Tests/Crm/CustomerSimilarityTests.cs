using OriginalPharma.Domain.Crm;

namespace OriginalPharma.Tests.Crm;

/// <summary>The same / similar rules used to warn about duplicates when adding a doctor, pharmacy or place.</summary>
public sealed class CustomerSimilarityTests
{
    private static int? Rank(string a, string b, string? phoneA = null, string? phoneB = null) =>
        CustomerSimilarity.Rank([a], phoneA, [b], phoneB);

    [Theory]
    [InlineData("احمد محمد", "أحمد محمد علي")]
    [InlineData("د. محمد السيد", "محمد السيد")]
    [InlineData("صيدلية النور", "صيدليه النور")]
    [InlineData("Ahmed Ali", "Ahmad Ali")]
    public void The_known_examples_match(string a, string b)
    {
        Assert.NotNull(Rank(a, b));
        Assert.NotNull(Rank(b, a));
    }

    [Theory]
    [InlineData("د. محمد السيد", "محمد السيد")]
    [InlineData("صيدلية النور", "صيدليه النور")]
    [InlineData("أحمد", "إحمد")]
    [InlineData("Dr. Ahmed Fathy", "ahmed  fathy")]
    public void Equal_names_after_normalizing_are_the_same(string a, string b) =>
        Assert.Equal(CustomerSimilarity.Same, Rank(a, b));

    [Fact]
    public void The_same_phone_is_the_same_customer_whatever_the_names()
    {
        Assert.Equal(CustomerSimilarity.Same, Rank("صيدلية الشفاء", "Al Amal Pharmacy", "+20 100 123 4567", "01001234567"));
        Assert.Equal(CustomerSimilarity.Same, Rank("Dr. One", "Dr. Two", "٠١٠٠١٢٣٤٥٦٧", "0100-123-4567"));
        // One side without a phone, or too short a number, says nothing.
        Assert.Null(Rank("Dr. One", "Dr. Two", "01001234567", null));
        Assert.Null(Rank("Dr. One", "Dr. Two", "123", "123"));
    }

    [Fact]
    public void Similar_names_rank_after_the_same_ones_closest_first()
    {
        Assert.Equal(1, Rank("احمد محمد", "أحمد محمد علي")); // contains
        Assert.Equal(2, Rank("م السيد", "محمد السيد")); // every word starts a word of the other
        Assert.Equal(3, Rank("Ahmed Ali", "Ahmad Ali")); // one letter apart
        Assert.Equal(4, Rank("Ahmed Aly", "Ahmad Ali")); // two letters apart
        Assert.Equal(5, Rank("Mohamed Abdelrahman Hassan", "Mohamad Abdulrahman Hasan")); // word by word
    }

    [Theory]
    [InlineData("Sara", "Sama")] // short names: one letter
    [InlineData("صيدليه", "صيدلبه")]
    public void Short_names_allow_one_letter(string a, string b) => Assert.Equal(3, Rank(a, b));

    [Theory]
    [InlineData("Omar", "Amir")] // two letters apart, but only four letters long
    [InlineData("محمد", "محمود علي")]
    [InlineData("صيدلية النور", "صيدلية الشفاء")]
    [InlineData("Dr. Mona Saeed", "Dr. Karim Adel")]
    [InlineData("ab", "abc")] // too short to contain
    [InlineData("", "Ahmed")]
    public void Different_names_do_not_match(string a, string b) => Assert.Null(Rank(a, b));

    [Fact]
    public void Either_name_of_a_customer_counts()
    {
        Assert.Equal(1, CustomerSimilarity.Rank(["Al Nour Pharmacy", null], null, ["Nour", "صيدلية النور"], null));
        Assert.Equal(CustomerSimilarity.Same, CustomerSimilarity.Rank(["صيدليه النور"], null, ["Al Nour Pharmacy", "صيدلية النور"], null));
    }

    [Fact]
    public void The_distance_stops_early_past_the_limit()
    {
        Assert.Equal(0, CustomerSimilarity.Distance("abc", "abc", 2));
        Assert.Equal(1, CustomerSimilarity.Distance("abc", "abd", 2));
        Assert.Equal(3, CustomerSimilarity.Distance("abcdef", "uvwxyz", 2));
        Assert.Equal(3, CustomerSimilarity.Distance("a", "abcdef", 2));
    }
}
