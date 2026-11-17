using OriginalPharma.Application.Common.Scoping;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Domain.Tracking;

namespace OriginalPharma.Tests.Identity;

public class DataScopeTests
{
    private static readonly Guid Me = Guid.NewGuid();
    private static readonly Guid MyRep = Guid.NewGuid();
    private static readonly Guid OtherRep = Guid.NewGuid();
    private static readonly Guid MyTerritory = Guid.NewGuid();
    private static readonly Guid OtherTerritory = Guid.NewGuid();

    private static readonly Shift[] Shifts =
    [
        new() { UserId = Me, TerritoryId = MyTerritory },
        new() { UserId = MyRep, TerritoryId = MyTerritory },
        new() { UserId = OtherRep, TerritoryId = OtherTerritory },
        new() { UserId = OtherRep, TerritoryId = MyTerritory },
    ];

    [Fact]
    public void All_returns_everything()
    {
        Assert.Equal(4, Shifts.AsQueryable().WhereInScope(DataScope.All(Me)).Count());
    }

    [Fact]
    public void Own_returns_only_my_rows()
    {
        var rows = Shifts.AsQueryable().WhereInScope(DataScope.Own(Me)).ToList();

        Assert.All(rows, r => Assert.Equal(Me, r.UserId));
        Assert.Single(rows);
    }

    [Fact]
    public void Team_returns_me_and_my_reports()
    {
        var rows = Shifts.AsQueryable().WhereInScope(DataScope.Team(Me, [MyRep])).ToList();

        Assert.Equal(2, rows.Count);
        Assert.DoesNotContain(rows, r => r.UserId == OtherRep);
    }

    [Fact]
    public void Territory_returns_rows_in_my_territories()
    {
        var rows = Shifts.AsQueryable().WhereInScope(DataScope.Territory(Me, [MyTerritory])).ToList();

        Assert.Equal(3, rows.Count);
        Assert.All(rows, r => Assert.Equal(MyTerritory, r.TerritoryId));
    }

    [Fact]
    public void Nothing_returns_no_rows()
    {
        Assert.Empty(Shifts.AsQueryable().WhereInScope(DataScope.Nothing(Me)));
    }

    [Fact]
    public void Users_table_filter_matches_scope()
    {
        var users = new[]
        {
            new User { Id = Me, TerritoryId = MyTerritory },
            new User { Id = MyRep, TerritoryId = MyTerritory, ManagerId = Me },
            new User { Id = OtherRep, TerritoryId = OtherTerritory },
        };

        Assert.Equal(2, users.AsQueryable().WhereUsersInScope(DataScope.Team(Me, [MyRep])).Count());
        Assert.Equal(2, users.AsQueryable().WhereUsersInScope(DataScope.Territory(Me, [MyTerritory])).Count());
        Assert.Single(users.AsQueryable().WhereUsersInScope(DataScope.Own(Me)));
    }

    [Theory]
    [InlineData(PermissionScope.Own, false)]
    [InlineData(PermissionScope.Team, true)]
    [InlineData(PermissionScope.All, true)]
    public void Includes_checks_a_single_record(PermissionScope level, bool expected)
    {
        var scope = level switch
        {
            PermissionScope.Own => DataScope.Own(Me),
            PermissionScope.Team => DataScope.Team(Me, [MyRep]),
            _ => DataScope.All(Me),
        };

        Assert.Equal(expected, scope.Includes(MyRep, MyTerritory));
    }
}
