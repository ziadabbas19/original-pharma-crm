using Microsoft.EntityFrameworkCore;
using OriginalPharma.Application.Common.Bulk;
using OriginalPharma.Application.Crm;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Lookups;
using OriginalPharma.Application.Orders;
using OriginalPharma.Domain.Audit;
using OriginalPharma.Domain.Orders;

namespace OriginalPharma.Tests.Integration;

[Collection(PostgresCollection.Name)]
public sealed class BulkDeleteTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static BulkDeleteRequest Delete(params Guid[] ids) => new(ids);

    private static Guid[] NewIds(int count) => Enumerable.Range(0, count).Select(_ => Guid.NewGuid()).ToArray();

    [Fact]
    public void A_preview_can_judge_a_larger_selection_than_a_real_request_may_change()
    {
        var validator = new BulkDeleteRequestValidator();

        Assert.True(validator.Validate(new BulkDeleteRequest(NewIds(BulkLimits.MaxItems))).IsValid);
        Assert.False(validator.Validate(new BulkDeleteRequest(NewIds(BulkLimits.MaxItems + 1))).IsValid);
        Assert.True(validator.Validate(new BulkDeleteRequest(NewIds(BulkLimits.MaxPreviewItems), DryRun: true)).IsValid);
        Assert.False(validator.Validate(new BulkDeleteRequest(NewIds(BulkLimits.MaxPreviewItems + 1), DryRun: true)).IsValid);
    }

    [Fact]
    public async Task Lookups_in_use_are_archived_and_unused_ones_are_removed()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var cash = await DemoPeople.MethodAsync(db, "Cash"); // used by the demo orders
        var cheque = await DemoPeople.MethodAsync(db, "Cheque"); // never used
        var cardiology = await DemoPeople.SpecialtyAsync(db, "Cardiology"); // doctors use it
        var ophthalmology = await DemoPeople.SpecialtyAsync(db, "Ophthalmology"); // nobody does

        // A dry run reports what would happen and changes nothing.
        var preview = await db.As<LookupService, BulkResult>(p.Admin, s => s.DeleteCollectionMethodsAsync(new BulkDeleteRequest([cash, cheque], DryRun: true), Ct));
        Assert.True(preview.DryRun);
        Assert.Equal((1, 1), (preview.Archived, preview.Deleted));
        Assert.True(preview.Items.Single(i => i.Id == cash).UsageCount > 0);
        Assert.Equal(2, await db.DbAsync(c => c.CollectionMethods.CountAsync(m => m.Id == cash || m.Id == cheque, Ct)));

        var methods = await db.As<LookupService, BulkResult>(p.Admin, s => s.DeleteCollectionMethodsAsync(Delete(cash, cheque), Ct));
        Assert.Equal(BulkOutcome.Archived, methods.Items.Single(i => i.Id == cash).Outcome);
        Assert.Equal(BulkOutcome.Deleted, methods.Items.Single(i => i.Id == cheque).Outcome);
        Assert.False(await db.DbAsync(c => c.CollectionMethods.AnyAsync(m => m.Id == cheque, Ct)));

        // Archived: gone from the pickers and refused for new orders, old orders keep the name.
        var picker = await db.As<LookupService, List<LookupDto>>(p.Rep, s => s.ListCollectionMethodsAsync(false, cancellationToken: Ct));
        Assert.DoesNotContain(picker, m => m.Id == cash);
        var archived = await db.As<LookupService, List<LookupDto>>(p.Admin, s => s.ListCollectionMethodsAsync(true, archived: true, Ct));
        Assert.Equal([cash], archived.Select(m => m.Id));
        var oldOrders = await db.As<OrderService, IReadOnlyList<OrderListItemDto>>(p.Supervisor, s => s.ListAsync(new OrderQuery(), Ct));
        Assert.Contains(oldOrders, o => o.CollectionMethodId == cash && o.CollectionMethodNameEn == "Cash");
        var kidofen = await DemoPeople.ProductAsync(db, "Kidofen syrup 100 ml");
        var refused = await Assert.ThrowsAsync<OriginalPharma.Application.Common.BusinessRuleException>(() =>
            db.As<OrderService, OrderDto>(p.Rep, s => s.CreateAsync(new CreateOrderRequest(Guid.NewGuid(), new DateOnly(2026, 11, 18),
                PlaceType.Pharmacy, "Test", [new OrderLineInput(kidofen, 1)], CollectionMethodId: cash), Ct)));
        Assert.Equal(OrderErrorCodes.CollectionMethodInvalid, refused.Code);

        var specialties = await db.As<LookupService, BulkResult>(p.Admin, s => s.DeleteSpecialtiesAsync(Delete(cardiology, ophthalmology, Guid.NewGuid()), Ct));
        Assert.Equal([BulkOutcome.Archived, BulkOutcome.Deleted, BulkOutcome.Blocked], specialties.Items.Select(i => i.Outcome));
        Assert.Equal(BulkCodes.NotFound, specialties.Items[2].Code);
        var ahmedId = await DemoPeople.DoctorAsync(db, "Dr. Ahmed Fathy");
        var doctor = await db.As<DoctorService, DoctorDto>(p.Sales, s => s.GetAsync(ahmedId, Ct));
        Assert.Equal("Cardiology", doctor.SpecialtyNameEn);

        // Restore puts it back in the pickers; a second restore is blocked.
        var restored = await db.As<LookupService, BulkResult>(p.Admin, s => s.RestoreSpecialtiesAsync(new BulkIdsRequest([cardiology]), Ct));
        Assert.Equal(1, restored.Restored);
        Assert.Contains(await db.As<LookupService, List<LookupDto>>(p.Rep, s => s.ListSpecialtiesAsync(false, cancellationToken: Ct)), x => x.Id == cardiology);
        var again = await db.As<LookupService, BulkResult>(p.Admin, s => s.RestoreSpecialtiesAsync(new BulkIdsRequest([cardiology]), Ct));
        Assert.Equal(BulkCodes.NotArchived, again.Items.Single().Code);

        // Every change is in the activity log: one entry per item plus one summary per request.
        var log = await db.DbAsync(c => c.AuditEntries.Where(e => e.EntityType == "specialty").ToListAsync(Ct));
        Assert.Contains(log, e => e.Action == AuditAction.Archived && e.EntityId == cardiology && e.ActorId == p.Admin);
        Assert.Contains(log, e => e.Action == AuditAction.Deleted && e.EntityId == ophthalmology);
        Assert.Contains(log, e => e.Action == AuditAction.BulkDelete && e.Count == 2);
        Assert.Contains(log, e => e.Action == AuditAction.Restored && e.EntityId == cardiology);
    }

    [Fact]
    public async Task Towns_with_doctors_are_archived_and_areas_with_active_towns_are_blocked()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var nasrCity = await DemoPeople.TerritoryAsync(db, "T-NSR"); // doctors
        var smouha = await DemoPeople.TerritoryAsync(db, "T-SMH"); // one doctor
        var sidiGaber = await DemoPeople.TerritoryAsync(db, "T-SDG"); // empty
        var eastCairo = await DemoPeople.TerritoryAsync(db, "A-CAI-E"); // users and towns
        var alexandria = await DemoPeople.TerritoryAsync(db, "A-ALX");

        var result = await db.As<TerritoryService, BulkResult>(p.Admin, s => s.DeleteManyAsync(Delete(nasrCity, sidiGaber, eastCairo), Ct));
        Assert.Equal(BulkOutcome.Archived, result.Items.Single(i => i.Id == nasrCity).Outcome);
        Assert.Equal(BulkOutcome.Deleted, result.Items.Single(i => i.Id == sidiGaber).Outcome);
        Assert.Equal(BulkCodes.HasChildren, result.Items.Single(i => i.Id == eastCairo).Code);

        // The archived town is gone from pickers but its doctors keep it.
        Assert.DoesNotContain(await db.As<LookupService, List<TownDto>>(p.Rep, s => s.ListTownsAsync(Ct)), t => t.Id == nasrCity);
        var ahmedId = await DemoPeople.DoctorAsync(db, "Dr. Ahmed Fathy");
        var ahmed = await db.As<DoctorService, DoctorDto>(p.Sales, s => s.GetAsync(ahmedId, Ct));
        Assert.Equal("Nasr City", ahmed.TownName);

        // Town and its area in one request: the town goes first, then the area (archived: its town is kept).
        var alex = await db.As<TerritoryService, BulkResult>(p.Admin, s => s.DeleteManyAsync(Delete(alexandria, smouha), Ct));
        Assert.Equal(BulkOutcome.Archived, alex.Items.Single(i => i.Id == smouha).Outcome);
        Assert.Equal(BulkOutcome.Archived, alex.Items.Single(i => i.Id == alexandria).Outcome);

        // Restoring the town alone waits for its area.
        var early = await db.As<TerritoryService, BulkResult>(p.Admin, s => s.RestoreManyAsync(new BulkIdsRequest([smouha]), Ct));
        Assert.Equal(BulkCodes.ParentArchived, early.Items.Single().Code);
        var both = await db.As<TerritoryService, BulkResult>(p.Admin, s => s.RestoreManyAsync(new BulkIdsRequest([smouha, alexandria]), Ct));
        Assert.Equal(2, both.Restored);
    }

    [Fact]
    public async Task Customers_follow_the_delete_scope_and_archive_when_visited()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var ahmed = await DemoPeople.DoctorAsync(db, "Dr. Ahmed Fathy"); // visited in the demo data
        var salma = await DemoPeople.DoctorAsync(db, "Dr. Salma Ibrahim"); // never visited, on nobody's list
        var omar = await DemoPeople.DoctorAsync(db, "Dr. Omar Khaled"); // Alexandria

        // The area manager deletes inside East Cairo only (territory scope).
        var area = await db.As<CustomerService, BulkResult>(p.Area, s => s.DeleteManyAsync(Delete(ahmed, omar), Ct));
        Assert.Equal(BulkOutcome.Archived, area.Items.Single(i => i.Id == ahmed).Outcome);
        Assert.Equal(BulkCodes.OutOfScope, area.Items.Single(i => i.Id == omar).Code);

        var sales = await db.As<CustomerService, BulkResult>(p.Sales, s => s.DeleteManyAsync(Delete(salma), Ct));
        Assert.Equal(BulkOutcome.Deleted, sales.Items.Single().Outcome);

        // Archived doctors leave the rep's list until restored.
        var mine = await db.As<DoctorService, IReadOnlyList<DoctorDto>>(p.Rep, s => s.ListAsync(new DoctorQuery(Mine: true), Ct));
        Assert.DoesNotContain(mine, d => d.Id == ahmed);
        await db.As<CustomerService, BulkResult>(p.Sales, s => s.RestoreManyAsync(new BulkIdsRequest([ahmed]), Ct));
        mine = await db.As<DoctorService, IReadOnlyList<DoctorDto>>(p.Rep, s => s.ListAsync(new DoctorQuery(Mine: true), Ct));
        Assert.Contains(mine, d => d.Id == ahmed);

        // A rep removes doctors from their own list only; other ids are reported, not touched.
        var removed = await db.As<DoctorService, BulkResult>(p.Rep, s => s.RemoveManyFromMyListAsync(new BulkIdsRequest([ahmed, omar]), Ct));
        Assert.Equal((1, 1), (removed.Deleted, removed.Blocked));
        Assert.True(await db.DbAsync(c => c.Customers.AnyAsync(x => x.Id == ahmed && x.ArchivedAt == null, Ct)));
    }

    [Fact]
    public async Task Orders_are_archived_hidden_from_lists_and_restorable_within_scope()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var orders = await db.As<OrderService, IReadOnlyList<OrderListItemDto>>(p.Sales, s => s.ListAsync(new OrderQuery(), Ct));
        var repOrder = orders.First(o => o.UserId == p.Rep).Id;
        var eastOrder = orders.First(o => o.UserId == p.RepEast).Id;

        // A role without orders:delete gets nothing done by the service either (scope "none").
        var rep = await db.As<OrderService, BulkResult>(p.Rep, s => s.DeleteManyAsync(Delete(repOrder), Ct));
        Assert.Equal(BulkCodes.OutOfScope, rep.Items.Single().Code);

        var result = await db.As<OrderService, BulkResult>(p.Area, s => s.DeleteManyAsync(Delete(repOrder, eastOrder), Ct));
        Assert.Equal(2, result.Archived);
        var visible = await db.As<OrderService, IReadOnlyList<OrderListItemDto>>(p.Supervisor, s => s.ListAsync(new OrderQuery(), Ct));
        Assert.DoesNotContain(visible, o => o.Id == repOrder || o.Id == eastOrder);
        var archived = await db.As<OrderService, IReadOnlyList<OrderListItemDto>>(p.Supervisor, s => s.ListAsync(new OrderQuery(Archived: true), Ct));
        Assert.Equal(new[] { repOrder, eastOrder }.Order(), archived.Select(o => o.Id).Order());

        // Archived orders cannot be changed until restored; the history keeps both steps.
        var locked = await db.As<OrderService, OrderDto>(p.Supervisor, s => s.GetAsync(repOrder, Ct));
        Assert.False(locked.CanCancel || locked.CanEdit || locked.CanReview || locked.CanDeliver);
        await db.As<OrderService, BulkResult>(p.Area, s => s.RestoreManyAsync(new BulkIdsRequest([repOrder]), Ct));
        var back = await db.As<OrderService, OrderDto>(p.Supervisor, s => s.GetAsync(repOrder, Ct));
        Assert.Null(back.ArchivedAt);
        Assert.Contains(back.History, h => h.Action == OrderHistoryAction.Archived);
        Assert.Contains(back.History, h => h.Action == OrderHistoryAction.Restored);
    }
}
