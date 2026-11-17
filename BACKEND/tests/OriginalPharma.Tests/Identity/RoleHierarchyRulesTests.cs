using OriginalPharma.Application.Identity;
using OriginalPharma.Domain.Identity;

namespace OriginalPharma.Tests.Identity;

public class RoleHierarchyRulesTests
{
    [Theory]
    [InlineData(0, 0, true)] // only the top level manages top-level roles
    [InlineData(0, 40, true)]
    [InlineData(10, 0, false)]
    [InlineData(20, 20, false)] // not your own level
    [InlineData(20, 10, false)]
    [InlineData(20, 21, true)]
    [InlineData(30, 40, true)]
    [InlineData(RoleHierarchyRules.NoRoleLevel, 40, false)]
    public void Roles_can_only_be_managed_strictly_below_your_own_level(int actor, int target, bool expected)
    {
        Assert.Equal(expected, RoleHierarchyRules.CanManage(actor, target));
    }

    [Fact]
    public void Best_level_is_the_lowest_number_and_no_roles_ranks_last()
    {
        Assert.Equal(10, RoleHierarchyRules.BestLevel([40, 10, 30]));
        Assert.Equal(RoleHierarchyRules.NoRoleLevel, RoleHierarchyRules.BestLevel([]));
    }

    [Fact]
    public void New_roles_default_to_just_below_the_creator()
    {
        Assert.Equal(1, RoleHierarchyRules.DefaultLevelBelow(0));
        Assert.Equal(21, RoleHierarchyRules.DefaultLevelBelow(20));
        Assert.Equal(Role.MaxLevel, RoleHierarchyRules.DefaultLevelBelow(Role.MaxLevel));
    }

    [Theory]
    [InlineData(PermissionScope.Territory, PermissionScope.Team, true)]
    [InlineData(PermissionScope.Territory, PermissionScope.Territory, true)]
    [InlineData(PermissionScope.Territory, PermissionScope.All, false)]
    [InlineData(null, PermissionScope.Own, false)]
    public void A_held_scope_covers_equal_or_narrower_scopes(PermissionScope? held, PermissionScope requested, bool expected)
    {
        Assert.Equal(expected, RoleHierarchyRules.Covers(held, requested));
    }

    [Theory]
    [InlineData("Key account manager", "KeyAccountManager")]
    [InlineData("  QA   visitor ", "QAVisitor")]
    [InlineData("2nd line support", "Role2ndLineSupport")]
    [InlineData("مشرف", "Role")]
    public void Keys_are_generated_from_the_english_name(string name, string expected)
    {
        Assert.Equal(expected, RoleKeys.FromName(name));
    }

    [Fact]
    public void Generated_keys_get_a_suffix_when_taken()
    {
        var taken = new HashSet<string> { "QAVISITOR", "QAVISITOR2" };

        Assert.Equal("QAVisitor3", RoleKeys.MakeUnique("QAVisitor", taken));
        Assert.Equal("Trainer", RoleKeys.MakeUnique("Trainer", taken));
    }

    [Fact]
    public void Generated_keys_fit_the_column()
    {
        var key = RoleKeys.FromName(string.Join(' ', Enumerable.Repeat("verylongword", 20)));

        Assert.True(key.Length + 4 <= Role.KeyMaxLength);
    }
}

public class ReportingLineRulesTests
{
    private static readonly Guid Sales = Guid.NewGuid();
    private static readonly Guid Area = Guid.NewGuid();
    private static readonly Guid Supervisor = Guid.NewGuid();
    private static readonly Guid Rep = Guid.NewGuid();

    private static Dictionary<Guid, Guid?> Chain() => new()
    {
        [Sales] = null,
        [Area] = Sales,
        [Supervisor] = Area,
        [Rep] = Supervisor,
    };

    private static Dictionary<Guid, int> Levels() => new()
    {
        [Sales] = 10,
        [Area] = 20,
        [Supervisor] = 30,
        [Rep] = 40,
    };

