using System.Globalization;
using System.Text;
using OriginalPharma.Application.Orders;

namespace OriginalPharma.Application.Expenses;

/// <summary>CSV exports of expenses in Arabic or English: a list of lines, and monthly statements.</summary>
public static class ExpenseCsv
{
    private static readonly string[] LinesEn = ["Date", "Rep", "City", "Amount (EGP)", "Default amount (EGP)", "Source", "Note"];
    private static readonly string[] LinesAr = ["التاريخ", "المندوب", "المدينة", "المبلغ (ج.م)", "المبلغ الافتراضي (ج.م)", "المصدر", "ملاحظة"];

    private static readonly string[] StatementEn =
        ["Rep", "Month", "Date", "City", "Amount (EGP)", "Default amount (EGP)", "Source", "Note", "Day note", "Manager note"];

    private static readonly string[] StatementAr =
        ["المندوب", "الشهر", "التاريخ", "المدينة", "المبلغ (ج.م)", "المبلغ الافتراضي (ج.م)", "المصدر", "ملاحظة", "ملاحظة اليوم", "ملاحظة المدير"];

    private static readonly Dictionary<ExpenseLineKind, (string En, string Ar)> Kinds = new()
    {
        [ExpenseLineKind.Auto] = ("Automatic", "تلقائي"),
        [ExpenseLineKind.Edited] = ("Edited", "معدّل"),
        [ExpenseLineKind.Manual] = ("Added by hand", "مضاف يدويًا"),
    };

    /// <summary>Every line of a report, newest day first.</summary>
    public static byte[] Lines(ExpenseReportDto report, string language)
    {
        var arabic = IsArabic(language);
        var csv = new StringBuilder();
        Append(csv, arabic ? LinesAr : LinesEn);
        foreach (var l in report.Lines)
        {
            Append(csv, [Day(l.Day), l.UserName, City(l, arabic), Money(l.Amount), Money(l.OriginalAmount), Kind(l.Kind, arabic), l.Note ?? string.Empty]);
        }

        Append(csv, [arabic ? "الإجمالي" : "Total", string.Empty, string.Empty, Money(report.Total), string.Empty, string.Empty, string.Empty]);
        return Encode(csv);
    }

    /// <summary>
    /// Monthly statements: every line of every day of the month with the day's notes, and the rep's month
    /// total. Days with notes but no lines get a row of their own so no note is left out.
    /// </summary>
    public static byte[] Statements(IEnumerable<ExpenseMonthDto> months, string language)
    {
        var arabic = IsArabic(language);
        var csv = new StringBuilder();
        Append(csv, arabic ? StatementAr : StatementEn);
        foreach (var m in months)
        {
            foreach (var day in m.Days)
            {
                if (day.Lines.Count == 0)
                {
                    Append(csv, [m.UserName, m.Month, Day(day.Day), string.Empty, string.Empty, string.Empty, string.Empty, string.Empty,
                        day.Note ?? string.Empty, day.ManagerNote ?? string.Empty]);
                    continue;
                }

                for (var i = 0; i < day.Lines.Count; i++)
                {
                    var l = day.Lines[i];
                    // The day's notes once, on its first line.
                    Append(csv, [m.UserName, m.Month, Day(day.Day), City(l, arabic), Money(l.Amount), Money(l.OriginalAmount), Kind(l.Kind, arabic),
                        l.Note ?? string.Empty, i == 0 ? day.Note ?? string.Empty : string.Empty, i == 0 ? day.ManagerNote ?? string.Empty : string.Empty]);
                }
            }

            Append(csv, [m.UserName, m.Month, arabic ? "إجمالي الشهر" : "Month total", string.Empty, Money(m.Total), string.Empty, string.Empty,
                string.Empty, string.Empty, string.Empty]);
        }

        return Encode(csv);
    }

    private static bool IsArabic(string language) => language.StartsWith("ar", StringComparison.OrdinalIgnoreCase);

    private static string Day(DateOnly day) => day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static string Money(decimal? amount) => amount?.ToString("0.00", CultureInfo.InvariantCulture) ?? string.Empty;

    private static string City(ExpenseLineDto line, bool arabic) => arabic ? line.CityNameAr ?? line.CityName : line.CityName;

    private static string Kind(ExpenseLineKind kind, bool arabic) => arabic ? Kinds[kind].Ar : Kinds[kind].En;

    private static void Append(StringBuilder csv, IEnumerable<string> cells)
    {
        csv.AppendJoin(',', cells.Select(OrderCsv.Escape));
        csv.Append("\r\n");
    }

    private static byte[] Encode(StringBuilder csv) => [.. Encoding.UTF8.GetPreamble(), .. Encoding.UTF8.GetBytes(csv.ToString())];
}
