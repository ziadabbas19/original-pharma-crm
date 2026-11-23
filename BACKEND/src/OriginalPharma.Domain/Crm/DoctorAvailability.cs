using OriginalPharma.Domain.Common;

namespace OriginalPharma.Domain.Crm;

/// <summary>
/// One weekly time slot when a doctor can be visited, for example Saturday 17:00-21:00 at the clinic.
/// A doctor has any number of them; slots on the same weekday never overlap.
/// </summary>
public class DoctorAvailability : Entity
{
    public const int PlaceMaxLength = 200;

    public Guid CustomerId { get; set; }

    public DayOfWeek Weekday { get; set; }

    public TimeOnly StartTime { get; set; }

    /// <summary>Always after <see cref="StartTime"/> (slots do not run past midnight).</summary>
    public TimeOnly EndTime { get; set; }

    /// <summary>Optional label, such as the clinic or hospital name.</summary>
    public string? Place { get; set; }
}
