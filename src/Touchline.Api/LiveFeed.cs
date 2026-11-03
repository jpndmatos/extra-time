using System.Security.Cryptography;
using System.Text.Json;

namespace Touchline;

public static class LiveFeed
{
    public static async Task Stream(HttpContext context, Providers providers, Store store, TimeProvider clock)
    {
        var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
        var day = today;
        var requested = context.Request.Query["day"].FirstOrDefault();
        if (requested is not null && (!DateOnly.TryParseExact(requested, "yyyy-MM-dd", out day) || Math.Abs(day.DayNumber - today.DayNumber) > 7))
        {
            context.Response.StatusCode = 400;
            await context.Response.WriteAsJsonAsync(new { detail = "Choose a date within a week of today." });
            return;
        }
        context.Response.ContentType = "text/event-stream";
        context.Response.Headers.CacheControl = "no-cache, no-transform";
        context.Response.Headers["X-Accel-Buffering"] = "no";
        var ct = context.RequestAborted;
        await context.Response.WriteAsync("retry: 3000\n\n", ct);
        await context.Response.Body.FlushAsync(ct);
        string? lastVersion = null;
        try
        {
            while (!ct.IsCancellationRequested)
            {
                var dashboard = await providers.Dashboard(day, store, ct);
                // Transport heartbeats must not cause React to replace an unchanged
                // dashboard or reload the currently playing third-party iframe.
                var content = JsonSerializer.Serialize(new { dashboard.Teams, dashboard.Matches, dashboard.Goals, dashboard.Sources }, JsonDefaults.Options);
                var version = Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(content)));
                if (version != lastVersion)
                {
                    var json = JsonSerializer.Serialize(dashboard, JsonDefaults.Options);
                    await context.Response.WriteAsync($"id: {version}\nevent: dashboard\ndata: {json}\n\n", ct);
                    lastVersion = version;
                }
                await context.Response.WriteAsync($"event: heartbeat\ndata: {clock.GetUtcNow():O}\n\n", ct);
                await context.Response.Body.FlushAsync(ct);
                await Task.Delay(TimeSpan.FromSeconds(2), clock, ct);
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
        catch (IOException) when (ct.IsCancellationRequested) { }
    }
}
