using System.Security.Cryptography;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Organization;
using OriginalPharma.Application.Common.Scoping;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Application.Identity;

public sealed record TerritoryDto(
    Guid Id,
    string Code,
    string Name,
    string? NameAr,
    TerritoryLevel Level,
    Guid? ParentId,
    int UserCount,
    int CustomerCount,
    int ChildCount);

/// <param name="Name">English name.</param>
/// <param name="Code">Optional; generated when empty.</param>
/// <param name="ParentId">Region for an area, area for a town, none for a region.</param>
public sealed record CreateTerritoryRequest(string Name, string? NameAr, TerritoryLevel Level, Guid? ParentId, string? Code = null);

/// <param name="ParentId">Moving a town to another area (or an area to another region) is allowed; the level never changes.</param>
public sealed record UpdateTerritoryRequest(string Name, string? NameAr, Guid? ParentId, string? Code = null);

public static class TerritoryErrorCodes
{
    public const string ParentInvalid = "territory_parent_invalid";
    public const string CodeTaken = "territory_code_taken";
    public const string InUse = "territory_in_use";
}

/// <summary>
/// The territory tree: regions, areas (where reps work) and towns (where doctors are). Reading
/// follows territories:read; changes need territories:manage and stay inside its scope.
/// </summary>
public sealed class TerritoryService(IAppDbContext db, IDataScopeResolver scopeResolver, IOrgHierarchy hierarchy)
{
    public async Task<IReadOnlyList<TerritoryDto>> ListAsync(CancellationToken cancellationToken = default)
    {
        var scope = await scopeResolver.ResolveAsync(Permissions.Territories.Read, cancellationToken);
        var visible = await VisibleIdsAsync(scope, cancellationToken);

        var query = db.Territories.AsNoTracking();
        if (visible is not null)
        {
            query = query.Where(t => visible.Contains(t.Id));
        }

        return await query
            .OrderBy(t => t.Level).ThenBy(t => t.Name)
            .Select(t => new TerritoryDto(
                t.Id,
                t.Code,
                t.Name,
                t.NameAr,
                t.Level,
                t.ParentId,
                db.Users.Count(u => u.TerritoryId == t.Id && u.IsActive),
                db.Customers.Count(c => c.TerritoryId == t.Id && c.IsActive),
                t.Children.Count))
            .ToListAsync(cancellationToken);
    }

    public async Task<TerritoryDto> CreateAsync(CreateTerritoryRequest request, CancellationToken cancellationToken = default)
    {
        var manageable = await ManageableIdsAsync(cancellationToken);
        await EnsureParentAsync(request.Level, request.ParentId, manageable, cancellationToken);

        var territory = new Territory
        {
            Name = request.Name.Trim(),
            NameAr = Clean(request.NameAr),
            Level = request.Level,
            ParentId = request.ParentId,
            Code = await UniqueCodeAsync(request.Code, request.Level, null, cancellationToken),
        };
        db.Territories.Add(territory);
        await db.SaveChangesAsync(cancellationToken);
        hierarchy.Invalidate();
        return await GetAsync(territory.Id, cancellationToken);
    }

    public async Task<TerritoryDto> UpdateAsync(Guid id, UpdateTerritoryRequest request, CancellationToken cancellationToken = default)
    {
        var manageable = await ManageableIdsAsync(cancellationToken);
        var territory = await db.Territories.SingleOrDefaultAsync(t => t.Id == id, cancellationToken)
                        ?? throw new NotFoundException("Territory", id);
        EnsureManageable(territory.Id, manageable);

        if (request.ParentId != territory.ParentId)
        {
            await EnsureParentAsync(territory.Level, request.ParentId, manageable, cancellationToken);
        }

        territory.Name = request.Name.Trim();
        territory.NameAr = Clean(request.NameAr);
        territory.ParentId = request.ParentId;
        if (!string.IsNullOrWhiteSpace(request.Code) && !string.Equals(request.Code.Trim(), territory.Code, StringComparison.OrdinalIgnoreCase))
        {
            territory.Code = await UniqueCodeAsync(request.Code, territory.Level, territory.Id, cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);
        hierarchy.Invalidate();
        return await GetAsync(territory.Id, cancellationToken);
    }

    /// <summary>Only empty nodes can be deleted: no child nodes, users, customers or orders.</summary>
    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var manageable = await ManageableIdsAsync(cancellationToken);
        var territory = await db.Territories.SingleOrDefaultAsync(t => t.Id == id, cancellationToken)
                        ?? throw new NotFoundException("Territory", id);
        EnsureManageable(territory.Id, manageable);

        var children = await db.Territories.CountAsync(t => t.ParentId == id, cancellationToken);
        var users = await db.Users.CountAsync(u => u.TerritoryId == id, cancellationToken);
        var customers = await db.Customers.CountAsync(c => c.TerritoryId == id, cancellationToken);
        var orders = await db.Orders.CountAsync(o => o.TerritoryId == id, cancellationToken);
        if (children + users + customers + orders > 0)
        {
            throw new ConflictException(TerritoryErrorCodes.InUse, "Move the towns, users and doctors of this territory first.")
            {
                Details = new Dictionary<string, object?>
                {
                    ["childCount"] = children,
                    ["userCount"] = users,
                    ["customerCount"] = customers,
                },
            };
        }

        db.Territories.Remove(territory);
        await db.SaveChangesAsync(cancellationToken);
        hierarchy.Invalidate();
    }

