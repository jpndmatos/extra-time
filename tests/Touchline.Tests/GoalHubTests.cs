using System.Net;
using System.Xml;
using Microsoft.Extensions.Configuration;
using Touchline;

namespace Touchline.Tests;

public class GoalHubTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 4, 12, 0, 0, TimeSpan.Zero);
    private static string Feed(string title = "Portsmouth [3]-1 Swansea - Player 90'+8'", string subreddit = "soccer", string published = "2026-11-04T11:00:00Z") => $$"""
        <feed xmlns="http://www.w3.org/2005/Atom"><entry><id>t3_abc123</id><title>{{System.Security.SecurityElement.Escape(title)}}</title>
        <published>{{published}}</published><link href="https://www.reddit.com/r/{{subreddit}}/comments/abc123/goal/"/>
        <author><name>/u/goalposter</name></author><content type="html">&lt;a href="https://streamin.link/v/abcdef12"&gt;[link]&lt;/a&gt;</content></entry></feed>
        """;

    [Fact]
    public void PublicFeedIncludesOtherClubsStoppageTimeAndAttribution()
    {
        var goal = Assert.Single(RedditFeed.Parse(Feed(), Now));
        Assert.Equal("Portsmouth", goal.HomeName); Assert.Equal("90+8", goal.Minute);
        Assert.Equal("goalposter", goal.Author); Assert.Equal("resolve", goal.Media?.Kind);
        Assert.True(Catalog.ValidId(goal.HomeId));
    }
    [Theory]
    [InlineData("Goal disallowed Portsmouth [3]-1 Swansea - Player 90'", "soccer", "2026-11-04T11:00:00Z")]
    [InlineData("Portsmouth [3]-1 Swansea - Player 90'", "other", "2026-11-04T11:00:00Z")]
    [InlineData("Portsmouth [3]-1 Swansea - Player 90'", "soccer", "2026-11-01T11:00:00Z")]
    public void PublicFeedRejectsUnrelatedOrStalePosts(string title, string subreddit, string published) => Assert.Empty(RedditFeed.Parse(Feed(title, subreddit, published), Now));

    [Fact]
    public void PublicFeedRejectsXmlEntityExpansion() => Assert.Throws<XmlException>(() => RedditFeed.Parse("<!DOCTYPE feed [<!ENTITY x SYSTEM 'file:///secrets'>]><feed>&x;</feed>", Now));

    [Fact]
    public async Task PublicFeedSharesItsCacheAndStopsAtRetirement()
    {
        var path = Path.Combine(Path.GetTempPath(), "touchline-rss-" + Guid.NewGuid().ToString("N") + ".db");
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["DatabasePath"] = path, ["Reddit:PublicFeedEnabled"] = "true" }).Build();
        var handler = new Handler(_ => new(HttpStatusCode.OK) { Content = new StringContent(Feed()) });
        var clock = new Clock();
        var providers = new Providers(new Factory(handler), config, clock);
        var store = new Store(config);
        try
        {
            var day = DateOnly.FromDateTime(Now.UtcDateTime);
            Assert.Single((await providers.Dashboard(day, store, default)).Goals);
            clock.Now = Now.AddSeconds(119);
            await providers.Dashboard(day, store, default); Assert.Equal(1, handler.Calls);
            clock.Now = RedditFeed.Retirement;
            var retired = await providers.Dashboard(day, store, default);
            Assert.Empty(retired.Goals); Assert.Equal("disconnected", retired.Sources[1].State); Assert.Equal(1, handler.Calls);
        }
        finally { Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools(); File.Delete(path); }
    }
    private sealed class Clock : TimeProvider { public DateTimeOffset Now = GoalHubTests.Now; public override DateTimeOffset GetUtcNow() => Now; }

    [Fact]
    public async Task ClipResolverFollowsOnlyAllowedPublisherRedirectsAndCachesMetadata()
    {
        var handler = new Handler(request => request.RequestUri!.Host == "streamin.link"
            ? new(HttpStatusCode.MovedPermanently) { Headers = { Location = new Uri("https://streamin.me/v/abcdef12") } }
            : new(HttpStatusCode.OK) { Content = new StringContent("<meta property='og:video' content='https://c-cdn.streamin.top/uploads/abcdef12.mp4?current'>") });
        var resolver = new ClipMedia(new Factory(handler), TimeProvider.System);
        var media = await resolver.Resolve("https://streamin.link/v/abcdef12", default);
        Assert.Equal("video", media?.Kind); Assert.Equal(2, handler.Calls);
        Assert.Equal(media, await resolver.Resolve("https://streamin.link/v/abcdef12", default)); Assert.Equal(2, handler.Calls);
    }
    [Theory]
    [InlineData("http://127.0.0.1/private")]
    [InlineData("https://streamin.me:8080/v/abcdef12")]
    [InlineData("https://example.org/v/abcdef12")]
    public async Task ClipResolverRejectsUnsafeRedirects(string target)
    {
        var handler = new Handler(_ => new(HttpStatusCode.Redirect) { Headers = { Location = new Uri(target) } });
        Assert.Null(await new ClipMedia(new Factory(handler), TimeProvider.System).Resolve("https://streamin.link/v/abcdef12", default));
        Assert.Equal(1, handler.Calls);
    }
    private sealed class Handler(Func<HttpRequestMessage, HttpResponseMessage> reply) : HttpMessageHandler
    {
        public int Calls;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) { Calls++; var response = reply(request); response.RequestMessage = request; return Task.FromResult(response); }
    }
    private sealed class Factory(Handler handler) : IHttpClientFactory { public HttpClient CreateClient(string name) => new(handler, false); }
}
