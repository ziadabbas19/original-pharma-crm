using System.Security.Cryptography;
using System.Text;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Tracking.Integrity;

namespace OriginalPharma.Application.Visits;

public sealed class VisitOptions
{
    public const string SectionName = "Visits";

    /// <summary>Fixes worse than this are rejected at check-in; the app retries with high accuracy.</summary>
    public double MaxAccuracyMeters { get; set; } = 100;

    /// <summary>Part of the fix accuracy added to the geofence radius (capped).</summary>
    public double MaxAccuracyAllowanceMeters { get; set; } = 50;

    /// <summary>Reject check-in outside the geofence (true) or accept and mark for review (false).</summary>
    public bool RejectOutsideGeofence { get; set; }

    public long MaxPhotoBytes { get; set; } = 8 * 1024 * 1024;

    /// <summary>
    /// How long after check-out the rep may still change the feedback and products of a visit. While
    /// the visit is in progress they can always be changed; cancelled visits never.
    /// </summary>
    public int ContentEditHours { get; set; } = 24;
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

/// <summary>Why a visit is waiting for a supervisor's eye. The codes are translated by the clients.</summary>
public static class VisitReviewReasons
{
    public const string OutsideGeofence = "outside-geofence";
    public const string MockLocation = "mock-location";
    public const string NoCheckOutLocation = "no-check-out-location";

    /// <summary>Check-in or check-out further from the doctor than the admin setting allows.</summary>
    public const string FarFromDoctor = "far-from-doctor";

    /// <summary>The location evidence is weak: poor or synthetic accuracy, spoofing settings, suspicious points around the visit.</summary>
    public const string LowTrust = "low-trust";

    /// <param name="trustReasons">Reasons stored on the visit (<see cref="FarFromDoctor"/>, <see cref="LowTrust"/>).</param>
    public static IReadOnlyList<string> For(
        bool withinGeofence,
        bool checkInMock,
        bool? checkOutMock,
        bool checkedOut,
        bool hasCheckOutLocation,
        IReadOnlyCollection<string>? trustReasons = null)
    {
        var reasons = new List<string>();
        if (!withinGeofence)
        {
            reasons.Add(OutsideGeofence);
        }

        if (checkInMock || checkOutMock == true)
        {
            reasons.Add(MockLocation);
        }

        if (checkedOut && !hasCheckOutLocation)
        {
            reasons.Add(NoCheckOutLocation);
        }

        foreach (var reason in trustReasons ?? [])
        {
            if (!reasons.Contains(reason))
            {
                reasons.Add(reason);
            }
        }

        return reasons;
    }
}

/// <param name="DistanceMeters">Distance between the fix and the doctor's saved location.</param>
/// <param name="SuspiciousPointsNearby">Suspicious or rejected tracking points of the rep around the visit.</param>
public sealed record VisitTrustInput(
    double DistanceMeters,
    double AccuracyMeters,
    DeviceSignalsDto? Signals,
    int SuspiciousPointsNearby);

/// <param name="Reasons">Visit review reasons (<see cref="VisitReviewReasons.FarFromDoctor"/>, <see cref="VisitReviewReasons.LowTrust"/>).</param>
/// <param name="Details">What made the visit low trust, for the flag details.</param>
public sealed record VisitTrustResult(IReadOnlyList<string> Reasons, IReadOnlyList<string> Details);

/// <summary>
/// Location trust of a visit check-in or check-out, with the admin settings. Only marks the visit:
/// nothing here refuses a check-in or check-out.
/// </summary>
public static class VisitTrustEvaluator
{
    public static VisitTrustResult Evaluate(VisitTrustInput input, LocationTrustSettings settings)
    {
        var reasons = new List<string>();
        var details = new List<string>();
        var allowance = Math.Min(Math.Max(input.AccuracyMeters, 0), settings.AccuracyAllowanceMeters);
        if (input.DistanceMeters - allowance > settings.MaxDistanceFromDoctorMeters)
        {
            reasons.Add(VisitReviewReasons.FarFromDoctor);
            details.Add($"{input.DistanceMeters:0} m from the doctor (more than {settings.MaxDistanceFromDoctorMeters:0} m).");
        }

        var lowTrust = new List<string>();
        if (input.AccuracyMeters > settings.LowTrustAccuracyMeters)
        {
            lowTrust.Add($"Weak fix: accuracy {input.AccuracyMeters:0} m.");
        }

        if (input.AccuracyMeters <= settings.PerfectAccuracyMeters)
        {
            lowTrust.Add($"Unrealistically precise fix: accuracy {input.AccuracyMeters:0.##} m.");
        }

        if (input.Signals?.MockLocationAppSelected == true)
        {
            lowTrust.Add("A spoofing app is selected as the mock location app.");
        }

        if (input.Signals?.Emulator == true)
        {
            lowTrust.Add("The app runs on an emulator.");
        }

        if (input.SuspiciousPointsNearby > 0)
        {
            lowTrust.Add($"{input.SuspiciousPointsNearby} suspicious tracking point(s) around the visit.");
        }

        if (lowTrust.Count > 0)
        {
            reasons.Add(VisitReviewReasons.LowTrust);
            details.AddRange(lowTrust);
        }

        return new VisitTrustResult(reasons, details);
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
