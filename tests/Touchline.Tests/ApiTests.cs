using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Touchline;

namespace Touchline.Tests;

public class ApiTests : IDisposable
{
    private readonly string database = Path.Combine(Path.GetTempPath(), "touchline-tests-" + Guid.NewGuid().ToString("N"), "test.db");
    private readonly WebApplicationFactory<Program> factory;
    public ApiTests()
    {
        factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder => builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
        { ["DatabasePath"] = database, ["Reddit:Enabled"] = "false", ["FootballData:Token"] = "" })));
    }
    [Fact]
    public async Task MissingCredentialsProduceHonestEmptySourcesAndSampleIsSeparate()
    {
        using var client = factory.CreateClient();
        var live = (await client.GetFromJsonAsync<Dashboard>("/api/dashboard"))!;
        Assert.Empty(live.Matches); Assert.Empty(live.Goals); Assert.False(live.Sample);
        Assert.All(live.Sources, s => Assert.Equal("disconnected", s.State));
        var sample = (await client.GetFromJsonAsync<Dashboard>("/api/dashboard?sample=true"))!;
        Assert.True(sample.Sample); Assert.NotEmpty(sample.Goals); Assert.All(sample.Goals, g => { Assert.True(g.Sample); Assert.Null(g.Media); });
    }
    [Fact]
    public async Task FavouritesPersistAndUnknownTeamsAreRejected()
    {
        using var client = factory.CreateClient();
        var next = new Preferences(["benfica"], ["fixture-1"], true, []);
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync("/api/preferences", next)).StatusCode);
        var saved = await client.GetFromJsonAsync<Preferences>("/api/preferences"); Assert.Equal(next.Teams, saved!.Teams); Assert.True(saved.Spoilers);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/preferences", next with { Teams = ["unknown"] })).StatusCode);
    }
    [Fact]
    public async Task ManualClipIsValidatedStoredAndCanBeRemoved()
    {
        using var client = factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/clips", new ClipInput("Benfica [1]-0 Porto - Player 18'", "https://www.reddit.com/r/soccer/comments/abc123/title/", "https://streamable.com/abc123"));
        response.EnsureSuccessStatusCode(); var goal = (await response.Content.ReadFromJsonAsync<Goal>())!;
        var data = (await client.GetFromJsonAsync<Dashboard>("/api/dashboard"))!; Assert.Single(data.Goals);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync("/api/clips/" + goal.Id)).StatusCode);
        Assert.Empty((await client.GetFromJsonAsync<Dashboard>("/api/dashboard"))!.Goals);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/clips", new ClipInput("title", "https://evil.test/", null))).StatusCode);
    }
    [Fact]
    public async Task RejectsInvalidDatesAndCrossSiteWrites()
    {
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/dashboard?day=not-a-date")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/dashboard?day=2000-01-01")).StatusCode);
        using var message = new HttpRequestMessage(HttpMethod.Put, "/api/preferences") { Content = JsonContent.Create(Preferences.Empty) };
        message.Headers.Add("Origin", "https://other-site.test");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.SendAsync(message)).StatusCode);
    }
    public void Dispose() { factory.Dispose(); Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools(); if (File.Exists(database)) File.Delete(database); }
}
