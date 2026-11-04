import { matchesGoal, type Dashboard, type Goal } from "./types";

export function matchGoals(data: Dashboard | null, selected: Goal | undefined) {
  if (!data || !selected) return null;
  const fixture =
    data.matches.find((match) => match.goalIds?.includes(selected.id)) ||
    data.matches.find((match) => matchesGoal(match, selected));
  const goals = data.goals
    .filter((goal) =>
      fixture
        ? fixture.goalIds?.length
          ? fixture.goalIds.includes(goal.id)
          : matchesGoal(fixture, goal)
        : goal.homeId === selected.homeId &&
          goal.awayId === selected.awayId &&
          Math.abs(
            Date.parse(goal.publishedAt) - Date.parse(selected.publishedAt),
          ) <
            6 * 3600_000,
    )
    .sort((a, b) => {
      const minute = (value: string | null) =>
        (value || "")
          .split("+")
          .reduce((sum, part) => sum + (Number(part) || 0), 0);
      return (
        minute(a.minute) - minute(b.minute) ||
        Date.parse(a.publishedAt) - Date.parse(b.publishedAt)
      );
    });
  const latest =
    [...goals].sort(
      (a, b) => b.homeScore + b.awayScore - a.homeScore - a.awayScore,
    )[0] || selected;
  const fixtureScore = fixture?.homeScore != null && fixture?.awayScore != null;
  return {
    goals,
    homeScore: fixtureScore ? fixture.homeScore! : latest.homeScore,
    awayScore: fixtureScore ? fixture.awayScore! : latest.awayScore,
    label: fixtureScore
      ? fixture.status === "FINISHED"
        ? "Full time"
        : "Fixture score"
      : "Score from clips",
  };
}
