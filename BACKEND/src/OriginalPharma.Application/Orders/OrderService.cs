using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Catalog;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Images;
using OriginalPharma.Application.Common.Organization;
using OriginalPharma.Application.Common.Scoping;
using OriginalPharma.Application.Identity;
using OriginalPharma.Domain.Catalog;
using OriginalPharma.Domain.Orders;

namespace OriginalPharma.Application.Orders;

/// <summary>
/// Sales orders. Reps take orders (orders:create) and may edit or cancel their own while they
/// are submitted; orders:manage approves, rejects, cancels and edits other people's orders
/// inside its scope. Reading follows the orders:read scope like visits. Totals are computed here.
/// </summary>
public sealed class OrderService(
    IAppDbContext db,
    ICurrentUser currentUser,
    IDataScopeResolver scopeResolver,
    IPermissionService permissions,
    ProductAccess productAccess,
    IOrderNumberGenerator numbers,
    TimeProvider time)
{
    public const int MaxListRows = 1000;
    public const int MaxExportRows = 20_000;

    public async Task<OrderDto> CreateAsync(CreateOrderRequest request, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();

        // A retry of an order that already reached the server (offline queue, lost response).
        var existing = await FindByClientRequestAsync(me, request.ClientRequestId, cancellationToken);
        if (existing is { } existingId)
        {
            return await BuildDtoAsync(existingId, cancellationToken);
        }

        var actor = await LoadActorAsync(me, cancellationToken);
        await EnsureReferencesAsync(request, null, cancellationToken);
        var (lines, products, warnings) = await PriceAsync(request, actor, null, cancellationToken);

        var now = time.GetUtcNow();
        var order = new Order
        {
            Number = FormatNumber(await numbers.NextAsync(cancellationToken), now),
            UserId = me,
            TerritoryId = actor.TerritoryId,
            ClientRequestId = request.ClientRequestId,
            Status = OrderStatus.Submitted,
            CreatedAt = now,
            CreatedById = me,
            UpdatedAt = now,
            UpdatedById = me,
        };
        Apply(order, request, lines, products);
        order.History.Add(History(order.Id, OrderHistoryAction.Created, null, OrderStatus.Submitted, actor, null, now));
        db.Orders.Add(order);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // The same key arrived twice at the same moment and the other request won the unique index.
            var winner = await FindByClientRequestAsync(me, request.ClientRequestId, cancellationToken);
            if (winner is null)
            {
                throw;
            }

            return await BuildDtoAsync(winner.Value, cancellationToken);
        }

        return await BuildDtoAsync(order.Id, cancellationToken, warnings);
    }

    public async Task<OrderDto> UpdateAsync(Guid id, UpdateOrderRequest request, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var order = await db.Orders.Include(o => o.Lines).SingleOrDefaultAsync(o => o.Id == id, cancellationToken)
                    ?? throw new NotFoundException("Order", id);
        var actor = await LoadActorAsync(me, cancellationToken);
        var rights = await RightsAsync(order, actor, cancellationToken);
        if (!rights.CanRead)
        {
            throw new NotFoundException("Order", id);
        }

        if (!rights.CanEdit)
        {
            throw order.Status != OrderStatus.Submitted ? StatusInvalid(order.Status) : new ForbiddenException("You cannot edit this order.");
        }

        await EnsureReferencesAsync(request, order, cancellationToken);
        var snapshot = order.Lines.ToDictionary(l => l.ProductId, l => l.UnitPrice);
        var (lines, products, warnings) = await PriceAsync(request, actor, snapshot, cancellationToken);

        db.OrderLines.RemoveRange(order.Lines);
        order.Lines.Clear();
        Apply(order, request, lines, products);

        // The new lines already carry their ids, so mark them as inserts explicitly.
        db.OrderLines.AddRange(order.Lines);

        var now = time.GetUtcNow();
        order.UpdatedAt = now;
        order.UpdatedById = me;
        db.OrderHistory.Add(History(order.Id, OrderHistoryAction.Edited, order.Status, order.Status, actor, null, now));
        await db.SaveChangesAsync(cancellationToken);
        return await BuildDtoAsync(order.Id, cancellationToken, warnings);
    }

    public Task<OrderDto> ApproveAsync(Guid id, OrderStatusRequest request, CancellationToken cancellationToken = default) =>
        ChangeStatusAsync(id, OrderHistoryAction.Approved, OrderStatus.Approved, request.Reason, cancellationToken);

    public Task<OrderDto> RejectAsync(Guid id, OrderStatusRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Reason))
        {
            throw new BusinessRuleException("reason_required", "Give a reason for rejecting the order.");
        }

        return ChangeStatusAsync(id, OrderHistoryAction.Rejected, OrderStatus.Rejected, request.Reason, cancellationToken);
    }

    public Task<OrderDto> CancelAsync(Guid id, OrderStatusRequest request, CancellationToken cancellationToken = default) =>
        ChangeStatusAsync(id, OrderHistoryAction.Cancelled, OrderStatus.Cancelled, request.Reason, cancellationToken);

    public async Task<OrderDto> GetAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var scope = await scopeResolver.ResolveAsync(Permissions.Orders.Read, cancellationToken);
        if (!await db.Orders.AsNoTracking().WhereInScope(scope).AnyAsync(o => o.Id == id, cancellationToken))
        {
            throw new NotFoundException("Order", id);
        }

        return await BuildDtoAsync(id, cancellationToken);
    }

    /// <summary>Orders in the caller's orders:read scope, newest first (at most 1000).</summary>
    public async Task<IReadOnlyList<OrderListItemDto>> ListAsync(OrderQuery query, CancellationToken cancellationToken = default) =>
        await Project(await FilterAsync(query, cancellationToken))
            .Take(MaxListRows)
            .ToListAsync(cancellationToken);

    /// <summary>Same filters as the list, as CSV (UTF-8 with BOM so spreadsheet apps read Arabic correctly).</summary>
    public async Task<byte[]> ExportCsvAsync(OrderQuery query, string language, CancellationToken cancellationToken = default)
    {
        var rows = await Project(await FilterAsync(query, cancellationToken))
            .Take(MaxExportRows)
            .ToListAsync(cancellationToken);
        return OrderCsv.Build(rows, language);
    }

    /// <summary>Place names used in visible orders plus active pharmacies, for the order form.</summary>
    public async Task<IReadOnlyList<PlaceSuggestionDto>> SuggestPlacesAsync(string? search, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var scope = await scopeResolver.ResolveAsync(Permissions.Orders.Read, cancellationToken);
        var term = search?.Trim().ToLower() ?? string.Empty;

        var orders = db.Orders.AsNoTracking();
        orders = scope.Level is null ? orders.Where(o => o.UserId == me) : orders.WhereInScope(scope);
        var used = await orders
            .Where(o => term == string.Empty || o.PlaceName.ToLower().Contains(term))
            .GroupBy(o => new { o.PlaceName, o.PlaceType, o.CustomerId })
            .OrderByDescending(g => g.Max(o => o.CreatedAt))
            .Select(g => new PlaceSuggestionDto(g.Key.PlaceName, g.Key.PlaceType, g.Key.CustomerId))
            .Take(15)
            .ToListAsync(cancellationToken);

        var pharmacies = await db.Customers.AsNoTracking()
            .Where(c => c.Type == Domain.Crm.CustomerType.Pharmacy && c.IsActive)
            .Where(c => term == string.Empty || c.Name.ToLower().Contains(term) || (c.NameAr != null && c.NameAr.Contains(term)))
            .OrderBy(c => c.Name)
            .Select(c => new PlaceSuggestionDto(c.NameAr ?? c.Name, PlaceType.Pharmacy, c.Id))
            .Take(10)
            .ToListAsync(cancellationToken);

        return used
            .Concat(pharmacies.Where(p => used.All(u => u.CustomerId != p.CustomerId)))
            .DistinctBy(p => (p.Name.ToLowerInvariant(), p.PlaceType))
            .Take(20)
            .ToList();
    }

    public static string FormatNumber(long sequence, DateTimeOffset at) => $"ORD-{at.Year}-{sequence:D6}";

    private async Task<OrderDto> ChangeStatusAsync(
        Guid id,
        OrderHistoryAction action,
        OrderStatus to,
        string? reason,
        CancellationToken cancellationToken)
    {
        var me = currentUser.RequireUserId();
        var order = await db.Orders.SingleOrDefaultAsync(o => o.Id == id, cancellationToken) ?? throw new NotFoundException("Order", id);
        var actor = await LoadActorAsync(me, cancellationToken);
        var rights = await RightsAsync(order, actor, cancellationToken);
        if (!rights.CanRead)
        {
            throw new NotFoundException("Order", id);
        }

        var allowed = action == OrderHistoryAction.Cancelled ? rights.CanCancel : rights.CanReview;
        if (!allowed)
        {
            if (action != OrderHistoryAction.Cancelled && order.UserId == me && rights.IsManager)
            {
                throw new ForbiddenException(OrderErrorCodes.SelfReview, "Someone else has to approve or reject your own orders.");
            }

            OrderStatus[] validFrom = action == OrderHistoryAction.Cancelled && rights.IsManager
                ? [OrderStatus.Submitted, OrderStatus.Approved]
                : [OrderStatus.Submitted];
            throw validFrom.Contains(order.Status) ? new ForbiddenException("You cannot change the status of this order.") : StatusInvalid(order.Status);
        }

        var now = time.GetUtcNow();
        var from = order.Status;
        order.Status = to;
        order.StatusReason = string.IsNullOrWhiteSpace(reason) ? null : reason.Trim();
        order.UpdatedAt = now;
        order.UpdatedById = me;
        db.OrderHistory.Add(History(order.Id, action, from, to, actor, order.StatusReason, now));
        await db.SaveChangesAsync(cancellationToken);
        return await BuildDtoAsync(order.Id, cancellationToken);
    }

    private async Task<IQueryable<Order>> FilterAsync(OrderQuery query, CancellationToken cancellationToken)
    {
        var me = currentUser.RequireUserId();
        var scope = await scopeResolver.ResolveAsync(Permissions.Orders.Read, cancellationToken);
        var orders = db.Orders.AsNoTracking().WhereInScope(scope);

        if (query.Mine)
        {
            orders = orders.Where(o => o.UserId == me);
        }

        if (query.RepId is { } repId)
        {
            orders = orders.Where(o => o.UserId == repId);
        }

        if (query.From is { } from)
        {
            orders = orders.Where(o => o.OrderDate >= from);
        }

        if (query.To is { } to)
        {
            orders = orders.Where(o => o.OrderDate <= to);
        }

        if (query.AreaId is { } areaId)
        {
            var tree = await TerritoryTree.LoadAsync(db, cancellationToken);
            var ids = tree.SelfAndDescendants(areaId).Select(id => (Guid?)id).ToArray();
            orders = orders.Where(o => ids.Contains(o.TerritoryId));
        }

        if (query.Status is { } status)
        {
            orders = orders.Where(o => o.Status == status);
        }

        if (query.PlaceType is { } placeType)
        {
            orders = orders.Where(o => o.PlaceType == placeType);
        }

        if (!string.IsNullOrWhiteSpace(query.Place))
        {
            var place = query.Place.Trim().ToLower();
            orders = orders.Where(o => o.PlaceName.ToLower().Contains(place));
        }

        if (query.CollectionMethodId is { } methodId)
        {
            orders = orders.Where(o => o.CollectionMethodId == methodId);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim().ToLower();
            orders = orders.Where(o => o.Number.ToLower().Contains(term) || o.PlaceName.ToLower().Contains(term));
        }

        return orders.OrderByDescending(o => o.OrderDate).ThenByDescending(o => o.CreatedAt);
    }

    private IQueryable<OrderListItemDto> Project(IQueryable<Order> orders) =>
        orders.Select(o => new OrderListItemDto(
            o.Id,
            o.Number,
            o.UserId,
            db.Users.Where(u => u.Id == o.UserId).Select(u => u.FullName).FirstOrDefault() ?? string.Empty,
            o.TerritoryId,
            db.Territories.Where(t => t.Id == o.TerritoryId).Select(t => t.Name).FirstOrDefault(),
            db.Territories.Where(t => t.Id == o.TerritoryId).Select(t => t.NameAr).FirstOrDefault(),
            o.OrderDate,
            o.PlaceType,
            o.PlaceName,
            o.CollectionMethodId,
            o.CollectionMethod != null ? o.CollectionMethod.NameAr : null,
            o.CollectionMethod != null ? o.CollectionMethod.NameEn : null,
            o.CollectionMethodOther,
            o.Status,
            o.Lines.Count,
            o.Total,
            o.CreatedAt));

    private async Task<OrderDto> BuildDtoAsync(Guid id, CancellationToken cancellationToken, IReadOnlyList<StockWarningDto>? warnings = null)
    {
        var me = currentUser.RequireUserId();
        var order = await db.Orders.AsNoTracking()
            .Include(o => o.Lines)
            .Include(o => o.History)
            .Include(o => o.CollectionMethod)
            .SingleAsync(o => o.Id == id, cancellationToken);
        var rep = await db.Users.AsNoTracking().Where(u => u.Id == order.UserId).Select(u => u.FullName).SingleOrDefaultAsync(cancellationToken);
        var territory = await db.Territories.AsNoTracking().Where(t => t.Id == order.TerritoryId)
            .Select(t => new { t.Name, t.NameAr }).SingleOrDefaultAsync(cancellationToken);

        var productIds = order.Lines.Select(l => l.ProductId).ToArray();
        var products = await db.Products.AsNoTracking()
            .Where(p => productIds.Contains(p.Id))
            .Select(p => new { p.Id, p.ImageKey, p.StockQuantity })
            .ToDictionaryAsync(p => p.Id, cancellationToken);

        // Warnings from the save itself, or the current stock while the order is still open.
        warnings ??= order.Status == OrderStatus.Submitted
            ? order.Lines
                .Where(l => products.TryGetValue(l.ProductId, out var p) && l.Quantity > p.StockQuantity)
                .Select(l => new StockWarningDto(l.ProductId, l.Quantity, products[l.ProductId].StockQuantity))
                .ToList()
            : [];

        var rights = await RightsAsync(order, await LoadActorAsync(me, cancellationToken), cancellationToken);

        return new OrderDto(
            order.Id, order.Number, order.ClientRequestId, order.UserId, rep ?? string.Empty, order.TerritoryId,
            territory?.Name, territory?.NameAr, order.OrderDate, order.PlaceType, order.PlaceName, order.CustomerId,
            order.CollectionMethodId, order.CollectionMethod?.NameAr, order.CollectionMethod?.NameEn,
            order.CollectionMethodOther, order.Notes, order.Status, order.StatusReason, order.Subtotal,
            order.DiscountTotal, order.Total, order.CreatedAt, order.UpdatedAt,
            order.Lines.OrderBy(l => l.SortOrder)
                .Select(l => new OrderLineDto(
                    l.Id, l.ProductId, l.ProductNameAr, l.ProductNameEn,
                    ImageService.Url(products.GetValueOrDefault(l.ProductId)?.ImageKey, ImageService.Thumbnail),
                    l.Quantity, l.UnitPrice, l.DiscountPercent, l.DiscountAmount, l.LineTotal, l.ExceededStock))
                .ToList(),
            order.History.OrderBy(h => h.CreatedAt)
                .Select(h => new OrderHistoryDto(h.Action, h.FromStatus, h.ToStatus, h.ActorName, h.Reason, h.CreatedAt))
                .ToList(),
            warnings,
            rights.CanEdit,
            rights.CanCancel,
            rights.CanReview);
    }

    private async Task<OrderRights> RightsAsync(Order order, OrderActor actor, CancellationToken cancellationToken)
    {
        var readScope = await scopeResolver.ResolveAsync(Permissions.Orders.Read, cancellationToken);
        var owner = order.UserId == actor.Id && actor.Permissions.Has(Permissions.Orders.Create);
        var manager = false;
        if (actor.Permissions.Has(Permissions.Orders.Manage))
        {
            var manageScope = await scopeResolver.ResolveAsync(Permissions.Orders.Manage, cancellationToken);
            manager = manageScope.Includes(order.UserId, order.TerritoryId);
        }

        var open = order.Status == OrderStatus.Submitted;
        return new OrderRights(
            CanRead: readScope.Includes(order.UserId, order.TerritoryId) || order.UserId == actor.Id || manager,
            CanEdit: open && (owner || manager),
            CanCancel: (open && (owner || manager)) || (manager && order.Status == OrderStatus.Approved),
            CanReview: open && manager && order.UserId != actor.Id,
            IsManager: manager);
    }

    private async Task<OrderActor> LoadActorAsync(Guid userId, CancellationToken cancellationToken)
    {
        var user = await db.Users.AsNoTracking()
                       .Where(u => u.Id == userId)
                       .Select(u => new { u.FullName, u.TerritoryId })
                       .SingleOrDefaultAsync(cancellationToken)
                   ?? throw new UnauthorizedException("unauthenticated", "Sign in required.");
        var caps = await db.UserRoles.AsNoTracking()
            .Where(ur => ur.UserId == userId)
            .Join(db.Roles, ur => ur.RoleId, r => r.Id, (_, r) => r.MaxDiscountPercent)
            .ToListAsync(cancellationToken);
        var effective = await permissions.GetEffectivePermissionsAsync(userId, cancellationToken);
        return new OrderActor(userId, user.FullName, user.TerritoryId, effective, OrderPricing.EffectiveDiscountCap(caps));
    }

    /// <summary>
    /// Prices the lines. New products must be active and in a line the actor may sell; lines kept
    /// from the previous version of the order keep their price snapshot.
    /// </summary>
    private async Task<(List<PricedLine> Lines, Dictionary<Guid, Product> Products, List<StockWarningDto> Warnings)> PriceAsync(
        IOrderInput input,
        OrderActor actor,
        IReadOnlyDictionary<Guid, decimal>? snapshot,
        CancellationToken cancellationToken)
    {
        if (actor.DiscountCap is { } cap && input.Lines.FirstOrDefault(l => l.DiscountPercent > cap) is { } above)
        {
            throw new BusinessRuleException(OrderErrorCodes.DiscountAboveCap, $"The highest discount you can give is {cap:0.##}%.")
            {
                Details = new Dictionary<string, object?>
                {
                    ["maxDiscountPercent"] = cap,
                    ["productId"] = above.ProductId,
                },
            };
        }

        var ids = input.Lines.Select(l => l.ProductId).Distinct().ToArray();
        var products = await db.Products.AsNoTracking()
            .Include(p => p.ProductLine)
            .Where(p => ids.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, cancellationToken);
        var visibleLines = await productAccess.VisibleLineIdsAsync(actor.Id, cancellationToken);

        var lines = new List<PricedLine>();
        var warnings = new List<StockWarningDto>();
        foreach (var line in input.Lines)
        {
            var kept = snapshot is not null && snapshot.ContainsKey(line.ProductId);
            if (!products.TryGetValue(line.ProductId, out var product) ||
                (!kept && (!product.IsActive || !product.ProductLine!.IsActive ||
                           (visibleLines is not null && !visibleLines.Contains(product.ProductLineId)))))
            {
                throw new BusinessRuleException(OrderErrorCodes.ProductUnavailable, "One of the products is not available to you.")
                {
                    Details = new Dictionary<string, object?> { ["productId"] = line.ProductId },
                };
            }

            var price = kept ? snapshot![line.ProductId] : product.Price;
            lines.Add(OrderPricing.PriceLine(product.Id, line.Quantity, price, line.DiscountPercent));
            if (line.Quantity > product.StockQuantity)
            {
                warnings.Add(new StockWarningDto(product.Id, line.Quantity, product.StockQuantity));
            }
        }

        return (lines, products, warnings);
    }

    private async Task EnsureReferencesAsync(IOrderInput input, Order? current, CancellationToken cancellationToken)
    {
        if (!OrderInputRules.HasExactlyOneCollectionMethod(input))
        {
            throw new BusinessRuleException(OrderErrorCodes.CollectionMethodInvalid, "Choose a collection method, or choose Other and type it.");
        }

        if (input.CollectionMethodId is { } methodId && methodId != current?.CollectionMethodId &&
            !await db.CollectionMethods.AnyAsync(m => m.Id == methodId && m.IsActive, cancellationToken))
        {
            throw new BusinessRuleException(OrderErrorCodes.CollectionMethodInvalid, "This collection method is no longer available.");
        }

        if (input.CustomerId is { } customerId && customerId != current?.CustomerId &&
            !await db.Customers.AnyAsync(c => c.Id == customerId && c.IsActive, cancellationToken))
        {
            throw new BusinessRuleException(OrderErrorCodes.CustomerInvalid, "The linked customer does not exist.");
        }
    }

    private static void Apply(Order order, IOrderInput input, IReadOnlyList<PricedLine> lines, IReadOnlyDictionary<Guid, Product> products)
    {
        order.OrderDate = input.OrderDate;
        order.PlaceType = input.PlaceType;
        order.PlaceName = input.PlaceName.Trim();
        order.CustomerId = input.CustomerId;
        order.CollectionMethodId = input.CollectionMethodId;
        order.CollectionMethodOther = input.CollectionMethodId is null ? input.CollectionMethodOther?.Trim() : null;
        order.Notes = string.IsNullOrWhiteSpace(input.Notes) ? null : input.Notes.Trim();

        var sort = 0;
        foreach (var line in lines)
        {
            var product = products[line.ProductId];
            order.Lines.Add(new OrderLine
            {
                OrderId = order.Id,
                ProductId = line.ProductId,
                ProductNameAr = product.NameAr,
                ProductNameEn = product.NameEn,
                Quantity = line.Quantity,
                UnitPrice = line.UnitPrice,
                DiscountPercent = line.DiscountPercent,
                DiscountAmount = line.DiscountAmount,
                LineTotal = line.LineTotal,
                ExceededStock = line.Quantity > product.StockQuantity,
                SortOrder = sort++,
            });
        }

        var totals = OrderPricing.Totals(lines);
        order.Subtotal = totals.Subtotal;
        order.DiscountTotal = totals.DiscountTotal;
        order.Total = totals.Total;
    }

    private static OrderHistoryEntry History(
        Guid orderId,
        OrderHistoryAction action,
        OrderStatus? from,
        OrderStatus to,
        OrderActor actor,
        string? reason,
        DateTimeOffset at) => new()
    {
        OrderId = orderId,
        Action = action,
        FromStatus = from,
        ToStatus = to,
        ActorId = actor.Id,
        ActorName = actor.FullName,
        Reason = reason,
        CreatedAt = at,
    };

    private Task<Guid?> FindByClientRequestAsync(Guid userId, Guid clientRequestId, CancellationToken cancellationToken) =>
        db.Orders.AsNoTracking()
            .Where(o => o.UserId == userId && o.ClientRequestId == clientRequestId)
            .Select(o => (Guid?)o.Id)
            .FirstOrDefaultAsync(cancellationToken);

    private static ConflictException StatusInvalid(OrderStatus status) =>
        new(OrderErrorCodes.StatusInvalid, $"This order is {status.ToString().ToLowerInvariant()} and can no longer be changed.")
        {
            Details = new Dictionary<string, object?> { ["status"] = status },
        };

    private sealed record OrderActor(Guid Id, string FullName, Guid? TerritoryId, EffectivePermissions Permissions, decimal? DiscountCap);

    private sealed record OrderRights(bool CanRead, bool CanEdit, bool CanCancel, bool CanReview, bool IsManager);
}
