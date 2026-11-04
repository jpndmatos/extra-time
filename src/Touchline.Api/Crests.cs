using System.Text.Json;
using System.Text.RegularExpressions;

namespace Touchline;

public static class Crests
{
    private static readonly Dictionary<string, string> Aliases = new()
    {
        ["aek athens"] = "aek", ["feyenoord"] = "feyenoord rotterdam",
        ["shakhtar"] = "shakhtar donetsk", ["lens"] = "racing club de lens",
        ["betis"] = "real betis balompie", ["real betis"] = "real betis balompie",
        ["como"] = "como 1907", ["bolton"] = "bolton wanderers",
        ["cardiff"] = "cardiff city", ["charlton"] = "charlton athletic",
        ["lincoln"] = "lincoln city", ["qpr"] = "queens park rangers",
        ["bragantino"] = "rb bragantino", ["slavia prague"] = "slavia praha",
        ["stuttgart"] = "vfb stuttgart", ["west ham"] = "west ham united",
        ["wolves"] = "wolverhampton wanderers", ["manchester utd"] = "man-utd"
    };
    private static readonly Dictionary<string, string> Bundled = Load();
    private static Dictionary<string, string> Load()
    {
        using var stream = typeof(Crests).Assembly.GetManifestResourceStream("Touchline.crest-catalogue.json")!;
        using var data = JsonDocument.Parse(stream);
        return data.RootElement.EnumerateArray().GroupBy(item => Key(item.GetProperty("name").GetString()!))
            .ToDictionary(group => group.Key, group => "/crests/" + group.First().GetProperty("file").GetString());
    }
    // Display assets only: youth and women's teams keep their own identity.
    private static string Key(string name)
    {
        var parent = Regex.Replace(GoalParser.Normalize(name), @"\b(?:u[ -]?\d{2}|under[ -]?\d{2}|women(?:'s)?|ladies|feminino|feminina|frauen)\b|\(w\)", "");
        parent = Regex.Replace(parent, @"\s+(?:ii|b)$", "").Trim();
        var key = ClubNames.Key(parent);
        return Aliases.GetValueOrDefault(key, key);
    }
    public static Team[] Enrich(IEnumerable<Team> input)
    {
        var teams = input.ToArray();
        var available = teams.Where(team => !string.IsNullOrWhiteSpace(team.Crest))
            .GroupBy(team => Key(team.Name)).ToDictionary(group => group.Key, group => group.First().Crest);
        // Resolve display assets without changing persisted club IDs or follows.
        return teams.Select(team => team with { Crest = team.Crest ?? Bundled.GetValueOrDefault(Key(team.Name)) ??
            available.GetValueOrDefault(Key(team.Name)) }).ToArray();
    }
}
