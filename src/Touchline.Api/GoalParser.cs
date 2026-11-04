using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace Touchline;

public static partial class GoalParser
{
    [GeneratedRegex(@"(?<home>\[?\d{1,2}\]?)\s*[-–:]\s*(?<away>\[?\d{1,2}\]?)")]
    private static partial Regex Score();
    [GeneratedRegex(@"(?<minute>\d{1,3}(?:\s*['’′]?\s*\+\s*\d{1,2})?)\s*['’′]")]
    private static partial Regex Minute();
    [GeneratedRegex(@"\b(disallowed|offside|missed|misses|penalty shootout|penalty save|no goal|ruled out|highlights|match thread|post.match)\b", RegexOptions.IgnoreCase)]
    private static partial Regex Excluded();
    [GeneratedRegex(@"^/r/[^/]+/comments/(?<id>[a-z0-9]+)(?:/|$)", RegexOptions.IgnoreCase)]
    private static partial Regex RedditPath();

    public static string Normalize(string value) => string.Concat(value.Normalize(NormalizationForm.FormD)
        .Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)).ToLowerInvariant();

    public static Goal? Parse(string id, string title, DateTimeOffset published, string source, string? clipUrl, bool allowUnknownTeams = false)
    {
        if (title.Length > 500 || Excluded().IsMatch(title)) return null;
        var score = Score().Match(title);
        if (!score.Success) return null;
        // A goal post names a side on each side of the score. Matching aliases as
        // complete words prevents Inter matching "international" or Milan matching Inter Milan.
        var left = title[..score.Index];
        var right = title[(score.Index + score.Length)..];
        var home = FindTeam(left);
        var away = FindTeam(right);
        if (allowUnknownTeams)
        {
            // RSS supplies public post titles, including clubs outside the seed
            // catalogue. Require a clean team/score/team - scorer/minute shape.
            var opponent = Regex.Match(right, @"^(?<team>.+?)\s+[-–—|]\s+.+$");
            var homeText = Regex.Replace(left, @"^\s*\[[^\]]+\]\s*", "").Trim();
            var awayText = opponent.Success ? opponent.Groups["team"].Value.Trim() : "";
            if (!IsTeamName(homeText) || !IsTeamName(awayText)) return null;
            home = Catalog.ByName(homeText) ?? Catalog.FromName(homeText);
            away = Catalog.ByName(awayText) ?? Catalog.FromName(awayText);
        }
        if (home is null || away is null || home.Id == away.Id) return null;
        var h = int.Parse(score.Groups["home"].Value.Trim('[', ']'), CultureInfo.InvariantCulture);
        var a = int.Parse(score.Groups["away"].Value.Trim('[', ']'), CultureInfo.InvariantCulture);
        if (h + a == 0) return null;
        var minute = Minute().Match(right);
        // A score alone can also be a match-thread title. Require a goal minute.
        if (!minute.Success) return null;
        var scorer = right[..minute.Index];
        foreach (var alias in away.Aliases.OrderByDescending(x => x.Length))
            scorer = Regex.Replace(scorer, Regex.Escape(alias), "", RegexOptions.IgnoreCase);
        scorer = scorer.Trim(' ', '-', '–', ':', '|', '(', ')', '[', ']');
        if (scorer.Length == 0) scorer = "Goal";
        var minuteText = Regex.Replace(minute.Groups["minute"].Value, @"[\s'’′]", "");
        return new(id, title, home.Id, away.Id, h, a, scorer, minuteText,
            published, source, SafeMedia(clipUrl), [], false, home.Name, away.Name);
    }

    private static bool IsTeamName(string value) => value.Length is >= 2 and <= 90 &&
        Regex.IsMatch(value, @"^[\p{L}\p{N} .&'’/()_-]+$") && Regex.IsMatch(value, @"\p{L}");

    private static Team? FindTeam(string text)
    {
        var normalized = Normalize(text);
        return Catalog.Teams.SelectMany(t => t.Aliases.Select(a => (Team: t, Alias: Normalize(a))))
            .OrderByDescending(x => x.Alias.Length)
            .FirstOrDefault(x => Regex.IsMatch(normalized, @"(?<![\p{L}\p{N}])" + Regex.Escape(x.Alias) + @"(?![\p{L}\p{N}])")).Team;
    }

    public static string? RedditUrl(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme != "https" ||
            uri.Host is not ("reddit.com" or "www.reddit.com" or "old.reddit.com")) return null;
        if (!RedditPath().IsMatch(uri.AbsolutePath)) return null;
        return "https://www.reddit.com" + uri.AbsolutePath.TrimEnd('/') + "/";
    }

    public static Media? SafeMedia(string? value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme != "https" || uri.Port != 443 || !string.IsNullOrEmpty(uri.UserInfo)) return null;
        var path = uri.AbsolutePath.Trim('/');
        if (uri.Host is "streama.in" or "streamain.com")
        {
            var match = Regex.Match(path, @"^(?:en/)?(?<id>[A-Za-z0-9]{8,40})/watch$");
            if (!match.Success) match = Regex.Match(path, @"^embed/(?<id>[A-Za-z0-9]{8,40})$");
            if (match.Success) return new("embed", "https://streamain.com/embed/" + match.Groups["id"].Value);
        }
        if (uri.Host is "streamin.link" or "streamin.me" && Regex.IsMatch(path, @"^v/[a-zA-Z0-9]{6,40}$"))
            return new("resolve", uri.GetLeftPart(UriPartial.Path));
        if (uri.Host is "streamable.com" or "www.streamable.com")
        {
            var id = path.StartsWith("e/", StringComparison.Ordinal) ? path[2..] : path;
            if (Regex.IsMatch(id, "^[a-zA-Z0-9]{3,20}$")) return new("embed", "https://streamable.com/e/" + id);
        }
        string? youtubeId = null;
        if (uri.Host == "youtu.be") youtubeId = path;
        if (uri.Host is "www.youtube.com" or "youtube.com")
        {
            if (path.StartsWith("embed/", StringComparison.Ordinal)) youtubeId = path[6..];
            else youtubeId = Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(uri.Query).GetValueOrDefault("v").ToString();
        }
        if (youtubeId is not null && Regex.IsMatch(youtubeId, "^[a-zA-Z0-9_-]{11}$"))
            return new("embed", "https://www.youtube-nocookie.com/embed/" + youtubeId);
        // Providers that don't explicitly support embedding remain source links.
        // No arbitrary iframe HTML, URL fetching, video downloading or rehosting.
        return null;
    }

    public static Goal[] Group(IEnumerable<Goal> goals) => goals
        .GroupBy(g => $"{g.HomeId}:{g.AwayId}:{g.PublishedAt.UtcDateTime:yyyy-MM-dd}:{g.HomeScore}:{g.AwayScore}:{g.Minute}")
        .Select(group =>
        {
            var ordered = group.OrderByDescending(g => g.Media is not null).ThenBy(g => g.PublishedAt).ToArray();
            var first = ordered[0];
            var mirrors = ordered.SelectMany(g => (g.Media is null ? Array.Empty<ClipSource>() : [new ClipSource(g.Media, g.SourceUrl)])
                .Concat(g.Mirrors ?? []))
                .Where(source => SafeMedia(source.Media.Url) is not null && RedditUrl(source.SourceUrl) is not null)
                .DistinctBy(source => source.Media.Url).Take(12).ToArray();
            return first with {
                Alternatives = ordered.SelectMany(g => g.Alternatives.Prepend(g.SourceUrl)).Where(x => x != first.SourceUrl).Distinct().ToArray(),
                Mirrors = mirrors
            };
        }).OrderByDescending(g => g.PublishedAt).ToArray();
}
