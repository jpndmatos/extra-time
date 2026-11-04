using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Touchline;

namespace Touchline.Tests;

public class RetentionTests : IDisposable
{
    private readonly string directory = Path.Combine(Path.GetTempPath(), "touchline-retention-" + Guid.NewGuid().ToString("N"));
    private static readonly DateTimeOffset Now = new(2026, 11, 4, 12, 0, 0, TimeSpan.Zero);
    private IConfiguration Config(bool oauth = false) => new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
        ["DatabasePath"] = Path.Combine(directory, "test.db"), ["Reddit:Enabled"] = oauth.ToString(),
        ["Reddit:AccessToken"] = "test-token", ["Reddit:PublicFeedEnabled"] = "true",
    }).Build();
    private static string Entry(string id, DateTimeOffset at, string title = "Unknown Club [1]-0 Another Club - Player 18'") => $"<entry><id>t3_{id}</id><published>{at:O}</published><title>{System.Security.SecurityElement.Escape(title)}</title><link href='https://www.reddit.com/r/soccer/comments/{id}/goal/'/><content type='html'>&lt;a href='https://streamable.com/abc123'&gt;[link]&lt;/a&gt;</content></entry>";
    private static string Feed(params string[] entries) => "<feed xmlns='http://www.w3.org/2005/Atom'>" + string.Concat(entries) + "</feed>";
    private static Goal Goal(string id, DateTimeOffset at) => GoalParser.Parse(id, "Unknown Club [1]-0 Another Club - Player 18'", at, $"https://www.reddit.com/r/soccer/comments/{id}/goal/", null, true)!;

    [Fact]
    public async Task RssPagingUsesNonGoalPostsAsCursorsAndIncludesUnknownTeams()
    {
        var config = Config(); var store = new Store(config); var clock = new Clock();
        var handler = new Handler(request => {
            var uri = request.RequestUri!;
            if (uri.AbsolutePath.Contains("/top/")) return Ok(Feed());
            return Ok(uri.Query.Contains("after=t3_news99")
                ? Feed(Entry("goal1", Now.AddHours(-30)))
                : Feed(Enumerable.Range(0, 100).Select(i => Entry("news" + i, Now.AddHours(-2), "News post")).ToArray()));
        });
        var result = await new Providers(new Factory(handler), config, clock).Dashboard(DateOnly.FromDateTime(Now.UtcDateTime), store, default);
        Assert.Equal("Unknown Club", Assert.Single(result.Goals).HomeName);
        Assert.Equal(3, handler.Calls); Assert.Contains("48-hour public listing scanned", result.Sources[1].Message);
    }

    [Fact]
    public async Task GoalSurvivesListingRotationAndServerRestartButExpiresAtPublicationPlus48Hours()
    {
        var config = Config(); var clock = new Clock(); var store = new Store(config);
        var include = true;
        var handler = new Handler(_ => Ok(include ? Feed(Entry("goal1", Now.AddHours(-47))) : Feed()));
        var providers = new Providers(new Factory(handler), config, clock);
        var day = DateOnly.FromDateTime(Now.UtcDateTime);
        Assert.Single((await providers.Dashboard(day, store, default)).Goals);
        include = false; clock.Now = Now.AddMinutes(3);
        Assert.Single((await providers.Dashboard(day, store, default)).Goals);
        var restarted = new Providers(new Factory(handler), config, clock);
        Assert.Single((await restarted.Dashboard(day, new Store(config), default)).Goals);
        clock.Now = Now.AddHours(1).AddMilliseconds(-1);
        Assert.Single((await restarted.Dashboard(day, store, default)).Goals);
        var calls = handler.Calls;
        clock.Now = Now.AddHours(1);
        Assert.Empty((await restarted.Dashboard(day, store, default)).Goals);
        Assert.Empty(store.Discovered(clock.Now)); Assert.Equal(calls, handler.Calls);
    }

    [Fact]
    public void StorageHasNo500GoalLimitAndRefreshingDoesNotExtendLifetime()
    {
        var store = new Store(Config());
        var goals = Enumerable.Range(0, 650).Select(i => Goal("post" + i, Now.AddHours(-47))).ToArray();
        store.KeepDiscovered(goals, Now); Assert.Equal(650, new Store(Config()).Discovered(Now).Length);
        store.KeepDiscovered(goals, Now.AddMinutes(59));
        Assert.Empty(store.Discovered(Now.AddHours(1)));
    }

    [Fact]
    public async Task OAuthScansPast300PostsAndParsesAllClubNames()
    {
        var config = Config(true); var store = new Store(config); var clock = new Clock(); var page = 0;
        var handler = new Handler(_ => {
            page++;
            return Ok(JsonSerializer.Serialize(new { data = new { after = page < 4 ? "t3_page" + page : null,
                children = new[] { new { data = new { id = "oauth" + page, title = page == 4 ? "Unknown Club [1]-0 Another Club - Player 18'" : "News", created_utc = Now.AddHours(-page).ToUnixTimeSeconds(), permalink = "/r/soccer/comments/oauth" + page + "/goal/", url = "https://streamable.com/abc123", author = "poster" } } } } }));
        });
        var result = await new Providers(new Factory(handler), config, clock).Dashboard(DateOnly.FromDateTime(Now.UtcDateTime), store, default);
        Assert.Equal(4, handler.Calls); Assert.Equal("poster", Assert.Single(result.Goals).Author);
    }

    [Fact]
    public async Task RateLimitKeepsFirstPageGoalsAndHonorsRetryAfter()
    {
        var config = Config(); var store = new Store(config); var clock = new Clock();
        var handler = new Handler(request => request.RequestUri!.Query.Contains("after=")
            ? new(HttpStatusCode.TooManyRequests) { Headers = { RetryAfter = new System.Net.Http.Headers.RetryConditionHeaderValue(TimeSpan.FromMinutes(10)) } }
            : Ok(Feed(Enumerable.Range(0, 100).Select(i => Entry("post" + i, Now.AddHours(-i / 100.0), i == 0 ? "Unknown Club [1]-0 Another Club - Player 18'" : "News")).ToArray())));
        var providers = new Providers(new Factory(handler), config, clock); var day = DateOnly.FromDateTime(Now.UtcDateTime);
        var first = await providers.Dashboard(day, store, default);
        Assert.Single(first.Goals); Assert.Equal(2, handler.Calls); Assert.Contains("Partial", first.Sources[1].Message);
        clock.Now = Now.AddMinutes(3);
        var retry = await providers.Dashboard(day, store, default);
        Assert.Single(retry.Goals); Assert.Equal("waiting", retry.Sources[1].State); Assert.Equal(2, handler.Calls);
    }
    private static HttpResponseMessage Ok(string value) => new(HttpStatusCode.OK) { Content = new StringContent(value) };
    private sealed class Clock : TimeProvider { public DateTimeOffset Now = RetentionTests.Now; public override DateTimeOffset GetUtcNow() => Now; }
    private sealed class Handler(Func<HttpRequestMessage, HttpResponseMessage> reply) : HttpMessageHandler {
        public int Calls; protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) { Calls++; return Task.FromResult(reply(request)); }
    }
    private sealed class Factory(Handler handler) : IHttpClientFactory { public HttpClient CreateClient(string name) => new(handler, false); }
    public void Dispose() { Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools(); if (Directory.Exists(directory)) Directory.Delete(directory, true); }
}
