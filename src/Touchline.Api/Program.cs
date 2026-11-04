using Touchline;

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    WebRootPath = Path.Combine(AppContext.BaseDirectory, "wwwroot")
});
builder.Configuration.AddUserSecrets<Program>(optional: true).AddEnvironmentVariables().AddCommandLine(args);
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<Store>();
builder.Services.AddSingleton<Providers>();
builder.Services.AddSingleton<ClipMedia>();
builder.Services.AddHttpClient("providers", client => { client.Timeout = TimeSpan.FromSeconds(12); client.MaxResponseContentBufferSize = 3_000_000; });
builder.Services.AddHttpClient("clip-metadata", client => { client.Timeout = TimeSpan.FromSeconds(10); client.DefaultRequestHeaders.UserAgent.ParseAdd("Touchline/0.1"); })
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
builder.Services.AddProblemDetails();
var app = builder.Build();
app.UseExceptionHandler();
app.Use(async (ctx, next) =>
{
    ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
    ctx.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    ctx.Response.Headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://crests.football-data.org; frame-src https://streamable.com https://www.youtube-nocookie.com https://streamain.com; media-src 'self' https://*.streamin.top; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";
    if (ctx.Request.Path.StartsWithSegments("/api")) ctx.Response.Headers.CacheControl = "no-store";
    // This is a single-user localhost app. Cross-site writes must not change it.
    if (ctx.Request.Method is "POST" or "PUT" or "DELETE" && ctx.Request.Headers.Origin.FirstOrDefault() is { } origin)
    {
        var sameOrigin = Uri.TryCreate(origin, UriKind.Absolute, out var uri) && uri.Scheme == ctx.Request.Scheme && uri.Host == ctx.Request.Host.Host && uri.Port == (ctx.Request.Host.Port ?? 80);
        var localDev = origin is "http://127.0.0.1:5194" or "http://localhost:5194";
        if (!sameOrigin && !localDev) { ctx.Response.StatusCode = 403; return; }
    }
    await next();
});
app.UseDefaultFiles(); app.UseStaticFiles();
app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));
app.MapGet("/api/live", LiveFeed.Stream);
app.MapPost("/api/media", async (MediaRequest input, ClipMedia media, CancellationToken ct) =>
{
    if (string.IsNullOrEmpty(input.Url) || input.Url.Length > 2000) return Results.Problem("Choose a valid clip link.", statusCode: 400);
    try
    {
        var result = await media.Resolve(input.Url, ct);
        return result is null ? Results.Problem("This clip could not be loaded here. Open its original Reddit thread or clip host.", statusCode: 422) : Results.Ok(result);
    }
    catch (Exception error) when (error is HttpRequestException || error is TaskCanceledException && !ct.IsCancellationRequested)
    { return Results.Problem("The clip host is unavailable. Open the original Reddit thread or try again later.", statusCode: 502); }
});
app.MapGet("/api/preferences", (Store store) => store.Preferences());
app.MapPut("/api/preferences", (Preferences value, Store store) =>
{
    if (value.Teams is null || value.Matches is null || value.Watched is null || value.Teams.Length > 50 || value.Matches.Length > 100 || value.Watched.Length > 1000 ||
        value.Teams.Any(x => x is null || !Catalog.ValidId(x)) || value.Matches.Concat(value.Watched).Any(x => string.IsNullOrEmpty(x) || x.Length > 100))
        return Results.Problem("The favourite list is invalid.", statusCode: 400);
    store.Save(value with { Teams = value.Teams.Distinct().ToArray(), Matches = value.Matches.Distinct().ToArray(), Watched = value.Watched.Distinct().ToArray() });
    return Results.Ok(store.Preferences());
});
app.MapGet("/api/dashboard", async (string? day, bool? sample, Providers providers, Store store, TimeProvider clock, CancellationToken ct) =>
{
    var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
    var date = today;
    if (day is not null && !DateOnly.TryParseExact(day, "yyyy-MM-dd", out date)) return Results.Problem("Use a date in YYYY-MM-DD format.", statusCode: 400);
    if (Math.Abs(date.DayNumber - today.DayNumber) > 7) return Results.Problem("Choose a day within a week of today.", statusCode: 400);
    return Results.Ok(sample == true ? Samples.Create(date) : await providers.Dashboard(date, store, ct));
});
app.MapPost("/api/clips", (ClipInput input, Store store, TimeProvider clock) =>
{
    if (string.IsNullOrWhiteSpace(input.Title) || string.IsNullOrWhiteSpace(input.RedditUrl)) return Results.Problem("Add the post title and Reddit thread URL.", statusCode: 400);
    var source = GoalParser.RedditUrl(input.RedditUrl);
    if (source is null) return Results.Problem("Use an HTTPS Reddit post URL, including /comments/.", statusCode: 400);
    if (!string.IsNullOrWhiteSpace(input.ClipUrl) && GoalParser.SafeMedia(input.ClipUrl) is null)
        return Results.Problem("Inline playback supports Streamable, Streamain, Streamin and YouTube links. Leave this blank for other hosts; the Reddit source will still open.", statusCode: 400);
    var goal = GoalParser.Parse("manual-" + Guid.NewGuid().ToString("N"), input.Title, clock.GetUtcNow(), source, input.ClipUrl, allowUnknownTeams: true);
    if (goal is null) return Results.Problem("Use a goal title with both supported teams, score and minute, for example: Benfica [1]-0 FC Porto - Player 18'. Disallowed goals and misses are excluded.", statusCode: 400);
    store.Add(goal); return Results.Ok(goal);
});
app.MapDelete("/api/clips/{id}", (string id, Store store) => { store.Remove(id); return Results.NoContent(); });
app.MapFallbackToFile("index.html");
app.Run();

public partial class Program;
