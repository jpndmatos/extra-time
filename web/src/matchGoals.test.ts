import { describe, expect, it } from "vitest";
import { matchGoals } from "./matchGoals";
import type { Dashboard, Fixture, Goal } from "./types";
const goal = (
  id: string,
  minute: string,
  homeScore: number,
  publishedAt = "2026-11-04T18:00:00Z",
): Goal => ({
  id,
  minute,
  homeScore,
  awayScore: 0,
  homeId: "home",
  awayId: "away",
  publishedAt,
  scorer: id,
  title: id,
  sourceUrl: "",
  media: null,
  alternatives: [],
  sample: false,
});
const first = goal("first", "18", 1),
  second = goal("second", "45+2", 2);
const dashboard = (goals: Goal[], matches: Fixture[] = []): Dashboard => ({
  teams: [],
  matches,
  goals,
  sources: [],
  updatedAt: "2026-11-04T18:00:00Z",
  sample: false,
});
describe("same-match context", () => {
  it("keeps added time in its own period before the following period starts", () => {
    const goals = [
      goal("extra-time", "91", 5),
      goal("second-half", "46", 3),
      goal("half-time", "45+2", 2),
      goal("first-half", "45", 1),
      goal("full-time", "90+7", 4),
    ];
    const result = matchGoals(dashboard(goals), goals[0])!;
    expect(result.goals.map((goal) => goal.id)).toEqual([
      "first-half",
      "half-time",
      "second-half",
      "full-time",
      "extra-time",
    ]);
  });
  it("keeps other matches and yesterday's meeting out, in chronological order", () => {
    const other = { ...goal("other", "30", 1), awayId: "different" };
    const old = goal("yesterday", "90", 3, "2026-11-03T18:00:00Z");
    const result = matchGoals(dashboard([second, other, old, first]), first)!;
    expect(result.goals.map((g) => g.id)).toEqual(["first", "second"]);
    expect([result.homeScore, result.awayScore, result.label]).toEqual([
      2,
      0,
      "Score from clips",
    ]);
  });
  it("uses explicit match membership and the authoritative fixture score", () => {
    const fixture = {
      id: "fixture",
      homeId: "home",
      awayId: "away",
      kickoff: first.publishedAt,
      goalIds: [first.id, second.id],
      homeScore: 2,
      awayScore: 1,
      status: "FINISHED",
    } as Fixture;
    const result = matchGoals(
      dashboard([first, goal("unassigned", "70", 4), second], [fixture]),
      first,
    )!;
    expect(result.goals.map((g) => g.id)).toEqual(["first", "second"]);
    expect([result.homeScore, result.awayScore, result.label]).toEqual([
      2,
      1,
      "Full time",
    ]);
  });
  it("does not call a clip-derived score final when fixture scores are absent", () => {
    expect(matchGoals(dashboard([first]), first)?.label).toBe(
      "Score from clips",
    );
    expect(matchGoals(null, first)).toBeNull();
  });
});
