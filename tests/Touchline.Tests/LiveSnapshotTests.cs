using Touchline;

namespace Touchline.Tests;

public class LiveSnapshotTests
{
    private static readonly DateOnly Day = new(2026, 11, 4);
    private static Dashboard Empty(DateTimeOffset now) => new([], [], [], [], now, false);
    [Fact]
    public async Task ConcurrentViewersShareWorkAndCancellationOnlyStopsTheirOwnWait()
    {
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var calls = 0;
        var snapshots = new LiveSnapshots(async (_, ct) => {
            Interlocked.Increment(ref calls); entered.TrySetResult(); await release.Task.WaitAsync(ct);
            return Empty(DateTimeOffset.UtcNow);
        }, TimeProvider.System);
        using var leaving = new CancellationTokenSource();
        var first = snapshots.Get(Day, leaving.Token);
        await entered.Task.WaitAsync(TimeSpan.FromSeconds(2));
        var viewers = Enumerable.Range(0, 20).Select(_ => snapshots.Get(Day, default)).ToArray();
        leaving.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(async () => await first);
        release.SetResult();
        var results = await Task.WhenAll(viewers);
        Assert.Equal(1, calls);
        Assert.All(results, item => Assert.Same(results[0], item));
    }
    [Fact]
    public async Task RefreshesAfterTwoSecondsWithoutPushingUnchangedDataAsNewContent()
    {
        var clock = new Clock(); var calls = 0;
        var snapshots = new LiveSnapshots((_, _) => { calls++; return Task.FromResult(Empty(clock.GetUtcNow())); }, clock);
        var first = await snapshots.Get(Day, default);
        Assert.Same(first, await snapshots.Get(Day, default)); Assert.Equal(1, calls);
        clock.Now = clock.Now.AddSeconds(2);
        var next = await snapshots.Get(Day, default);
        Assert.Equal(2, calls); Assert.NotSame(first, next);
        Assert.Equal(first.Version, next.Version); Assert.NotEqual(first.Json, next.Json);
    }
    [Fact]
    public async Task FailedBuildDoesNotPoisonFutureRefreshes()
    {
        var calls = 0;
        var snapshots = new LiveSnapshots((_, _) => ++calls == 1
            ? Task.FromException<Dashboard>(new IOException("Temporary read failure"))
            : Task.FromResult(Empty(DateTimeOffset.UtcNow)), TimeProvider.System);
        await Assert.ThrowsAsync<IOException>(() => snapshots.Get(Day, default));
        Assert.NotNull(await snapshots.Get(Day, default)); Assert.Equal(2, calls);
    }
    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now = new(2026, 11, 4, 20, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => Now;
    }
}
