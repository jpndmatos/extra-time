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
}
