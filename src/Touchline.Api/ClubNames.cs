using System.Text.RegularExpressions;

namespace Touchline;

public static class ClubNames
{
    private static readonly Dictionary<string, string> Known = Catalog.Teams
        .SelectMany(team => team.Aliases.Select(alias => (Name: GoalParser.Normalize(alias), team.Id)))
        .GroupBy(item => item.Name).ToDictionary(group => group.Key, group => group.First().Id);
    private static readonly Dictionary<string, string> Aliases = new()
    {
        ["lask linz"] = "lask", ["preston"] = "preston north end",
        ["sheffield utd"] = "sheffield united", ["west brom"] = "west bromwich albion",
        ["derby"] = "derby county", ["swansea"] = "swansea city",
        ["stoke"] = "stoke city", ["birmingham"] = "birmingham city",
        ["blackburn"] = "blackburn rovers", ["norwich"] = "norwich city"
    };
    public static string Key(string name)
    {
        var normalized = GoalParser.Normalize(name.Trim());
        if (Known.TryGetValue(normalized, out var id)) return id;
        var value = Regex.Replace(normalized, @"[^\p{L}\p{N}]+", " ").Trim();
        value = Regex.Replace(value, @"^(?:fc|afc|cf|sk|sc|fk|ac|as|pae|k)\s+|\s+(?:fc|afc|cf|sk|sc|fk|ac|as)$", "").Trim();
        return Aliases.GetValueOrDefault(value, value);
    }
}
