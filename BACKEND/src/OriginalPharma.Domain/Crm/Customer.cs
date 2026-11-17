using NetTopologySuite.Geometries;
using OriginalPharma.Domain.Common;

namespace OriginalPharma.Domain.Crm;

public enum CustomerType
{
    Doctor = 1,
    Pharmacy = 2,
}

/// <summary>
/// Doctor or pharmacy a rep visits. Doctors are kept once and linked to the reps that
/// cover them (<see cref="RepDoctor"/>).
/// TODO: classification (A/B/C), opening hours, QR sticker printing.
/// </summary>
public class Customer : Entity
{
    public const int NameMaxLength = 200;
    public const int PhoneMaxLength = 32;
    public const int NotesMaxLength = 1000;

    public CustomerType Type { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? NameAr { get; set; }
    public string? Address { get; set; }

    /// <summary>Territory node of the customer. For doctors this is their town.</summary>
    public Guid? TerritoryId { get; set; }

    public Guid? SpecialtyId { get; set; }
    public Specialty? Specialty { get; set; }

    public string? Phone { get; set; }

    /// <summary>Clinic details, visiting hours and similar free text.</summary>
    public string? Notes { get; set; }

    /// <summary>Clinic / pharmacy location used for geofence checks.</summary>
    public Point? Location { get; set; }

    public int GeofenceRadiusMeters { get; set; } = 150;

    /// <summary>Value printed in the QR sticker at the location (optional visit proof).</summary>
    public string? QrCode { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
    public Guid? CreatedById { get; set; }
    public DateTimeOffset? UpdatedAt { get; set; }

    public ICollection<RepDoctor> Reps { get; set; } = new List<RepDoctor>();
}
