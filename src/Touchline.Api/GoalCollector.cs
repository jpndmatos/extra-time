namespace Touchline;

// Discovery continues while the local server is running, independently of viewers.
public sealed class GoalCollector(Providers providers, Store store, TimeProvider clock, ILogger<GoalCollector> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await providers.Dashboard(DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime), store, stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception error) { logger.LogWarning("Goal collection failed ({Kind}); the next scheduled collection will retry.", error.GetType().Name); }
            try { await Task.Delay(TimeSpan.FromSeconds(30), clock, stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
        }
    }
}
