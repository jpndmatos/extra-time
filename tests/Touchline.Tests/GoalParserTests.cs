using Touchline;

namespace Touchline.Tests;

public class GoalParserTests
{
    [Theory]
    [InlineData("Benfica [1]-0 FC Porto - Player 18'", "benfica", "porto", "18")]
    [InlineData("Arsenal 0-[1] Liverpool - Mo Salah 90+2'", "arsenal", "liverpool", "90+2")]
    [InlineData("Atlético Madrid [2]–1 Barcelona - Player 62’", "atletico", "barcelona", "62")]
    [InlineData("Inter Milan [1]-0 AC Milan - Player 20'", "inter", "milan", "20")]
    public void RecognizesTeamsScoresAndStoppageTime(string title, string home, string away, string minute)
    {
        var goal = GoalParser.Parse("id", title, DateTimeOffset.UtcNow, "https://www.reddit.com/r/soccer/comments/abc123/", null);
        Assert.NotNull(goal); Assert.Equal(home, goal.HomeId); Assert.Equal(away, goal.AwayId); Assert.Equal(minute, goal.Minute);
    }
    [Theory]
    [InlineData("Benfica [1]-0 Roma - Romano Floriani 18'", "Romano Floriani")]
    [InlineData("Chelsea 0-[1] Arsenal - Arsenal Campbell (pen.) 42'", "Arsenal Campbell (pen.)")]
    [InlineData("Porto [1]-0 Inter - Winter Santos 18'", "Winter Santos")]
    public void RemovesOnlyTheOpponentPrefixWithoutDamagingScorerNames(string title, string expected)
    {
        var goal = GoalParser.Parse("name", title, DateTimeOffset.UtcNow, "", null, true);
        Assert.NotNull(goal); Assert.Equal(expected, goal.Scorer);
    }
    [Fact]
    public void GroupsTheSameGoalAcrossClubAliasesWithoutCombiningYouthTeams()
    {
        var now = DateTimeOffset.UtcNow;
        var first = GoalParser.Parse("first", "Dortmund [1]-0 Betis - Player 49'", now, "https://www.reddit.com/r/soccer/comments/first/", "https://streamable.com/firstclip", true)!;
        var mirror = GoalParser.Parse("mirror", "Borussia Dortmund [1]-0 Real Betis - Player 49'", now, "https://www.reddit.com/r/soccer/comments/mirror/", "https://streamable.com/otherclip", true)!;
        var youth = GoalParser.Parse("youth", "Dortmund U19 [1]-0 Betis U19 - Player 49'", now, "https://www.reddit.com/r/soccer/comments/youth/", "https://streamable.com/youthclip", true)!;
        var grouped = GoalParser.Group([first, mirror, youth]);
        Assert.Equal(2, grouped.Length);
        Assert.Equal(2, grouped.Single(goal => goal.Id == "first").Mirrors!.Length);
    }
    [Theory]
    [InlineData("Benfica 1-0 Porto - Player 18' disallowed")]
    [InlineData("Arsenal 1-0 Liverpool - Player misses 18'")]
    [InlineData("Arsenal 0-0 Liverpool - Player 18'")]
    [InlineData("International [1]-0 Barcelona - Player 18'")]
    [InlineData("Arsenal 1-0 Liverpool full time")]
    [InlineData("Highlights Arsenal 1-0 Liverpool 90'")]
    public void RejectsNonGoalsAndPartialAliases(string title) => Assert.Null(GoalParser.Parse("id", title, DateTimeOffset.UtcNow, "", null));

    [Theory]
    [InlineData("https://streamable.com/abc123", "https://streamable.com/e/abc123")]
    [InlineData("https://youtu.be/abcdefghijk", "https://www.youtube-nocookie.com/embed/abcdefghijk")]
    public void ConstructsEmbedsFromAllowedIdentifiers(string input, string expected) => Assert.Equal(expected, GoalParser.SafeMedia(input)?.Url);
    [Theory]
    [InlineData("https://streamable.com.evil.test/abc123")]
    [InlineData("http://streamable.com/abc123")]
    [InlineData("https://127.0.0.1/secret")]
    [InlineData("javascript:alert(1)")]
    public void RejectsUntrustedMediaUrls(string input) => Assert.Null(GoalParser.SafeMedia(input));

    [Fact]
    public void GroupsAlternatePostsAndPrefersPlayableClip()
    {
        var first = GoalParser.Parse("1", "Benfica [1]-0 Porto - Player 18'", DateTimeOffset.UtcNow, "https://www.reddit.com/r/soccer/comments/abc123/", null)!;
        var second = first with { Id = "2", SourceUrl = "https://www.reddit.com/r/soccer/comments/def456/", Media = new("embed", "https://streamable.com/e/abc123") };
        var grouped = Assert.Single(GoalParser.Group([first, second]));
        Assert.Equal("2", grouped.Id); Assert.Equal([first.SourceUrl], grouped.Alternatives);
        Assert.Equal(2, GoalParser.Group([first, second with { Minute = "25" }]).Length);
    }

    [Fact]
    public void GroupingPreservesDistinctVideoMirrorsAndTheirPostsAcrossRefreshes()
    {
        var first = GoalParser.Parse("1", "Benfica [1]-0 Porto - Player 18'", DateTimeOffset.UtcNow, "https://www.reddit.com/r/soccer/comments/abc123/", "https://streamable.com/firstclip")!;
        var second = first with { Id = "2", SourceUrl = "https://www.reddit.com/r/soccer/comments/def456/", Media = new("resolve", "https://streamin.link/v/abcdef12") };
        var duplicate = second with { Id = "3", SourceUrl = "https://www.reddit.com/r/soccer/comments/ghi789/" };
        var grouped = Assert.Single(GoalParser.Group([first, second, duplicate]));
        Assert.Equal(2, grouped.Mirrors?.Length);
        Assert.Equal(second.SourceUrl, grouped.Mirrors![1].SourceUrl);
        var refreshed = Assert.Single(GoalParser.Group([grouped, second]));
        Assert.Equal(2, refreshed.Mirrors?.Length); Assert.Equal(2, refreshed.Alternatives.Length);
        Assert.Equal(2, GoalParser.Group([first, second with { Minute = "25" }]).Length);
    }
}
