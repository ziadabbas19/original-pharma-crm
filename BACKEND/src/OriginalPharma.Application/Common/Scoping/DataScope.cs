using System.Linq.Expressions;
using OriginalPharma.Domain.Common;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Application.Common.Scoping;

/// <summary>
/// The slice of data a user may see for one permission, resolved from the
/// permission's scope (own / team / territory / all).
/// </summary>
public sealed class DataScope
{
    private DataScope(PermissionScope? level, Guid userId, Guid[] userIds, Guid?[] territoryIds)
    {
        Level = level;
        UserId = userId;
        UserIds = userIds;
        TerritoryIds = territoryIds;
    }

    /// <summary>Null means the user does not hold the permission at all (matches nothing).</summary>
    public PermissionScope? Level { get; }

    public Guid UserId { get; }

    /// <summary>For <see cref="PermissionScope.Team"/>: the user plus everyone below them.</summary>
    public Guid[] UserIds { get; }

    /// <summary>For <see cref="PermissionScope.Territory"/>: the user's territory and its descendants.</summary>
    public Guid?[] TerritoryIds { get; }

    public static DataScope Nothing(Guid userId) => new(null, userId, [], []);
    public static DataScope All(Guid userId) => new(PermissionScope.All, userId, [], []);
    public static DataScope Own(Guid userId) => new(PermissionScope.Own, userId, [userId], []);

    public static DataScope Team(Guid userId, IEnumerable<Guid> subordinateIds) =>
        new(PermissionScope.Team, userId, subordinateIds.Append(userId).Distinct().ToArray(), []);

    public static DataScope Territory(Guid userId, IEnumerable<Guid> territoryIds) =>
        new(PermissionScope.Territory, userId, [userId], territoryIds.Select(id => (Guid?)id).Distinct().ToArray());

    /// <summary>In-memory check for a single record.</summary>
    public bool Includes(Guid ownerUserId, Guid? territoryId) => Level switch
    {
        PermissionScope.All => true,
        PermissionScope.Own => ownerUserId == UserId,
        PermissionScope.Team => UserIds.Contains(ownerUserId),
        PermissionScope.Territory => ownerUserId == UserId || TerritoryIds.Contains(territoryId),
        _ => false,
    };
}

/// <summary>Resolves the <see cref="DataScope"/> of the current user for a permission.</summary>
public interface IDataScopeResolver
{
    Task<DataScope> ResolveAsync(string permissionKey, CancellationToken cancellationToken = default);

    /// <summary>The same for another user, e.g. to find who may review a rep's work.</summary>
    Task<DataScope> ResolveForAsync(Guid userId, string permissionKey, CancellationToken cancellationToken = default);
}

/// <summary>
/// Specification-style query filters for scope-based access. Applied explicitly
/// in each query because the scope depends on which permission the endpoint uses
/// (e.g. visits:read may be "team" while tracking:history is "own").
/// </summary>
public static class ScopeQueryExtensions
{
    public static IQueryable<T> WhereInScope<T>(this IQueryable<T> query, DataScope scope)
        where T : class, IScopedEntity
    {
        if (scope.Level == PermissionScope.All)
        {
            return query;
        }

        // Built by property name so EF Core maps it to the concrete entity's columns
        // (an interface member access would not translate).
        var entity = Expression.Parameter(typeof(T), "e");
        var userId = Expression.Property(entity, nameof(IScopedEntity.UserId));
        var territoryId = Expression.Property(entity, nameof(IScopedEntity.TerritoryId));
        var values = Expression.Constant(new ScopeValues(scope));

        Expression body = scope.Level switch
        {
            PermissionScope.Own => Expression.Equal(userId, Expression.Field(values, nameof(ScopeValues.UserId))),
            PermissionScope.Team => ContainsCall(Expression.Field(values, nameof(ScopeValues.UserIds)), userId, typeof(Guid)),
            PermissionScope.Territory => Expression.OrElse(
                ContainsCall(Expression.Field(values, nameof(ScopeValues.TerritoryIds)), territoryId, typeof(Guid?)),
                Expression.Equal(userId, Expression.Field(values, nameof(ScopeValues.UserId)))),
            _ => Expression.Constant(false),
        };

        return query.Where(Expression.Lambda<Func<T, bool>>(body, entity));
    }

    /// <summary>Scope filter for the users table itself (a user "owns" their own row).</summary>
    public static IQueryable<User> WhereUsersInScope(this IQueryable<User> query, DataScope scope)
    {
        var userId = scope.UserId;
        var userIds = scope.UserIds;
        var territoryIds = scope.TerritoryIds;

        return scope.Level switch
        {
            PermissionScope.All => query,
            PermissionScope.Own => query.Where(u => u.Id == userId),
            PermissionScope.Team => query.Where(u => userIds.Contains(u.Id)),
            PermissionScope.Territory => query.Where(u => u.Id == userId || territoryIds.Contains(u.TerritoryId)),
            _ => query.Where(_ => false),
        };
    }

    /// <summary>
    /// Ids of the users visible in the scope, as a subquery. For data owned by a user that has no
    /// territory column of its own (doctor lists), so "territory" means the owner's territory.
    /// </summary>
    public static IQueryable<Guid> VisibleUserIds(this IQueryable<User> users, DataScope scope) =>
        users.WhereUsersInScope(scope).Select(u => u.Id);

    private static MethodCallExpression ContainsCall(Expression collection, Expression item, Type itemType) =>
        Expression.Call(typeof(Enumerable), nameof(Enumerable.Contains), [itemType], collection, item);

    /// <summary>Holder so EF Core turns the values into SQL parameters instead of constants.</summary>
    private sealed class ScopeValues(DataScope scope)
    {
        public readonly Guid UserId = scope.UserId;
        public readonly Guid[] UserIds = scope.UserIds;
        public readonly Guid?[] TerritoryIds = scope.TerritoryIds;
    }
}
