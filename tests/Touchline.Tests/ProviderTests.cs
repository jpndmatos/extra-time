using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Touchline;

namespace Touchline.Tests;

public class ProviderTests
{
    [Fact]
    public async Task LiveRefreshCadenceAndDateBrowsingShareOneFixtureBudget()
    {
        var directory = Path.Combine(Path.GetTempPath(), "touchline-provider-" + Guid.NewGuid().ToString("N"));
        var handler = new Handler(request => request.RequestUri!.Host == "api.football-data.org" ? "{\"matches\":[]}" : "{\"data\":{\"children\":[],\"after\":null}}");
        var config = Config(directory); var store = new Store(config);
        var clock = new Clock();
        var providers = new Providers(new Factory(handler), config, clock);
        var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
        await providers.Dashboard(today, store, default); Assert.Equal(2, handler.Calls);
        var queued = await providers.Dashboard(today.AddDays(1), store, default);
        Assert.Equal("waiting", queued.Sources[0].State); Assert.Equal(2, handler.Calls);
        clock.Advance(10);
        await providers.Dashboard(today.AddDays(1), store, default); Assert.Equal(3, handler.Calls);
        clock.Advance(20);
        await providers.Dashboard(today, store, default); Assert.Equal(4, handler.Calls);
        clock.Advance(15);
        await providers.Dashboard(today, store, default); Assert.Equal(5, handler.Calls);
        Cleanup(directory);
    }
    private sealed class Clock : TimeProvider
    {
        private DateTimeOffset now = DateTimeOffset.UtcNow;
        public override DateTimeOffset GetUtcNow() => now;
        public void Advance(int seconds) => now = now.AddSeconds(seconds);
    }
    [Fact]
    public async Task NormalizesFixturesParsesGoalsAndCachesBothFeeds()
    {
        var directory = Path.Combine(Path.GetTempPath(), "touchline-provider-" + Guid.NewGuid().ToString("N"));
        var now = DateTimeOffset.UtcNow;
        var handler = new Handler(request => request.RequestUri!.Host == "api.football-data.org"
            ? JsonSerializer.Serialize(new { matches = new[] { new { id = 1, homeTeam = new { id = 1, name = "SL Benfica" }, awayTeam = new { id = 2, name = "FC Porto" }, utcDate = now.ToString("O"), competition = new { name = "Liga Portugal" }, status = "IN_PLAY", score = new { fullTime = new { home = 1, away = 0 } } } } })
            : JsonSerializer.Serialize(new { data = new { after = (string?)null, children = new[] { new { data = new { id = "abc123", title = "Benfica [1]-0 FC Porto - Player 18'", created_utc = now.ToUnixTimeSeconds(), permalink = "/r/soccer/comments/abc123/goal/", url = "https://streamable.com/abc123", over_18 = false } } } } }));
        var config = Config(directory); var store = new Store(config);
        var providers = new Providers(new Factory(handler), config, TimeProvider.System);
        var first = await providers.Dashboard(DateOnly.FromDateTime(now.UtcDateTime), store, default);
        Assert.Equal("benfica", Assert.Single(first.Matches).HomeId); Assert.Single(first.Goals);
        Assert.All(first.Sources, source => Assert.Equal("connected", source.State));
        await providers.Dashboard(DateOnly.FromDateTime(now.UtcDateTime), store, default);
        Assert.Equal(2, handler.Calls);
        Cleanup(directory);
    }

    [Theory]
    [InlineData(HttpStatusCode.TooManyRequests)]
    [InlineData(HttpStatusCode.Forbidden)]
    public async Task UpstreamFailuresAreVisibleAndBackedOff(HttpStatusCode status)
    {
        var directory = Path.Combine(Path.GetTempPath(), "touchline-provider-" + Guid.NewGuid().ToString("N"));
        var handler = new Handler(_ => "{}", status); var config = Config(directory); var store = new Store(config);
        var providers = new Providers(new Factory(handler), config, TimeProvider.System);
        var date = DateOnly.FromDateTime(DateTime.UtcNow);
        var result = await providers.Dashboard(date, store, default);
        Assert.Empty(result.Goals); Assert.Empty(result.Matches); Assert.All(result.Sources, source => Assert.Equal("error", source.State));
        await providers.Dashboard(date, store, default); Assert.Equal(2, handler.Calls);
        Cleanup(directory);
    }

    private static IConfiguration Config(string directory) => new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
    { ["FootballData:Token"] = "test-key", ["Reddit:Enabled"] = "true", ["Reddit:AccessToken"] = "test-token", ["Reddit:UserAgent"] = "TouchlineTests/1.0", ["DatabasePath"] = Path.Combine(directory, "test.db") }).Build();
    private static void Cleanup(string directory) { Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools(); File.Delete(Path.Combine(directory, "test.db")); Directory.Delete(directory); }
    private sealed class Handler(Func<HttpRequestMessage, string> content, HttpStatusCode status = HttpStatusCode.OK) : HttpMessageHandler
    {
        public int Calls { get; private set; }
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        { Calls++; return Task.FromResult(new HttpResponseMessage(status) { Content = new StringContent(content(request)) }); }
    }
    private sealed class Factory(Handler handler) : IHttpClientFactory { public HttpClient CreateClient(string name) => new(handler, false); }
}
