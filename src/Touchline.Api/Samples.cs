namespace Touchline;

public static class Samples
{
    public static Dashboard Create(DateOnly day)
    {
        var start = new DateTimeOffset(day.ToDateTime(new TimeOnly(19, 0)), TimeSpan.Zero);
        Fixture[] matches = [
            new("sample-benfica", "benfica", "porto", "Benfica", "FC Porto", start, "Sample match", "IN_PLAY", 2, 1, true),
            new("sample-arsenal", "arsenal", "chelsea", "Arsenal", "Chelsea", start.AddHours(-2), "Sample match", "FINISHED", 1, 0, true),
            new("sample-liverpool", "liverpool", "man-city", "Liverpool", "Manchester City", start.AddHours(2), "Sample match", "TIMED", null, null, true),
            new("sample-sporting", "sporting", "braga", "Sporting CP", "SC Braga", start.AddDays(1), "Sample match", "TIMED", null, null, true)
        ];
        Goal[] goals = [
            new("sample-1", "Benfica [2]–1 FC Porto — Sample goal 67'", "benfica", "porto", 2, 1, "Sample scorer", "67", start.AddMinutes(67), "", null, [], true),
            new("sample-2", "Benfica 1–[1] FC Porto — Sample goal 42'", "benfica", "porto", 1, 1, "Sample scorer", "42", start.AddMinutes(42), "", null, [], true),
            new("sample-3", "Benfica [1]–0 FC Porto — Sample goal 18'", "benfica", "porto", 1, 0, "Sample scorer", "18", start.AddMinutes(18), "", null, [], true),
            new("sample-4", "Arsenal [1]–0 Chelsea — Sample goal 29'", "arsenal", "chelsea", 1, 0, "Sample scorer", "29", start.AddHours(-2).AddMinutes(29), "", null, [], true)
        ];
        return new(Catalog.Teams, matches, goals, [new("Sample workspace", "sample", "Fictional fixtures and goal metadata. No footage is supplied.")], DateTimeOffset.UtcNow, true);
    }
}
