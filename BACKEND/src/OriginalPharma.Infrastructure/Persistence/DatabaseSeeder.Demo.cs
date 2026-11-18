using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using OriginalPharma.Application.Common.Images;
using OriginalPharma.Application.Identity;
using OriginalPharma.Application.Orders;
using OriginalPharma.Domain.Catalog;
using OriginalPharma.Domain.Common;
using OriginalPharma.Domain.Crm;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Domain.Notifications;
using OriginalPharma.Domain.Orders;
using OriginalPharma.Domain.Tracking;
using OriginalPharma.Domain.Visits;
using OriginalPharma.Infrastructure.Orders;
using SkiaSharp;

namespace OriginalPharma.Infrastructure.Persistence;

/// <summary>
/// Development demo data. Each step runs once per database and only adds rows (looked up by
/// code, e-mail or English name), so it is safe on databases seeded by older versions.
/// </summary>
internal sealed partial class DatabaseSeeder
{
    private const string RepEmail = "rep@demo.local";
    private const string SecondRepEmail = "rep.east@demo.local";
    private const string SupervisorEmail = "supervisor@demo.local";

    private async Task SeedDemoDataAsync(CancellationToken cancellationToken)
    {
        await RunOnceAsync("demo-org-v1", SeedOrganisationAsync, cancellationToken);
        await RunOnceAsync("demo-towns-v1", SeedTownsAsync, cancellationToken);
        await RunOnceAsync("demo-lookups-v1", SeedLookupsAsync, cancellationToken);
        await RunOnceAsync("demo-catalog-v1", SeedCatalogAsync, cancellationToken);
        await RunOnceAsync("demo-reps-v1", SeedRepsAsync, cancellationToken);
        await RunOnceAsync("demo-doctors-v1", SeedDoctorsAsync, cancellationToken);
        await RunOnceAsync("demo-orders-v1", SeedOrdersAsync, cancellationToken);
        await RunOnceAsync("demo-discounts-v1", SeedDiscountsAsync, cancellationToken);
        await RunOnceAsync("demo-activity-v1", SeedActivityAsync, cancellationToken);
    }

    private async Task RunOnceAsync(string key, Func<CancellationToken, Task> step, CancellationToken cancellationToken)
    {
        if (await db.SeedHistory.AnyAsync(e => e.Key == key, cancellationToken))
        {
            return;
        }

        await step(cancellationToken);
        db.SeedHistory.Add(new SeedHistoryEntry { Key = key, AppliedAt = time.GetUtcNow() });
        await db.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Applied demo seed step {Step}", key);
    }

    /// <summary>Region, area and first town, the managers and the first rep (skipped on databases that already have territories).</summary>
    private async Task SeedOrganisationAsync(CancellationToken cancellationToken)
    {
        if (await db.Territories.AnyAsync(cancellationToken))
        {
            return;
        }

        var region = new Territory { Code = "R-CAI", Name = "Greater Cairo", NameAr = "القاهرة الكبرى", Level = TerritoryLevel.Region };
        var area = new Territory { Code = "A-CAI-E", Name = "East Cairo", NameAr = "شرق القاهرة", Level = TerritoryLevel.Area, Parent = region };
        var town = new Territory { Code = "T-NSR", Name = "Nasr City", NameAr = "مدينة نصر", Level = TerritoryLevel.Town, Parent = area };
        db.Territories.AddRange(region, area, town);

        db.Customers.AddRange(
            new Customer
            {
                Type = CustomerType.Doctor,
                Name = "Dr. Demo Clinic",
                NameAr = "عيادة تجريبية",
                TerritoryId = town.Id,
                Location = GeoFactory.Point(30.0561, 31.3301),
                GeofenceRadiusMeters = 150,
                QrCode = "DEMO-CLINIC-001",
                CreatedAt = time.GetUtcNow(),
            },
            new Customer
            {
                Type = CustomerType.Pharmacy,
                Name = "Demo Pharmacy",
                NameAr = "صيدلية تجريبية",
                TerritoryId = town.Id,
                Location = GeoFactory.Point(30.0626, 31.3451),
                GeofenceRadiusMeters = 100,
                QrCode = "DEMO-PHARMACY-001",
                CreatedAt = time.GetUtcNow(),
            });

        await db.SaveChangesAsync(cancellationToken);

        // Reps and supervisors work in an area; managers above them in the area or region.
        var salesManager = await CreateUserAsync("sales.manager@demo.local", "Demo Sales Manager", DefaultRoles.SalesManager, null, region.Id, "en");
        var areaManager = await CreateUserAsync("area.manager@demo.local", "Demo Area Manager", DefaultRoles.AreaManager, salesManager?.Id, area.Id, "ar");
        var supervisor = await CreateUserAsync(SupervisorEmail, "Demo Supervisor", DefaultRoles.Supervisor, areaManager?.Id, area.Id, "ar");
        await CreateUserAsync(RepEmail, "Demo Rep", DefaultRoles.Rep, supervisor?.Id, area.Id, "ar");
    }

    private sealed record TownSeed(string Code, string Name, string NameAr);

    private sealed record AreaSeed(string Code, string Name, string NameAr, TownSeed[] Towns);

    private sealed record RegionSeed(string Code, string Name, string NameAr, AreaSeed[] Areas);

