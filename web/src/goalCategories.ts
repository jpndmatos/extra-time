import type { Dashboard, Goal, Team } from "./types";

export const categories = [
  ["main", "Main"],
  ["women", "Women"],
  ["u21", "U21"],
  ["u19", "U19"],
  ["youth", "Other youth"],
  ["reserves", "Reserves"],
] as const;
export type Category = (typeof categories)[number][0];
const normalize = (value: string) =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const women =
  /\b(?:women(?:'s)?|ladies|feminine|feminin[oa]s?|femenin[oa]s?|frauen|femminile|dames|wsl|nwsl|uwcl|wcl)\b|\bliga f\b|\(w\)/i;
const youth =
  /\b(?:u[ -]?\d{2}|under[ -]?\d{2}|youth|academy|juniores?|juniors?)\b/i;
export function goalCategory(
  goal: Goal,
  data: Pick<Dashboard, "teams" | "matches">,
): Category {
  const names = [
    goal.homeName,
    goal.awayName,
    ...data.teams
      .filter((t) => t.id === goal.homeId || t.id === goal.awayId)
      .map((t) => t.name),
  ]
    .filter(Boolean)
    .join(" ");
  const match = data.matches.find(
    (m) =>
      m.goalIds?.includes(goal.id) ||
      (m.homeId === goal.homeId && m.awayId === goal.awayId),
  );
  // Use match metadata and the title too: many posts omit age/gender from club names.
  const text = normalize(`${names} ${match?.competition || ""} ${goal.title}`);
  if (women.test(text)) return "women";
  if (/\b(?:u[ -]?21|under[ -]?21)\b/.test(text)) return "u21";
  if (/\b(?:u[ -]?19|under[ -]?19)\b/.test(text)) return "u19";
  if (youth.test(text)) return "youth";
  if (
    /\b(?:reserves?|premier league 2)\b/.test(text) ||
    /\b(?:II|B)\b/.test(names)
  )
    return "reserves";
  return "main";
}

const aliases: Record<string, string> = {
  "aek athens": "aek",
  "feyenoord rotterdam": "feyenoord",
  "shakhtar donetsk": "shakhtar",
  "racing club de lens": "lens",
  "real betis balompie": "betis",
  "real betis": "betis",
  "como 1907": "como",
};
function crestKey(name: string) {
  const key = normalize(name)
    .replace(
      /\b(?:u[ -]?\d{2}|under[ -]?\d{2}|women(?:'s)?|ladies|feminino|feminina|frauen)\b/g,
      "",
    )
    .replace(/\(w\)/g, "")
    .replace(/\s+(?:ii|b)$/, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/^(?:fc|fk|afc|cf|sc|ac|pae)\s+|\s+(?:fc|fk|afc|cf|sc|ac)$/, "")
    .trim();
  return aliases[key] || key;
}
export function clubCrest(team: Team | undefined, teams: Team[], name = "") {
  if (team?.crest) return team.crest;
  const key = crestKey(team?.name || name);
  return teams.find(
    (candidate) =>
      candidate.crest &&
      [candidate.name, ...candidate.aliases].some(
        (alias) => crestKey(alias) === key,
      ),
  )?.crest;
}
