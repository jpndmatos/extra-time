namespace Touchline;

public static class Crests
{
    private static readonly Dictionary<string, int> SeedIds = new()
    {
        ["benfica"] = 1903, ["porto"] = 503, ["sporting"] = 498, ["braga"] = 5613,
        ["arsenal"] = 57, ["liverpool"] = 64, ["chelsea"] = 61, ["man-city"] = 65,
        ["man-utd"] = 66, ["tottenham"] = 73, ["newcastle"] = 67, ["aston-villa"] = 58,
        ["real-madrid"] = 86, ["barcelona"] = 81, ["atletico"] = 78, ["psg"] = 524,
        ["marseille"] = 516, ["bayern"] = 5, ["dortmund"] = 4, ["leverkusen"] = 3,
        ["inter"] = 108, ["milan"] = 98, ["juventus"] = 109, ["napoli"] = 113
    };
    public static Team[] Enrich(IEnumerable<Team> input)
    {
        var teams = input.ToArray();
        var available = teams.Where(team => !string.IsNullOrWhiteSpace(team.Crest))
            .GroupBy(team => ClubNames.Key(team.Name)).ToDictionary(group => group.Key, group => group.First().Crest);
        // Resolve display assets without changing persisted club IDs or follows.
        return teams.Select(team => team with { Crest = team.Crest ?? available.GetValueOrDefault(ClubNames.Key(team.Name)) ??
            (SeedIds.TryGetValue(team.Id, out var id) ? $"https://crests.football-data.org/{id}.png" : null) }).ToArray();
    }
}
