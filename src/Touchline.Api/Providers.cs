using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace Touchline;

public sealed class Providers(IHttpClientFactory clients, IConfiguration config, TimeProvider clock)
{
    private readonly SemaphoreSlim gate = new(1, 1);
    private readonly Dictionary<string, (DateTimeOffset At, Fixture[] Items)> fixtures = [];
    private Goal[] goals = [];
    private DateTimeOffset? goalsAt;
    private string? token;
    private DateTimeOffset tokenUntil;
    private readonly Dictionary<string, (DateTimeOffset At, ProviderResult<Fixture> Result)> fixtureResults = [];
    private (DateTimeOffset At, ProviderResult<Goal> Result)? redditResult;
    private DateTimeOffset? lastFootballRequest;

    private TimeSpan FixtureTtl(DateOnly day) => day == DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime)
        ? TimeSpan.FromSeconds(30) : TimeSpan.FromMinutes(5);
    private static TimeSpan ResultTtl(ProviderStatus status, TimeSpan normal) => status.State switch
    {
        "error" => TimeSpan.FromMinutes(2),
        "waiting" => TimeSpan.FromSeconds(2),
        _ => normal
    };

    public async Task<Dashboard> Dashboard(DateOnly day, Store store, CancellationToken ct)
    {
        // A single shared cache prevents one upstream request for every browser/tab.
        await gate.WaitAsync(ct);
        try
        {
            var key = day.ToString("yyyy-MM-dd");
            if (!fixtureResults.TryGetValue(key, out var result) || clock.GetUtcNow() - result.At >= ResultTtl(result.Result.Status, FixtureTtl(day)))
            {
                result = (clock.GetUtcNow(), await Football(day, ct));
                if (fixtureResults.Count >= 8) fixtureResults.Remove(fixtureResults.OrderBy(x => x.Value.At).First().Key);
                fixtureResults[key] = result;
            }
            var matches = result.Result;
            var redditTtl = TimeSpan.FromSeconds(config.GetValue<bool>("Reddit:Enabled") ? 45 : 120);
            if (redditResult is null || clock.GetUtcNow() - redditResult.Value.At >= ResultTtl(redditResult.Value.Result.Status, redditTtl))
                redditResult = (clock.GetUtcNow(), await Reddit(ct));
            var clips = redditResult.Value.Result;
            var allGoals = GoalParser.Group(clips.Items.Concat(store.Clips()));
            var teams = matches.Items.SelectMany(match => new[] { Catalog.FromName(match.HomeName) with { Crest = match.HomeCrest }, Catalog.FromName(match.AwayName) with { Crest = match.AwayCrest } }).Concat(Catalog.Teams)
                .Concat(allGoals.SelectMany(goal => new[] { Catalog.FromName(goal.HomeName ?? Catalog.Find(goal.HomeId)?.Name ?? goal.HomeId), Catalog.FromName(goal.AwayName ?? Catalog.Find(goal.AwayId)?.Name ?? goal.AwayId) }))
                .DistinctBy(team => team.Id).OrderBy(team => team.Name).ToArray();
            return new(Crests.Enrich(teams), matches.Items, allGoals,
                [matches.Status, clips.Status], clock.GetUtcNow(), false);
        }
        finally { gate.Release(); }
    }

    private static string? Crest(JsonElement team) => team.TryGetProperty("crest", out var crest) &&
        Uri.TryCreate(crest.GetString(), UriKind.Absolute, out var uri) && uri.Scheme == "https" &&
        uri.Host == "crests.football-data.org" && string.IsNullOrEmpty(uri.UserInfo) ? uri.AbsoluteUri : null;

    private async Task<ProviderResult<Fixture>> Football(DateOnly day, CancellationToken ct)
    {
        var key = day.ToString("yyyy-MM-dd");
        var apiToken = config["FootballData:Token"];
        if (string.IsNullOrWhiteSpace(apiToken)) return new([], new("football-data.org", "disconnected", "Add a football-data.org key to load fixtures. Free-plan scores are delayed."));
        if (fixtures.TryGetValue(key, out var cached) && clock.GetUtcNow() - cached.At < FixtureTtl(day))
            return new(cached.Items, new("football-data.org", "connected", "Fixtures connected. Score freshness depends on your plan.", cached.At));
        // A shared ceiling across all dates/tabs: at most six fixture requests per
        // minute, leaving capacity under the free plan's ten-per-minute allowance.
        if (lastFootballRequest is { } last && clock.GetUtcNow() - last < TimeSpan.FromSeconds(10))
            return new(cached.Items ?? [], new("football-data.org", "waiting", "Waiting for the next shared fixture refresh.", cached.At == default ? null : cached.At));
        lastFootballRequest = clock.GetUtcNow();
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get,
                $"https://api.football-data.org/v4/matches?dateFrom={day.AddDays(-2):yyyy-MM-dd}&dateTo={day.AddDays(3):yyyy-MM-dd}");
            request.Headers.Add("X-Auth-Token", apiToken);
            using var response = await clients.CreateClient("providers").SendAsync(request, ct);
            if (!response.IsSuccessStatusCode) return new(cached.Items ?? [], Failure("football-data.org", response.StatusCode, cached.At));
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
            var items = new List<Fixture>();
            foreach (var m in json.RootElement.GetProperty("matches").EnumerateArray())
            {
                var home = m.GetProperty("homeTeam"); var away = m.GetProperty("awayTeam");
                var homeName = home.GetProperty("name").GetString() ?? "Home team";
                var awayName = away.GetProperty("name").GetString() ?? "Away team";
                var score = m.GetProperty("score").GetProperty("fullTime");
                items.Add(new(m.GetProperty("id").ToString(), Catalog.FromName(homeName).Id,
                    Catalog.FromName(awayName).Id, homeName, awayName,
                    m.GetProperty("utcDate").GetDateTimeOffset(), m.GetProperty("competition").GetProperty("name").GetString() ?? "Football",
                    m.GetProperty("status").GetString() ?? "SCHEDULED", Number(score, "home"), Number(score, "away"), false, Crest(home), Crest(away)));
            }
            var now = clock.GetUtcNow();
            // Date browsing must not grow a cache without a bound.
            if (fixtures.Count >= 8) fixtures.Remove(fixtures.OrderBy(x => x.Value.At).First().Key);
            fixtures[key] = (now, items.ToArray());
            return new(items.ToArray(), new("football-data.org", "connected", "Fixtures connected. Score freshness depends on your plan.", now));
        }
        catch (Exception e) when (e is HttpRequestException or JsonException or KeyNotFoundException or InvalidOperationException or FormatException || e is TaskCanceledException && !ct.IsCancellationRequested)
        { return new(cached.Items ?? [], new("football-data.org", "error", "Fixtures could not refresh. Check the connection and try again. Cached fixtures remain visible.", cached.At == default ? null : cached.At)); }
    }

    private async Task<ProviderResult<Goal>> Reddit(CancellationToken ct)
    {
        if (!config.GetValue<bool>("Reddit:Enabled")) return await PublicReddit(ct);
        if (string.IsNullOrWhiteSpace(config["Reddit:AccessToken"]) &&
            (string.IsNullOrWhiteSpace(config["Reddit:ClientId"]) || string.IsNullOrWhiteSpace(config["Reddit:ClientSecret"])))
            return new([], new("Reddit", "disconnected", "An approved app's OAuth credentials are required. See source setup."));
        if (goalsAt is { } at && clock.GetUtcNow() - at < TimeSpan.FromSeconds(45))
            return new(goals, new("Reddit", "connected", "Recent r/soccer goal posts. Refreshed at most once every 45 seconds.", goalsAt));
        try
        {
            var client = clients.CreateClient("providers");
            var access = config["Reddit:AccessToken"];
            if (string.IsNullOrWhiteSpace(access))
            {
                if (token is null || tokenUntil <= clock.GetUtcNow())
                {
                    using var auth = new HttpRequestMessage(HttpMethod.Post, "https://www.reddit.com/api/v1/access_token");
                    auth.Headers.Authorization = new("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes(config["Reddit:ClientId"] + ":" + config["Reddit:ClientSecret"])));
                    auth.Headers.TryAddWithoutValidation("User-Agent", config["Reddit:UserAgent"]);
                    auth.Content = new FormUrlEncodedContent(new Dictionary<string, string> { ["grant_type"] = "client_credentials" });
                    using var authResponse = await client.SendAsync(auth, ct);
                    if (!authResponse.IsSuccessStatusCode) return new(goals, Failure("Reddit", authResponse.StatusCode, goalsAt));
                    using var authJson = JsonDocument.Parse(await authResponse.Content.ReadAsStringAsync(ct));
                    token = authJson.RootElement.GetProperty("access_token").GetString();
                    tokenUntil = clock.GetUtcNow().AddSeconds(authJson.RootElement.GetProperty("expires_in").GetDouble() - 60);
                }
                access = token;
            }
            var found = new List<Goal>(); string? after = null;
            for (var page = 0; page < 3; page++)
            {
                using var request = new HttpRequestMessage(HttpMethod.Get, "https://oauth.reddit.com/r/soccer/new?limit=100&raw_json=1" + (after is null ? "" : "&after=" + Uri.EscapeDataString(after)));
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", access);
                request.Headers.TryAddWithoutValidation("User-Agent", config["Reddit:UserAgent"]);
                using var response = await client.SendAsync(request, ct);
                if (!response.IsSuccessStatusCode)
                {
                    if (response.StatusCode == HttpStatusCode.Unauthorized) { token = null; tokenUntil = default; }
                    return new(goals, Failure("Reddit", response.StatusCode, goalsAt));
                }
                using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
                var listing = json.RootElement.GetProperty("data"); var old = false;
                foreach (var child in listing.GetProperty("children").EnumerateArray())
                {
                    var post = child.GetProperty("data");
                    var published = DateTimeOffset.FromUnixTimeSeconds((long)post.GetProperty("created_utc").GetDouble());
                    if (published < clock.GetUtcNow().AddHours(-48)) { old = true; continue; }
                    if (post.TryGetProperty("removed_by_category", out var removed) && removed.ValueKind != JsonValueKind.Null) continue;
                    if (post.TryGetProperty("over_18", out var nsfw) && nsfw.GetBoolean()) continue;
                    var source = GoalParser.RedditUrl("https://www.reddit.com" + post.GetProperty("permalink").GetString());
                    if (source is null) continue;
                    var goal = GoalParser.Parse(post.GetProperty("id").GetString()!, post.GetProperty("title").GetString()!, published,
                        source, post.GetProperty("url").GetString());
                    if (goal is not null) found.Add(goal);
                }
                after = listing.GetProperty("after").GetString();
                if (old || after is null) break;
            }
            goals = GoalParser.Group(found); goalsAt = clock.GetUtcNow();
            return new(goals, new("Reddit", "connected", "Recent r/soccer posts. Up to 300 posts from the last 48 hours are scanned.", goalsAt));
        }
        catch (Exception e) when (e is HttpRequestException or JsonException or KeyNotFoundException or InvalidOperationException or FormatException || e is TaskCanceledException && !ct.IsCancellationRequested)
        { return new(goals, new("Reddit", "error", "Reddit could not refresh. Check source setup or try again. Previously fetched goals remain visible.", goalsAt)); }
    }

    private static int? Number(JsonElement score, string key) => score.TryGetProperty(key, out var item) && item.ValueKind == JsonValueKind.Number ? item.GetInt32() : null;
    private async Task<ProviderResult<Goal>> PublicReddit(CancellationToken ct)
    {
        if (!config.GetValue<bool>("Reddit:PublicFeedEnabled")) return new([], new("Reddit", "disconnected", "Public feed disabled. An approved app is required for the OAuth connector."));
        if (clock.GetUtcNow() >= RedditFeed.Retirement) return new([], new("Reddit", "disconnected", "Reddit's public RSS retirement date has passed (13 November 2026). Use approved API access or add goal links manually."));
        if (goalsAt is { } at && clock.GetUtcNow() - at < TimeSpan.FromMinutes(2))
            return new(goals, new("Reddit", "connected", "r/soccer public RSS, refreshed every two minutes. Reddit plans to retire RSS on 13 November 2026.", at));
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, "https://www.reddit.com/r/soccer/new/.rss?limit=100");
            request.Headers.TryAddWithoutValidation("User-Agent", "Touchline/0.1 personal RSS reader");
            request.Headers.Accept.ParseAdd("application/atom+xml");
            using var response = await clients.CreateClient("providers").SendAsync(request, ct);
            if (!response.IsSuccessStatusCode) return new(goals, Failure("Reddit", response.StatusCode, goalsAt));
            goals = RedditFeed.Parse(await response.Content.ReadAsStringAsync(ct), clock.GetUtcNow());
            goalsAt = clock.GetUtcNow();
            return new(goals, new("Reddit", "connected", "r/soccer public RSS, refreshed every two minutes. Reddit plans to retire RSS on 13 November 2026.", goalsAt));
        }
        catch (Exception error) when (error is HttpRequestException or System.Xml.XmlException || error is TaskCanceledException && !ct.IsCancellationRequested)
        { return new(goals, new("Reddit", "error", "The public r/soccer feed could not refresh. Try again later or open the source thread. Previously loaded goals remain visible.", goalsAt)); }
    }
    private static ProviderStatus Failure(string name, HttpStatusCode code, DateTimeOffset? at) => new(name, "error", code switch
    {
        HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden => "Access was refused. Check your credentials and provider approval.",
        HttpStatusCode.TooManyRequests => "Provider rate limit reached. Wait a few minutes before retrying.",
        _ => "Provider is unavailable. Try again in a few minutes."
    }, at == default(DateTimeOffset) ? null : at);
}
