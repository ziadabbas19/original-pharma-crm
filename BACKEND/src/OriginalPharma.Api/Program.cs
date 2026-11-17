using Hangfire;
using OriginalPharma.Api.Common;
using OriginalPharma.Api.Modules.Tracking;
using OriginalPharma.Application;
using OriginalPharma.Infrastructure;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSerilog((services, logger) => logger
    .ReadFrom.Configuration(builder.Configuration)
    .ReadFrom.Services(services)
    .Enrich.FromLogContext());

builder.Services
    .AddApplication(builder.Configuration)
    .AddInfrastructure(builder.Configuration)
    .AddApi(builder.Configuration);

var app = builder.Build();

app.UseForwardedHeaders();
app.UseSerilogRequestLogging();
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseCors(ApiSetup.CorsPolicy);
app.UseAuthentication();
// After authentication so per-user limits (password changes) can see who is calling.
app.UseRateLimiter();
// Before authorization so refused (403) requests also report the permissions version.
app.UseMiddleware<PermissionsVersionHeaderMiddleware>();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi(); // /openapi/v1.json
    app.UseSwaggerUI(o =>
    {
        o.SwaggerEndpoint("/openapi/v1.json", "Original Pharma CRM API v1");
        o.RoutePrefix = "swagger";
    });
    app.MapHangfireDashboard("/hangfire"); // local requests only
}

app.MapHealthChecks("/health", ApiSetup.HealthOptions);
app.MapControllers();
app.MapHub<TrackingHub>("/hubs/tracking");

if (!OriginalPharma.Infrastructure.DependencyInjection.IsWritingOpenApiDocument)
{
    await app.InitializeAsync();
}
await app.RunAsync();

public partial class Program;