    [Fact]
    public void Pointing_a_manager_at_someone_below_them_is_a_cycle()
    {
        Assert.True(ReportingLineRules.CreatesCycle(Chain(), Sales, Rep));
        Assert.True(ReportingLineRules.CreatesCycle(Chain(), Rep, Rep));
        Assert.False(ReportingLineRules.CreatesCycle(Chain(), Rep, Area));
    }

    [Fact]
    public void Existing_loops_in_the_data_do_not_hang_the_check()
    {
        var managers = new Dictionary<Guid, Guid?> { [Area] = Sales, [Sales] = Area };

        Assert.False(ReportingLineRules.CreatesCycle(managers, Rep, Area));
    }

    [Fact]
    public void A_valid_chain_has_no_invalid_links()
    {
        Assert.Empty(ReportingLineRules.FindInvalidLinks(Chain(), Levels(), new HashSet<Guid> { Sales, Area, Supervisor, Rep }));
    }

    [Fact]
    public void A_manager_on_the_same_level_is_invalid()
    {
        var levels = Levels();
        levels[Rep] = 30;

        var invalid = ReportingLineRules.FindInvalidLinks(Chain(), levels, new HashSet<Guid> { Rep });

        Assert.Equal([new ReportingLink(Rep, Supervisor)], invalid);
    }

    [Fact]
    public void Only_links_touching_the_changed_users_are_reported()
    {
        var levels = Levels();
        levels[Area] = 50; // breaks Supervisor -> Area and Area -> Sales is still fine

        Assert.Empty(ReportingLineRules.FindInvalidLinks(Chain(), levels, new HashSet<Guid> { Rep }));
        Assert.Equal([new ReportingLink(Supervisor, Area)], ReportingLineRules.FindInvalidLinks(Chain(), levels, new HashSet<Guid> { Area }));
    }
}

public class RoleValidatorTests
{
    [Fact]
    public void Create_requires_both_names_and_a_level_in_range()
    {
        var validator = new CreateRoleRequestValidator();

        Assert.True(validator.Validate(new CreateRoleRequest("مدرب", "Trainer")).IsValid);
        Assert.True(validator.Validate(new CreateRoleRequest("مدرب", "Trainer", Level: 35)).IsValid);

        var result = validator.Validate(new CreateRoleRequest(" ", "", Level: Role.MaxLevel + 1));
        Assert.Contains(result.Errors, e => e.PropertyName == nameof(CreateRoleRequest.NameAr));
        Assert.Contains(result.Errors, e => e.PropertyName == nameof(CreateRoleRequest.NameEn));
        Assert.Contains(result.Errors, e => e.PropertyName == nameof(CreateRoleRequest.Level));
    }

    [Fact]
    public void Update_rejects_long_names_and_negative_levels()
    {
        var validator = new UpdateRoleRequestValidator();
        var result = validator.Validate(new UpdateRoleRequest(new string('ا', Role.NameMaxLength + 1), "Trainer", null, -1));

        Assert.Contains(result.Errors, e => e.PropertyName == nameof(UpdateRoleRequest.NameAr));
        Assert.Contains(result.Errors, e => e.PropertyName == nameof(UpdateRoleRequest.Level));
    }

    [Fact]
    public void Audit_limit_is_bounded()
    {
        var validator = new RoleAuditQueryValidator();

        Assert.True(validator.Validate(new RoleAuditQuery(20)).IsValid);
        Assert.False(validator.Validate(new RoleAuditQuery(0)).IsValid);
        Assert.False(validator.Validate(new RoleAuditQuery(500)).IsValid);
    }

    [Fact]
    public void User_roles_need_at_least_one_role()
    {
        Assert.False(new SetUserRolesRequestValidator().Validate(new SetUserRolesRequest([])).IsValid);
        Assert.True(new SetUserRolesRequestValidator().Validate(new SetUserRolesRequest([DefaultRoles.Rep])).IsValid);
    }
}
