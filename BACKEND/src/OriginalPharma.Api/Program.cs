using Hangfire;
using OriginalPharma.Api.Common;
using OriginalPharma.Api.Modules.Tracking;
using OriginalPharma.Application;
using OriginalPharma.Infrastructure;
using Serilog;

var builder = WebApplication.CreateBuilder(args);
var isLive = !builder.Environment.IsLocal() && !OriginalPharma.Infrastructure.DependencyInjection.IsWritingOpenApiDocument;

if (isLive)
{
    var problems = ProductionConfiguration.FindProblems(builder.Configuration).ToList();
    problems.AddRange(ProductionConfiguration.FindFolderProblems(builder.Configuration));

    if (problems.Count > 0)
    {
        await Console.Error.WriteLineAsync(ProductionConfiguration.Format(problems));
        return 1;
    }

    if (builder.Configuration["PORT"] is { Length: > 0 } port)
    {
        builder.WebHost.UseUrls($"http://+:{port}");
    }
}

builder.Services.AddSerilog((services, logger) => logger
    .ReadFrom.Configuration(builder.Configuration)
    .ReadFrom.Services(services)
    .Enrich.FromLogContext());

builder.Services
    .AddApplication(builder.Configuration)
    .AddInfrastructure(builder.Configuration)
    .AddApi(builder.Configuration, builder.Environment);

var app = builder.Build();

app.UseForwardedHeaders();
if (isLive)
{
    app.UseHsts();

    // The platform health check calls the container directly over plain HTTP and does not follow redirects.
    app.UseWhen(context => !context.Request.Path.StartsWithSegments("/health"), branch => branch.UseHttpsRedirection());
}

app.UseSerilogRequestLogging();
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseCors(ApiSetup.CorsPolicy);
app.UseAuthentication();
// After authentication so per-user limits (password changes) can see who is calling.
app.UseRateLimiter();
// Before authorization so refused (403) requests also report the permissions version.
app.UseMiddleware<PermissionsVersionHeaderMiddleware>();
app.UseMiddleware<PasswordChangeEnforcementMiddleware>();
app.UseAuthorization();

if (app.Environment.IsDevelopment() || app.Configuration.GetValue<bool>("DeveloperPages:Enabled"))
{
    app.MapOpenApi(); // /openapi/v1.json
    app.UseSwaggerUI(o =>
    {
        o.SwaggerEndpoint("/openapi/v1.json", "Original Pharma CRM API v1");
        o.RoutePrefix = "swagger";
    });
    app.MapHangfireDashboard("/hangfire"); // local requests only
}

app.MapHealthChecks("/health", ApiSetup.HealthOptions(app.Environment));
app.MapControllers();
app.MapHub<TrackingHub>("/hubs/tracking");

if (!OriginalPharma.Infrastructure.DependencyInjection.IsWritingOpenApiDocument)
{
    try
    {
        await app.InitializeAsync();
    }
    catch (Exception ex) when (isLive)
    {
        // Exit so the platform restarts the container instead of serving an uninitialised database.
        app.Logger.LogCritical(ex, "Startup failed: {Reason}", ex.Message);
        await app.DisposeAsync();
        return 1;
    }
}

await app.RunAsync();
return 0;

public partial class Program;
