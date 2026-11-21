using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using OriginalPharma.Application.Common;
using OriginalPharma.Application.Common.Bulk;
using OriginalPharma.Application.Identity;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Infrastructure.Identity;

namespace OriginalPharma.Tests.Integration;

/// <summary>
/// Month-long sessions: every refresh slides the session 30 days forward up to 90 days from the
/// login, refresh tokens rotate with a short grace for parallel refreshes, reuse ends the session,
/// and each device is its own session that can be ended alone.
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class SessionTests(PostgresFixture postgres)
{
    private const string RepEmail = "rep@demo.local";
    private static readonly TimeSpan Tolerance = TimeSpan.FromSeconds(30);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public void Settings_default_to_a_thirty_day_session_capped_at_ninety_and_read_the_environment()
    {
        var defaults = new AuthSessionOptions();
        Assert.Equal(30, defaults.SessionDays);
        Assert.Equal(90, defaults.SessionMaxDays);
        Assert.Equal(TimeSpan.FromSeconds(10), defaults.ReuseGrace);

        var configured = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Auth:SessionDays"] = "14",
                ["Auth:SessionMaxDays"] = "60",
                ["Auth:RefreshReuseGraceSeconds"] = "5",
            })
            .Build()
            .GetSection(AuthSessionOptions.SectionName)
            .Get<AuthSessionOptions>()!;
        Assert.Equal(TimeSpan.FromDays(14), configured.Sliding);
        Assert.Equal(TimeSpan.FromDays(60), configured.Maximum);
        Assert.Equal(TimeSpan.FromSeconds(5), configured.ReuseGrace);

        // A maximum shorter than the sliding window would make no sense; the window wins.
        Assert.Equal(TimeSpan.FromDays(30), new AuthSessionOptions { SessionDays = 30, SessionMaxDays = 7 }.Maximum);
    }

    [Fact]
    public async Task Each_refresh_extends_the_session_by_thirty_days()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var rep = await db.UserIdAsync(RepEmail);

        var login = await LoginAsync(db, rep, "phone-a");
        var session = await SessionAsync(db, login);
        var loggedInAt = db.Clock.GetUtcNow();
        Assert.Equal(loggedInAt.AddDays(30), login.RefreshTokenExpiresAt, Tolerance);
        Assert.Equal(loggedInAt.AddDays(90), session.AbsoluteExpiresAt, Tolerance);
        Assert.Equal("Test phone", session.DeviceName);

        db.Clock.Advance(TimeSpan.FromDays(20));
        var refreshed = await RefreshAsync(db, rep, login.RefreshToken);
        Assert.Equal(db.Clock.GetUtcNow().AddDays(30), refreshed.RefreshTokenExpiresAt, Tolerance);

        session = await SessionAsync(db, refreshed);
        Assert.Equal(db.Clock.GetUtcNow(), session.LastUsedAt, Tolerance);
        Assert.Equal(refreshed.RefreshTokenExpiresAt, session.ExpiresAt, Tolerance);

        // Still signed in 29 days after the last use.
        db.Clock.Advance(TimeSpan.FromDays(29));
        await RefreshAsync(db, rep, refreshed.RefreshToken);
    }

    [Fact]
    public async Task A_device_not_used_for_thirty_days_needs_the_password_again()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var rep = await db.UserIdAsync(RepEmail);
        var login = await LoginAsync(db, rep, "phone-a");

        db.Clock.Advance(TimeSpan.FromDays(30) + TimeSpan.FromMinutes(1));
        await AssertRefreshRefusedAsync(db, rep, login.RefreshToken);
    }

    [Fact]
    public async Task The_absolute_maximum_needs_a_password_login_however_often_the_device_is_used()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var rep = await db.UserIdAsync(RepEmail);
        var login = await LoginAsync(db, rep, "phone-a");
        var absolute = (await SessionAsync(db, login)).AbsoluteExpiresAt;

        var token = login.RefreshToken;
        foreach (var day in new[] { 25, 25, 25 })
        {
            db.Clock.Advance(TimeSpan.FromDays(day));
            var refreshed = await RefreshAsync(db, rep, token);
            // Never past the maximum: on day 75 the window ends on day 90, not 105.
            Assert.True(refreshed.RefreshTokenExpiresAt <= absolute);
            token = refreshed.RefreshToken;
        }

        Assert.Equal(absolute, (await SessionAsync(db, login)).ExpiresAt, Tolerance);

        db.Clock.Advance(TimeSpan.FromDays(14));
        token = (await RefreshAsync(db, rep, token)).RefreshToken; // day 89

        db.Clock.Advance(TimeSpan.FromDays(1) + TimeSpan.FromMinutes(1));
        await AssertRefreshRefusedAsync(db, rep, token);

        // The password brings the device back.
        await LoginAsync(db, rep, "phone-a");
    }

    [Fact]
    public async Task Two_refreshes_at_once_from_one_device_both_succeed()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var rep = await db.UserIdAsync(RepEmail);
        var login = await LoginAsync(db, rep, "phone-a");

        var first = await RefreshAsync(db, rep, login.RefreshToken);
        db.Clock.Advance(TimeSpan.FromSeconds(3));
        var second = await RefreshAsync(db, rep, login.RefreshToken);

        Assert.NotEqual(first.RefreshToken, second.RefreshToken);
        // Both answers leave the device with a working token.
        await RefreshAsync(db, rep, first.RefreshToken);
        await RefreshAsync(db, rep, second.RefreshToken);
    }

    [Fact]
    public async Task Reusing_a_replaced_token_after_the_grace_period_ends_the_session()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var rep = await db.UserIdAsync(RepEmail);
        var login = await LoginAsync(db, rep, "phone-a");
        var rotated = await RefreshAsync(db, rep, login.RefreshToken);

        db.Clock.Advance(TimeSpan.FromSeconds(11));
        await AssertRefreshRefusedAsync(db, rep, login.RefreshToken);

        // The whole session is gone, including the token the real device holds.
        await AssertRefreshRefusedAsync(db, rep, rotated.RefreshToken);
        var session = await SessionAsync(db, login);
        Assert.Equal(SessionRevokeReasons.ReuseDetected, session.RevokedReason);
        Assert.True(await RevokedAsync(db, session.Id));
    }

    [Fact]
    public async Task A_password_reset_ends_every_session_at_once()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var phoneA = await LoginAsync(db, p.Rep, "phone-a");
        var phoneB = await LoginAsync(db, p.Rep, "phone-b");

        await db.As<AccountService, TemporaryPasswordDto>(p.Supervisor, s => s.ResetPasswordAsync(p.Rep, new ResetPasswordRequest(), Ct));

        await AssertRefreshRefusedAsync(db, p.Rep, phoneA.RefreshToken);
        await AssertRefreshRefusedAsync(db, p.Rep, phoneB.RefreshToken);
        Assert.True(await RevokedAsync(db, (await SessionAsync(db, phoneA)).Id));
        Assert.True(await RevokedAsync(db, (await SessionAsync(db, phoneB)).Id));
    }

    [Fact]
    public async Task Changing_your_password_keeps_this_device_and_ends_the_others()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var rep = await db.UserIdAsync(RepEmail);
        var here = await LoginAsync(db, rep, "phone-a");
        var other = await LoginAsync(db, rep, "phone-b");
        var hereId = (await SessionAsync(db, here)).Id;

        await db.AsAsync(rep, sp =>
        {
            sp.GetRequiredService<TestCurrentUser>().SessionId = hereId;
            return sp.GetRequiredService<AccountService>().ChangePasswordAsync(new ChangePasswordRequest(PostgresFixture.Password, "Another-Pass-2026"), Ct);
        });

        await RefreshAsync(db, rep, here.RefreshToken);
        await AssertRefreshRefusedAsync(db, rep, other.RefreshToken);
        Assert.Equal(SessionRevokeReasons.PasswordChanged, (await SessionAsync(db, other)).RevokedReason);
    }

    [Fact]
    public async Task Deactivating_a_user_ends_their_sessions()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var login = await LoginAsync(db, p.Rep, "phone-a");

        // The demo rep has visits and orders, so deleting archives (deactivates) them.
        var result = await db.UsersAsync(p.Admin, s => s.DeleteManyAsync(new BulkDeleteRequest([p.Rep]), Ct));
        Assert.Equal(BulkOutcome.Archived, result.Items.Single().Outcome);

        await AssertRefreshRefusedAsync(db, p.Rep, login.RefreshToken);
        Assert.Equal(SessionRevokeReasons.UserArchived, (await SessionAsync(db, login)).RevokedReason);
    }

    [Fact]
    public async Task One_lost_phone_can_be_signed_out_without_the_others()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var p = await DemoPeople.LoadAsync(db);
        var lost = await LoginAsync(db, p.Rep, "phone-lost");
        var kept = await LoginAsync(db, p.Rep, "phone-kept");
        var lostId = (await SessionAsync(db, lost)).Id;
        // The lost phone's background uploader has a session of its own.
        var uploader = await db.AsAsync(p.Rep, sp =>
        {
            sp.GetRequiredService<TestCurrentUser>().SessionId = lostId;
            return sp.GetRequiredService<IAuthService>().CreateSessionAsync(p.Rep, ClientKind.Native, "phone-lost", null, Ct);
        });

        var listed = await db.As<SessionService, IReadOnlyList<UserSessionDto>>(p.Supervisor, s => s.ListForUserAsync(p.Rep, Ct));
        Assert.Equal(3, listed.Count);

        await db.As<SessionService>(p.Supervisor, s => s.RevokeForUserAsync(p.Rep, lostId, Ct));

        await AssertRefreshRefusedAsync(db, p.Rep, lost.RefreshToken);
        await AssertRefreshRefusedAsync(db, p.Rep, uploader.RefreshToken);
        await RefreshAsync(db, p.Rep, kept.RefreshToken);

        var mine = await db.As<SessionService, IReadOnlyList<UserSessionDto>>(p.Rep, s => s.ListMineAsync(Ct));
        Assert.Equal("phone-kept", Assert.Single(mine).DeviceId);
        Assert.True(await db.DbAsync(c => c.UserAuditEntries.AnyAsync(e => e.UserId == p.Rep && e.Action == UserAuditAction.SessionRevoked, Ct)));

        // Only people who may reset the user's password can do this.
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            db.As<SessionService, IReadOnlyList<UserSessionDto>>(p.RepEast, s => s.ListForUserAsync(p.Rep, Ct)));
    }

    [Fact]
    public async Task A_user_can_sign_out_one_of_their_own_devices()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var rep = await db.UserIdAsync(RepEmail);
        var phone = await LoginAsync(db, rep, "phone-a");
        var browser = await LoginAsync(db, rep, null, ClientKind.Web);

        var browserId = (await SessionAsync(db, browser)).Id;
        await db.As<SessionService>(rep, s => s.RevokeMineAsync(browserId, Ct));

        await AssertRefreshRefusedAsync(db, rep, browser.RefreshToken);
        await RefreshAsync(db, rep, phone.RefreshToken);

        // Someone else's session id is not found, whatever it is.
        var other = await LoginAsync(db, await db.UserIdAsync("rep.east@demo.local"), "phone-x");
        var otherId = (await SessionAsync(db, other)).Id;
        await Assert.ThrowsAsync<NotFoundException>(() => db.As<SessionService>(rep, s => s.RevokeMineAsync(otherId, Ct)));
    }

    [Fact]
    public async Task Signing_out_ends_only_this_device()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var rep = await db.UserIdAsync(RepEmail);
        var phoneA = await LoginAsync(db, rep, "phone-a");
        var phoneB = await LoginAsync(db, rep, "phone-b");

        await db.As<IAuthService>(rep, s => s.LogoutAsync(phoneA.RefreshToken, Ct));

        await AssertRefreshRefusedAsync(db, rep, phoneA.RefreshToken);
        await RefreshAsync(db, rep, phoneB.RefreshToken);
        Assert.Equal(SessionRevokeReasons.Logout, (await SessionAsync(db, phoneA)).RevokedReason);
    }

    [Fact]
    public async Task Tokens_issued_before_sessions_were_recorded_keep_working()
    {
        await using var db = await postgres.CreateDatabaseAsync();
        var rep = await db.UserIdAsync(RepEmail);
        var raw = TokenService.NewRefreshToken();
        var family = Guid.CreateVersion7();
        var issued = db.Clock.GetUtcNow().AddDays(-3);
        await db.DbAsync(async c =>
        {
            c.RefreshTokens.Add(new RefreshToken
            {
                UserId = rep,
                TokenHash = TokenService.Hash(raw),
                FamilyId = family,
                Client = ClientKind.Native,
                DeviceId = "old-phone",
                CreatedAt = issued,
                ExpiresAt = issued.AddDays(30),
            });
            return await c.SaveChangesAsync(Ct);
        });

        var refreshed = await RefreshAsync(db, rep, raw);

        var session = await db.DbAsync(c => c.UserSessions.SingleAsync(s => s.Id == family, Ct));
        Assert.Equal(issued, session.CreatedAt, Tolerance);
        Assert.Equal(issued.AddDays(90), session.AbsoluteExpiresAt, Tolerance);
        await RefreshAsync(db, rep, refreshed.RefreshToken);
    }

    private static Task<AuthTokens> LoginAsync(TestDatabase db, Guid userId, string? deviceId, ClientKind client = ClientKind.Native) =>
        db.AsAsync(userId, async sp =>
        {
            var email = await sp.GetRequiredService<IAppDbContext>().Users.Where(u => u.Id == userId).Select(u => u.Email!).SingleAsync(Ct);
            return await sp.GetRequiredService<IAuthService>().LoginAsync(
                new LoginRequest(email, PostgresFixture.Password, client, deviceId, "Test phone"), Ct);
        });

    private static Task<AuthTokens> RefreshAsync(TestDatabase db, Guid userId, string refreshToken) =>
        db.As<IAuthService, AuthTokens>(userId, s => s.RefreshAsync(refreshToken, ClientKind.Native, null, null, Ct));

    private static async Task AssertRefreshRefusedAsync(TestDatabase db, Guid userId, string refreshToken)
    {
        var refused = await Assert.ThrowsAsync<UnauthorizedException>(() => RefreshAsync(db, userId, refreshToken));
        Assert.Equal("invalid-refresh-token", refused.Code);
    }

    private static Task<UserSession> SessionAsync(TestDatabase db, AuthTokens tokens) =>
        db.DbAsync(c =>
        {
            var hash = TokenService.Hash(tokens.RefreshToken);
            return c.UserSessions.AsNoTracking()
                .Where(s => c.RefreshTokens.Any(t => t.TokenHash == hash && t.FamilyId == s.Id))
                .SingleAsync(Ct);
        });

    private static Task<bool> RevokedAsync(TestDatabase db, Guid sessionId) =>
        db.AsAsync(Guid.Empty, sp => sp.GetRequiredService<ISessionRevocationList>().ContainsAsync(sessionId, Ct));
}
