using System.Collections.Concurrent;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;

namespace Touchline;

public record MediaRequest(string Url);
public sealed class ClipMedia(IHttpClientFactory clients, TimeProvider clock)
{
    private readonly ConcurrentDictionary<string, (DateTimeOffset At, Media Media)> cache = new();
    public async Task<Media?> Resolve(string value, CancellationToken ct)
    {
        var safe = GoalParser.SafeMedia(value);
        if (safe?.Kind != "resolve") return null;
        if (cache.TryGetValue(safe.Url, out var existing) && clock.GetUtcNow() - existing.At < TimeSpan.FromMinutes(10)) return existing.Media;
        var client = clients.CreateClient("clip-metadata");
        var response = await client.GetAsync(safe.Url, HttpCompletionOption.ResponseHeadersRead, ct);
        for (var redirects = 0; (int)response.StatusCode is >= 300 and < 400 && redirects < 3; redirects++)
        {
            var location = response.Headers.Location;
            var next = location is null ? null : new Uri(response.RequestMessage?.RequestUri ?? new Uri(safe.Url), location);
            if (next is null || next.Port != 443 || GoalParser.SafeMedia(next.AbsoluteUri)?.Kind != "resolve") { response.Dispose(); return null; }
            response.Dispose();
            response = await client.GetAsync(next, HttpCompletionOption.ResponseHeadersRead, ct);
        }
        using var finalResponse = response;
        if (!response.IsSuccessStatusCode) return null;
        if (response.Content.Headers.ContentLength > 500_000) return null;
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var reader = new StreamReader(stream);
        var text = new StringBuilder(); var buffer = new char[4096];
        int count;
        while ((count = await reader.ReadAsync(buffer.AsMemory(), ct)) > 0)
        {
            text.Append(buffer, 0, count);
            if (text.Length > 500_000) return null;
        }
        var match = Regex.Match(text.ToString(), "<meta\\b[^>]*property=[\"']og:video(?::secure_url|:url)?[\"'][^>]*content=[\"'](?<url>[^\"']+)", RegexOptions.IgnoreCase);
        var target = WebUtility.HtmlDecode(match.Groups["url"].Value);
        if (!Uri.TryCreate(target, UriKind.Absolute, out var uri) || uri.Scheme != "https" || uri.Port != 443 || !string.IsNullOrEmpty(uri.UserInfo) ||
            !Regex.IsMatch(uri.Host, @"^[a-z]-cdn\.streamin\.top$") || !Regex.IsMatch(uri.AbsolutePath, @"^/uploads/[A-Za-z0-9]+\.mp4$")) return null;
        var media = new Media("video", uri.AbsoluteUri);
        if (cache.Count >= 128) foreach (var item in cache.OrderBy(item => item.Value.At).Take(16)) cache.TryRemove(item.Key, out _);
        cache[safe.Url] = (clock.GetUtcNow(), media);
        return media;
    }
}
