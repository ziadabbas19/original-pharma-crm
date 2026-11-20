using NetTopologySuite.Geometries;
using OriginalPharma.Domain.Common;

namespace OriginalPharma.Domain.Crm;

public enum CustomerType
{
    Doctor = 1,
    Pharmacy = 2,
}

/// <summary>Where the saved clinic / pharmacy location came from.</summary>
public enum ClinicLocationSource
{
    /// <summary>Typed in or changed by a manager (customers:manage).</summary>
    ManagerSet = 1,

    /// <summary>Taken from the first visit with a good fix, when no location was saved yet.</summary>
    FirstVisit = 2,
}

/// <summary>
/// Doctor or pharmacy a rep visits. Doctors are kept once and linked to the reps that
/// cover them (<see cref="RepDoctor"/>).
/// TODO: classification (A/B/C), opening hours, QR sticker printing.
/// </summary>
public class Customer : Entity, IArchivable
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

    /// <summary>How <see cref="Location"/> was set (null when there is none, or for locations saved before this was kept).</summary>
    public ClinicLocationSource? LocationSource { get; set; }

    /// <summary>The rep (first visit) or manager who set the location.</summary>
    public Guid? LocationCapturedById { get; set; }

    public DateTimeOffset? LocationCapturedAt { get; set; }

    /// <summary>Reported accuracy of the fix the location was taken from (first visit only).</summary>
    public double? LocationAccuracyMeters { get; set; }

    /// <summary>The visit whose check-in became the location (first visit only).</summary>
    public Guid? LocationVisitId { get; set; }

    public int GeofenceRadiusMeters { get; set; } = 150;

    /// <summary>Value printed in the QR sticker at the location (optional visit proof).</summary>
    public string? QrCode { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
    public Guid? CreatedById { get; set; }
    public DateTimeOffset? UpdatedAt { get; set; }

    /// <summary>Deleted while visits or orders still point at it; hidden from lists, kept for history.</summary>
    public DateTimeOffset? ArchivedAt { get; set; }
    public Guid? ArchivedById { get; set; }

    public ICollection<RepDoctor> Reps { get; set; } = new List<RepDoctor>();
}
