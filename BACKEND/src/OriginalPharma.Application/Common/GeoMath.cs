namespace OriginalPharma.Application.Common;

public readonly record struct GeoCoordinate(double Latitude, double Longitude);

public static class GeoMath
{
    /// <summary>Mean earth radius (IUGG).</summary>
    public const double EarthRadiusMeters = 6_371_008.8;

    /// <summary>Great-circle distance using the haversine formula.</summary>
    public static double DistanceMeters(double lat1, double lng1, double lat2, double lng2)
    {
        var dLat = ToRadians(lat2 - lat1);
        var dLng = ToRadians(lng2 - lng1);
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                Math.Cos(ToRadians(lat1)) * Math.Cos(ToRadians(lat2)) *
                Math.Sin(dLng / 2) * Math.Sin(dLng / 2);
        var c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
        return EarthRadiusMeters * c;
    }

    public static double DistanceMeters(GeoCoordinate a, GeoCoordinate b) =>
        DistanceMeters(a.Latitude, a.Longitude, b.Latitude, b.Longitude);

    private static double ToRadians(double degrees) => degrees * Math.PI / 180d;
}
