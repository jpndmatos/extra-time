using System.Net;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;

namespace Touchline;

public static class RedditFeed
{
    public static readonly DateTimeOffset Retirement = new(2026, 11, 13, 0, 0, 0, TimeSpan.Zero);
    public record Page(Goal[] Goals, string? After, int Count, bool ReachedCutoff);
    public static Goal[] Parse(string xml, DateTimeOffset now) => GoalParser.Group(ParsePage(xml, now).Goals);
    public static Page ParsePage(string xml, DateTimeOffset now)
    {
        using var input = new StringReader(xml);
        using var reader = XmlReader.Create(input, new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, MaxCharactersInDocument = 2_000_000 });
        var document = XDocument.Load(reader);
        XNamespace atom = "http://www.w3.org/2005/Atom";
        var goals = new List<Goal>();
        var entries = document.Descendants(atom + "entry").Take(100).ToArray();
        var reachedCutoff = false;
        string? after = null;
        foreach (var entry in entries)
        {
            var entryId = entry.Element(atom + "id")?.Value;
            if (entryId is not null && Regex.IsMatch(entryId, "^t3_[a-z0-9]+$")) after = entryId;
            var title = entry.Element(atom + "title")?.Value ?? "";
            if (!DateTimeOffset.TryParse(entry.Element(atom + "published")?.Value, out var published)) continue;
            if (published <= now.AddHours(-48)) { reachedCutoff = true; continue; }
            if (published > now.AddMinutes(5)) continue;
            var postUrl = GoalParser.RedditUrl(entry.Elements(atom + "link").FirstOrDefault(e => e.Attribute("rel")?.Value is null or "alternate")?.Attribute("href")?.Value ?? "");
            if (postUrl is null || !new Uri(postUrl).AbsolutePath.StartsWith("/r/soccer/comments/", StringComparison.OrdinalIgnoreCase)) continue;
            var content = entry.Element(atom + "content")?.Value ?? "";
            var link = Regex.Matches(content, "<a\\b[^>]*href=[\"'](?<url>[^\"']+)[\"'][^>]*>(?<text>.*?)</a>", RegexOptions.IgnoreCase | RegexOptions.Singleline)
                .FirstOrDefault(match => WebUtility.HtmlDecode(match.Groups["text"].Value).Trim() == "[link]")?.Groups["url"].Value;
            var id = entry.Element(atom + "id")?.Value.Replace("t3_", "", StringComparison.Ordinal) ?? "";
            if (!Regex.IsMatch(id, "^[a-z0-9]+$")) continue;
            var goal = GoalParser.Parse(id, title, published, postUrl, link is null ? null : WebUtility.HtmlDecode(link), allowUnknownTeams: true);
            if (goal is null) continue;
            var author = entry.Element(atom + "author")?.Element(atom + "name")?.Value.TrimStart('/');
            if (author?.StartsWith("u/", StringComparison.Ordinal) == true) author = author[2..].Trim();
            goals.Add(goal with { Author = author });
        }
        return new(goals.ToArray(), after, entries.Length, reachedCutoff);
    }
}
