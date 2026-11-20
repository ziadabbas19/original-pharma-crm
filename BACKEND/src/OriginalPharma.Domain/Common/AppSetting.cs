namespace OriginalPharma.Domain.Common;

/// <summary>
/// A group of settings edited from the dashboard, stored as one JSON document per key. Settings that
/// are missing here fall back to the defaults in configuration.
/// </summary>
public class AppSetting
{
    public string Key { get; set; } = string.Empty;

    /// <summary>JSON document; its shape belongs to the code that owns <see cref="Key"/>.</summary>
    public string Value { get; set; } = "{}";

    public DateTimeOffset UpdatedAt { get; set; }
    public Guid? UpdatedById { get; set; }
}
