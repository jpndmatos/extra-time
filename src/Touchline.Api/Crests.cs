using System.Text.Json;
using System.Text.RegularExpressions;

namespace Touchline;

public static class Crests
{
    private static readonly Dictionary<string, string> Bundled = Load();
    private static Dictionary<string, string> Load()
    {
        using var stream = typeof(Crests).Assembly.GetManifestResourceStream("Touchline.crest-catalogue.json")!;
        using var data = JsonDocument.Parse(stream);
        return data.RootElement.EnumerateArray().GroupBy(item => Key(item.GetProperty("name").GetString()!))
            .ToDictionary(group => group.Key, group => "/crests/" + group.OrderBy(item => item.TryGetProperty("source", out _) ? 1 : 0).First().GetProperty("file").GetString());
    }
    // Display assets only: youth and women's teams keep their own identity.
    private static string Key(string name)
    {
        var parent = Regex.Replace(GoalParser.Normalize(name), @"\b(?:u[ -]?\d{2}|under[ -]?\d{2}|women(?:'s)?|ladies|feminino|feminina|frauen)\b|\(w\)", "");
        parent = Regex.Replace(parent, @"\s+(?:ii|b)$", "").Trim();
        return ClubNames.Key(parent);
    }
    public static Team[] Enrich(IEnumerable<Team> input)
    {
        var teams = input.ToArray();
        var available = teams.Where(team => !string.IsNullOrWhiteSpace(team.Crest))
            .GroupBy(team => Key(team.Name)).ToDictionary(group => group.Key, group => group.First().Crest);
        // Resolve display assets without changing persisted club IDs or follows.
        return teams.Select(team => {
            var local = Bundled.GetValueOrDefault(Key(team.Name));
            return team with {
                Crest = team.Crest ?? local ?? available.GetValueOrDefault(Key(team.Name)),
                CrestFallback = local
            };
        }).ToArray();
    }
}
