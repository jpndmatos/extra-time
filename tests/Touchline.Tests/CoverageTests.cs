using Touchline;

namespace Touchline.Tests;

public class CoverageTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 4, 20, 0, 0, TimeSpan.Zero);
    private static Goal Post(string id, string title = "Preston [1]-0 Sheffield Utd - Player 18'") => GoalParser.Parse(id, title, Now, $"https://www.reddit.com/r/soccer/comments/{id}/", "https://streamable.com/abc123", true)!;
    [Theory]
    [InlineData("Benfica [1]-0 Porto - Player 18' (Great Goal)", "Great goal")]
    [InlineData("Benfica [1]-0 Porto - Player 18' SCREAMER", "Screamer")]
    [InlineData("Benfica [1]-0 Porto - Player 18' (great free-kick)", "Great free-kick")]
    [InlineData("Benfica [1]-0 Porto - Player 18' Golazo", "Golazo")]
    [InlineData("Benfica [1]-0 Porto - Player 18' bicycle kick", "Bicycle kick")]
    public void SpotlightComesFromPostTitle(string title, string label)
    {
        var goal = Post("tagged", title);
        Assert.Equal(label, goal.WatchReason); Assert.Equal(goal.SourceUrl, goal.WatchSourceUrl);
    }
    [Theory]
    [InlineData("Benfica [1]-0 Porto - Player 18'")]
    [InlineData("Benfica [1]-0 Porto - Player 18' (not a great goal)")]
    [InlineData("Benfica [1]-0 Porto - Player 18' isn't a screamer")]
    public void DoesNotInventQualityOrIgnoreNegation(string title) => Assert.Null(Post("plain", title).WatchReason);
    [Fact]
    public void HighlightTagSurvivesAlternatePostGroupingWithCorrectAttribution()
    {
        var first = Post("first"); var second = Post("second", first.Title + " (Great goal)");
        var goal = Assert.Single(GoalParser.Group([first, second]));
        Assert.Equal("Great goal", goal.WatchReason); Assert.Equal(second.SourceUrl, goal.WatchSourceUrl);
    }
    [Fact]
    public void DiscoversEveryPostedMatchWithoutInventingFixtureFacts()
    {
        var first = Post("first"); var second = Post("second", "Preston [2]-0 Sheffield Utd - Player 38'");
        var matches = MatchCoverage.Merge([], [first, second]); var match = Assert.Single(matches);
        Assert.Equal("reddit", match.Source); Assert.Equal("GOALS_AVAILABLE", match.Status);
        Assert.Null(match.HomeScore); Assert.Null(match.AwayScore);
        Assert.Equal(2, match.GoalIds?.Length);
        Assert.Equal(match.Id, Assert.Single(MatchCoverage.Merge([], [second, first])).Id);
    }
    [Fact]
    public void LinksAliasesToScheduledGameWithoutDuplicatingIt()
    {
        var goal = Post("goal");
        var fixture = new Fixture("real", "rss-preston-north-end-fc", "rss-sheffield-united-fc", "Preston North End FC", "Sheffield United FC", Now.AddHours(-1), "Championship", "FINISHED", 1, 0);
        var match = Assert.Single(MatchCoverage.Merge([fixture], [goal]));
        Assert.Equal("real", match.Id); Assert.Equal([goal.Id], match.GoalIds!); Assert.Equal("football-data", match.Source);
        Assert.Equal(2, MatchCoverage.Merge([fixture with { Kickoff = Now.AddDays(-2) }], [goal]).Length);
    }
    [Fact]
    public void CollectsEveryGoalFromTheSameMatchAcrossBetisAliases()
    {
        var first = Post("first", "Dortmund [1]-0 Betis - Player 49'");
        var equaliser = Post("second", "Borussia Dortmund 1-[1] Real Betis - Player 67'");
        var winner = Post("third", "Dortmund [2]-1 Real Betis Balompié - Player 72'");
        var fixture = Assert.Single(MatchCoverage.Merge([], [first, equaliser, winner]));
        Assert.Equal(3, fixture.GoalIds!.Length);
        Assert.Equal(3, fixture.GoalIds.Distinct().Count());
    }
    [Fact]
    public void KeepsAMidnightMatchTogetherButSeparatesTheNextMeeting()
    {
        var before = Post("before") with { PublishedAt = new DateTimeOffset(2026, 11, 3, 23, 40, 0, TimeSpan.Zero) };
        var after = Post("after", "Preston [2]-0 Sheffield Utd - Player 72'") with { PublishedAt = before.PublishedAt.AddMinutes(40) };
        var later = Post("later") with { PublishedAt = before.PublishedAt.AddHours(12) };
        var matches = MatchCoverage.Merge([], [later, after, before]);
        Assert.Equal(2, matches.Length);
        Assert.Equal(2, matches.Single(match => match.GoalIds!.Contains(before.Id)).GoalIds!.Length);
        Assert.Single(matches.Single(match => match.GoalIds!.Contains(later.Id)).GoalIds!);
        Assert.Equal(2, matches.Select(match => match.Id).Distinct().Count());
        var mirror = before with { Id = "mirror", SourceUrl = "https://www.reddit.com/r/soccer/comments/mirror/", PublishedAt = after.PublishedAt };
        Assert.Single(GoalParser.Group([before, mirror]));
        Assert.Equal(2, GoalParser.Group([before, later]).Length);
    }
    [Theory]
    [InlineData("Betis", "Real Betis Balompié")]
    [InlineData("Dortmund U19", "Borussia Dortmund U19")]
    [InlineData("Manchester Utd U21", "Manchester United U21")]
    [InlineData("Betis Women", "Real Betis Ladies")]
    public void ResolvesExactAliasesWithinTheSameTeamCategory(string a, string b) => Assert.Equal(ClubNames.Key(a), ClubNames.Key(b));
    [Theory]
    [InlineData("Dortmund", "Dortmund U19")]
    [InlineData("Betis Women", "Betis")]
    [InlineData("Dortmund U19", "Dortmund U21")]
    public void NeverCombinesDifferentTeamCategories(string a, string b) => Assert.NotEqual(ClubNames.Key(a), ClubNames.Key(b));
}
