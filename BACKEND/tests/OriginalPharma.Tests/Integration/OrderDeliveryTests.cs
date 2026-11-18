using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Bulk;
using OriginalPharma.Application.Notifications;
using OriginalPharma.Application.Orders;
using OriginalPharma.Domain.Notifications;
using OriginalPharma.Domain.Orders;

namespace OriginalPharma.Tests.Integration;

[Collection(PostgresCollection.Name)]
public sealed class OrderDeliveryTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static async Task<OrderDto> NewOrderAsync(TestDatabase db, Guid rep)
    {
        var product = await DemoPeople.ProductAsync(db, "Kidofen syrup 100 ml");
        var cash = await DemoPeople.MethodAsync(db, "Cash");
        return await db.As<OrderService, OrderDto>(rep, s => s.CreateAsync(new CreateOrderRequest(
            Guid.NewGuid(), new DateOnly(2026, 11, 18), PlaceType.Pharmacy, "Delivery pharmacy", [new OrderLineInput(product, 3)],
            CollectionMethodId: cash), Ct));
    }

    private static Task<IReadOnlyList<NotificationDto>> InboxAsync(TestDatabase db, Guid user) =>
        db.As<NotificationService, IReadOnlyList<NotificationDto>>(user, s => s.ListAsync(new NotificationQuery(), Ct));

    [Fact]
    public async Task Approval_and_delivery_reach_only_the_rep_with_who_and_when()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var order = await NewOrderAsync(db, p.Rep);
        Assert.Null(order.Delivery);
        var before = (await InboxAsync(db, p.Rep)).Count;
        var othersBefore = await db.DbAsync(c => c.Notifications.CountAsync(n => n.UserId != p.Rep, Ct));

        var approved = await db.As<OrderService, OrderDto>(p.Supervisor, s => s.ApproveAsync(order.Id,
            new OrderStatusRequest("Deliver before Thursday", "Customer pays late, watch the balance"), Ct));
        Assert.Equal((OrderStatus.Approved, DeliveryStatus.NotDelivered), (approved.Status, approved.Delivery));
        Assert.Equal("Demo Supervisor", approved.DecidedByName);
        Assert.NotNull(approved.DecidedAt);
        Assert.True(approved.CanDeliver);

        // The rep only can neither deliver nor see the internal note.
        var asRep = await db.As<OrderService, OrderDto>(p.Rep, s => s.GetAsync(order.Id, Ct));
        Assert.False(asRep.CanDeliver);
        Assert.Equal("Deliver before Thursday", asRep.StatusReason);
        Assert.All(asRep.History, h => Assert.Null(h.InternalNote));
        Assert.Contains(approved.History, h => h.InternalNote == "Customer pays late, watch the balance");
        await Assert.ThrowsAsync<ForbiddenException>(() => db.As<OrderService, OrderDto>(p.Rep, s => s.DeliverAsync(order.Id, new OrderStatusRequest(), Ct)));

        var delivered = await db.As<OrderService, OrderDto>(p.Area, s => s.DeliverAsync(order.Id, new OrderStatusRequest("Left with the pharmacist"), Ct));
        Assert.Equal(DeliveryStatus.Delivered, delivered.Delivery);
        Assert.Equal("Demo Area Manager", delivered.DeliveredByName);
        Assert.Equal("Left with the pharmacist", delivered.DeliveryNote);
        Assert.False(delivered.CanCancel || delivered.CanDeliver);

        // Delivered orders stay delivered: no second delivery, no cancel.
        var twice = await Assert.ThrowsAsync<ConflictException>(() => db.As<OrderService, OrderDto>(p.Area, s => s.DeliverAsync(order.Id, new OrderStatusRequest(), Ct)));
        Assert.Equal(OrderErrorCodes.StatusInvalid, twice.Code);
        await Assert.ThrowsAsync<ConflictException>(() => db.As<OrderService, OrderDto>(p.Area, s => s.CancelAsync(order.Id, new OrderStatusRequest(), Ct)));

        // Two notifications for the rep, nothing for anybody else; both were also pushed live to the rep only.
        var inbox = await InboxAsync(db, p.Rep);
        Assert.Equal(before + 2, inbox.Count);
        var latest = inbox.Take(2).ToList();
        Assert.Equal([NotificationType.OrderDelivered, NotificationType.OrderApproved], latest.Select(n => n.Type));
        Assert.All(latest, n => Assert.Equal(order.Id, n.EntityId));
        Assert.Equal("Deliver before Thursday", latest[1].Data.GetProperty("note").GetString());
        Assert.Equal(order.Number, latest[0].Data.GetProperty("orderNumber").GetString());
        Assert.DoesNotContain("internal", latest[1].Data.GetRawText(), StringComparison.OrdinalIgnoreCase);
        Assert.Equal(othersBefore, await db.DbAsync(c => c.Notifications.CountAsync(n => n.UserId != p.Rep, Ct)));
        Assert.All(db.Published.Sent, s => Assert.Equal(p.Rep, s.UserId));
        Assert.Equal(2, db.Published.Sent.Count(s => s.Notification.EntityId == order.Id));

        // Nobody else can read the rep's notifications or mark them.
        Assert.DoesNotContain(await InboxAsync(db, p.RepEast), n => n.EntityId == order.Id);
        var foreign = await db.As<NotificationService, BulkResult>(p.RepEast, s => s.MarkReadAsync(new BulkIdsRequest([latest[0].Id]), Ct));
        Assert.Equal(BulkCodes.NotFound, foreign.Items.Single().Code);
        var mine = await db.As<NotificationService, BulkResult>(p.Rep, s => s.MarkReadAsync(new BulkIdsRequest([latest[0].Id]), Ct));
        Assert.Equal(1, mine.Updated);
    }

    [Fact]
    public async Task Rejection_needs_a_reason_and_the_rep_cancelling_their_own_order_notifies_nobody()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var order = await NewOrderAsync(db, p.Rep);

        var noReason = await Assert.ThrowsAsync<BusinessRuleException>(() => db.As<OrderService, OrderDto>(p.Supervisor, s => s.RejectAsync(order.Id, new OrderStatusRequest(), Ct)));
        Assert.Equal("reason_required", noReason.Code);
        var rejected = await db.As<OrderService, OrderDto>(p.Supervisor, s => s.RejectAsync(order.Id, new OrderStatusRequest("Wrong price list"), Ct));
        Assert.Equal((OrderStatus.Rejected, "Wrong price list", (DeliveryStatus?)null), (rejected.Status, rejected.StatusReason, rejected.Delivery));
        var rejection = (await InboxAsync(db, p.Rep)).First();
        Assert.Equal(NotificationType.OrderRejected, rejection.Type);
        Assert.Equal("Wrong price list", rejection.Data.GetProperty("note").GetString());

        var own = await NewOrderAsync(db, p.Rep);
        var count = await db.DbAsync(c => c.Notifications.CountAsync(Ct));
        var cancelled = await db.As<OrderService, OrderDto>(p.Rep, s => s.CancelAsync(own.Id, new OrderStatusRequest("Typo"), Ct));
        Assert.Equal(OrderStatus.Cancelled, cancelled.Status);
        Assert.Equal(count, await db.DbAsync(c => c.Notifications.CountAsync(Ct)));

        // A manager cancelling an approved (not delivered) order tells the rep.
        var third = await NewOrderAsync(db, p.Rep);
        await db.As<OrderService, OrderDto>(p.Supervisor, s => s.ApproveAsync(third.Id, new OrderStatusRequest(), Ct));
        await db.As<OrderService, OrderDto>(p.Area, s => s.CancelAsync(third.Id, new OrderStatusRequest("Customer closed"), Ct));
        var top = (await InboxAsync(db, p.Rep)).First();
        Assert.Equal((NotificationType.OrderCancelled, "Demo Area Manager"), (top.Type, top.Data.GetProperty("actorName").GetString()));

        // The list shows who decided and when.
        var list = await db.As<OrderService, IReadOnlyList<OrderListItemDto>>(p.Rep, s => s.ListAsync(new OrderQuery(Mine: true), Ct));
        var row = list.Single(o => o.Id == third.Id);
        Assert.Equal("Demo Area Manager", row.DecidedByName);
        Assert.NotNull(row.DecidedAt);
    }
}
