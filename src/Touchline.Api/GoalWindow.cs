namespace Touchline;

public static class GoalWindow
{
    public static bool Contains(Goal goal, DateTimeOffset now) =>
        goal.PublishedAt > now.AddHours(-48) && goal.PublishedAt <= now.AddMinutes(5);
}
