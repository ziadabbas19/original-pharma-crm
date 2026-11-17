using System.Globalization;
using System.Text;
using OriginalPharma.Domain.Orders;

namespace OriginalPharma.Application.Orders;

/// <summary>CSV export of the order list in Arabic or English.</summary>
public static class OrderCsv
{
    private static readonly string[] HeadersEn =
        ["Number", "Date", "Rep", "Area", "Place type", "Place", "Collection method", "Status", "Lines", "Total (EGP)", "Created at (UTC)"];

    private static readonly string[] HeadersAr =
        ["رقم الطلب", "التاريخ", "المندوب", "المنطقة", "نوع المكان", "المكان", "طريقة التحصيل", "الحالة", "عدد الأصناف", "الإجمالي (ج.م)", "تاريخ الإنشاء (UTC)"];

    private static readonly Dictionary<OrderStatus, (string En, string Ar)> Statuses = new()
    {
        [OrderStatus.Submitted] = ("Submitted", "مُرسل"),
        [OrderStatus.Approved] = ("Approved", "معتمد"),
        [OrderStatus.Rejected] = ("Rejected", "مرفوض"),
        [OrderStatus.Cancelled] = ("Cancelled", "ملغي"),
    };

    private static readonly Dictionary<PlaceType, (string En, string Ar)> Places = new()
    {
        [PlaceType.Pharmacy] = ("Pharmacy", "صيدلية"),
        [PlaceType.Warehouse] = ("Warehouse", "مخزن"),
        [PlaceType.Shop] = ("Shop", "محل"),
        [PlaceType.Other] = ("Other", "أخرى"),
    };

    public static byte[] Build(IEnumerable<OrderListItemDto> rows, string language)
    {
        var arabic = language.StartsWith("ar", StringComparison.OrdinalIgnoreCase);
        var csv = new StringBuilder();
        AppendRow(csv, arabic ? HeadersAr : HeadersEn);

        foreach (var o in rows)
        {
            AppendRow(csv,
            [
                o.Number,
                o.OrderDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                o.RepName,
                arabic ? o.TerritoryNameAr ?? o.TerritoryName ?? string.Empty : o.TerritoryName ?? string.Empty,
                arabic ? Places[o.PlaceType].Ar : Places[o.PlaceType].En,
                o.PlaceName,
                (arabic ? o.CollectionMethodNameAr : o.CollectionMethodNameEn) ?? o.CollectionMethodOther ?? string.Empty,
                arabic ? Statuses[o.Status].Ar : Statuses[o.Status].En,
                o.LineCount.ToString(CultureInfo.InvariantCulture),
                o.Total.ToString("0.00", CultureInfo.InvariantCulture),
                o.CreatedAt.UtcDateTime.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture),
            ]);
        }

        return [.. Encoding.UTF8.GetPreamble(), .. Encoding.UTF8.GetBytes(csv.ToString())];
    }

    private static void AppendRow(StringBuilder csv, IEnumerable<string> cells)
    {
        csv.AppendJoin(',', cells.Select(Escape));
        csv.Append("\r\n");
    }

    /// <summary>Quotes when needed and defuses values a spreadsheet would run as a formula.</summary>
    internal static string Escape(string value)
    {
        if (value.Length > 0 && value[0] is '=' or '+' or '-' or '@' or '\t' or '\r')
        {
            value = "'" + value;
        }

        return value.IndexOfAny([',', '"', '\r', '\n']) >= 0 ? $"\"{value.Replace("\"", "\"\"")}\"" : value;
    }
}
