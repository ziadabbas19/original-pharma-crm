using System.Text;
using System.Text.RegularExpressions;

namespace OriginalPharma.Domain.Crm;

/// <summary>
/// The forgiving form of a customer name that searches compare against, so that "احمد", "أحمد" and
/// "إحمد" all find "أحمد محمد" and "د. أحمد" is found by "احمد":
/// <list type="bullet">
/// <item>Arabic: diacritics and tatweel removed; أ إ آ ٱ become ا; ى and ئ become ي; ة becomes ه; ؤ becomes و.</item>
/// <item>Latin: lower case.</item>
/// <item>Runs of white space become one space; a leading title (د، د.، د/، دكتور، دكتورة، dr, dr.) is dropped.</item>
/// </list>
/// The search text goes through the same function. The migration that filled the column for existing
/// rows applies the same steps in SQL (AddRepDoctorListsAndNameSearch.NormalizeSql).
/// </summary>
public static partial class CustomerNameSearch
{
    public static string Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var builder = new StringBuilder(value.Length);
        foreach (var ch in value.ToLowerInvariant())
        {
            if (IsMark(ch))
            {
                continue;
            }

            builder.Append(ch switch
            {
                'أ' or 'إ' or 'آ' or 'ٱ' => 'ا',
                'ى' or 'ئ' => 'ي',
                'ة' => 'ه',
                'ؤ' => 'و',
                _ => ch,
            });
        }

        var text = Spaces().Replace(builder.ToString(), " ").Trim();
        return Title().Replace(text, string.Empty, 1).Trim();
    }

    /// <summary>Arabic diacritics (U+064B to U+065F, superscript alef U+0670) and tatweel (U+0640).</summary>
    private static bool IsMark(char ch) => ch is >= '\u064B' and <= '\u065F' or '\u0670' or '\u0640';

    [GeneratedRegex(@"\s+")]
    private static partial Regex Spaces();

    /// <summary>A title at the start, followed by a dot, a slash or a space (after the letters are unified).</summary>
    [GeneratedRegex(@"^(?:دكتوره|دكتور|د|dr)(?:\s*[./]\s*|\s+)")]
    private static partial Regex Title();
}