    private static readonly RegionSeed[] Regions =
    [
        new("R-CAI", "Greater Cairo", "القاهرة الكبرى",
        [
            new("A-CAI-E", "East Cairo", "شرق القاهرة",
            [
                new("T-NSR", "Nasr City", "مدينة نصر"),
                new("T-HLP", "Heliopolis", "مصر الجديدة"),
                new("T-NCR", "New Cairo", "القاهرة الجديدة"),
            ]),
            new("A-GIZ", "Giza", "الجيزة",
            [
                new("T-DOK", "Dokki", "الدقي"),
                new("T-MOH", "Mohandessin", "المهندسين"),
                new("T-OCT", "6th of October", "السادس من أكتوبر"),
            ]),
        ]),
        new("R-ALX", "Alexandria", "الإسكندرية",
        [
            new("A-ALX", "Central Alexandria", "وسط الإسكندرية",
            [
                new("T-SMH", "Smouha", "سموحة"),
                new("T-SDG", "Sidi Gaber", "سيدي جابر"),
            ]),
        ]),
    ];

    /// <summary>Regions, areas and towns, added by code when missing.</summary>
    private async Task SeedTownsAsync(CancellationToken cancellationToken)
    {
        var byCode = await db.Territories.ToDictionaryAsync(t => t.Code, cancellationToken);

        Territory Ensure(string code, string name, string nameAr, TerritoryLevel level, Territory? parent)
        {
            if (byCode.TryGetValue(code, out var existing))
            {
                return existing;
            }

            var territory = new Territory { Code = code, Name = name, NameAr = nameAr, Level = level, ParentId = parent?.Id };
            db.Territories.Add(territory);
            byCode[code] = territory;
            return territory;
        }

        foreach (var region in Regions)
        {
            var regionNode = Ensure(region.Code, region.Name, region.NameAr, TerritoryLevel.Region, null);
            foreach (var area in region.Areas)
            {
                var areaNode = Ensure(area.Code, area.Name, area.NameAr, TerritoryLevel.Area, regionNode);
                foreach (var town in area.Towns)
                {
                    Ensure(town.Code, town.Name, town.NameAr, TerritoryLevel.Town, areaNode);
                }
            }
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private static readonly (string En, string Ar)[] SpecialtySeeds =
    [
        ("Cardiology", "أمراض القلب"),
        ("Pediatrics", "طب الأطفال"),
        ("Internal medicine", "الباطنة"),
        ("Dermatology", "الجلدية"),
        ("Orthopedics", "العظام"),
        ("Obstetrics and gynecology", "النساء والتوليد"),
        ("ENT", "الأنف والأذن والحنجرة"),
        ("Ophthalmology", "الرمد"),
    ];

    private static readonly (string En, string Ar)[] CollectionMethodSeeds =
    [
        ("Cash", "نقدي"),
        ("Bank transfer", "تحويل بنكي"),
        ("Cheque", "شيك"),
        ("Post-dated cheque", "شيك آجل"),
        ("On account (credit)", "على الحساب (آجل)"),
    ];

    private async Task SeedLookupsAsync(CancellationToken cancellationToken)
    {
        var specialties = (await db.Specialties.Select(s => s.NameEn.ToLower()).ToListAsync(cancellationToken)).ToHashSet();
        var order = 0;
        foreach (var (en, ar) in SpecialtySeeds)
        {
            order += 10;
            if (!specialties.Contains(en.ToLowerInvariant()))
            {
                db.Specialties.Add(new Specialty { NameEn = en, NameAr = ar, SortOrder = order });
            }
        }

        var methods = (await db.CollectionMethods.Select(m => m.NameEn.ToLower()).ToListAsync(cancellationToken)).ToHashSet();
        order = 0;
        foreach (var (en, ar) in CollectionMethodSeeds)
        {
            order += 10;
            if (!methods.Contains(en.ToLowerInvariant()))
            {
                db.CollectionMethods.Add(new CollectionMethod { NameEn = en, NameAr = ar, SortOrder = order });
            }
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private sealed record ProductSeed(string En, string Ar, decimal Price, int Stock, int Shape);

    private sealed record LineSeed(string En, string Ar, string Description, SKColor Color, ProductSeed[] Products);

    /// <summary>Made-up product names; pictures are drawn at seed time (no real brand assets).</summary>
    private static readonly LineSeed[] LineSeeds =
    [
        new("Cardio line", "خط القلب", "Blood pressure and cholesterol products.", new SKColor(0x00, 0x63, 0xAD),
        [
            new("Cardiolin 5 mg, 30 tablets", "كارديولين 5 مجم، 30 قرص", 86.50m, 240, 0),
            new("Cardiolin 10 mg, 30 tablets", "كارديولين 10 مجم، 30 قرص", 124.00m, 180, 0),
            new("Lipostat 20 mg, 28 tablets", "ليبوستات 20 مجم، 28 قرص", 152.75m, 90, 1),
            new("Pressanorm 80 mg, 14 capsules", "بريسانورم 80 مجم، 14 كبسولة", 64.25m, 12, 2),
        ]),
        new("Pediatric line", "خط الأطفال", "Syrups and drops for children.", new SKColor(0x9B, 0xC8, 0x4E),
        [
            new("Kidofen syrup 100 ml", "شراب كيدوفين 100 مل", 38.00m, 400, 3),
            new("Vitakid drops 15 ml", "نقط فيتاكيد 15 مل", 45.50m, 150, 3),
            new("Coughex junior syrup 120 ml", "شراب كوفكس جونيور 120 مل", 41.25m, 60, 3),
            new("Probiokid sachets, 10", "أكياس بروبيوكيد، 10", 72.00m, 8, 1),
        ]),
        new("Derma line", "خط الجلدية", "Creams and gels.", new SKColor(0xC2, 0x5B, 0x8C),
        [
            new("Dermacalm cream 50 g", "كريم ديرماكالم 50 جم", 98.00m, 75, 4),
            new("Acnoclear gel 30 g", "جل أكنوكلير 30 جم", 112.50m, 40, 4),
            new("Sunshield SPF 50, 60 ml", "صن شيلد SPF 50، 60 مل", 185.00m, 25, 1),
        ]),
    ];

    private async Task SeedCatalogAsync(CancellationToken cancellationToken)
    {
        var lines = await db.ProductLines.ToDictionaryAsync(l => l.NameEn.ToLower(), cancellationToken);
        var products = (await db.Products.Select(p => p.NameEn.ToLower()).ToListAsync(cancellationToken)).ToHashSet();
        var now = time.GetUtcNow();

        foreach (var seed in LineSeeds)
        {
            if (!lines.TryGetValue(seed.En.ToLowerInvariant(), out var line))
            {
                line = new ProductLine { NameEn = seed.En, NameAr = seed.Ar, Description = seed.Description, CreatedAt = now };
                db.ProductLines.Add(line);
                lines[seed.En.ToLowerInvariant()] = line;
            }

            foreach (var product in seed.Products.Where(p => !products.Contains(p.En.ToLowerInvariant())))
            {
                string? imageKey = null;
                try
                {
                    imageKey = await images.StoreAsync(PlaceholderPicture(seed.Color, product.Shape), ImagePurpose.Product, cancellationToken);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    logger.LogWarning(ex, "Could not create a placeholder picture for {Product}", product.En);
                }

                db.Products.Add(new Product
                {
                    ProductLineId = line.Id,
                    NameEn = product.En,
                    NameAr = product.Ar,
                    Price = product.Price,
                    StockQuantity = product.Stock,
                    ImageKey = imageKey,
                    CreatedAt = now,
                });
            }
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>A second rep, and product lines for both demo reps.</summary>
    private async Task SeedRepsAsync(CancellationToken cancellationToken)
    {
        var supervisor = await userManager.FindByEmailAsync(SupervisorEmail);
        var rep = await userManager.FindByEmailAsync(RepEmail);
        if (supervisor is null || rep is null)
        {
            return;
        }

        var second = await userManager.FindByEmailAsync(SecondRepEmail)
                     ?? await CreateUserAsync(SecondRepEmail, "Demo Rep East", DefaultRoles.Rep, supervisor.Id, supervisor.TerritoryId, "ar");

        var lineIds = await db.ProductLines.ToDictionaryAsync(l => l.NameEn, l => l.Id, cancellationToken);
        var existing = await db.UserProductLines.Select(l => new { l.UserId, l.ProductLineId }).ToListAsync(cancellationToken);

        void Assign(User? user, params string[] lineNames)
        {
            foreach (var name in lineNames)
            {
                if (user is not null && lineIds.TryGetValue(name, out var lineId) &&
                    !existing.Any(e => e.UserId == user.Id && e.ProductLineId == lineId))
                {
                    db.UserProductLines.Add(new UserProductLine { UserId = user.Id, ProductLineId = lineId });
                }
            }
        }

        Assign(rep, "Cardio line", "Pediatric line");
        Assign(second, "Pediatric line", "Derma line");
        await db.SaveChangesAsync(cancellationToken);
    }

    private sealed record DoctorSeed(string Name, string NameAr, string Town, string Specialty, string? Phone, bool FirstRep, bool SecondRep);

    private static readonly DoctorSeed[] DoctorSeeds =
    [
        new("Dr. Ahmed Fathy", "د. أحمد فتحي", "T-NSR", "Cardiology", "01001234501", true, false),
        new("Dr. Mona Saeed", "د. منى سعيد", "T-NSR", "Pediatrics", "01001234502", true, true),
        new("Dr. Karim Adel", "د. كريم عادل", "T-HLP", "Internal medicine", null, true, false),
        new("Dr. Rania Hassan", "د. رانيا حسن", "T-HLP", "Dermatology", "01001234504", false, true),
        new("Dr. Tamer Nabil", "د. تامر نبيل", "T-NCR", "Cardiology", "01001234505", true, false),
        new("Dr. Heba Mostafa", "د. هبة مصطفى", "T-NCR", "Obstetrics and gynecology", null, false, true),
        new("Dr. Youssef Samir", "د. يوسف سمير", "T-DOK", "Orthopedics", "01001234507", true, false),
        new("Dr. Salma Ibrahim", "د. سلمى إبراهيم", "T-MOH", "Pediatrics", null, false, false),
        new("Dr. Omar Khaled", "د. عمر خالد", "T-SMH", "ENT", null, false, false),
    ];

    /// <summary>Doctors in several towns, on the demo reps' lists (one outside the area, to show the warning).</summary>
    private async Task SeedDoctorsAsync(CancellationToken cancellationToken)
    {
        var towns = await db.Territories.Where(t => t.Level == TerritoryLevel.Town).ToDictionaryAsync(t => t.Code, t => t.Id, cancellationToken);
        var specialties = await db.Specialties.ToDictionaryAsync(s => s.NameEn, s => s.Id, cancellationToken);
        var rep = await userManager.FindByEmailAsync(RepEmail);
        var second = await userManager.FindByEmailAsync(SecondRepEmail);
        var existingNames = (await db.Customers.Where(c => c.Type == CustomerType.Doctor).Select(c => c.Name).ToListAsync(cancellationToken)).ToHashSet();
        var now = time.GetUtcNow();

        foreach (var seed in DoctorSeeds.Where(d => !existingNames.Contains(d.Name)))
        {
            if (!towns.TryGetValue(seed.Town, out var townId))
            {
                continue;
            }

            var doctor = new Customer
            {
                Type = CustomerType.Doctor,
                Name = seed.Name,
                NameAr = seed.NameAr,
                TerritoryId = townId,
                SpecialtyId = specialties.GetValueOrDefault(seed.Specialty) is var id && id != Guid.Empty ? id : null,
                Phone = seed.Phone,
                CreatedAt = now,
            };
            db.Customers.Add(doctor);

            if (seed.FirstRep && rep is not null)
            {
                db.RepDoctors.Add(new RepDoctor { UserId = rep.Id, CustomerId = doctor.Id, AssignedAt = now });
            }

            if (seed.SecondRep && second is not null)
            {
                db.RepDoctors.Add(new RepDoctor { UserId = second.Id, CustomerId = doctor.Id, AssignedAt = now });
            }
        }

        // The original demo doctor goes on the first rep's list too (the doctor row itself is left as it is).
        var demoClinic = await db.Customers.Where(c => c.QrCode == "DEMO-CLINIC-001").Select(c => (Guid?)c.Id).FirstOrDefaultAsync(cancellationToken);
        if (rep is not null && demoClinic is { } clinicId && !await db.RepDoctors.AnyAsync(a => a.UserId == rep.Id && a.CustomerId == clinicId, cancellationToken))
        {
            db.RepDoctors.Add(new RepDoctor { UserId = rep.Id, CustomerId = clinicId, AssignedAt = now });
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>Two orders by the first demo rep: one waiting for review, one approved by the supervisor.</summary>
    private async Task SeedOrdersAsync(CancellationToken cancellationToken)
    {
        var rep = await userManager.FindByEmailAsync(RepEmail);
        var supervisor = await userManager.FindByEmailAsync(SupervisorEmail);
        var products = await db.Products.Where(p => p.IsActive).OrderBy(p => p.NameEn).ToListAsync(cancellationToken);
        var cash = await db.CollectionMethods.Where(m => m.NameEn == "Cash").Select(m => (Guid?)m.Id).FirstOrDefaultAsync(cancellationToken);
        var pharmacy = await db.Customers.Where(c => c.QrCode == "DEMO-PHARMACY-001").Select(c => (Guid?)c.Id).FirstOrDefaultAsync(cancellationToken);
        if (rep is null || products.Count < 3)
        {
            return;
        }

        var numbers = new OrderNumberGenerator(db);
        var today = DateOnly.FromDateTime(time.GetLocalNow().DateTime);
        var now = time.GetUtcNow();

        async Task AddAsync(int daysAgo, PlaceType placeType, string placeName, Guid? customerId, Guid? methodId, string? other,
            (Product Product, int Quantity, decimal Discount)[] items, bool approved)
        {
            var created = now.AddDays(-daysAgo);
            var order = new Order
            {
                Number = OrderService.FormatNumber(await numbers.NextAsync(cancellationToken), created),
                UserId = rep.Id,
                TerritoryId = rep.TerritoryId,
                ClientRequestId = Guid.NewGuid(),
                OrderDate = today.AddDays(-daysAgo),
                PlaceType = placeType,
                PlaceName = placeName,
                CustomerId = customerId,
                CollectionMethodId = methodId,
                CollectionMethodOther = methodId is null ? other : null,
                Status = OrderStatus.Submitted,
                CreatedAt = created,
                CreatedById = rep.Id,
                UpdatedAt = created,
                UpdatedById = rep.Id,
            };

            var priced = items.Select(i => OrderPricing.PriceLine(i.Product.Id, i.Quantity, i.Product.Price, i.Discount)).ToList();
            var sort = 0;
            foreach (var (line, item) in priced.Zip(items))
            {
                order.Lines.Add(new OrderLine
                {
                    ProductId = line.ProductId,
                    ProductNameAr = item.Product.NameAr,
                    ProductNameEn = item.Product.NameEn,
                    Quantity = line.Quantity,
                    UnitPrice = line.UnitPrice,
                    DiscountPercent = line.DiscountPercent,
                    DiscountAmount = line.DiscountAmount,
                    LineTotal = line.LineTotal,
                    ExceededStock = line.Quantity > item.Product.StockQuantity,
                    SortOrder = sort++,
                });
            }

            var totals = OrderPricing.Totals(priced);
            order.Subtotal = totals.Subtotal;
            order.DiscountTotal = totals.DiscountTotal;
            order.Total = totals.Total;
            order.History.Add(new OrderHistoryEntry
            {
                OrderId = order.Id, Action = OrderHistoryAction.Created, ToStatus = OrderStatus.Submitted,
                ActorId = rep.Id, ActorName = rep.FullName, CreatedAt = created,
            });

            if (approved && supervisor is not null)
            {
                order.Status = OrderStatus.Approved;
                order.UpdatedAt = created.AddHours(3);
                order.UpdatedById = supervisor.Id;
                order.History.Add(new OrderHistoryEntry
                {
                    OrderId = order.Id, Action = OrderHistoryAction.Approved, FromStatus = OrderStatus.Submitted,
                    ToStatus = OrderStatus.Approved, ActorId = supervisor.Id, ActorName = supervisor.FullName,
                    CreatedAt = created.AddHours(3),
                });
            }

            db.Orders.Add(order);
        }

        await AddAsync(3, PlaceType.Warehouse, "Al Nour medical warehouse", null, null, "Cash on delivery",
            [(products[0], 20, 5m), (products[1], 10, 0m)], approved: true);
        await AddAsync(0, PlaceType.Pharmacy, "صيدلية تجريبية", pharmacy, cash, null,
            [(products[0], 4, 0m), (products[2], 6, 2.5m), (products[^1], 12, 0m)], approved: false);

        await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>Default and maximum discounts on two lines and a few products (product values win for the default; the lowest maximum applies).</summary>
    private async Task SeedDiscountsAsync(CancellationToken cancellationToken)
    {
        var lines = await db.ProductLines.ToDictionaryAsync(l => l.NameEn, cancellationToken);
        if (lines.TryGetValue("Cardio line", out var cardio))
        {
            cardio.DefaultDiscountPercent ??= 5m;
            cardio.MaxDiscountPercent ??= 15m;
        }

        if (lines.TryGetValue("Pediatric line", out var pediatric))
        {
            pediatric.MaxDiscountPercent ??= 10m;
        }

        var products = await db.Products.ToDictionaryAsync(p => p.NameEn, cancellationToken);
        if (products.TryGetValue("Lipostat 20 mg, 28 tablets", out var lipostat))
        {
            lipostat.DefaultDiscountPercent ??= 7.5m;
            lipostat.MaxDiscountPercent ??= 12m;
        }

        if (products.TryGetValue("Kidofen syrup 100 ml", out var kidofen))
        {
            kidofen.DefaultDiscountPercent ??= 2.5m;
        }

        if (products.TryGetValue("Sunshield SPF 50, 60 ml", out var sunshield))
        {
            sunshield.MaxDiscountPercent ??= 5m;
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private sealed record VisitSeed(
        bool FirstRep, int DaysAgo, string Doctor, VisitFeedbackCategory? Category, string? Feedback, string[] Products, string? Reply);

    private static readonly VisitSeed[] VisitSeeds =
    [
        new(true, 0, "Dr. Ahmed Fathy", VisitFeedbackCategory.Positive,
            "Liked the new Cardiolin pack size and will start two new patients this week.", ["Cardiolin 5 mg, 30 tablets", "Cardiolin 10 mg, 30 tablets"], null),
        new(true, 1, "Dr. Mona Saeed", VisitFeedbackCategory.Request,
            "Asked for samples of Vitakid drops and the dosing leaflet in Arabic.", ["Vitakid drops 15 ml", "Kidofen syrup 100 ml"],
            "Samples go out with Thursday's delivery."),
        new(true, 2, "Dr. Karim Adel", VisitFeedbackCategory.NeedsFollowUp,
            "Wants the cholesterol study results before switching patients to Lipostat.", ["Lipostat 20 mg, 28 tablets"], null),
        new(true, 4, "Dr. Tamer Nabil", VisitFeedbackCategory.Complaint,
            "Two pharmacies near the clinic were out of Pressanorm last week.", ["Pressanorm 80 mg, 14 capsules"],
            "Checked with the warehouse, stock arrives on Sunday."),
        new(true, 6, "Dr. Youssef Samir", null, null, ["Cardiolin 5 mg, 30 tablets"], null),
        new(false, 0, "Dr. Rania Hassan", VisitFeedbackCategory.Positive,
            "Happy with Dermacalm results on eczema patients.", ["Dermacalm cream 50 g", "Acnoclear gel 30 g"], null),
        new(false, 2, "Dr. Heba Mostafa", VisitFeedbackCategory.Request,
            "Requested a short talk about Probiokid at the clinic's monthly meeting.", ["Probiokid sachets, 10"], null),
        new(false, 3, "Dr. Mona Saeed", null, null, ["Coughex junior syrup 120 ml"], null),
    ];

    /// <summary>
    /// A week of field activity for both demo reps: working days (shifts), visits with feedback, products
    /// discussed and replies, orders that were decided and delivered, and the notifications those created.
    /// </summary>
    private async Task SeedActivityAsync(CancellationToken cancellationToken)
    {
        var rep = await userManager.FindByEmailAsync(RepEmail);
        var second = await userManager.FindByEmailAsync(SecondRepEmail);
        var supervisor = await userManager.FindByEmailAsync(SupervisorEmail);
        var areaManager = await userManager.FindByEmailAsync("area.manager@demo.local");
        if (rep is null || second is null || supervisor is null)
        {
            return;
        }

        var doctors = await db.Customers.Where(c => c.Type == CustomerType.Doctor).ToDictionaryAsync(c => c.Name, cancellationToken);
        var products = await db.Products.ToDictionaryAsync(p => p.NameEn, cancellationToken);
        var now = time.GetUtcNow();
        var today = new DateTimeOffset(now.UtcDateTime.Date, TimeSpan.Zero);

        // Working days: 07:00 to 14:30 UTC (09:00 to 16:30 in Cairo), today's still running.
        foreach (var user in new[] { rep, second })
        {
            for (var day = 6; day >= 0; day--)
            {
                var start = today.AddDays(-day).AddHours(7).AddMinutes(user == rep ? 0 : 20);
                if (start > now)
                {
                    continue;
                }

                db.Shifts.Add(new Shift
                {
                    UserId = user.Id,
                    TerritoryId = user.TerritoryId,
                    DeviceId = $"demo-{(user == rep ? "rep" : "rep-east")}",
                    Source = LocationSource.Pwa,
                    Status = ShiftStatus.Ended,
                    StartedAt = start,
                    EndedAt = day == 0 ? (start.AddHours(7.5) < now ? start.AddHours(7.5) : now) : start.AddHours(7.5),
                    LastPointAt = start.AddHours(7),
                });
            }
        }

        foreach (var seed in VisitSeeds)
        {
            var user = seed.FirstRep ? rep : second;
            if (!doctors.TryGetValue(seed.Doctor, out var doctor))
            {
                continue;
            }

            // Never in the future: today's visits are moved back when the seed runs early in the day.
            var checkIn = today.AddDays(-seed.DaysAgo).AddHours(seed.DaysAgo == 0 ? 7.5 : 9);
            if (checkIn.AddHours(2) > now)
            {
                checkIn = now.AddHours(-2);
            }

            var visit = new Visit
            {
                UserId = user.Id,
                TerritoryId = user.TerritoryId,
                CustomerId = doctor.Id,
                DeviceId = $"demo-{(seed.FirstRep ? "rep" : "rep-east")}",
                Status = VisitStatus.Completed,
                CheckInAt = checkIn,
                CheckInReceivedAt = checkIn,
                CheckInLocation = doctor.Location ?? GeoFactory.Point(30.06, 31.33),
                CheckInAccuracy = 12,
                CheckInDistanceMeters = 18,
                CheckInWithinGeofence = true,
                CheckOutAt = checkIn.AddMinutes(25),
                CheckOutReceivedAt = checkIn.AddMinutes(25),
                CheckOutLocation = doctor.Location ?? GeoFactory.Point(30.06, 31.33),
                CheckOutAccuracy = 15,
                CheckOutDistanceMeters = 22,
                CheckOutWithinGeofence = true,
                ContentUpdatedAt = checkIn.AddMinutes(30),
            };

            var order = 0;
            foreach (var name in seed.Products)
            {
                if (products.TryGetValue(name, out var product))
                {
                    visit.Products.Add(new VisitProduct { VisitId = visit.Id, ProductId = product.Id, SortOrder = order++ });
                }
            }

            if (seed.Feedback is not null)
            {
                visit.Feedback = new VisitFeedback
                {
                    VisitId = visit.Id,
                    Text = seed.Feedback,
                    Category = seed.Category,
                    CreatedAt = checkIn.AddMinutes(30),
                    UpdatedAt = checkIn.AddMinutes(30),
                };

                foreach (var recipient in new[] { supervisor, areaManager }.OfType<User>())
                {
                    var answered = seed.Reply is not null && recipient == supervisor;
                    db.Notifications.Add(Notification(recipient.Id, NotificationType.VisitFeedback, visit.Id, new
                    {
                        visitId = visit.Id,
                        repName = user.FullName,
                        customerName = doctor.Name,
                        customerNameAr = doctor.NameAr,
                        category = seed.Category,
                        excerpt = seed.Feedback,
                    }, checkIn.AddMinutes(30), answered ? checkIn.AddHours(2) : null));
                }

                if (seed.Reply is not null)
                {
                    visit.Feedback.SeenBy.Add(new VisitFeedbackSeen
                    {
                        VisitId = visit.Id, UserId = supervisor.Id, UserName = supervisor.FullName, SeenAt = checkIn.AddHours(2),
                    });
                    visit.Replies.Add(new VisitFeedbackReply
                    {
                        VisitId = visit.Id, AuthorId = supervisor.Id, AuthorName = supervisor.FullName, Text = seed.Reply,
                        CreatedAt = checkIn.AddHours(2),
                    });
                    db.Notifications.Add(Notification(user.Id, NotificationType.VisitFeedbackReply, visit.Id, new
                    {
                        visitId = visit.Id,
                        authorName = supervisor.FullName,
                        customerName = doctor.Name,
                        customerNameAr = doctor.NameAr,
                        excerpt = seed.Reply,
                    }, checkIn.AddHours(2), null));
                }
            }

            db.Visits.Add(visit);
        }

        await db.SaveChangesAsync(cancellationToken);
        await SeedDecisionsAsync(rep, second, supervisor, products, now, cancellationToken);
    }

    /// <summary>The approved demo order gets delivered; three more orders show a rejection, a cancellation and an open delivery.</summary>
    private async Task SeedDecisionsAsync(
        User rep,
        User second,
        User supervisor,
        IReadOnlyDictionary<string, Product> products,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var approved = await db.Orders.Where(o => o.UserId == rep.Id && o.Status == OrderStatus.Approved)
            .OrderBy(o => o.CreatedAt).FirstOrDefaultAsync(cancellationToken);
        if (approved is not null)
        {
            var decided = approved.UpdatedAt;
            approved.DecidedAt = decided;
            approved.DecidedById = supervisor.Id;
            approved.DecidedByName = supervisor.FullName;
            approved.Delivery = DeliveryStatus.Delivered;
            approved.DeliveredAt = decided.AddDays(1);
            approved.DeliveredById = supervisor.Id;
            approved.DeliveredByName = supervisor.FullName;
            approved.DeliveryNote = "Delivered to the warehouse gate, signed by the store keeper.";
            db.OrderHistory.Add(new OrderHistoryEntry
            {
                OrderId = approved.Id, Action = OrderHistoryAction.Delivered, FromStatus = OrderStatus.Approved, ToStatus = OrderStatus.Approved,
                ActorId = supervisor.Id, ActorName = supervisor.FullName, Reason = approved.DeliveryNote, CreatedAt = decided.AddDays(1),
            });
            db.Notifications.Add(OrderNotification(rep, approved, NotificationType.OrderApproved, supervisor, null, decided, decided.AddHours(1)));
            db.Notifications.Add(OrderNotification(rep, approved, NotificationType.OrderDelivered, supervisor, approved.DeliveryNote, decided.AddDays(1), null));
        }

        var cash = await db.CollectionMethods.Where(m => m.NameEn == "Cash").Select(m => (Guid?)m.Id).FirstOrDefaultAsync(cancellationToken);
        var transfer = await db.CollectionMethods.Where(m => m.NameEn == "Bank transfer").Select(m => (Guid?)m.Id).FirstOrDefaultAsync(cancellationToken);
        var numbers = new OrderNumberGenerator(db);
        var today = DateOnly.FromDateTime(time.GetLocalNow().DateTime);

        async Task AddAsync(User owner, int daysAgo, string place, PlaceType type, Guid? method, (string Product, int Quantity, decimal Discount)[] items,
            OrderStatus status, string? reason, bool delivered)
        {
            var created = now.AddDays(-daysAgo).AddHours(-3);
            var order = new Order
            {
                Number = OrderService.FormatNumber(await numbers.NextAsync(cancellationToken), created),
                UserId = owner.Id,
                TerritoryId = owner.TerritoryId,
                ClientRequestId = Guid.NewGuid(),
                OrderDate = today.AddDays(-daysAgo),
                PlaceType = type,
                PlaceName = place,
                CollectionMethodId = method,
                CollectionMethodOther = method is null ? "Cash on delivery" : null,
                Status = OrderStatus.Submitted,
                CreatedAt = created,
                CreatedById = owner.Id,
                UpdatedAt = created,
                UpdatedById = owner.Id,
            };

            var sort = 0;
            var priced = new List<PricedLine>();
            foreach (var (name, quantity, discount) in items)
            {
                if (!products.TryGetValue(name, out var product))
                {
                    continue;
                }

                var line = OrderPricing.PriceLine(product.Id, quantity, product.Price, discount);
                priced.Add(line);
                order.Lines.Add(new OrderLine
                {
                    ProductId = product.Id, ProductNameAr = product.NameAr, ProductNameEn = product.NameEn, Quantity = quantity,
                    UnitPrice = line.UnitPrice, DiscountPercent = discount, DiscountAmount = line.DiscountAmount, LineTotal = line.LineTotal,
                    ExceededStock = quantity > product.StockQuantity, SortOrder = sort++,
                });
            }

            if (priced.Count == 0)
            {
                return;
            }

            var totals = OrderPricing.Totals(priced);
            (order.Subtotal, order.DiscountTotal, order.Total) = (totals.Subtotal, totals.DiscountTotal, totals.Total);
            order.History.Add(new OrderHistoryEntry
            {
                OrderId = order.Id, Action = OrderHistoryAction.Created, ToStatus = OrderStatus.Submitted,
                ActorId = owner.Id, ActorName = owner.FullName, CreatedAt = created,
            });

            if (status != OrderStatus.Submitted)
            {
                var decidedAt = created.AddHours(2);
                order.Status = status;
                order.StatusReason = reason;
                order.DecidedAt = decidedAt;
                order.DecidedById = supervisor.Id;
                order.DecidedByName = supervisor.FullName;
                order.UpdatedAt = decidedAt;
                order.UpdatedById = supervisor.Id;
                order.Delivery = status == OrderStatus.Approved ? DeliveryStatus.NotDelivered : null;
                order.History.Add(new OrderHistoryEntry
                {
                    OrderId = order.Id,
                    Action = status switch
                    {
                        OrderStatus.Approved => OrderHistoryAction.Approved,
                        OrderStatus.Rejected => OrderHistoryAction.Rejected,
                        _ => OrderHistoryAction.Cancelled,
                    },
                    FromStatus = OrderStatus.Submitted, ToStatus = status, ActorId = supervisor.Id, ActorName = supervisor.FullName,
                    Reason = reason, CreatedAt = decidedAt,
                });
                db.Notifications.Add(OrderNotification(owner, order, status switch
                {
                    OrderStatus.Approved => NotificationType.OrderApproved,
                    OrderStatus.Rejected => NotificationType.OrderRejected,
                    _ => NotificationType.OrderCancelled,
                }, supervisor, reason, decidedAt, null));

                if (delivered)
                {
                    order.Delivery = DeliveryStatus.Delivered;
                    order.DeliveredAt = decidedAt.AddHours(20);
                    order.DeliveredById = supervisor.Id;
                    order.DeliveredByName = supervisor.FullName;
                    order.History.Add(new OrderHistoryEntry
                    {
                        OrderId = order.Id, Action = OrderHistoryAction.Delivered, FromStatus = status, ToStatus = status,
                        ActorId = supervisor.Id, ActorName = supervisor.FullName, CreatedAt = decidedAt.AddHours(20),
                    });
                    db.Notifications.Add(OrderNotification(owner, order, NotificationType.OrderDelivered, supervisor, null, decidedAt.AddHours(20), null));
                }
            }

            db.Orders.Add(order);
        }

        await AddAsync(rep, 5, "El Ezaby pharmacy, Abbas El Akkad", PlaceType.Pharmacy, cash,
            [("Lipostat 20 mg, 28 tablets", 10, 7.5m), ("Cardiolin 10 mg, 30 tablets", 6, 5m)], OrderStatus.Rejected,
            "The pharmacy has an unpaid balance; collect it before the next order.", false);
        await AddAsync(rep, 2, "Seif pharmacy, Makram Ebeid", PlaceType.Pharmacy, transfer,
            [("Cardiolin 5 mg, 30 tablets", 12, 5m), ("Kidofen syrup 100 ml", 20, 2.5m)], OrderStatus.Approved, null, false);
        await AddAsync(second, 4, "Al Shorouk medical store", PlaceType.Warehouse, null,
            [("Dermacalm cream 50 g", 15, 0m), ("Vitakid drops 15 ml", 10, 0m)], OrderStatus.Approved,
            "Approved, split delivery is fine.", true);
        await AddAsync(second, 1, "Roshdy pharmacy, Heliopolis", PlaceType.Pharmacy, cash,
            [("Acnoclear gel 30 g", 4, 0m)], OrderStatus.Cancelled, "Duplicate of yesterday's order.", false);

        await db.SaveChangesAsync(cancellationToken);
    }

    private static Notification OrderNotification(
        User recipient, Order order, NotificationType type, User actor, string? note, DateTimeOffset at, DateTimeOffset? readAt) =>
        Notification(recipient.Id, type, order.Id, new
        {
            orderId = order.Id,
            orderNumber = order.Number,
            placeName = order.PlaceName,
            total = order.Total,
            actorName = actor.FullName,
            note,
        }, at, readAt);

    private static Notification Notification(Guid userId, NotificationType type, Guid entityId, object data, DateTimeOffset at, DateTimeOffset? readAt) => new()
    {
        UserId = userId,
        Type = type,
        EntityId = entityId,
        Data = System.Text.Json.JsonSerializer.Serialize(data, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web)),
        CreatedAt = at,
        ReadAt = readAt,
    };

    /// <summary>
    /// Simple product picture (no text, no logos): a tinted background with a box, bottle,
    /// blister, syrup bottle or tube shape in the line's colour.
    /// </summary>
    private static byte[] PlaceholderPicture(SKColor color, int shape)
    {
        const int size = 640;
        using var surface = SKSurface.Create(new SKImageInfo(size, size, SKColorType.Rgba8888, SKAlphaType.Premul));
        var canvas = surface.Canvas;
        canvas.Clear(Mix(color, SKColors.White, 0.86f));

        using var fill = new SKPaint { Color = color, IsAntialias = true };
        using var white = new SKPaint { Color = SKColors.White, IsAntialias = true };
        using var shade = new SKPaint { Color = Mix(color, SKColors.Black, 0.25f), IsAntialias = true };

        switch (shape % 5)
        {
            case 0: // carton box
                canvas.DrawRoundRect(new SKRect(150, 190, 490, 470), 18, 18, white);
                canvas.DrawRect(new SKRect(150, 280, 490, 340), fill);
                canvas.DrawRoundRect(new SKRect(190, 380, 330, 400), 8, 8, shade);
                break;
            case 1: // pill bottle
                canvas.DrawRoundRect(new SKRect(230, 150, 410, 210), 12, 12, shade);
                canvas.DrawRoundRect(new SKRect(210, 200, 430, 500), 36, 36, white);
                canvas.DrawRect(new SKRect(210, 290, 430, 390), fill);
                break;
            case 2: // blister strip
                canvas.DrawRoundRect(new SKRect(140, 200, 500, 440), 22, 22, white);
                for (var row = 0; row < 2; row++)
                {
                    for (var col = 0; col < 4; col++)
                    {
                        canvas.DrawRoundRect(new SKRect(175 + col * 80, 235 + row * 105, 235 + col * 80, 300 + row * 105), 28, 28, fill);
                    }
                }

                break;
            case 3: // syrup bottle
            {
                using var body = new SKPaint { Color = Mix(color, SKColors.White, 0.35f), IsAntialias = true };
                canvas.DrawRoundRect(new SKRect(270, 130, 370, 190), 10, 10, shade);
                canvas.DrawRoundRect(new SKRect(285, 180, 355, 230), 8, 8, white);
                canvas.DrawRoundRect(new SKRect(220, 220, 420, 510), 40, 40, body);
                canvas.DrawRect(new SKRect(220, 320, 420, 420), white);
                break;
            }
            default: // cream tube
                canvas.Save();
                canvas.RotateDegrees(-25, size / 2f, size / 2f);
                canvas.DrawRoundRect(new SKRect(200, 170, 440, 430), 30, 30, white);
                canvas.DrawRect(new SKRect(200, 260, 440, 330), fill);
                canvas.DrawRoundRect(new SKRect(275, 430, 365, 500), 10, 10, shade);
                canvas.Restore();
                break;
        }

        using var image = surface.Snapshot();
        using var png = image.Encode(SKEncodedImageFormat.Png, 100);
        return png.ToArray();
    }

    private static SKColor Mix(SKColor a, SKColor b, float amount) => new(
        (byte)(a.Red + (b.Red - a.Red) * amount),
        (byte)(a.Green + (b.Green - a.Green) * amount),
        (byte)(a.Blue + (b.Blue - a.Blue) * amount));
}
