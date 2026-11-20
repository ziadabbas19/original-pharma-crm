namespace OriginalPharma.Domain.Tracking;

/// <summary>How far a stored location point can be believed. Points are never deleted for it.</summary>
public enum LocationTrustStatus
{
    /// <summary>No plausibility check fired.</summary>
    Trusted = 1,

    /// <summary>A check fired (mock flag, synthetic-looking fix, device settings): kept and shown for review.</summary>
    Suspicious = 2,

    /// <summary>Physically impossible (teleport, impossible speed): kept as evidence, never counted in distances.</summary>
    Rejected = 3,
}

/// <summary>What happens to points the device reported as coming from a mock location provider.</summary>
public enum MockLocationPolicy
{
    /// <summary>Marked suspicious and raised for review; still counted everywhere.</summary>
    FlagOnly = 1,

    /// <summary>Also left out of the distance travelled and of attendance (visits counted in statistics).</summary>
    FlagAndExclude = 2,
}
