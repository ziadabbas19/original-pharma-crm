using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using OriginalPharma.Api.Common;

namespace OriginalPharma.Tests.Deployment;

public sealed class ForwardedHeadersTests
{
    private static readonly IPAddress Proxy = IPAddress.Parse("100.64.0.9");

    private static async Task<HttpContext> SendAsync(Dictionary<string, string?> settings, Action<IHeaderDictionary> headers)
    {
        var options = new ForwardedHeadersOptions();
        ForwardedHeadersSettings.Apply(options, new ConfigurationBuilder().AddInMemoryCollection(settings).Build());

        var context = new DefaultHttpContext();
        context.Connection.RemoteIpAddress = Proxy;
        headers(context.Request.Headers);
        var middleware = new ForwardedHeadersMiddleware(_ => Task.CompletedTask, NullLoggerFactory.Instance, Options.Create(options));
        await middleware.Invoke(context);
        return context;
    }

    [Fact]
    public async Task An_untrusted_proxy_cannot_set_the_client_address()
    {
        var context = await SendAsync([], h => h["X-Forwarded-For"] = "203.0.113.7");
        Assert.Equal(Proxy, context.Connection.RemoteIpAddress);
    }

    [Fact]
    public async Task The_platform_header_supplies_the_client_address_and_scheme()
    {
        var context = await SendAsync(
            new() { ["ForwardedHeaders:TrustAllProxies"] = "true", ["ForwardedHeaders:ClientIpHeader"] = "X-Real-IP" },
            h =>
            {
                h["X-Real-IP"] = "203.0.113.7";
                h["X-Forwarded-For"] = "198.51.100.1";
                h["X-Forwarded-Proto"] = "https";
            });

        Assert.Equal(IPAddress.Parse("203.0.113.7"), context.Connection.RemoteIpAddress);
        Assert.Equal("https", context.Request.Scheme);
    }

    [Fact]
    public async Task Only_the_entry_added_by_the_nearest_proxy_counts()
    {
        var context = await SendAsync(
            new() { ["ForwardedHeaders:TrustAllProxies"] = "true" },
            h => h["X-Forwarded-For"] = "198.51.100.1, 203.0.113.7");

        Assert.Equal(IPAddress.Parse("203.0.113.7"), context.Connection.RemoteIpAddress);
    }

    [Fact]
    public async Task A_listed_network_is_trusted_and_others_are_not()
    {
        var trusted = await SendAsync(
            new() { ["ForwardedHeaders:KnownNetworks"] = "100.64.0.0/10" },
            h => h["X-Forwarded-For"] = "203.0.113.7");
        var other = await SendAsync(
            new() { ["ForwardedHeaders:KnownNetworks"] = "10.0.0.0/8" },
            h => h["X-Forwarded-For"] = "203.0.113.7");

        Assert.Equal(IPAddress.Parse("203.0.113.7"), trusted.Connection.RemoteIpAddress);
        Assert.Equal(Proxy, other.Connection.RemoteIpAddress);
    }
}
