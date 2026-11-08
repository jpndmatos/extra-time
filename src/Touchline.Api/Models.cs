using System.Text.Json;

namespace Touchline;

public record Team(string Id, string Name, string ShortName, string Country, string[] Aliases, string? Crest = null, string? CrestFallback = null);
public record Fixture(string Id, string HomeId, string AwayId, string HomeName, string AwayName,
    DateTimeOffset Kickoff, string Competition, string Status, int? HomeScore, int? AwayScore, bool Sample = false, string? HomeCrest = null, string? AwayCrest = null, string? Source = null, string[]? GoalIds = null);
public record Media(string Kind, string Url);
public record ClipSource(Media Media, string SourceUrl);
public record Goal(string Id, string Title, string HomeId, string AwayId, int HomeScore, int AwayScore,
    string Scorer, string? Minute, DateTimeOffset PublishedAt, string SourceUrl, Media? Media,
    string[] Alternatives, bool Sample = false, string? HomeName = null, string? AwayName = null, string? Author = null, ClipSource[]? Mirrors = null, string? WatchReason = null, string? WatchSourceUrl = null);
public record ProviderStatus(string Name, string State, string Message, DateTimeOffset? UpdatedAt = null);
public record Dashboard(Team[] Teams, Fixture[] Matches, Goal[] Goals, ProviderStatus[] Sources, DateTimeOffset UpdatedAt, bool Sample);
public record Preferences(string[] Teams, string[] Matches, bool Spoilers, string[] Watched)
{
    public static Preferences Empty => new([], [], false, []);
}
public record ClipInput(string Title, string RedditUrl, string? ClipUrl);
public record ProviderResult<T>(T[] Items, ProviderStatus Status);

public static class Catalog
{
    public static readonly Team[] Teams = [
        new("benfica", "Benfica", "SLB", "Portugal", ["Benfica", "SL Benfica", "Sport Lisboa e Benfica"]),
        new("porto", "FC Porto", "POR", "Portugal", ["FC Porto", "Porto"]),
        new("sporting", "Sporting CP", "SCP", "Portugal", ["Sporting CP", "Sporting Lisbon", "Sporting Clube de Portugal", "Sporting"]),
        new("braga", "SC Braga", "BRA", "Portugal", ["SC Braga", "Sporting Braga", "Braga"]),
        new("arsenal", "Arsenal", "ARS", "England", ["Arsenal FC", "Arsenal"]),
        new("liverpool", "Liverpool", "LIV", "England", ["Liverpool FC", "Liverpool"]),
        new("chelsea", "Chelsea", "CHE", "England", ["Chelsea FC", "Chelsea"]),
        new("man-city", "Manchester City", "MCI", "England", ["Manchester City FC", "Manchester City", "Man City"]),
        new("man-utd", "Manchester United", "MUN", "England", ["Manchester United FC", "Manchester United", "Man United", "Man Utd"]),
        new("tottenham", "Tottenham", "TOT", "England", ["Tottenham Hotspur FC", "Tottenham Hotspur", "Tottenham", "Spurs"]),
        new("newcastle", "Newcastle United", "NEW", "England", ["Newcastle United FC", "Newcastle United", "Newcastle"]),
        new("aston-villa", "Aston Villa", "AVL", "England", ["Aston Villa FC", "Aston Villa"]),
        new("real-madrid", "Real Madrid", "RMA", "Spain", ["Real Madrid CF", "Real Madrid"]),
        new("barcelona", "Barcelona", "BAR", "Spain", ["FC Barcelona", "Barcelona", "Barça"]),
        new("atletico", "Atlético Madrid", "ATM", "Spain", ["Club Atlético de Madrid", "Atlético Madrid", "Atletico Madrid", "Atletico de Madrid"]),
        new("psg", "Paris Saint-Germain", "PSG", "France", ["Paris Saint-Germain FC", "Paris Saint-Germain", "PSG"]),
        new("marseille", "Marseille", "OM", "France", ["Olympique de Marseille", "Marseille"]),
        new("bayern", "Bayern Munich", "BAY", "Germany", ["FC Bayern München", "Bayern Munich", "Bayern München", "Bayern"]),
        new("dortmund", "Borussia Dortmund", "BVB", "Germany", ["Borussia Dortmund", "Dortmund"]),
        new("leverkusen", "Bayer Leverkusen", "B04", "Germany", ["Bayer 04 Leverkusen", "Bayer Leverkusen", "Leverkusen"]),
        new("inter", "Inter Milan", "INT", "Italy", ["FC Internazionale Milano", "Internazionale", "Inter Milan", "Inter"]),
        new("milan", "AC Milan", "MIL", "Italy", ["AC Milan", "A.C. Milan"]),
        new("juventus", "Juventus", "JUV", "Italy", ["Juventus FC", "Juventus"]),
        new("napoli", "Napoli", "NAP", "Italy", ["SSC Napoli", "Napoli"])
    ];

    public static Team? Find(string id) => Teams.FirstOrDefault(t => t.Id == id);
    public static Team? ByName(string name) => Teams.FirstOrDefault(t =>
        t.Aliases.Any(a => GoalParser.Normalize(a) == GoalParser.Normalize(name)));

    public static Team FromName(string name)
    {
        var known = ByName(name);
        if (known is not null) return known;
        var clean = name.Trim();
        var slug = System.Text.RegularExpressions.Regex.Replace(GoalParser.Normalize(clean), @"[^\p{L}\p{N}]+", "-").Trim('-');
        var id = "rss-" + slug;
        var code = string.Concat(clean.Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(word => word[0])).ToUpperInvariant();
        if (code.Length < 2) code = clean[..Math.Min(3, clean.Length)].ToUpperInvariant();
        return new(id, clean, code[..Math.Min(4, code.Length)], "Other clubs", [clean]);
    }
    public static bool ValidId(string id) => Find(id) is not null || System.Text.RegularExpressions.Regex.IsMatch(id, @"^rss-[\p{L}\p{N}-]{1,90}$");
}

public static class JsonDefaults
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);
}
