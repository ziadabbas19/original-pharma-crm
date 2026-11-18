using System.Globalization;
using System.Text;
using OriginalPharma.Application.Orders;

namespace OriginalPharma.Application.Stats;

/// <summary>CSV of one statistics table (UTF-8 with a byte order mark, Arabic or English headers).</summary>
public static class StatsCsv
{
    /// <summary>Tables per section, as accepted by the export endpoint.</summary>
    public static readonly IReadOnlyDictionary<StatsSection, string[]> Tables = new Dictionary<StatsSection, string[]>
    {
        [StatsSection.Orders] = ["byStatus", "trend", "topProducts", "topLines", "byRep", "byArea", "byPlaceType", "byCollectionMethod"],
        [StatsSection.Visits] = ["trend", "perRepPerDay", "byRep", "productsDiscussed", "feedbackByCategory"],
        [StatsSection.Doctors] = ["byRep", "byTown", "bySpecialty", "notVisited"],
        [StatsSection.Reps] = ["reps"],
        [StatsSection.Catalog] = ["productsPerLine", "lowStock", "activeUsersByRole"],
    };

    public static byte[] Build(object section, string table, string language)
    {
        var ar = language.StartsWith("ar", StringComparison.OrdinalIgnoreCase);
        var csv = new StringBuilder();
        string N(string en, string arabic) => ar ? arabic : en;
        string Money(decimal v) => v.ToString("0.00", CultureInfo.InvariantCulture);
        string Int(decimal v) => v.ToString("0.##", CultureInfo.InvariantCulture);
        string Name(StatRow r) => ar ? r.NameAr ?? r.Name : r.Name;

        void Rows(IEnumerable<StatRow> rows, string countHeader, string? valueHeader, string? quantityHeader)
        {
            var header = new List<string> { N("Name", "الاسم"), countHeader };
            if (valueHeader is not null)
            {
                header.Add(valueHeader);
            }

            if (quantityHeader is not null)
            {
                header.Add(quantityHeader);
            }

            Append(csv, header);
            foreach (var r in rows)
            {
                var cells = new List<string> { Name(r), Int(r.Count) };
                if (valueHeader is not null)
                {
                    cells.Add(Money(r.Value));
                }

                if (quantityHeader is not null)
                {
                    cells.Add(Int(r.Quantity));
                }

                Append(csv, cells);
            }
        }

        void Trend(IEnumerable<TrendPoint> points, bool money)
        {
            Append(csv, money ? [N("Date", "التاريخ"), N("Orders", "الطلبات"), N("Value (EGP)", "القيمة (ج.م)")] : [N("Date", "التاريخ"), N("Visits", "الزيارات")]);
            foreach (var p in points)
            {
                Append(csv, money
                    ? [p.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), Int(p.Count), Money(p.Value)]
                    : [p.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), Int(p.Count)]);
            }
        }

        var orders = N("Orders", "الطلبات");
        var value = N("Value (EGP)", "القيمة (ج.م)");
        var units = N("Units", "الوحدات");
        var onList = N("Doctors on lists", "الأطباء في القوائم");
        var covered = N("Visited", "تمت زيارتهم");

        switch (section, table)
        {
            case (OrderStatsDto s, "byStatus"): Rows(s.ByStatus, orders, value, null); break;
            case (OrderStatsDto s, "trend"): Trend(s.Trend, true); break;
            case (OrderStatsDto s, "topProducts"): Rows(s.TopProducts, N("Order lines", "سطور الطلبات"), value, units); break;
            case (OrderStatsDto s, "topLines"): Rows(s.TopLines, N("Order lines", "سطور الطلبات"), value, units); break;
            case (OrderStatsDto s, "byRep"): Rows(s.ByRep, orders, value, null); break;
            case (OrderStatsDto s, "byArea"): Rows(s.ByArea, orders, value, null); break;
            case (OrderStatsDto s, "byPlaceType"): Rows(s.ByPlaceType, orders, value, null); break;
            case (OrderStatsDto s, "byCollectionMethod"): Rows(s.ByCollectionMethod, orders, value, null); break;
            case (VisitStatsDto s, "trend"): Trend(s.Trend, false); break;
            case (VisitStatsDto s, "perRepPerDay"):
                Append(csv, [N("Rep", "المندوب"), N("Date", "التاريخ"), N("Visits", "الزيارات")]);
                foreach (var r in s.PerRepPerDay)
                {
                    Append(csv, [r.RepName, r.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), Int(r.Count)]);
                }

                break;
            case (VisitStatsDto s, "byRep"): Rows(s.ByRep, N("Visits", "الزيارات"), null, N("Verified", "موثقة")); break;
            case (VisitStatsDto s, "productsDiscussed"): Rows(s.ProductsDiscussed, N("Visits", "الزيارات"), null, null); break;
            case (VisitStatsDto s, "feedbackByCategory"): Rows(s.FeedbackByCategory, N("Feedback", "الملاحظات"), null, null); break;
            case (DoctorStatsDto s, "byRep"): Rows(s.ByRep, onList, null, covered); break;
            case (DoctorStatsDto s, "byTown"): Rows(s.ByTown, onList, null, covered); break;
            case (DoctorStatsDto s, "bySpecialty"): Rows(s.BySpecialty, onList, null, covered); break;
            case (DoctorStatsDto s, "notVisited"):
                Append(csv, [N("Doctor", "الطبيب")]);
                foreach (var r in s.NotVisited)
                {
                    Append(csv, [Name(r)]);
                }

                break;
            case (RepStatsDto s, "reps"):
                Append(csv,
                [
                    N("Rep", "المندوب"), orders, value, N("Visits", "الزيارات"), N("Doctors visited", "أطباء تمت زيارتهم"),
                    N("Tracking hours", "ساعات التتبع"), N("Active days", "أيام العمل"),
                ]);
                foreach (var r in s.Reps)
                {
                    Append(csv, [r.Name, Int(r.Orders), Money(r.OrderValue), Int(r.Visits), Int(r.DoctorsCovered), Int(r.TrackingHours), Int(r.ActiveDays)]);
                }

                break;
            case (CatalogStatsDto s, "productsPerLine"): Rows(s.ProductsPerLine, N("Products", "المنتجات"), null, N("Units in stock", "المخزون")); break;
            case (CatalogStatsDto s, "lowStock"): Rows(s.LowStock, N("In stock", "المخزون"), N("Price (EGP)", "السعر (ج.م)"), null); break;
            case (CatalogStatsDto s, "activeUsersByRole"): Rows(s.ActiveUsersByRole, N("Active users", "المستخدمون النشطون"), null, null); break;
            default:
                throw new Common.BusinessRuleException("stats_table_unknown", $"Unknown table '{table}'.");
        }

        return [.. Encoding.UTF8.GetPreamble(), .. Encoding.UTF8.GetBytes(csv.ToString())];
    }

    private static void Append(StringBuilder csv, IEnumerable<string> cells)
    {
        csv.AppendJoin(',', cells.Select(OrderCsv.Escape));
        csv.Append("\r\n");
    }
}
