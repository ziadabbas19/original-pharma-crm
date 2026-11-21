using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using OriginalPharma.Api.Common;
using OriginalPharma.Application.Common;

namespace OriginalPharma.Tests.Errors;

/// <summary>What the error bodies tell clients about showing the title to users.</summary>
public sealed class ProblemDetailsTests
{
    [Fact]
    public async Task Business_rule_and_conflict_titles_are_marked_safe_to_show()
    {
        var rule = await WriteAsync(new BusinessRuleException("visit-in-progress", "Another visit is still open."));
        var conflict = await WriteAsync(new ConflictException("role_name_taken", "Another role already uses this name."));

        Assert.True(rule.GetProperty("safeToShow").GetBoolean());
        Assert.Equal("visit-in-progress", rule.GetProperty("code").GetString());
        Assert.Equal(422, rule.GetProperty("status").GetInt32());
        Assert.True(conflict.GetProperty("safeToShow").GetBoolean());
    }

    [Fact]
    public async Task Other_titles_are_not_marked_and_every_body_has_a_trace_id()
    {
        var notFound = await WriteAsync(new NotFoundException("Customer", Guid.Empty));
        var forbidden = await WriteAsync(new ForbiddenException());
        var crash = await WriteAsync(new InvalidOperationException("Sequence contains no elements"));

        Assert.False(notFound.TryGetProperty("safeToShow", out _));
        Assert.False(forbidden.TryGetProperty("safeToShow", out _));
        Assert.False(crash.TryGetProperty("safeToShow", out _));
        Assert.Equal("server-error", crash.GetProperty("code").GetString());
        Assert.DoesNotContain("Sequence contains", crash.GetProperty("title").GetString());
        Assert.False(string.IsNullOrEmpty(crash.GetProperty("traceId").GetString()));
    }

    private static async Task<JsonElement> WriteAsync(Exception exception)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddProblemDetails(o => o.CustomizeProblemDetails = ctx =>
            ctx.ProblemDetails.Extensions["traceId"] = ctx.HttpContext.TraceIdentifier);
        await using var provider = services.BuildServiceProvider();

        var context = new DefaultHttpContext { RequestServices = provider, TraceIdentifier = "trace-1" };
        context.Request.Headers.Accept = "application/json";
        context.Response.Body = new MemoryStream();

        var handler = new GlobalExceptionHandler(
            provider.GetRequiredService<IProblemDetailsService>(),
            new TestEnvironment(),
            NullLogger<GlobalExceptionHandler>.Instance);
        Assert.True(await handler.TryHandleAsync(context, exception, TestContext.Current.CancellationToken));

        context.Response.Body.Position = 0;
        using var document = await JsonDocument.ParseAsync(context.Response.Body, cancellationToken: TestContext.Current.CancellationToken);
        return document.RootElement.Clone();
    }

    private sealed class TestEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Production;
        public string ApplicationName { get; set; } = "tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } =
            new Microsoft.Extensions.FileProviders.NullFileProvider();
    }
}
