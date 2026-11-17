using System.Security.Cryptography;
using System.Text;
using OriginalPharma.Application.Common;

namespace OriginalPharma.Application.Visits;

public sealed class VisitOptions
{
    public const string SectionName = "Visits";

    /// <summary>Fixes worse than this are rejected at check-in; the app retries with high accuracy.</summary>
    public double MaxAccuracyMeters { get; set; } = 100;

    /// <summary>Part of the fix accuracy added to the geofence radius (capped).</summary>
    public double MaxAccuracyAllowanceMeters { get; set; } = 50;

    /// <summary>Reject check-in outside the geofence (true) or accept and mark for review (false).</summary>
    public bool RejectOutsideGeofence { get; set; } = true;

    public long MaxPhotoBytes { get; set; } = 8 * 1024 * 1024;
}

public sealed record GeofenceResult(double DistanceMeters, double AllowedMeters, bool Inside);

public static class GeofenceEvaluator
{
    /// <summary>
    /// Inside when the distance to the customer is within the radius plus part of
    /// the reported accuracy (so a 30 m fix at the door of the clinic still counts).
    /// </summary>
    public static GeofenceResult Evaluate(
        double customerLat,
        double customerLng,
        int radiusMeters,
        double lat,
        double lng,
        double accuracyMeters,
        double maxAccuracyAllowanceMeters)
    {
        var distance = GeoMath.DistanceMeters(customerLat, customerLng, lat, lng);
        var allowed = radiusMeters + Math.Min(Math.Max(accuracyMeters, 0), maxAccuracyAllowanceMeters);
        return new GeofenceResult(distance, allowed, distance <= allowed);
    }
}

public static class QrVerifier
{
    /// <summary>Constant-time comparison of the scanned payload against the customer's code.</summary>
    /// TODO: switch to signed, rotating QR payloads (HMAC of customer id + day) so stickers can't be photographed and reused.
    public static bool Matches(string? expected, string? scanned)
    {
        if (string.IsNullOrEmpty(expected) || string.IsNullOrEmpty(scanned))
        {
            return false;
        }

        return CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(scanned.Trim()));
    }
}
