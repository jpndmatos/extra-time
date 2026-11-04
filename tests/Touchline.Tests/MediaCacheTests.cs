using System.Net;
using Touchline;

namespace Touchline.Tests;

public class MediaCacheTests
{
    [Fact]
    public async Task ConcurrentViewersShareLookupAndOneCancellationDoesNotCancelOthers()
    {
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var handler = new Handler(async (_, ct) => {
            entered.TrySetResult(); await release.Task.WaitAsync(ct);
            return new(HttpStatusCode.OK) { Content = new StringContent("<meta property='og:video' content='https://c-cdn.streamin.top/uploads/abcdef12.mp4'>") };
        });
        var resolver = new ClipMedia(new Factory(handler), TimeProvider.System);
        using var cancellation = new CancellationTokenSource();
        var first = resolver.Resolve("https://streamin.link/v/abcdef12", cancellation.Token);
        await entered.Task.WaitAsync(TimeSpan.FromSeconds(2));
        var second = resolver.Resolve("https://streamin.link/v/abcdef12", default);
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(async () => await first);
        release.SetResult();
        Assert.Equal("video", (await second)?.Kind);
        Assert.Equal(1, handler.Calls);
        Assert.NotNull(await resolver.Resolve("https://streamin.link/v/abcdef12", default));
        Assert.Equal(1, handler.Calls);
    }
    [Fact]
    public async Task UnavailableClipsAreBrieflyCachedButExplicitRefreshCanRetry()
    {
        var handler = new Handler((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound)));
        var resolver = new ClipMedia(new Factory(handler), TimeProvider.System);
        Assert.Null(await resolver.Resolve("https://streamin.link/v/abcdef12", default));
        Assert.Null(await resolver.Resolve("https://streamin.link/v/abcdef12", default));
        Assert.Equal(1, handler.Calls);
        Assert.Null(await resolver.Resolve("https://streamin.link/v/abcdef12", default, refresh: true));
        Assert.Equal(2, handler.Calls);
    }
    private sealed class Handler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> response) : HttpMessageHandler
    {
        public int Calls;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) { Interlocked.Increment(ref Calls); return response(request, ct); }
    }
    private sealed class Factory(Handler handler) : IHttpClientFactory { public HttpClient CreateClient(string name) => new(handler, false); }
}