    private async Task<TerritoryDto> GetAsync(Guid id, CancellationToken cancellationToken) =>
        await db.Territories.AsNoTracking()
            .Where(t => t.Id == id)
            .Select(t => new TerritoryDto(
                t.Id, t.Code, t.Name, t.NameAr, t.Level, t.ParentId,
                db.Users.Count(u => u.TerritoryId == t.Id && u.IsActive),
                db.Customers.Count(c => c.TerritoryId == t.Id && c.IsActive),
                t.Children.Count))
            .SingleAsync(cancellationToken);

    /// <summary>
    /// Ids visible for a scope, or null for all. Territory scope already contains the subtree;
    /// own and team scopes see the users' nodes plus everything under them.
    /// </summary>
    private async Task<HashSet<Guid>?> VisibleIdsAsync(DataScope scope, CancellationToken cancellationToken)
    {
        var roots = await scope.ResolveTerritoryIdsAsync(db, cancellationToken);
        if (roots is null)
        {
            return null;
        }

        var tree = await TerritoryTree.LoadAsync(db, cancellationToken);
        return roots.SelectMany(tree.SelfAndDescendants).ToHashSet();
    }

    private async Task<HashSet<Guid>?> ManageableIdsAsync(CancellationToken cancellationToken) =>
        await VisibleIdsAsync(await scopeResolver.ResolveAsync(Permissions.Territories.Manage, cancellationToken), cancellationToken);

    private static void EnsureManageable(Guid id, HashSet<Guid>? manageable)
    {
        if (manageable is not null && !manageable.Contains(id))
        {
            throw new ForbiddenException("This territory is outside your scope.");
        }
    }

    private async Task EnsureParentAsync(TerritoryLevel level, Guid? parentId, HashSet<Guid>? manageable, CancellationToken cancellationToken)
    {
        if (level == TerritoryLevel.Region)
        {
            if (parentId is not null)
            {
                throw new BusinessRuleException(TerritoryErrorCodes.ParentInvalid, "A region cannot have a parent.");
            }

            if (manageable is not null)
            {
                throw new ForbiddenException("Only users with access to every territory can add regions.");
            }

            return;
        }

        if (parentId is not { } id)
        {
            throw new BusinessRuleException(TerritoryErrorCodes.ParentInvalid,
                level == TerritoryLevel.Town ? "Choose the area this town belongs to." : "Choose the region of this area.");
        }

        var parentLevel = await db.Territories.Where(t => t.Id == id).Select(t => (TerritoryLevel?)t.Level).SingleOrDefaultAsync(cancellationToken)
                          ?? throw new NotFoundException("Territory", id);
        if (Territory.ChildLevel(parentLevel) != level)
        {
            throw new BusinessRuleException(TerritoryErrorCodes.ParentInvalid,
                level == TerritoryLevel.Town ? "A town must belong to an area." : "An area must belong to a region.");
        }

        EnsureManageable(id, manageable);
    }

    private async Task<string> UniqueCodeAsync(string? requested, TerritoryLevel level, Guid? exceptId, CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(requested))
        {
            var code = requested.Trim().ToUpperInvariant();
            if (await db.Territories.AnyAsync(t => t.Code == code && t.Id != exceptId, cancellationToken))
            {
                throw new ConflictException(TerritoryErrorCodes.CodeTaken, "Another territory already uses this code.");
            }

            return code;
        }

        var prefix = level switch
        {
            TerritoryLevel.Region => "R",
            TerritoryLevel.Area => "A",
            _ => "T",
        };
        while (true)
        {
            var code = $"{prefix}-{RandomNumberGenerator.GetString("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6)}";
            if (!await db.Territories.AnyAsync(t => t.Code == code, cancellationToken))
            {
                return code;
            }
        }
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

public sealed class CreateTerritoryRequestValidator : AbstractValidator<CreateTerritoryRequest>
{
    public CreateTerritoryRequestValidator()
    {
        RuleFor(x => x.Name).Must(n => !string.IsNullOrWhiteSpace(n)).WithMessage("Name is required.").MaximumLength(Territory.NameMaxLength);
        RuleFor(x => x.NameAr).MaximumLength(Territory.NameMaxLength);
        RuleFor(x => x.Level).IsInEnum();
        RuleFor(x => x.Code).MaximumLength(Territory.CodeMaxLength).Matches("^[A-Za-z0-9-]*$").When(x => x.Code is not null);
        RuleFor(x => x.ParentId).NotEqual(Guid.Empty);
    }
}

public sealed class UpdateTerritoryRequestValidator : AbstractValidator<UpdateTerritoryRequest>
{
    public UpdateTerritoryRequestValidator()
    {
        RuleFor(x => x.Name).Must(n => !string.IsNullOrWhiteSpace(n)).WithMessage("Name is required.").MaximumLength(Territory.NameMaxLength);
        RuleFor(x => x.NameAr).MaximumLength(Territory.NameMaxLength);
        RuleFor(x => x.Code).MaximumLength(Territory.CodeMaxLength).Matches("^[A-Za-z0-9-]*$").When(x => x.Code is not null);
        RuleFor(x => x.ParentId).NotEqual(Guid.Empty);
    }
}
