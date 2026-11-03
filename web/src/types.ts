export type Team = {
  id: string;
  name: string;
  shortName: string;
  country: string;
  aliases: string[];
};
export type Fixture = {
  id: string;
  homeId: string;
  awayId: string;
  homeName: string;
  awayName: string;
  kickoff: string;
  competition: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  sample: boolean;
};
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
  media: { kind: string; url: string } | null;
  alternatives: string[];
  sample: boolean;
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
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    throw new Error(
      problem.detail || "Touchline could not complete the request. Try again.",
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export function localDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function tracked(
  goals: Goal[],
  matches: Fixture[],
  preferences: Preferences,
  team: string,
  match: string,
  unwatched: boolean,
) {
  return goals.filter((goal) => {
    const favouriteMatch = matches.some(
      (m) =>
        preferences.matches.includes(m.id) &&
        m.homeId === goal.homeId &&
        m.awayId === goal.awayId &&
        Math.abs(
          new Date(goal.publishedAt).getTime() - new Date(m.kickoff).getTime(),
        ) <
          6 * 3600_000,
    );
    return (
      (preferences.teams.includes(goal.homeId) ||
        preferences.teams.includes(goal.awayId) ||
        favouriteMatch) &&
      (!team || goal.homeId === team || goal.awayId === team) &&
      (!match ||
        matches.some(
          (m) =>
            m.id === match &&
            m.homeId === goal.homeId &&
            m.awayId === goal.awayId &&
            Math.abs(
              new Date(goal.publishedAt).getTime() -
                new Date(m.kickoff).getTime(),
            ) <
              6 * 3600_000,
        )) &&
      (!unwatched || !preferences.watched.includes(goal.id))
    );
  });
}
