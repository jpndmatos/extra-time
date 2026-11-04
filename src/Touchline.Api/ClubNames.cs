using System.Text.RegularExpressions;
using System.Collections.Concurrent;

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
        ["blackburn"] = "blackburn rovers", ["norwich"] = "norwich city",
        ["aek athens"] = "aek", ["feyenoord"] = "feyenoord rotterdam",
        ["shakhtar"] = "shakhtar donetsk", ["lens"] = "racing club de lens",
        ["betis"] = "real betis", ["real betis balompie"] = "real betis",
        ["como"] = "como 1907", ["bolton"] = "bolton wanderers",
        ["cardiff"] = "cardiff city", ["charlton"] = "charlton athletic",
        ["lincoln"] = "lincoln city", ["qpr"] = "queens park rangers",
        ["bragantino"] = "rb bragantino", ["slavia prague"] = "slavia praha",
        ["stuttgart"] = "vfb stuttgart", ["west ham"] = "west ham united",
        ["wolves"] = "wolverhampton wanderers", ["manchester utd"] = "man-utd",
        ["atletico pr"] = "ca paranaense", ["athletico pr"] = "ca paranaense",
        ["athletico paranaense"] = "ca paranaense", ["vasco"] = "cr vasco da gama"
    };
    private static readonly Regex Category = new(@"\b(?:u[ -]?\d{2}|under[ -]?\d{2}|women(?:'s)?|ladies|feminino|feminina|frauen)\b|\(w\)", RegexOptions.CultureInvariant);
    private static readonly ConcurrentDictionary<string, string> Keys = new(StringComparer.Ordinal);
    public static string Key(string name)
    {
        var normalized = GoalParser.Normalize(name.Trim());
        if (Keys.TryGetValue(normalized, out var cached)) return cached;
        var categories = Category.Matches(normalized).Select(match =>
            Regex.IsMatch(match.Value, @"^(?:u|under)[ -]?\d") ? Regex.Replace(match.Value, @"^(?:under|u)[ -]?", "u") : "women")
            .Distinct().Order().ToArray();
        var parent = Regex.Replace(Category.Replace(normalized, " "), @"\s+", " ").Trim();
        var key = BaseKey(parent) + (categories.Length == 0 ? "" : " " + string.Join(" ", categories));
        if (Keys.Count >= 512) Keys.Clear();
        Keys.TryAdd(normalized, key);
        return key;
    }
    private static string BaseKey(string normalized)
    {
        if (Known.TryGetValue(normalized, out var id)) return id;
        var value = Regex.Replace(normalized, @"[^\p{L}\p{N}]+", " ").Trim();
        value = Regex.Replace(value, @"^(?:fc|afc|cf|sk|sc|fk|ac|as|pae|k)\s+|\s+(?:fc|afc|cf|sk|sc|fk|ac|as)$", "").Trim();
        if (Known.TryGetValue(value, out id)) return id;
        return Aliases.GetValueOrDefault(value, value);
    }
}
