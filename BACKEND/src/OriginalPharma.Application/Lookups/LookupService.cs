using FluentValidation;
using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Domain.Crm;
using OriginalPharma.Domain.Orders;

namespace OriginalPharma.Application.Lookups;

/// <summary>A specialty or collection method.</summary>
public sealed record LookupDto(Guid Id, string NameAr, string NameEn, bool IsActive, int SortOrder);

/// <summary>A town with the area it belongs to (for doctor forms and filters).</summary>
public sealed record TownDto(Guid Id, string Name, string? NameAr, Guid? AreaId, string? AreaName, string? AreaNameAr);

public sealed record SaveLookupRequest(string NameAr, string NameEn, bool IsActive = true, int SortOrder = 0);

public static class LookupErrorCodes
{
    public const string NameTaken = "lookup_name_taken";
}

/// <summary>
/// Small admin-managed lists: doctor specialties and order collection methods. Everyone signed in
/// can read the active entries (forms need them); changes need lookups:manage. Entries are
/// deactivated rather than deleted so old doctors and orders keep their values.
/// </summary>
public sealed class LookupService(IAppDbContext db)
{
    /// <summary>All towns, by area then name. Town names are not sensitive; everyone signed in can read them.</summary>
    public Task<List<TownDto>> ListTownsAsync(CancellationToken cancellationToken = default) =>
        db.Territories.AsNoTracking()
            .Where(t => t.Level == Domain.Identity.TerritoryLevel.Town)
            .OrderBy(t => t.Parent!.Name).ThenBy(t => t.Name)
            .Select(t => new TownDto(t.Id, t.Name, t.NameAr, t.ParentId, t.Parent!.Name, t.Parent.NameAr))
            .ToListAsync(cancellationToken);

    public Task<List<LookupDto>> ListSpecialtiesAsync(bool includeInactive, CancellationToken cancellationToken = default) =>
        db.Specialties.AsNoTracking()
            .Where(s => includeInactive || s.IsActive)
            .OrderBy(s => s.SortOrder).ThenBy(s => s.NameEn)
            .Select(s => new LookupDto(s.Id, s.NameAr, s.NameEn, s.IsActive, s.SortOrder))
            .ToListAsync(cancellationToken);

    public async Task<LookupDto> CreateSpecialtyAsync(SaveLookupRequest request, CancellationToken cancellationToken = default)
    {
        var (ar, en) = Names(request);
        await EnsureSpecialtyNamesFreeAsync(ar, en, null, cancellationToken);
        var specialty = new Specialty { NameAr = ar, NameEn = en, IsActive = request.IsActive, SortOrder = request.SortOrder };
        db.Specialties.Add(specialty);
        await db.SaveChangesAsync(cancellationToken);
        return new LookupDto(specialty.Id, specialty.NameAr, specialty.NameEn, specialty.IsActive, specialty.SortOrder);
    }

    public async Task<LookupDto> UpdateSpecialtyAsync(Guid id, SaveLookupRequest request, CancellationToken cancellationToken = default)
    {
        var specialty = await db.Specialties.SingleOrDefaultAsync(s => s.Id == id, cancellationToken)
                        ?? throw new NotFoundException("Specialty", id);
        var (ar, en) = Names(request);
        await EnsureSpecialtyNamesFreeAsync(ar, en, id, cancellationToken);
        specialty.NameAr = ar;
        specialty.NameEn = en;
        specialty.IsActive = request.IsActive;
        specialty.SortOrder = request.SortOrder;
        await db.SaveChangesAsync(cancellationToken);
        return new LookupDto(specialty.Id, specialty.NameAr, specialty.NameEn, specialty.IsActive, specialty.SortOrder);
    }

    public Task<List<LookupDto>> ListCollectionMethodsAsync(bool includeInactive, CancellationToken cancellationToken = default) =>
        db.CollectionMethods.AsNoTracking()
            .Where(m => includeInactive || m.IsActive)
            .OrderBy(m => m.SortOrder).ThenBy(m => m.NameEn)
            .Select(m => new LookupDto(m.Id, m.NameAr, m.NameEn, m.IsActive, m.SortOrder))
            .ToListAsync(cancellationToken);

    public async Task<LookupDto> CreateCollectionMethodAsync(SaveLookupRequest request, CancellationToken cancellationToken = default)
    {
        var (ar, en) = Names(request);
        await EnsureMethodNamesFreeAsync(ar, en, null, cancellationToken);
        var method = new CollectionMethod { NameAr = ar, NameEn = en, IsActive = request.IsActive, SortOrder = request.SortOrder };
        db.CollectionMethods.Add(method);
        await db.SaveChangesAsync(cancellationToken);
        return new LookupDto(method.Id, method.NameAr, method.NameEn, method.IsActive, method.SortOrder);
    }

    public async Task<LookupDto> UpdateCollectionMethodAsync(Guid id, SaveLookupRequest request, CancellationToken cancellationToken = default)
    {
        var method = await db.CollectionMethods.SingleOrDefaultAsync(m => m.Id == id, cancellationToken)
                     ?? throw new NotFoundException("CollectionMethod", id);
        var (ar, en) = Names(request);
        await EnsureMethodNamesFreeAsync(ar, en, id, cancellationToken);
        method.NameAr = ar;
        method.NameEn = en;
        method.IsActive = request.IsActive;
        method.SortOrder = request.SortOrder;
        await db.SaveChangesAsync(cancellationToken);
        return new LookupDto(method.Id, method.NameAr, method.NameEn, method.IsActive, method.SortOrder);
    }

    private static (string Ar, string En) Names(SaveLookupRequest request) => (request.NameAr.Trim(), request.NameEn.Trim());

    private async Task EnsureSpecialtyNamesFreeAsync(string ar, string en, Guid? exceptId, CancellationToken cancellationToken)
    {
        var arLower = ar.ToLower();
        var enLower = en.ToLower();
        if (await db.Specialties.AnyAsync(s => s.Id != exceptId && (s.NameAr.ToLower() == arLower || s.NameEn.ToLower() == enLower), cancellationToken))
        {
            throw new ConflictException(LookupErrorCodes.NameTaken, "Another entry already uses this name.");
        }
    }

    private async Task EnsureMethodNamesFreeAsync(string ar, string en, Guid? exceptId, CancellationToken cancellationToken)
    {
        var arLower = ar.ToLower();
        var enLower = en.ToLower();
        if (await db.CollectionMethods.AnyAsync(m => m.Id != exceptId && (m.NameAr.ToLower() == arLower || m.NameEn.ToLower() == enLower), cancellationToken))
        {
            throw new ConflictException(LookupErrorCodes.NameTaken, "Another entry already uses this name.");
        }
    }
}

public sealed class SaveLookupRequestValidator : AbstractValidator<SaveLookupRequest>
{
    public SaveLookupRequestValidator()
    {
        RuleFor(x => x.NameAr).Must(n => !string.IsNullOrWhiteSpace(n)).WithMessage("Name is required.").MaximumLength(Specialty.NameMaxLength);
        RuleFor(x => x.NameEn).Must(n => !string.IsNullOrWhiteSpace(n)).WithMessage("Name is required.").MaximumLength(Specialty.NameMaxLength);
        RuleFor(x => x.SortOrder).InclusiveBetween(0, 10_000);
    }
}
