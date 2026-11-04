using System.Security.Cryptography;
using System.Text;

namespace Touchline;

public static class MatchCoverage
{
    public static Fixture[] Merge(Fixture[] fixtures, Goal[] goals)
    {
        var assigned = new Dictionary<string, List<Goal>>();
        var fixtureGroups = fixtures.GroupBy(match => (ClubNames.Key(match.HomeName), ClubNames.Key(match.AwayName)))
            .ToDictionary(group => group.Key, group => group.ToArray());
        var unmatched = new List<Goal>();
        foreach (var goal in goals)
        {
            var home = ClubNames.Key(goal.HomeName ?? Catalog.Find(goal.HomeId)?.Name ?? goal.HomeId);
            var away = ClubNames.Key(goal.AwayName ?? Catalog.Find(goal.AwayId)?.Name ?? goal.AwayId);
            var fixture = fixtureGroups.GetValueOrDefault((home, away), []).Where(match => Math.Abs((goal.PublishedAt - match.Kickoff).TotalHours) <= 8)
                .OrderBy(match => Math.Abs((goal.PublishedAt - match.Kickoff).TotalHours)).FirstOrDefault();
            if (fixture is null) unmatched.Add(goal);
            else { if (!assigned.TryGetValue(fixture.Id, out var clips)) assigned[fixture.Id] = clips = []; clips.Add(goal); }
        }
        var merged = fixtures.Select(match => match with { Source = "football-data", GoalIds = assigned.GetValueOrDefault(match.Id, []).Select(goal => goal.Id).ToArray() });
        var discovered = unmatched.GroupBy(goal => $"{ClubNames.Key(goal.HomeName ?? goal.HomeId)}:{ClubNames.Key(goal.AwayName ?? goal.AwayId)}:{goal.PublishedAt.UtcDateTime:yyyy-MM-dd}")
            .Select(group => {
                var posts = group.OrderByDescending(goal => goal.PublishedAt).ToArray(); var first = posts[0];
                var id = "reddit-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(group.Key)))[..16].ToLowerInvariant();
                return new Fixture(id, first.HomeId, first.AwayId, first.HomeName ?? first.HomeId, first.AwayName ?? first.AwayId,
                    posts.Min(goal => goal.PublishedAt), "r/soccer goal posts", "GOALS_AVAILABLE", null, null, Source: "reddit", GoalIds: posts.Select(goal => goal.Id).ToArray());
            });
        return merged.Concat(discovered).ToArray();
    }
}
