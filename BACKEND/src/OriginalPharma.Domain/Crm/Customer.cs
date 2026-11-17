using NetTopologySuite.Geometries;
using OriginalPharma.Domain.Common;

namespace OriginalPharma.Domain.Crm;

public enum CustomerType
{
    Doctor = 1,
    Pharmacy = 2,
}

/// <summary>
/// Doctor or pharmacy a rep visits. Only the fields visit verification needs
/// exist for now.
/// TODO: specialties, classification, contact details, CRUD endpoints.
/// </summary>
public class Customer : Entity
{
    public CustomerType Type { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? NameAr { get; set; }
    public string? Address { get; set; }
    public Guid? TerritoryId { get; set; }

    /// <summary>Clinic / pharmacy location used for geofence checks.</summary>
    public Point? Location { get; set; }

    public int GeofenceRadiusMeters { get; set; } = 150;

    /// <summary>Value printed in the QR sticker at the location (optional visit proof).</summary>
    public string? QrCode { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
}
