using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Identity;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Tests.Integration;

[Collection(PostgresCollection.Name)]
public sealed class AccountTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Creating_accounts_needs_users_create_and_follows_the_hierarchy()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var area = await DemoPeople.TerritoryAsync(db, "A-CAI-E");
        var cardio = await DemoPeople.LineAsync(db, "Cardio line");

        CreateUserRequest NewRep(string email, Guid? manager, string? role = null) =>
            new(email, "New Rep", null, [role ?? DefaultRoles.Rep], manager, area, "ar", [cardio]);

        // users:manage alone is not enough any more; the area manager holds neither by default.
        var noPermission = await Assert.ThrowsAsync<ForbiddenException>(() => db.UsersAsync(p.Area, s => s.CreateAsync(NewRep("a@test.local", p.Supervisor), Ct)));
        Assert.Equal("forbidden", noPermission.Code);

        await db.GrantAsync(p.Admin, DefaultRoles.Supervisor, (Permissions.Users.Create, PermissionScope.Team));

        Assert.Equal(IdentityErrorCodes.RoleLevelTooHigh, (await Assert.ThrowsAsync<ForbiddenException>(() => db.UsersAsync(p.Supervisor, s =>
            s.CreateAsync(NewRep("b@test.local", p.Supervisor, DefaultRoles.SalesManager), Ct)))).Code);
        Assert.Equal(IdentityErrorCodes.RoleLevelTooHigh, (await Assert.ThrowsAsync<ForbiddenException>(() => db.UsersAsync(p.Supervisor, s =>
            s.CreateAsync(NewRep("c@test.local", p.Supervisor, DefaultRoles.Supervisor), Ct)))).Code);
        // Team scope: the new user must report to someone in the creator's team.
        await Assert.ThrowsAsync<ForbiddenException>(() => db.UsersAsync(p.Supervisor, s => s.CreateAsync(NewRep("d@test.local", p.Area), Ct)));
        // A rep cannot manage another rep.
        Assert.Equal(IdentityErrorCodes.ManagerLevelInvalid, (await Assert.ThrowsAsync<BusinessRuleException>(() => db.UsersAsync(p.Supervisor, s =>
            s.CreateAsync(NewRep("e@test.local", p.Rep), Ct)))).Code);

        var created = await db.UsersAsync(p.Supervisor, s => s.CreateAsync(NewRep("new.rep@test.local", p.Supervisor), Ct));
        Assert.NotNull(created.TemporaryPassword);
        Assert.True(created.User.MustChangePassword);
        Assert.Equal([cardio], created.User.ProductLineIds);
        Assert.Equal(p.Supervisor, created.User.ManagerId);
        Assert.True(await CheckPasswordAsync(db, created.User.Id, created.TemporaryPassword!));

        // A password typed by the creator is not echoed back.
        var typed = await db.UsersAsync(p.Admin, s => s.CreateAsync(NewRep("typed@test.local", p.Supervisor) with { Password = "Typed-Pass-2026" }, Ct));
        Assert.Null(typed.TemporaryPassword);

        var audit = await db.As<AccountService, IReadOnlyList<UserAuditEntryDto>>(p.Admin, s => s.GetAuditAsync(created.User.Id, 10, Ct));
        var entry = Assert.Single(audit);
        Assert.Equal(UserAuditAction.Created, entry.Action);
        Assert.Equal("Demo Supervisor", entry.ActorName);
        Assert.DoesNotContain(created.TemporaryPassword!, entry.Details.GetRawText());
    }

    [Fact]
    public async Task Changing_your_password_ends_your_other_sessions()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var current = Guid.NewGuid();
        var phone = Guid.NewGuid();
        var someoneElse = Guid.NewGuid();
        await AddSessionsAsync(db, (p.Rep, current), (p.Rep, phone), (p.RepEast, someoneElse));
        await db.DbAsync(c => c.Users.Where(u => u.Id == p.Rep).ExecuteUpdateAsync(s => s.SetProperty(u => u.MustChangePassword, true), Ct));

        Task Change(string currentPassword, string newPassword) => db.AsAsync(p.Rep, sp =>
        {
            sp.GetRequiredService<TestCurrentUser>().SessionId = current;
            return sp.GetRequiredService<AccountService>().ChangePasswordAsync(new ChangePasswordRequest(currentPassword, newPassword), Ct);
        });

        Assert.Equal(AccountErrorCodes.CurrentPasswordIncorrect,
            (await Assert.ThrowsAsync<BusinessRuleException>(() => Change("wrong-password", "Another-Pass-2026"))).Code);
        Assert.Equal(AccountErrorCodes.PasswordUnchanged,
            (await Assert.ThrowsAsync<BusinessRuleException>(() => Change(PostgresFixture.Password, PostgresFixture.Password))).Code);
        Assert.Equal(AccountErrorCodes.PasswordPolicy,
            (await Assert.ThrowsAsync<BusinessRuleException>(() => Change(PostgresFixture.Password, "alllowercase"))).Code);

        await Change(PostgresFixture.Password, "Another-Pass-2026");

        var sessions = await SessionsAsync(db);
        Assert.Null(sessions[current]);
        Assert.Equal("password-changed", sessions[phone]);
        Assert.Null(sessions[someoneElse]);
        Assert.True(await CheckPasswordAsync(db, p.Rep, "Another-Pass-2026"));
        Assert.False(await db.DbAsync(c => c.Users.Where(u => u.Id == p.Rep).Select(u => u.MustChangePassword).SingleAsync(Ct)));

        var audit = await db.As<AccountService, IReadOnlyList<UserAuditEntryDto>>(p.Admin, s => s.GetAuditAsync(p.Rep, 10, Ct));
        Assert.Equal(UserAuditAction.PasswordChanged, audit[0].Action);
        Assert.Equal(1, audit[0].Details.GetProperty("revokedSessions").GetInt32());
    }

    [Fact]
    public async Task Resetting_a_password_follows_the_hierarchy_and_signs_the_user_out()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var session = Guid.NewGuid();
        await AddSessionsAsync(db, (p.Rep, session));

        // Supervisors hold users:reset-password for their team by default.
        var reset = await db.As<AccountService, TemporaryPasswordDto>(p.Supervisor, s => s.ResetPasswordAsync(p.Rep, new ResetPasswordRequest(), Ct));
        Assert.True(await CheckPasswordAsync(db, p.Rep, reset.TemporaryPassword));
        Assert.False(await CheckPasswordAsync(db, p.Rep, PostgresFixture.Password));
        Assert.True(await db.DbAsync(c => c.Users.Where(u => u.Id == p.Rep).Select(u => u.MustChangePassword).SingleAsync(Ct)));
        Assert.Equal("password-reset", (await SessionsAsync(db))[session]);

        await Assert.ThrowsAsync<ForbiddenException>(() => db.As<AccountService, TemporaryPasswordDto>(p.Supervisor, s => s.ResetPasswordAsync(p.Area, new ResetPasswordRequest(), Ct)));
        Assert.Equal(IdentityErrorCodes.SelfEditForbidden, (await Assert.ThrowsAsync<ForbiddenException>(() =>
            db.As<AccountService, TemporaryPasswordDto>(p.Supervisor, s => s.ResetPasswordAsync(p.Supervisor, new ResetPasswordRequest(), Ct)))).Code);
        await Assert.ThrowsAsync<ForbiddenException>(() => db.As<AccountService, TemporaryPasswordDto>(p.Rep, s => s.ResetPasswordAsync(p.RepEast, new ResetPasswordRequest(), Ct)));

        // A typed temporary password must still meet the policy.
        Assert.Equal(AccountErrorCodes.PasswordPolicy, (await Assert.ThrowsAsync<BusinessRuleException>(() =>
            db.As<AccountService, TemporaryPasswordDto>(p.Admin, s => s.ResetPasswordAsync(p.RepEast, new ResetPasswordRequest("nodigitsatall"), Ct)))).Code);

        var audit = await db.As<AccountService, IReadOnlyList<UserAuditEntryDto>>(p.Admin, s => s.GetAuditAsync(p.Rep, 10, Ct));
        Assert.Equal(UserAuditAction.PasswordReset, audit[0].Action);
        Assert.Equal("Demo Supervisor", audit[0].ActorName);
    }

    [Fact]
    public void Generated_passwords_meet_the_policy_and_avoid_look_alikes()
    {
        for (var i = 0; i < 200; i++)
        {
            var password = AccountService.GeneratePassword();
            Assert.Equal(14, password.Length);
            Assert.Contains(password, char.IsAsciiLetterUpper);
            Assert.Contains(password, char.IsAsciiLetterLower);
            Assert.Contains(password, char.IsAsciiDigit);
            Assert.DoesNotContain(password, c => c is '0' or 'O' or '1' or 'l' or 'I');
        }
    }

    private static Task<bool> CheckPasswordAsync(TestDatabase db, Guid userId, string password) =>
        db.AsAsync(userId, async sp =>
        {
            var users = sp.GetRequiredService<UserManager<User>>();
            return await users.CheckPasswordAsync((await users.FindByIdAsync(userId.ToString()))!, password);
        });

    private static Task AddSessionsAsync(TestDatabase db, params (Guid UserId, Guid FamilyId)[] sessions) =>
        db.DbAsync(async c =>
        {
            var now = DateTimeOffset.UtcNow;
            foreach (var (userId, familyId) in sessions)
            {
                c.RefreshTokens.Add(new RefreshToken
                {
                    UserId = userId,
                    FamilyId = familyId,
                    TokenHash = Guid.NewGuid().ToString("N"),
                    Client = ClientKind.Web,
                    CreatedAt = now,
                    ExpiresAt = now.AddDays(30),
                });
            }

            return await c.SaveChangesAsync(Ct);
        });

    /// <summary>Family id -> revoke reason (null while active).</summary>
    private static Task<Dictionary<Guid, string?>> SessionsAsync(TestDatabase db) =>
        db.DbAsync(c => c.RefreshTokens.ToDictionaryAsync(t => t.FamilyId, t => t.RevokedReason, Ct));
}
