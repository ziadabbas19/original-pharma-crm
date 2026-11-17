using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Tracking;

namespace OriginalPharma.Infrastructure.Tracking;

public sealed class PlayIntegrityOptions
{
    public const string SectionName = "PlayIntegrity";

    public string PackageName { get; set; } = "com.originalpharma.crm";

    /// <summary>Google Cloud project number linked to the Play Console app.</summary>
    public string? CloudProjectNumber { get; set; }

    /// <summary>Path to the service account JSON (keep outside the repo; set via user secrets or env).</summary>
    public string? ServiceAccountJsonPath { get; set; }
}

/// <summary>
/// Play Integrity verification. Not implemented yet: every token is reported as
/// "not checked" (Passed = null), which never raises a flag.
/// </summary>
internal sealed class PlayIntegrityVerifier(IOptions<PlayIntegrityOptions> options, ILogger<PlayIntegrityVerifier> logger) : IPlayIntegrityVerifier
{
    public Task<IntegrityVerdict> VerifyAsync(string token, string? nonce, CancellationToken cancellationToken = default)
    {
        // TODO: call playintegrity.googleapis.com/v1/{PackageName}:decodeIntegrityToken with the
        // service account, then check:
        //   - requestDetails.requestPackageName == PackageName and requestDetails.nonce == nonce
        //     (nonce issued by the server, single use, short lived)
        //   - appIntegrity.appRecognitionVerdict == PLAY_RECOGNIZED
        //   - deviceIntegrity.deviceRecognitionVerdict contains MEETS_DEVICE_INTEGRITY
        //   - accountDetails.appLicensingVerdict == LICENSED
        logger.LogDebug("Play Integrity token received for {Package} ({Length} chars); verification not implemented", options.Value.PackageName, token.Length);
        return Task.FromResult(new IntegrityVerdict(null, "not-checked"));
    }
}

/// <summary>No GeoIP database yet, so the IP vs GPS check is skipped.</summary>
internal sealed class NullIpGeolocationService : IIpGeolocationService
{
    // TODO: load a GeoIP database (e.g. MaxMind GeoLite2 City, refreshed weekly) and resolve the address here.
    public Task<GeoCoordinate?> LocateAsync(string? ipAddress, CancellationToken cancellationToken = default) =>
        Task.FromResult<GeoCoordinate?>(null);
}

/// <summary>Logs push messages instead of sending them.</summary>
internal sealed class LoggingPushNotificationSender(ILogger<LoggingPushNotificationSender> logger) : IPushNotificationSender
{
    // TODO: send through Firebase Cloud Messaging (FirebaseAdmin SDK, service account JSON from
    // user secrets / environment). Use data-only messages with android.priority = "high" so the
    // app can apply the new tracking config while in the background.
    public Task SendDataAsync(IReadOnlyCollection<string> deviceTokens, IReadOnlyDictionary<string, string> data, CancellationToken cancellationToken = default)
    {
        logger.LogInformation("Push (not sent, FCM not configured) to {Count} device(s): {Data}",
            deviceTokens.Count, string.Join(", ", data.Select(kv => $"{kv.Key}={kv.Value}")));
        return Task.CompletedTask;
    }
}
