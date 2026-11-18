using System.Net;
using Microsoft.AspNetCore.HttpOverrides;

namespace OriginalPharma.Api.Common;

/// <summary>The web refresh-token cookie. Section <c>Auth:RefreshCookie</c>.</summary>
public sealed class RefreshCookieSettings
{
    public const string SectionName = "Auth:RefreshCookie";

    /// <summary>Empty keeps the cookie on the API host only, which is what the web app needs.</summary>
    public string? Domain { get; set; }

    public bool Secure { get; set; } = true;

    public SameSiteMode SameSite { get; set; } = SameSiteMode.Strict;
}

/// <summary>Which proxies may report the client address and scheme. Section <c>ForwardedHeaders</c>.</summary>
internal static class ForwardedHeadersSettings
{
    public const string SectionName = "ForwardedHeaders";

    public static void Apply(ForwardedHeadersOptions options, IConfiguration configuration)
    {
        var section = configuration.GetSection(SectionName);
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        options.ForwardLimit = section.GetValue("ForwardLimit", 1);

        var clientIpHeader = section["ClientIpHeader"];
        if (!string.IsNullOrWhiteSpace(clientIpHeader))
        {
            options.ForwardedForHeaderName = clientIpHeader.Trim();
        }

        var proxies = SettingList.Read(section.GetSection("KnownProxies"));
        var networks = SettingList.Read(section.GetSection("KnownNetworks"));
        if (section.GetValue<bool>("TrustAllProxies") || proxies.Length > 0 || networks.Length > 0)
        {
            // The loopback defaults would otherwise stay trusted next to the configured proxies.
            options.KnownProxies.Clear();
            options.KnownIPNetworks.Clear();
        }

        foreach (var proxy in proxies)
        {
            options.KnownProxies.Add(IPAddress.Parse(proxy));
        }

        foreach (var network in networks)
        {
            options.KnownIPNetworks.Add(System.Net.IPNetwork.Parse(network));
        }
    }
}

/// <summary>Reads a list setting written as JSON array, indexed variables or one comma-separated variable.</summary>
internal static class SettingList
{
    public static string[] Read(IConfigurationSection section)
    {
        var values = section.Value is { Length: > 0 } single
            ? single.Split([',', ';'])
            : section.GetChildren().Select(c => c.Value ?? string.Empty);
        return values.Select(v => v.Trim()).Where(v => v.Length > 0).ToArray();
    }
}
