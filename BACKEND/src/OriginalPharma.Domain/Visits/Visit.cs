using NetTopologySuite.Geometries;
using OriginalPharma.Domain.Common;
using OriginalPharma.Domain.Crm;

namespace OriginalPharma.Domain.Visits;

public enum VisitStatus
{
    InProgress = 1,
    Completed = 2,
    Cancelled = 3,
}

/// <summary>
/// A rep's visit to a doctor or pharmacy, verified by geofence at check-in and
/// check-out, optional photos and an optional QR scan.
/// TODO: visit content (products discussed, samples, notes templates).
/// </summary>
public class Visit : Entity, IScopedEntity
{
    public Guid UserId { get; set; }
    public Guid? TerritoryId { get; set; }
    public Guid CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public Guid? ShiftId { get; set; }
    public string DeviceId { get; set; } = string.Empty;

    public VisitStatus Status { get; set; } = VisitStatus.InProgress;

    public DateTimeOffset CheckInAt { get; set; }
    public DateTimeOffset CheckInReceivedAt { get; set; }
    public Point CheckInLocation { get; set; } = null!;
    public double CheckInAccuracy { get; set; }
    public double CheckInDistanceMeters { get; set; }
    public bool CheckInWithinGeofence { get; set; }
    public bool CheckInIsMock { get; set; }

    public DateTimeOffset? CheckOutAt { get; set; }
    public DateTimeOffset? CheckOutReceivedAt { get; set; }
    public Point? CheckOutLocation { get; set; }
    public double? CheckOutAccuracy { get; set; }
    public double? CheckOutDistanceMeters { get; set; }
    public bool? CheckOutWithinGeofence { get; set; }
    public bool? CheckOutIsMock { get; set; }

    public bool QrVerified { get; set; }
    public string? Notes { get; set; }

    /// <summary>True when something about the visit needs a supervisor's eye.</summary>
    public bool NeedsReview { get; set; }

    public ICollection<VisitPhoto> Photos { get; set; } = new List<VisitPhoto>();
}

public class VisitPhoto : Entity
{
    public Guid VisitId { get; set; }
    public string StoragePath { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public DateTimeOffset UploadedAt { get; set; }
}
