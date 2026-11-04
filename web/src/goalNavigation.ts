import type { Goal, Team } from "./types";
import { goalPostIds } from "./goalHistory";

const normalize = (value: string) =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function searchGoals(
  goals: Goal[],
  teams: Team[],
  query: string,
  spoilers: boolean,
  revealed: string[],
) {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return goals;
  const clubs = new Map(teams.map((team) => [team.id, team]));
  const visible = new Set(revealed);
  return goals.filter((goal) => {
    const home = clubs.get(goal.homeId),
      away = clubs.get(goal.awayId);
    const names = [
      home?.name || goal.homeName || goal.homeId,
      away?.name || goal.awayName || goal.awayId,
      ...(home?.aliases || []),
      ...(away?.aliases || []),
    ];
    if (!spoilers || goalPostIds(goal).some((id) => visible.has(id)))
      names.push(goal.scorer, goal.title);
    const text = normalize(names.join(" "));
    return words.every((word) => text.includes(word));
  });
}

export function adjacentGoal(
  goals: Goal[],
  selectedId: string | undefined,
  direction: -1 | 1,
) {
  const index = goals.findIndex((goal) => goal.id === selectedId);
  if (index < 0) return direction === 1 ? goals[0] : undefined;
  return goals[index + direction];
}
