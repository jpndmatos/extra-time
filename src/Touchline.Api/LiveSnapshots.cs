using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Touchline;

public record LiveSnapshot(string Version, string Json);

// All viewers of a day share one database read, enrichment and serialization per
// two-second interval. Cancelling one viewer never cancels work needed by others.
public sealed class LiveSnapshots(Func<DateOnly, CancellationToken, Task<Dashboard>> load, TimeProvider clock)
{
    private readonly ConcurrentDictionary<DateOnly, (DateTimeOffset At, LiveSnapshot Value)> cache = new();
    private readonly ConcurrentDictionary<DateOnly, Lazy<Task<LiveSnapshot>>> pending = new();
    public async Task<LiveSnapshot> Get(DateOnly day, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        if (cache.TryGetValue(day, out var found) && clock.GetUtcNow() - found.At < TimeSpan.FromSeconds(2)) return found.Value;
        return await pending.GetOrAdd(day, key => new Lazy<Task<LiveSnapshot>>(() => Build(key))).Value.WaitAsync(ct);
    }
    private async Task<LiveSnapshot> Build(DateOnly day)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        try
        {
            var dashboard = await load(day, deadline.Token);
            var content = JsonSerializer.Serialize(new { dashboard.Teams, dashboard.Matches, dashboard.Goals, dashboard.Sources }, JsonDefaults.Options);
            var version = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(content)));
            var snapshot = new LiveSnapshot(version, JsonSerializer.Serialize(dashboard, JsonDefaults.Options));
            if (cache.Count >= 8)
                foreach (var oldest in cache.OrderBy(entry => entry.Value.At).Take(2)) cache.TryRemove(oldest.Key, out _);
            cache[day] = (clock.GetUtcNow(), snapshot);
            return snapshot;
        }
        finally { pending.TryRemove(day, out _); }
    }
}
