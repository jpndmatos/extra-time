import { apiUrl } from "./api";

export type Team = {
  id: string;
  name: string;
  shortName: string;
  country: string;
  aliases: string[];
  crest?: string | null;
};
export type Fixture = {
  id: string;
  homeId: string;
  awayId: string;
  source?: string | null;
  goalIds?: string[] | null;
  homeCrest?: string | null;
  awayCrest?: string | null;
  homeName: string;
  awayName: string;
  kickoff: string;
  competition: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  sample: boolean;
};
export type Clip = { kind: string; url: string };
export type ClipSource = { media: Clip; sourceUrl: string };
export type Goal = {
  id: string;
  title: string;
  homeId: string;
  awayId: string;
  homeScore: number;
  awayScore: number;
  scorer: string;
  minute: string | null;
  publishedAt: string;
  sourceUrl: string;
  media: Clip | null;
  mirrors?: ClipSource[] | null;
  alternatives: string[];
  sample: boolean;
  homeName?: string | null;
  awayName?: string | null;
  author?: string | null;
  watchReason?: string | null;
  watchSourceUrl?: string | null;
};
export type Preferences = {
  teams: string[];
  matches: string[];
  spoilers: boolean;
  watched: string[];
};
export type Dashboard = {
  teams: Team[];
  matches: Fixture[];
  goals: Goal[];
  sources: {
    name: string;
    state: string;
    message: string;
    updatedAt: string | null;
  }[];
  updatedAt: string;
  sample: boolean;
};

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body != null && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  const deadline = AbortSignal.timeout(25_000);
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      headers,
      signal: init?.signal
        ? AbortSignal.any([init.signal, deadline])
        : deadline,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError")
      throw new Error("Touchline took too long to respond. Please try again.");
    if (error instanceof TypeError)
      throw new Error(
        "Could not reach Touchline. Check your connection and try again.",
      );
    throw error;
  }
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    throw new Error(
      typeof problem.detail === "string" && problem.detail.trim()
        ? problem.detail.slice(0, 500)
        : "Touchline could not complete the request. Try again.",
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export function localDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function matchesGoal(fixture: Fixture, goal: Goal) {
  return (
    !!fixture.goalIds?.includes(goal.id) ||
    (fixture.homeId === goal.homeId &&
      fixture.awayId === goal.awayId &&
      Math.abs(
        new Date(goal.publishedAt).getTime() -
          new Date(fixture.kickoff).getTime(),
      ) <
        6 * 3600_000)
  );
}
export function tracked(
  goals: Goal[],
  matches: Fixture[],
  preferences: Preferences,
  team: string,
  match: string,
  unwatched: boolean,
  allGoals = false,
  onlyWatch = false,
) {
  return goals.filter((goal) => {
    const favouriteMatch = matches.some(
      (fixture) =>
        preferences.matches.includes(fixture.id) && matchesGoal(fixture, goal),
    );
    return (
      (allGoals ||
        preferences.teams.includes(goal.homeId) ||
        preferences.teams.includes(goal.awayId) ||
        favouriteMatch) &&
      (!onlyWatch || !!goal.watchReason) &&
      (!team || goal.homeId === team || goal.awayId === team) &&
      (!match ||
        matches.some(
          (fixture) => fixture.id === match && matchesGoal(fixture, goal),
        )) &&
      (!unwatched || !preferences.watched.includes(goal.id))
    );
  });
}
