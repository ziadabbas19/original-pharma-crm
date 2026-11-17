using NetTopologySuite;
using NetTopologySuite.Geometries;

namespace OriginalPharma.Domain.Common;

/// <summary>Creates WGS84 (SRID 4326) geometries. Note NTS uses (x = longitude, y = latitude).</summary>
public static class GeoFactory
{
    public const int Wgs84Srid = 4326;

    private static readonly GeometryFactory Factory =
        NtsGeometryServices.Instance.CreateGeometryFactory(srid: Wgs84Srid);

    public static Point Point(double latitude, double longitude) =>
        Factory.CreatePoint(new Coordinate(longitude, latitude));
}
