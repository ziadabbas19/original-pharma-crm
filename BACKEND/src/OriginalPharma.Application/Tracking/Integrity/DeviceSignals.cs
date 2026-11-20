using System.Text.Json;
using System.Text.Json.Serialization;
using OriginalPharma.Application.Tracking.Anomalies;

namespace OriginalPharma.Application.Tracking.Integrity;

/// <summary>
/// Device settings that make a location less trustworthy, as the app reports them. Platform neutral
/// on purpose: the Android app fills most fields today, an iPhone app can send its own later
/// (<see cref="LocationFromAccessory"/> is the iOS hint for an external GPS). Null = the device could
/// not tell. Every field is optional, so older apps that send nothing keep working.
/// </summary>
/// <param name="Platform">android, ios or web.</param>
/// <param name="MockLocationAppSelected">A known spoofing app is the mock location app in developer options.</param>
/// <param name="SpoofingApps">Known spoofing apps found on the device (best-effort list in the app).</param>
/// <param name="Rooted">Basic root (or jailbreak) signals were found; see <paramref name="RootSignals"/>.</param>
/// <param name="CollectedAt">Device clock when the signals were read.</param>
public sealed record DeviceSignalsDto(
    string? Platform = null,
    bool? DeveloperOptionsEnabled = null,
    bool? MockLocationAppSelected = null,
    IReadOnlyList<string>? SpoofingApps = null,
    bool? AutoTimeEnabled = null,
    bool? AutoTimeZoneEnabled = null,
    bool? Emulator = null,
    IReadOnlyList<string>? EmulatorSignals = null,
    bool? Rooted = null,
    IReadOnlyList<string>? RootSignals = null,
    bool? LocationFromAccessory = null,
    DateTimeOffset? CollectedAt = null)
{
    private const int MaxItems = 20;
    private const int MaxLength = 128;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    /// <summary>
    /// Trims what an app sent to sane sizes instead of refusing it: a refused batch would block the
    /// native uploader's queue.
    /// </summary>
    public DeviceSignalsDto Sanitized() => this with
    {
        Platform = Clip(Platform, 16),
        SpoofingApps = List(SpoofingApps),
        EmulatorSignals = List(EmulatorSignals),
        RootSignals = List(RootSignals),
    };

    public string ToJson() => JsonSerializer.Serialize(Sanitized(), Json);

    public static DeviceSignalsDto? FromJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<DeviceSignalsDto>(json, Json);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string? Clip(string? value, int length) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim()[..Math.Min(value.Trim().Length, length)];

    private static IReadOnlyList<string>? List(IReadOnlyList<string>? values) =>
        values?.Where(v => !string.IsNullOrWhiteSpace(v)).Select(v => Clip(v, MaxLength)!).Distinct().Take(MaxItems).ToList();
}

/// <summary>Reason codes derived from device signals (see <see cref="AnomalyCodes"/>).</summary>
public static class DeviceSignalCodes
{
    public static IReadOnlyList<string> From(DeviceSignalsDto? signals)
    {
        if (signals is null)
        {
            return [];
        }

        var codes = new List<string>();
        if (signals.MockLocationAppSelected == true)
        {
            codes.Add(AnomalyCodes.MockAppSelected);
        }

        if (signals.Emulator == true)
        {
            codes.Add(AnomalyCodes.Emulator);
        }

        if (signals.Rooted == true)
        {
            codes.Add(AnomalyCodes.RootedDevice);
        }

        if (signals.SpoofingApps is { Count: > 0 })
        {
            codes.Add(AnomalyCodes.SpoofingAppInstalled);
        }

        if (signals.AutoTimeEnabled == false || signals.AutoTimeZoneEnabled == false)
        {
            codes.Add(AnomalyCodes.AutoTimeOff);
        }

        if (signals.LocationFromAccessory == true)
        {
            codes.Add(AnomalyCodes.LocationAccessory);
        }

        return codes;
    }

    /// <summary>Short human readable summary for flag details (English, like the other details).</summary>
    public static string? Describe(DeviceSignalsDto? signals)
    {
        if (signals is null)
        {
            return null;
        }

        var parts = new List<string>();
        if (signals.MockLocationAppSelected == true)
        {
            parts.Add("a spoofing app is the selected mock location app");
        }

        if (signals.SpoofingApps is { Count: > 0 } apps)
        {
            parts.Add("spoofing apps installed: " + string.Join(", ", apps));
        }

        if (signals.Emulator == true)
        {
            parts.Add("runs on an emulator");
        }

        if (signals.Rooted == true)
        {
            parts.Add("root signals: " + string.Join(", ", signals.RootSignals ?? []));
        }

        if (signals.AutoTimeEnabled == false || signals.AutoTimeZoneEnabled == false)
        {
            parts.Add("automatic time or time zone is off");
        }

        return parts.Count == 0 ? null : "Device: " + string.Join("; ", parts) + ".";
    }
}
