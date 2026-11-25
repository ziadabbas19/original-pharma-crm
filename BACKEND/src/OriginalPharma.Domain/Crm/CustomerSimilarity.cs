namespace OriginalPharma.Domain.Crm;

/// <summary>
/// Whether a new customer looks like one that already exists in the same town, so the person adding it
/// can pick the existing record instead of creating a duplicate. Names are compared in their search form
/// (<see cref="CustomerNameSearch.Normalize"/>), so hamza forms, ta marbuta, diacritics and a leading
/// "Dr." do not matter.
/// <list type="bullet">
/// <item>Same (rank 0): the names are equal, or both have the same phone number.</item>
/// <item>Similar: one name contains the other (rank 1); every word of the shorter name is a word, or the
/// start of a word, of the longer one (rank 2); the names are one or two letters apart (rank 3 or 4: one
/// for names up to 6 letters, two for longer ones); or, word by word, each word is that close (rank 5).</item>
/// </list>
/// Text shorter than <see cref="MinLength"/> letters only matches an equal name.
/// </summary>
public static class CustomerSimilarity
{
    public const int Same = 0;
    public const int MinLength = 3;
    public const int ShortNameLength = 6;

    /// <summary>
    /// The closest rank between any of <paramref name="names"/> and any of <paramref name="otherNames"/>
    /// (or the phones), null when they are not alike. Names are raw; they are normalized here.
    /// </summary>
    public static int? Rank(
        IEnumerable<string?> names,
        string? phone,
        IEnumerable<string?> otherNames,
        string? otherPhone)
    {
        var mine = names.Select(CustomerNameSearch.Normalize).Where(n => n.Length > 0).Distinct().ToList();
        var theirs = otherNames.Select(CustomerNameSearch.Normalize).Where(n => n.Length > 0).Distinct().ToList();
        return RankNormalized(mine, NormalizePhone(phone), theirs, NormalizePhone(otherPhone));
    }

    /// <summary><see cref="Rank(IEnumerable{string?}, string?, IEnumerable{string?}, string?)"/> on names and phones already normalized.</summary>
    public static int? RankNormalized(
        IReadOnlyCollection<string> names,
        string? phone,
        IReadOnlyCollection<string> otherNames,
        string? otherPhone)
    {
        if (phone is not null && phone == otherPhone)
        {
            return Same;
        }

        int? best = null;
        foreach (var a in names)
        {
            foreach (var b in otherNames)
            {
                if (NameRank(a, b) is { } rank && (best is null || rank < best))
                {
                    best = rank;
                }
            }
        }

        return best;
    }

    /// <summary>How close two names in search form are (see the class summary), or null.</summary>
    public static int? NameRank(string a, string b)
    {
        if (a.Length == 0 || b.Length == 0)
        {
            return null;
        }

        if (a == b)
        {
            return Same;
        }

        var (shorter, longer) = a.Length <= b.Length ? (a, b) : (b, a);
        if (shorter.Length < MinLength)
        {
            return null;
        }

        if (longer.Contains(shorter, StringComparison.Ordinal))
        {
            return 1;
        }

        var wordsA = a.Split(' ');
        var wordsB = b.Split(' ');
        var (fewer, more) = wordsA.Length < wordsB.Length || (wordsA.Length == wordsB.Length && a.Length <= b.Length)
            ? (wordsA, wordsB)
            : (wordsB, wordsA);
        if (fewer.All(word => more.Any(other => other.StartsWith(word, StringComparison.Ordinal))))
        {
            return 2;
        }

        var distance = Distance(a, b, 2);
        if (distance <= Allowed(shorter.Length))
        {
            return 2 + distance;
        }

        if (wordsA.Length > 1 && wordsA.Length == wordsB.Length && wordsA.Zip(wordsB).All(pair => WordsClose(pair.First, pair.Second)))
        {
            return 5;
        }

        return null;
    }

    /// <summary>
    /// A phone number as digits only (Arabic-Indic digits included), the last ten when longer, so
    /// "+20 100 123 4567" and "01001234567" are the same number. Null with fewer than six digits.
    /// </summary>
    public static string? NormalizePhone(string? phone)
    {
        if (string.IsNullOrWhiteSpace(phone))
        {
            return null;
        }

        var digits = new string(phone
            .Select(ch => ch switch
            {
                >= '٠' and <= '٩' => (char)('0' + (ch - '٠')),
                >= '۰' and <= '۹' => (char)('0' + (ch - '۰')),
                _ => ch,
            })
            .Where(char.IsAsciiDigit)
            .ToArray());
        return digits.Length < 6 ? null : digits.Length > 10 ? digits[^10..] : digits;
    }

    private static int Allowed(int length) => length <= ShortNameLength ? 1 : 2;

    private static bool WordsClose(string a, string b) =>
        a == b || (Math.Min(a.Length, b.Length) >= MinLength && Distance(a, b, 2) <= Allowed(Math.Min(a.Length, b.Length)));

    /// <summary>Levenshtein distance, stopping early once it is over <paramref name="limit"/> (returns limit + 1).</summary>
    public static int Distance(string a, string b, int limit)
    {
        if (Math.Abs(a.Length - b.Length) > limit)
        {
            return limit + 1;
        }

        var previous = new int[b.Length + 1];
        var current = new int[b.Length + 1];
        for (var j = 0; j <= b.Length; j++)
        {
            previous[j] = j;
        }

        for (var i = 1; i <= a.Length; i++)
        {
            current[0] = i;
            var rowMin = current[0];
            for (var j = 1; j <= b.Length; j++)
            {
                var cost = a[i - 1] == b[j - 1] ? 0 : 1;
                current[j] = Math.Min(Math.Min(current[j - 1] + 1, previous[j] + 1), previous[j - 1] + cost);
                rowMin = Math.Min(rowMin, current[j]);
            }

            if (rowMin > limit)
            {
                return limit + 1;
            }

            (previous, current) = (current, previous);
        }

        return Math.Min(previous[b.Length], limit + 1);
    }
}
