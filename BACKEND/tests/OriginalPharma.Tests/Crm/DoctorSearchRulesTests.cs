using OriginalPharma.Application.Crm;
using OriginalPharma.Domain.Crm;

namespace OriginalPharma.Tests.Crm;

public sealed class DoctorSearchRulesTests
{
    [Theory]
    [InlineData("أحمد محمد", "احمد محمد")]
    [InlineData("إحمد", "احمد")]
    [InlineData("آمال", "امال")]
    [InlineData("ٱحمد", "احمد")]
    [InlineData("مُحَمَّد", "محمد")] // diacritics
    [InlineData("محـــمد", "محمد")] // tatweel
    [InlineData("مصطفى", "مصطفي")]
    [InlineData("فاطمة", "فاطمه")]
    [InlineData("مؤمن", "مومن")]
    [InlineData("هانئ", "هاني")]
    [InlineData("  أحمد \t  محمد  ", "احمد محمد")]
    [InlineData("د. أحمد فتحي", "احمد فتحي")]
    [InlineData("د.أحمد", "احمد")]
    [InlineData("د/ أحمد", "احمد")]
    [InlineData("د أحمد", "احمد")]
    [InlineData("دكتور أحمد", "احمد")]
    [InlineData("دكتورة منى", "مني")]
    [InlineData("Dr. Ahmed  Fathy", "ahmed fathy")]
    [InlineData("DR Ahmed", "ahmed")]
    [InlineData("dr.ahmed", "ahmed")]
    [InlineData("Drew Smith", "drew smith")] // "dr" inside a word is not a title
    [InlineData("دكتوراه", "دكتوراه")] // nor is "دكتور" inside a word
    [InlineData("د", "د")]
    [InlineData("", "")]
    [InlineData(null, "")]
    public void Names_are_normalized_for_search(string? name, string expected) =>
        Assert.Equal(expected, CustomerNameSearch.Normalize(name));

    [Fact]
    public void Every_hamza_form_of_a_name_finds_the_others()
    {
        var stored = CustomerNameSearch.Normalize("أحمد محمد");
        Assert.All(["احمد", "أحمد", "إحمد", "آحمد", "د. احمد"], text => Assert.StartsWith(CustomerNameSearch.Normalize(text), stored));
    }

    [Fact]
    public void A_doctor_entity_keeps_both_search_names()
    {
        var doctor = new Customer { Name = "Dr. Ahmed Fathy", NameAr = "د. أحمد فتحي" };
        doctor.RefreshNameSearch();
        Assert.Equal(("ahmed fathy", "احمد فتحي"), (doctor.NameSearch, doctor.NameArSearch));

        doctor.NameAr = "  ";
        doctor.RefreshNameSearch();
        Assert.Null(doctor.NameArSearch);
    }

    private static bool Matches(string start, string end, string? from, string? to, DayOfWeek? weekday = DayOfWeek.Saturday) =>
        DoctorAvailabilityRules.SlotMatches(weekday, DoctorAvailabilityRules.ParseTime(from), DoctorAvailabilityRules.ParseTime(to)).Compile()(
            new DoctorAvailability { Weekday = DayOfWeek.Saturday, StartTime = TimeOnly.Parse(start), EndTime = TimeOnly.Parse(end) });

    [Theory]
    // The example: searching 5:45 to 6:00.
    [InlineData("17:00", "18:00", true)] // ends with the search window
    [InlineData("17:00", "17:50", true)] // ends inside it
    [InlineData("16:00", "17:45", false)] // touches its start only
    [InlineData("18:00", "19:00", false)] // touches its end only
    [InlineData("17:00", "20:00", true)] // spans the whole window
    [InlineData("17:50", "17:55", true)] // fully inside it
    [InlineData("17:59", "19:00", true)] // starts in its last minute
    public void A_slot_matches_when_it_overlaps_the_search_window(string start, string end, bool expected) =>
        Assert.Equal(expected, Matches(start, end, "17:45", "18:00"));

    [Fact]
    public void Times_next_to_midnight_follow_the_same_rule()
    {
        Assert.True(Matches("00:00", "00:30", "00:00", "00:15"));
        Assert.False(Matches("00:00", "00:30", "00:30", "01:00"));
        Assert.True(Matches("23:00", "23:59", "23:30", "23:59"));
        Assert.False(Matches("22:00", "23:00", "23:00", "23:59"));
        Assert.False(Matches("23:00", "23:59", "23:59", null)); // the last minute is the slot's end
        Assert.True(Matches("00:00", "01:00", "00:00", null));
    }

    [Fact]
    public void With_one_end_only_from_means_available_at_that_minute_and_to_means_starting_before_it()
    {
        Assert.True(Matches("17:00", "18:00", "17:00", null));
        Assert.True(Matches("17:00", "18:00", "17:59", null));
        Assert.False(Matches("17:00", "18:00", "18:00", null));
        Assert.False(Matches("17:00", "18:00", "16:59", null)); // starts after that minute

        Assert.True(Matches("17:00", "18:00", null, "17:01"));
        Assert.False(Matches("17:00", "18:00", null, "17:00"));
    }

    [Fact]
    public void The_weekday_must_match_when_one_is_chosen()
    {
        Assert.False(Matches("17:00", "18:00", "17:45", "18:00", DayOfWeek.Sunday));
        Assert.True(Matches("17:00", "18:00", "17:45", "18:00", weekday: null));
        Assert.True(Matches("17:00", "18:00", null, null));
    }
}
