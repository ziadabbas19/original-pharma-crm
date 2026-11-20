using OriginalPharma.Application.Common;
using OriginalPharma.Application.Tracking.Integrity;

namespace OriginalPharma.Application.Visits;

/// <summary>An earlier visit to the same customer whose check-in fix can serve as a reference.</summary>
public sealed record ReferenceFix(Guid VisitId, DateTimeOffset At, double Lat, double Lng);

/// <param name="PreviousVisitId">The latest earlier reference visit.</param>
/// <param name="MedianDistanceMeters">Distance from the median of the earlier visits; null with fewer than <see cref="VisitLocationHistory.MinVisitsForMedian"/>.</param>
/// <param name="ReferenceCount">How many earlier visits were used.</param>
public sealed record VisitLocationComparison(
    Guid? PreviousVisitId,
    double? PreviousDistanceMeters,
    double? SincePreviousSeconds,
    double? MedianDistanceMeters,
    double? NearestDistanceMeters,
    int ReferenceCount)
{
    public static readonly VisitLocationComparison None = new(null, null, null, null, null, 0);
}

/// <param name="Sources">Which comparisons exceeded the settings: <see cref="VisitLocationHistory.FromClinic"/>, <see cref="VisitLocationHistory.FromMedian"/>, <see cref="VisitLocationHistory.FromPrevious"/>.</param>
/// <param name="Details">Human-readable evidence for the review page.</param>
public sealed record DriftResult(IReadOnlyList<string> Sources, IReadOnlyList<string> Details)
{
    public bool IsDrift => Sources.Count > 0;
}

/// <param name="Problems">Why the fix cannot serve as a reference (empty when it can).</param>
public sealed record FixQuality(bool IsGood, IReadOnlyList<string> Problems);

/// <summary>
/// Compares a visit's check-in with the clinic location and with all earlier good visits to the same
/// customer. The numbers are stored on the visit when it is recorded, so its history never changes later.
/// Only marks visits for review; nothing here refuses a check-in.
/// </summary>
public static class VisitLocationHistory
{
    public const string FromClinic = "clinic";
    public const string FromMedian = "median";
    public const string FromPrevious = "previous";

    /// <summary>The median of one or two points says little more than the points themselves.</summary>
    public const int MinVisitsForMedian = 2;

    /// <summary>
    /// Whether a fix is good enough to become the clinic location or a reference for later visits: no mock
    /// flag, no spoofing, root or emulator signal, an accuracy within the weak-fix setting that does not look
    /// synthetic, and no suspicious tracking points of the rep around it.
    /// </summary>
    public static FixQuality QualityOf(
        bool isMock,
        double accuracyMeters,
        DeviceSignalsDto? signals,
        int suspiciousPointsNearby,
        LocationTrustSettings settings)
    {
        var problems = new List<string>();
        if (isMock)
        {
            problems.Add("The phone reported a mock location.");
        }

        if (accuracyMeters > settings.LowTrustAccuracyMeters)
        {
            problems.Add($"Weak fix: accuracy {accuracyMeters:0} m (more than {settings.LowTrustAccuracyMeters:0} m).");
        }

        if (accuracyMeters <= settings.PerfectAccuracyMeters)
        {
            problems.Add($"Unrealistically precise fix: accuracy {accuracyMeters:0.##} m.");
        }

        if (signals?.MockLocationAppSelected == true)
        {
            problems.Add("A spoofing app is selected as the mock location app.");
        }

        if (signals?.Emulator == true)
        {
            problems.Add("The app runs on an emulator.");
        }

        if (signals?.Rooted == true)
        {
            problems.Add("The phone shows root signals.");
        }

        if (signals?.SpoofingApps is { Count: > 0 })
        {
            problems.Add("A known spoofing app is installed.");
        }

        if (suspiciousPointsNearby > 0)
        {
            problems.Add($"{suspiciousPointsNearby} suspicious tracking point(s) around the visit.");
        }

        return new FixQuality(problems.Count == 0, problems);
    }

    /// <summary>Distances from <paramref name="lat"/>/<paramref name="lng"/> to the earlier reference visits.</summary>
    /// <param name="earlier">Earlier visits of the same customer with a good fix, in any order.</param>
    public static VisitLocationComparison Compare(double lat, double lng, DateTimeOffset at, IReadOnlyList<ReferenceFix> earlier)
    {
        if (earlier.Count == 0)
        {
            return VisitLocationComparison.None;
        }

        var previous = earlier.MaxBy(v => v.At)!;
        var nearest = earlier.Min(v => GeoMath.DistanceMeters(v.Lat, v.Lng, lat, lng));
        double? median = null;
        if (earlier.Count >= MinVisitsForMedian)
        {
            var (medianLat, medianLng) = MedianOf(earlier);
            median = Round(GeoMath.DistanceMeters(medianLat, medianLng, lat, lng));
        }

        return new VisitLocationComparison(
            previous.VisitId,
            Round(GeoMath.DistanceMeters(previous.Lat, previous.Lng, lat, lng)),
            Math.Max(0, Math.Round((at - previous.At).TotalSeconds)),
            median,
            Round(nearest),
            earlier.Count);
    }

    /// <summary>
    /// Median latitude and median longitude, taken separately. Unlike the mean, one bad fix among many
    /// good ones does not pull it away from the clinic.
    /// </summary>
    public static (double Lat, double Lng) MedianOf(IReadOnlyList<ReferenceFix> fixes)
    {
        if (fixes.Count == 0)
        {
            throw new ArgumentException("At least one fix is needed.", nameof(fixes));
        }

        return (Median(fixes.Select(f => f.Lat)), Median(fixes.Select(f => f.Lng)));
    }

    /// <summary>
    /// "Location drift": further than the settings allow from the clinic, from the median of the earlier
    /// visits (with at least two of them) or from the previous visit. Part of the fix accuracy is credited,
    /// as for the doctor distance, so a weak indoor fix alone does not count as drift.
    /// </summary>
    public static DriftResult Drift(
        VisitLocationComparison comparison,
        double? clinicDistanceMeters,
        double accuracyMeters,
        LocationTrustSettings settings)
    {
        var allowance = Math.Min(Math.Max(accuracyMeters, 0), settings.AccuracyAllowanceMeters);
        var sources = new List<string>();
        var details = new List<string>();

        if (clinicDistanceMeters is { } clinic && clinic - allowance > settings.DriftFromClinicMeters)
        {
            sources.Add(FromClinic);
            details.Add($"{clinic:0} m from the clinic location (more than {settings.DriftFromClinicMeters:0} m).");
        }

        if (comparison is { ReferenceCount: >= MinVisitsForMedian, MedianDistanceMeters: { } median } &&
            median - allowance > settings.DriftFromVisitsMeters)
        {
            sources.Add(FromMedian);
            details.Add($"{median:0} m from the median of {comparison.ReferenceCount} earlier visits (more than {settings.DriftFromVisitsMeters:0} m).");
        }

        if (comparison.PreviousDistanceMeters is { } previous && previous - allowance > settings.DriftFromVisitsMeters)
        {
            sources.Add(FromPrevious);
            details.Add($"{previous:0} m from the previous visit (more than {settings.DriftFromVisitsMeters:0} m).");
        }

        return new DriftResult(sources, details);
    }

    private static double Median(IEnumerable<double> values)
    {
        var sorted = values.Order().ToArray();
        var middle = sorted.Length / 2;
        return sorted.Length % 2 == 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    }

    private static double Round(double meters) => Math.Round(meters, 1);
}
