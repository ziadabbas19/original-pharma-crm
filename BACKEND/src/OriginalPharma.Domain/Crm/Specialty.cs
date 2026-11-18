using OriginalPharma.Domain.Common;

namespace OriginalPharma.Domain.Crm;

/// <summary>Medical specialty of a doctor. Managed from the dashboard (lookups).</summary>
public class Specialty : Entity, ILookupItem
{
    public const int NameMaxLength = 100;

    public string NameAr { get; set; } = string.Empty;
    public string NameEn { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }

    /// <summary>Deleted while doctors still use it: hidden from pickers, those doctors keep the name.</summary>
    public DateTimeOffset? ArchivedAt { get; set; }
}
