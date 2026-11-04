using System.Collections.Concurrent;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;

namespace Touchline;

public record MediaRequest(string Url, bool Refresh = false);
public sealed class ClipMedia(IHttpClientFactory clients, TimeProvider clock)
{
    private readonly ConcurrentDictionary<string, (DateTimeOffset At, Media Media)> cache = new();
    private readonly ConcurrentDictionary<string, DateTimeOffset> failed = new();
    private readonly ConcurrentDictionary<string, Lazy<Task<Media?>>> pending = new();
    private readonly SemaphoreSlim slots = new(4, 4);
    public async Task<Media?> Resolve(string value, CancellationToken ct, bool refresh = false)
    {
        var safe = GoalParser.SafeMedia(value);
        if (safe?.Kind != "resolve") return null;
        if (refresh) { cache.TryRemove(safe.Url, out _); failed.TryRemove(safe.Url, out _); }
        if (cache.TryGetValue(safe.Url, out var existing) && clock.GetUtcNow() - existing.At < TimeSpan.FromMinutes(10)) return existing.Media;
        if (failed.TryGetValue(safe.Url, out var failure) && clock.GetUtcNow() - failure < TimeSpan.FromSeconds(30)) return null;
        // One shared lookup per clip. A departing viewer cancels only their wait.
        var operation = pending.GetOrAdd(safe.Url, url => new Lazy<Task<Media?>>(() => FetchShared(url)));
        return await operation.Value.WaitAsync(ct);
    }
    private async Task<Media?> FetchShared(string url)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(12));
        var entered = false;
        try
        {
            await slots.WaitAsync(deadline.Token); entered = true;
            var result = await Fetch(url, deadline.Token);
            if (result is null) RememberFailure(url);
            return result;
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException)
        { RememberFailure(url); throw; }
        finally { if (entered) slots.Release(); pending.TryRemove(url, out _); }
    }
    private void RememberFailure(string url)
    {
        if (failed.Count >= 128) foreach (var item in failed.OrderBy(item => item.Value).Take(16)) failed.TryRemove(item.Key, out _);
        failed[url] = clock.GetUtcNow();
    }
    private async Task<Media?> Fetch(string value, CancellationToken ct)
    {
        var client = clients.CreateClient("clip-metadata");
        var response = await client.GetAsync(value, HttpCompletionOption.ResponseHeadersRead, ct);
        for (var redirects = 0; (int)response.StatusCode is >= 300 and < 400 && redirects < 3; redirects++)
        {
            var location = response.Headers.Location;
            var next = location is null ? null : new Uri(response.RequestMessage?.RequestUri ?? new Uri(value), location);
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
        cache[value] = (clock.GetUtcNow(), media);
        return media;
    }
}
