namespace Touchline;

public static class LiveFeed
{
    public static async Task Stream(HttpContext context, LiveSnapshots snapshots, TimeProvider clock)
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
                var snapshot = await snapshots.Get(day, ct);
                // Transport heartbeats must not cause React to replace an unchanged
                // dashboard or reload the currently playing third-party iframe.
                if (snapshot.Version != lastVersion)
                {
                    await context.Response.WriteAsync($"id: {snapshot.Version}\nevent: dashboard\ndata: {snapshot.Json}\n\n", ct);
                    lastVersion = snapshot.Version;
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
