using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Auditing;
using OriginalPharma.Application.Common.Scoping;
using OriginalPharma.Application.Identity;
using OriginalPharma.Domain.Audit;
using OriginalPharma.Domain.Expenses;

namespace OriginalPharma.Application.Expenses;

/// <summary>
/// Daily expenses per city. The first visit of a rep in a city on a day creates that city's line with
/// the rep's amount for it (their own, else the city's default; once: a removed or changed line is left
/// as it is). Reps change their own lines and notes for days inside the editable window; managers with
/// expenses:manage change any past day of the reps in their scope. Month totals are always summed from the current lines of the month's days.
/// Every change is written to the activity log with the values before and after.
/// </summary>
public sealed class ExpenseService(
    IAppDbContext db,
    ICurrentUser currentUser,
    IDataScopeResolver scopes,
    AuditTrail audit,
    LocalCalendar calendar,
    IOptions<ExpenseOptions> options,
    TimeProvider time,
    ILogger<ExpenseService> logger)
{
    /// <summary>Lines returned by one report at most (a month of a large team stays far below).</summary>
    public const int MaxReportLines = 5000;

    public const int MaxReportDays = 92;

    private ExpenseOptions Settings => options.Value;

    private sealed record Person(Guid Id, string Name, Guid? TerritoryId);

    /// <param name="CanRead">The caller may see this rep's expenses.</param>
    /// <param name="Own">The caller may change their own expenses (expenses:write-own) inside the window.</param>
    /// <param name="Manage">The caller holds expenses:manage over this rep.</param>
    private sealed record Access(bool CanRead, bool Own, bool Manage);

    // ---------------------------------------------------------------------------------------------
    // Automatic lines
    // ---------------------------------------------------------------------------------------------

    /// <summary>
    /// Called for every visit check-in: creates the line of the visit's city for the rep's day unless
    /// the day already has one for that city (or had one that the rep removed). The amount is the rep's own
    /// for the city, else the city's default; zero, and visits without a city, create nothing. Never fails
    /// the check-in.
    /// </summary>
    public async Task EnsureAutoLineAsync(Guid userId, Guid? repTerritoryId, DateTimeOffset at, Guid? cityId, CancellationToken cancellationToken = default)
    {
        if (cityId is not { } city)
        {
            return;
        }

        try
        {
            // The rep's own amount for the town, else the town's default.
            var amount = await db.Territories.AsNoTracking()
                .Where(t => t.Id == city && t.ArchivedAt == null)
                .Select(t => db.RepTownExpenseDefaults.Where(d => d.UserId == userId && d.TerritoryId == t.Id).Select(d => (decimal?)d.Amount).FirstOrDefault()
                             ?? (decimal?)t.DefaultDailyExpense)
                .SingleOrDefaultAsync(cancellationToken);
            if (amount is not > 0)
            {
                return;
            }

            var day = calendar.DayOf(at);
            if (day > calendar.Today())
            {
                return;
            }

            // One statement, so two first visits arriving together still make one line: the partial
            // unique index (user, day, city) of automatic lines turns the second insert into nothing,
            // and the NOT EXISTS keeps a line the rep added by hand from getting an automatic twin.
            var id = Guid.CreateVersion7();
            var now = time.GetUtcNow();
            var inserted = await db.ExecuteSqlAsync(
                $"""
                INSERT INTO expense_lines (id, user_id, territory_id, day, city_id, amount, original_amount, source, created_at, created_by_id)
                SELECT CAST({id} AS uuid), CAST({userId} AS uuid), CAST({repTerritoryId} AS uuid), CAST({day} AS date),
                       CAST({city} AS uuid), CAST({amount.Value} AS numeric), CAST({amount.Value} AS numeric), {(int)ExpenseSource.Auto},
                       CAST({now} AS timestamptz), CAST({userId} AS uuid)
                WHERE NOT EXISTS (
                    SELECT 1 FROM expense_lines
                    WHERE user_id = CAST({userId} AS uuid) AND day = CAST({day} AS date) AND city_id = CAST({city} AS uuid) AND archived_at IS NULL)
                ON CONFLICT (user_id, day, city_id) WHERE source = {(int)ExpenseSource.Auto} DO NOTHING
                """,
                cancellationToken);
            if (inserted == 1)
            {
                await audit.AddAsync(AuditEntities.Expense, id, AuditAction.Created,
                    new { userId, day, cityId = city, amount = amount.Value, source = "auto" }, cancellationToken: cancellationToken);
                await db.SaveChangesAsync(cancellationToken);
            }
        }
        catch (Exception ex) when (ex is DbUpdateException or InvalidOperationException)
        {
            logger.LogWarning(ex, "Could not create the automatic expense line of user {UserId} for city {CityId}", userId, city);
        }
    }

    // ---------------------------------------------------------------------------------------------
    // One day, one month
    // ---------------------------------------------------------------------------------------------

    /// <summary>The rep's lines and notes of one day (yourself, or a rep in your expenses:read scope).</summary>
    public async Task<ExpenseDayDto> GetDayAsync(DateOnly day, Guid? userId = null, CancellationToken cancellationToken = default)
    {
        var (person, access) = await ResolveAsync(userId, cancellationToken);
        if (!access.CanRead)
        {
            throw new ForbiddenException();
        }

        return await DayDtoAsync(person, access, day, cancellationToken);
    }

    /// <summary>
    /// A rep's calendar month: total, days with expenses, totals per city and per day, and the statement.
    /// <paramref name="month"/> is "yyyy-MM".
    /// </summary>
    public async Task<ExpenseMonthDto> GetMonthAsync(string month, Guid? userId = null, CancellationToken cancellationToken = default)
    {
        var (first, last) = MonthRange(month);
        var (person, access) = await ResolveAsync(userId, cancellationToken);
        if (!access.CanRead)
        {
            throw new ForbiddenException();
        }

        var lines = await LinesAsync(db.ExpenseLines.Where(l => l.UserId == person.Id && l.Day >= first && l.Day <= last), cancellationToken);
        var notes = await db.ExpenseDays.AsNoTracking()
            .Where(d => d.UserId == person.Id && d.Day >= first && d.Day <= last && (d.Note != null || d.ManagerNote != null))
            .Select(d => new { d.Day, d.Note, d.ManagerNote })
            .ToDictionaryAsync(d => d.Day, cancellationToken);

        var days = lines.Select(l => l.Day).Concat(notes.Keys).Distinct().Order()
            .Select(day =>
            {
                var dayLines = lines.Where(l => l.Day == day).ToList();
                notes.TryGetValue(day, out var note);
                return new ExpenseStatementDayDto(day, dayLines, dayLines.Sum(l => l.Amount), note?.Note, note?.ManagerNote);
            })
            .ToList();

        return new ExpenseMonthDto(
            person.Id,
            person.Name,
            first.ToString("yyyy-MM", CultureInfo.InvariantCulture),
            first,
            last,
            lines.Sum(l => l.Amount),
            days.Count(d => d.Lines.Count > 0),
            ByCity(lines),
            days.Select(d => new ExpenseDayTotalDto(
                d.Day, d.Total, d.Lines.Count, d.Note is not null || d.ManagerNote is not null, d.Lines.Any(l => l.Kind == ExpenseLineKind.Edited))).ToList(),
            days);
    }

    // ---------------------------------------------------------------------------------------------
    // Changes
    // ---------------------------------------------------------------------------------------------

    /// <summary>Adds a line by hand for a city (yourself inside the window, or a rep you manage).</summary>
    public async Task<ExpenseLineDto> CreateLineAsync(CreateExpenseLineRequest request, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        if (request.Id is { } clientId &&
            await db.ExpenseLines.AsNoTracking().AnyAsync(l => l.Id == clientId && l.UserId == (request.UserId ?? me), cancellationToken))
        {
            // A retry from the offline queue: the line is already there.
            return (await LinesAsync(db.ExpenseLines.Where(l => l.Id == clientId), cancellationToken, includeArchived: true)).Single();
        }

        var (person, access) = await ResolveAsync(request.UserId, cancellationToken);
        EnsureCanChangeLines(access, request.Day);

        if (!await db.Territories.AnyAsync(t => t.Id == request.CityId && t.ArchivedAt == null, cancellationToken))
        {
            throw new BusinessRuleException(ExpenseErrorCodes.CityInvalid, "Choose a city from the list.");
        }

        if (await db.ExpenseLines.AnyAsync(
                l => l.UserId == person.Id && l.Day == request.Day && l.CityId == request.CityId && l.ArchivedAt == null, cancellationToken))
        {
            throw new ConflictException(ExpenseErrorCodes.CityExists, "This day already has a line for this city. Change that line instead.");
        }

        var now = time.GetUtcNow();
        var changedAt = ChangedAt(request.ChangedAt, now);
        var line = new ExpenseLine
        {
            UserId = person.Id,
            TerritoryId = person.TerritoryId,
            Day = request.Day,
            CityId = request.CityId,
            Amount = Money(request.Amount),
            Source = ExpenseSource.Manual,
            Note = CleanNote(request.Note),
            AmountChangedAt = changedAt,
            NoteChangedAt = string.IsNullOrWhiteSpace(request.Note) ? null : changedAt,
            CreatedAt = now,
            CreatedById = me,
        };
        if (request.Id is { } id)
        {
            line.Id = id;
        }

        db.ExpenseLines.Add(line);
        await audit.AddAsync(AuditEntities.Expense, line.Id, AuditAction.Created,
            new { userId = person.Id, day = line.Day, cityId = line.CityId, amount = line.Amount, note = line.Note, source = "manual" },
            cancellationToken: cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return (await LinesAsync(db.ExpenseLines.Where(l => l.Id == line.Id), cancellationToken)).Single();
    }

    /// <summary>
    /// Changes a line's amount and/or note. With <c>changedAt</c> (offline changes) each field keeps its
    /// latest change: an older amount does not overwrite a newer one, and an amount change never touches the note.
    /// </summary>
    public async Task<ExpenseLineDto> UpdateLineAsync(Guid id, UpdateExpenseLineRequest request, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var line = await db.ExpenseLines.SingleOrDefaultAsync(l => l.Id == id && l.ArchivedAt == null, cancellationToken)
                   ?? throw new NotFoundException("Expense line", id);
        var (_, access) = await ResolveAsync(line.UserId, cancellationToken);
        EnsureCanChangeLines(access, line.Day);

        var now = time.GetUtcNow();
        var changedAt = ChangedAt(request.ChangedAt, now);
        var before = new { line.Amount, line.Note };
        if (request.Amount is { } amount && (line.AmountChangedAt is null || changedAt >= line.AmountChangedAt))
        {
            line.Amount = Money(amount);
            line.AmountChangedAt = changedAt;
        }

        if (request.Note is { } note && (line.NoteChangedAt is null || changedAt >= line.NoteChangedAt))
        {
            line.Note = CleanNote(note);
            line.NoteChangedAt = changedAt;
        }

        var after = new { line.Amount, line.Note };
        if (!before.Equals(after))
        {
            line.UpdatedAt = now;
            line.UpdatedById = me;
            await audit.AddAsync(AuditEntities.Expense, line.Id, AuditAction.Updated,
                new { userId = line.UserId, day = line.Day, cityId = line.CityId, before, after }, cancellationToken: cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);
        return (await LinesAsync(db.ExpenseLines.Where(l => l.Id == line.Id), cancellationToken)).Single();
    }

    /// <summary>Removes a line. A removed automatic line does not come back with the day's later visits.</summary>
    public async Task RemoveLineAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var line = await db.ExpenseLines.SingleOrDefaultAsync(l => l.Id == id, cancellationToken)
                   ?? throw new NotFoundException("Expense line", id);
        if (line.ArchivedAt is not null)
        {
            return; // removed already (a retry)
        }

        var (_, access) = await ResolveAsync(line.UserId, cancellationToken);
        EnsureCanChangeLines(access, line.Day);

        line.ArchivedAt = time.GetUtcNow();
        line.ArchivedById = me;
        await audit.AddAsync(AuditEntities.Expense, line.Id, AuditAction.Archived,
            new { userId = line.UserId, day = line.Day, cityId = line.CityId, amount = line.Amount, originalAmount = line.OriginalAmount, line.Note },
            cancellationToken: cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>The rep's general note for a day, or a manager's note on it (expenses:manage).</summary>
    public async Task<ExpenseDayDto> SetDayNoteAsync(DateOnly day, SetExpenseDayNoteRequest request, CancellationToken cancellationToken = default)
    {
        var me = currentUser.RequireUserId();
        var (person, access) = await ResolveAsync(request.UserId, cancellationToken);
        if (request.Note is not null && !CanWriteNote(access, day))
        {
            throw access.Own ? new BusinessRuleException(ExpenseErrorCodes.DayLocked, "This day can no longer be changed.") : new ForbiddenException();
        }

        if (request.ManagerNote is not null && !access.Manage)
        {
            throw new ForbiddenException();
        }

        var now = time.GetUtcNow();
        var changedAt = ChangedAt(request.ChangedAt, now);
        var row = await db.ExpenseDays.SingleOrDefaultAsync(d => d.UserId == person.Id && d.Day == day, cancellationToken);
        if (row is null)
        {
            row = new ExpenseDay { UserId = person.Id, TerritoryId = person.TerritoryId, Day = day, UpdatedAt = now };
            db.ExpenseDays.Add(row);
        }

        var before = new { row.Note, row.ManagerNote };
        if (request.Note is { } note && (row.NoteChangedAt is null || changedAt >= row.NoteChangedAt))
        {
            row.Note = CleanNote(note);
            row.NoteChangedAt = changedAt;
            row.NoteUpdatedById = me;
        }

        if (request.ManagerNote is { } managerNote && (row.ManagerNoteChangedAt is null || changedAt >= row.ManagerNoteChangedAt))
        {
            row.ManagerNote = CleanNote(managerNote);
            row.ManagerNoteChangedAt = changedAt;
            row.ManagerNoteById = me;
        }

        var after = new { row.Note, row.ManagerNote };
        if (!before.Equals(after))
        {
            row.UpdatedAt = now;
            await audit.AddAsync(AuditEntities.ExpenseDay, row.Id, AuditAction.Updated,
                new { userId = person.Id, day, before, after }, cancellationToken: cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);
        return await DayDtoAsync(person, access, day, cancellationToken);
    }

    // ---------------------------------------------------------------------------------------------
    // Managers
    // ---------------------------------------------------------------------------------------------

    /// <summary>
    /// Expenses of the reps in the caller's expenses:read scope between two days (at most
    /// <see cref="MaxReportDays"/>), optionally for one rep or city, with totals per rep, city and day.
    /// </summary>
    public async Task<ExpenseReportDto> ReportAsync(
        DateOnly from,
        DateOnly to,
        Guid? userId = null,
        Guid? cityId = null,
        CancellationToken cancellationToken = default)
    {
        if (to < from || to.DayNumber - from.DayNumber >= MaxReportDays)
        {
            throw new BusinessRuleException("invalid-range", $"Range must be positive and at most {MaxReportDays} days.");
        }

        var query = await ScopedLinesAsync(cancellationToken);
        query = query.Where(l => l.Day >= from && l.Day <= to);
        if (userId is { } rep)
        {
            query = query.Where(l => l.UserId == rep);
        }

        if (cityId is { } city)
        {
            query = query.Where(l => l.CityId == city);
        }

        var lines = await LinesAsync(query.OrderByDescending(l => l.Day).Take(MaxReportLines + 1), cancellationToken);
        var truncated = lines.Count > MaxReportLines;
        if (truncated)
        {
            lines = lines.Take(MaxReportLines).ToList();
        }

        var noteDays = await NoteDaysAsync(from, to, userId, cancellationToken);
        return new ExpenseReportDto(
            from,
            to,
            lines.Sum(l => l.Amount),
            lines.OrderByDescending(l => l.Day).ThenBy(l => l.UserName).ThenBy(l => l.CityName).ToList(),
            lines.GroupBy(l => new { l.UserId, l.UserName })
                .Select(g => new ExpenseRepTotalDto(g.Key.UserId, g.Key.UserName, g.Sum(l => l.Amount), g.Select(l => l.Day).Distinct().Count()))
                .OrderByDescending(r => r.Total).ThenBy(r => r.UserName)
                .ToList(),
            ByCity(lines),
            lines.GroupBy(l => l.Day)
                .Select(g => new ExpenseDayTotalDto(g.Key, g.Sum(l => l.Amount), g.Count(), noteDays.Contains(g.Key), g.Any(l => l.Kind == ExpenseLineKind.Edited)))
                .OrderBy(d => d.Day)
                .ToList(),
            truncated);
    }

    /// <summary>The calendar month of <paramref name="month"/> ("yyyy-MM") for everyone in scope.</summary>
    public Task<ExpenseReportDto> MonthReportAsync(string month, Guid? userId = null, Guid? cityId = null, CancellationToken cancellationToken = default)
    {
        var (first, last) = MonthRange(month);
        return ReportAsync(first, last, userId, cityId, cancellationToken);
    }

    /// <summary>Statements of a month for one rep, or for every rep in scope with expenses that month.</summary>
    public async Task<IReadOnlyList<ExpenseMonthDto>> StatementsAsync(string month, Guid? userId = null, CancellationToken cancellationToken = default)
    {
        if (userId is { } one)
        {
            return [await GetMonthAsync(month, one, cancellationToken)];
        }

        var (first, last) = MonthRange(month);
        var query = await ScopedLinesAsync(cancellationToken);
        var reps = await query.Where(l => l.Day >= first && l.Day <= last).Select(l => l.UserId).Distinct().ToListAsync(cancellationToken);
        var statements = new List<ExpenseMonthDto>();
        foreach (var rep in reps)
        {
            statements.Add(await GetMonthAsync(month, rep, cancellationToken));
        }

        return statements.OrderBy(s => s.UserName).ToList();
    }

    // ---------------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------------

    private async Task<ExpenseDayDto> DayDtoAsync(Person person, Access access, DateOnly day, CancellationToken cancellationToken)
    {
        var lines = await LinesAsync(db.ExpenseLines.Where(l => l.UserId == person.Id && l.Day == day), cancellationToken);
        var notes = await db.ExpenseDays.AsNoTracking()
            .Where(d => d.UserId == person.Id && d.Day == day)
            .Select(d => new
            {
                d.Note,
                d.ManagerNote,
                ManagerNoteBy = db.Users.Where(u => u.Id == d.ManagerNoteById).Select(u => u.FullName).FirstOrDefault(),
            })
            .SingleOrDefaultAsync(cancellationToken);
        var first = LocalCalendar.FirstOfMonth(day);
        var last = LocalCalendar.LastOfMonth(day);
        var monthTotal = await db.ExpenseLines
            .Where(l => l.UserId == person.Id && l.Day >= first && l.Day <= last && l.ArchivedAt == null)
            .SumAsync(l => (decimal?)l.Amount, cancellationToken) ?? 0m;
        var today = calendar.Today();

        return new ExpenseDayDto(
            person.Id,
            person.Name,
            day,
            lines.OrderBy(l => l.CityName).ToList(),
            lines.Sum(l => l.Amount),
            notes?.Note,
            notes?.ManagerNote,
            notes?.ManagerNoteBy,
            monthTotal,
            CanChangeLines(access, day),
            CanWriteNote(access, day),
            access.Manage,
            EditableFrom(),
            today);
    }

    private DateOnly EditableFrom() => calendar.Today().AddDays(-Math.Max(0, Settings.EditableDays));

    /// <summary>Lines: never for a day still to come; the rep inside the window, managers on any past day.</summary>
    private bool CanChangeLines(Access access, DateOnly day) =>
        day <= calendar.Today() && (access.Manage || (access.Own && day >= EditableFrom()));

    /// <summary>The rep's own note: any day from the start of the window on (a plan for tomorrow is fine).</summary>
    private bool CanWriteNote(Access access, DateOnly day) => access.Own && day >= EditableFrom();

    private void EnsureCanChangeLines(Access access, DateOnly day)
    {
        if (day > calendar.Today())
        {
            throw new BusinessRuleException(ExpenseErrorCodes.FutureDay, "Expenses can only be entered for today or earlier.");
        }

        if (CanChangeLines(access, day))
        {
            return;
        }

        if (access.Own)
        {
            throw new BusinessRuleException(ExpenseErrorCodes.DayLocked,
                $"Days older than {Settings.EditableDays} days can no longer be changed. Ask your manager.");
        }

        throw new ForbiddenException();
    }

    /// <summary>The rep (yourself by default) and what the caller may do with their expenses.</summary>
    private async Task<(Person Person, Access Access)> ResolveAsync(Guid? userId, CancellationToken cancellationToken)
    {
        var me = currentUser.RequireUserId();
        var target = userId ?? me;
        var person = await db.Users.AsNoTracking()
                         .Where(u => u.Id == target)
                         .Select(u => new Person(u.Id, u.FullName, u.TerritoryId))
                         .SingleOrDefaultAsync(cancellationToken)
                     ?? throw new NotFoundException("User", target);

        var own = target == me;
        var read = await scopes.ResolveAsync(Identity.Permissions.Expenses.Read, cancellationToken);
        var manage = await scopes.ResolveAsync(Identity.Permissions.Expenses.Manage, cancellationToken);
        var readOwn = own && (await scopes.ResolveAsync(Identity.Permissions.Expenses.ReadOwn, cancellationToken)).Level is not null;
        var writeOwn = own && (await scopes.ResolveAsync(Identity.Permissions.Expenses.WriteOwn, cancellationToken)).Level is not null;
        var canManage = manage.Includes(person.Id, person.TerritoryId);
        var canRead = readOwn || writeOwn || canManage || read.Includes(person.Id, person.TerritoryId);
        return (person, new Access(canRead, writeOwn, canManage));
    }

    /// <summary>Lines the caller may see in reports: expenses:read scope (or only their own with read-own).</summary>
    private async Task<IQueryable<ExpenseLine>> ScopedLinesAsync(CancellationToken cancellationToken)
    {
        var me = currentUser.RequireUserId();
        var read = await scopes.ResolveAsync(Identity.Permissions.Expenses.Read, cancellationToken);
        if (read.Level is not null)
        {
            return db.ExpenseLines.WhereInScope(read);
        }

        var own = await scopes.ResolveAsync(Identity.Permissions.Expenses.ReadOwn, cancellationToken);
        if (own.Level is not null)
        {
            return db.ExpenseLines.Where(l => l.UserId == me);
        }

        throw new ForbiddenException();
    }

    private async Task<HashSet<DateOnly>> NoteDaysAsync(DateOnly from, DateOnly to, Guid? userId, CancellationToken cancellationToken)
    {
        var read = await scopes.ResolveAsync(Identity.Permissions.Expenses.Read, cancellationToken);
        var query = read.Level is not null
            ? db.ExpenseDays.AsNoTracking().WhereInScope(read)
            : db.ExpenseDays.AsNoTracking().Where(d => d.UserId == currentUser.RequireUserId());
        query = query.Where(d => d.Day >= from && d.Day <= to && (d.Note != null || d.ManagerNote != null));
        if (userId is { } rep)
        {
            query = query.Where(d => d.UserId == rep);
        }

        return (await query.Select(d => d.Day).Distinct().ToListAsync(cancellationToken)).ToHashSet();
    }

    private async Task<List<ExpenseLineDto>> LinesAsync(IQueryable<ExpenseLine> query, CancellationToken cancellationToken, bool includeArchived = false)
    {
        if (!includeArchived)
        {
            query = query.Where(l => l.ArchivedAt == null);
        }

        var rows = await query.AsNoTracking()
            .Select(l => new
            {
                l.Id,
                l.UserId,
                UserName = db.Users.Where(u => u.Id == l.UserId).Select(u => u.FullName).FirstOrDefault(),
                l.Day,
                l.CityId,
                City = db.Territories.Where(t => t.Id == l.CityId).Select(t => new { t.Name, t.NameAr }).FirstOrDefault(),
                l.Amount,
                l.OriginalAmount,
                l.Source,
                l.Note,
                l.CreatedAt,
                l.UpdatedAt,
                UpdatedBy = db.Users.Where(u => u.Id == l.UpdatedById).Select(u => u.FullName).FirstOrDefault(),
            })
            .ToListAsync(cancellationToken);

        return rows
            .Select(l => new ExpenseLineDto(
                l.Id, l.UserId, l.UserName ?? string.Empty, l.Day, l.CityId, l.City?.Name ?? string.Empty, l.City?.NameAr,
                l.Amount, l.OriginalAmount, KindOf(l.Source, l.Amount, l.OriginalAmount), l.Note, l.CreatedAt, l.UpdatedAt, l.UpdatedBy))
            .ToList();
    }

    private static ExpenseLineKind KindOf(ExpenseSource source, decimal amount, decimal? original) =>
        source == ExpenseSource.Manual ? ExpenseLineKind.Manual
        : original is { } o && o != amount ? ExpenseLineKind.Edited
        : ExpenseLineKind.Auto;

    private static List<ExpenseCityTotalDto> ByCity(IEnumerable<ExpenseLineDto> lines) =>
        lines.GroupBy(l => new { l.CityId, l.CityName, l.CityNameAr })
            .Select(g => new ExpenseCityTotalDto(g.Key.CityId, g.Key.CityName, g.Key.CityNameAr, g.Sum(l => l.Amount), g.Select(l => l.Day).Distinct().Count()))
            .OrderByDescending(c => c.Total).ThenBy(c => c.CityName)
            .ToList();

    /// <summary>"yyyy-MM" to the first and last day of that month.</summary>
    public static (DateOnly First, DateOnly Last) MonthRange(string month)
    {
        if (!DateOnly.TryParseExact(month + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var first))
        {
            throw new BusinessRuleException("invalid-month", "Month must look like 2026-11.");
        }

        return (first, LocalCalendar.LastOfMonth(first));
    }

    /// <summary>Amounts in EGP with piasters: two decimals, rounded half away from zero.</summary>
    private decimal Money(decimal amount)
    {
        if (amount < 0 || amount > Settings.MaxAmount)
        {
            throw new BusinessRuleException("expense_amount_invalid", $"Enter an amount between 0 and {Settings.MaxAmount:0}.");
        }

        return Math.Round(amount, 2, MidpointRounding.AwayFromZero);
    }

    private static string? CleanNote(string? note)
    {
        var trimmed = note?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed.Length <= ExpenseLine.NoteMaxLength ? trimmed : trimmed[..ExpenseLine.NoteMaxLength];
    }

    /// <summary>The device's time of the change, never later than now.</summary>
    private static DateTimeOffset ChangedAt(DateTimeOffset? requested, DateTimeOffset now) =>
        requested is { } at && at < now ? at.ToUniversalTime() : now;
}
