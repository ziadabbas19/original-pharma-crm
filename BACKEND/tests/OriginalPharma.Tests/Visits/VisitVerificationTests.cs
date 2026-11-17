using OriginalPharma.Application.Common;
using OriginalPharma.Application.Visits;

namespace OriginalPharma.Tests.Visits;

public class VisitVerificationTests
{
    private const double ClinicLat = 30.0561;
    private const double ClinicLng = 31.3301;

    [Fact]
    public void Haversine_distance_is_accurate()
    {
        // Cairo Tower -> Giza pyramids is about 11.4 km.
        var meters = GeoMath.DistanceMeters(30.0459, 31.2243, 29.9792, 31.1342);

        Assert.InRange(meters, 11_200, 11_600);
    }

    [Fact]
    public void Fix_inside_radius_is_inside()
    {
        var result = GeofenceEvaluator.Evaluate(ClinicLat, ClinicLng, 150, 30.0565, 31.3305, 10, 50);

        Assert.True(result.Inside);
        Assert.InRange(result.DistanceMeters, 40, 80);
    }

    [Fact]
    public void Accuracy_allowance_is_capped()
    {
        // ~190 m away: outside 150 m + capped 50 m allowance would be 200 m -> inside;
        // the same fix 260 m away stays outside even with a 500 m accuracy.
        var near = GeofenceEvaluator.Evaluate(ClinicLat, ClinicLng, 150, ClinicLat + 0.0017, ClinicLng, 500, 50);
        var far = GeofenceEvaluator.Evaluate(ClinicLat, ClinicLng, 150, ClinicLat + 0.0024, ClinicLng, 500, 50);

        Assert.Equal(200, near.AllowedMeters);
        Assert.True(near.Inside);
        Assert.False(far.Inside);
    }

    [Theory]
    [InlineData("DEMO-CLINIC-001", "DEMO-CLINIC-001", true)]
    [InlineData("DEMO-CLINIC-001", " DEMO-CLINIC-001 ", true)]
    [InlineData("DEMO-CLINIC-001", "DEMO-CLINIC-002", false)]
    [InlineData(null, "DEMO-CLINIC-001", false)]
    [InlineData("DEMO-CLINIC-001", "", false)]
    public void Qr_payload_must_match(string? expected, string? scanned, bool match)
    {
        Assert.Equal(match, QrVerifier.Matches(expected, scanned));
    }
}
