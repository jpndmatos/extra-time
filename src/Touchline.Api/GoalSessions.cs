namespace Touchline;

public static class GoalSessions
{
    // A date boundary is not a match boundary. Keep nearby posts together while
    // separating later meetings of the same teams; never chain beyond eight hours.
    public static IEnumerable<Goal[]> Split(IEnumerable<Goal> input)
    {
        var session = new List<Goal>();
        foreach (var goal in input.OrderBy(goal => goal.PublishedAt).ThenBy(goal => goal.Id, StringComparer.Ordinal))
        {
            if (session.Count > 0 && goal.PublishedAt - session[0].PublishedAt > TimeSpan.FromHours(8))
            {
                yield return session.ToArray();
                session.Clear();
            }
            session.Add(goal);
        }
        if (session.Count > 0) yield return session.ToArray();
    }
}
