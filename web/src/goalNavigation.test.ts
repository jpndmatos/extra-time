import { describe, expect, it } from "vitest";
import { adjacentGoal, searchGoals } from "./goalNavigation";
import type { Goal, Team } from "./types";
const goal = {
  id: "goal",
  homeId: "atletico",
  awayId: "benfica",
  scorer: "João Félix",
  title: "Atlético Madrid [1]-0 Benfica - João Félix 18'",
} as Goal;
const teams = [
  { id: "atletico", name: "Atlético Madrid", aliases: ["Atletico", "Atleti"] },
  { id: "benfica", name: "Benfica", aliases: ["SL Benfica"] },
] as Team[];
describe("goal browsing", () => {
  it("finds teams, aliases and scorers without accent-sensitive typing", () => {
    expect(searchGoals([goal], teams, "ATLETI benfica", false, [])).toEqual([
      goal,
    ]);
    expect(searchGoals([goal], teams, "joao felix", false, [])).toEqual([goal]);
    expect(searchGoals([goal], teams, "Porto", false, [])).toEqual([]);
  });
  it("does not reveal hidden scorers through search results", () => {
    expect(searchGoals([goal], teams, "Felix", true, [])).toEqual([]);
    expect(searchGoals([goal], teams, "Atletico", true, [])).toEqual([goal]);
    expect(searchGoals([goal], teams, "Felix", true, [goal.id])).toEqual([
      goal,
    ]);
  });
  it("moves within the current results without wrapping or playing an unrelated goal", () => {
    const next = { ...goal, id: "next" };
    expect(adjacentGoal([goal, next], goal.id, 1)).toEqual(next);
    expect(adjacentGoal([goal, next], goal.id, -1)).toBeUndefined();
    expect(adjacentGoal([goal, next], next.id, 1)).toBeUndefined();
    expect(adjacentGoal([next], goal.id, 1)).toEqual(next);
    expect(adjacentGoal([], goal.id, 1)).toBeUndefined();
  });
});
