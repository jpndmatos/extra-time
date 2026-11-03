import { describe, expect, it } from "vitest";
import { tracked, type Fixture, type Goal, type Preferences } from "./types";
const goal = {
  id: "goal",
  homeId: "benfica",
  awayId: "porto",
  publishedAt: "2026-11-03T19:18:00Z",
} as Goal;
const fixture = {
  id: "fixture",
  homeId: "benfica",
  awayId: "porto",
  kickoff: "2026-11-03T19:00:00Z",
} as Fixture;
const prefs: Preferences = {
  teams: [],
  matches: [],
  watched: [],
  spoilers: false,
};
describe("goal feed", () => {
  it("includes goals for either side of a followed team", () => {
    expect(
      tracked([goal], [], { ...prefs, teams: ["porto"] }, "", "", false),
    ).toEqual([goal]);
    expect(tracked([goal], [], prefs, "", "", false)).toEqual([]);
  });
  it("follows an individual fixture without following its teams", () => {
    expect(
      tracked(
        [goal],
        [fixture],
        { ...prefs, matches: ["fixture"] },
        "",
        "",
        false,
      ),
    ).toEqual([goal]);
    expect(
      tracked(
        [goal],
        [{ ...fixture, kickoff: "2026-11-04T19:00:00Z" }],
        { ...prefs, matches: ["fixture"] },
        "",
        "",
        false,
      ),
    ).toEqual([]);
  });
  it("combines team, fixture and unwatched filters", () => {
    const followed = { ...prefs, teams: ["benfica"], watched: ["goal"] };
    expect(
      tracked([goal], [fixture], followed, "benfica", "fixture", true),
    ).toEqual([]);
    expect(
      tracked([goal], [fixture], followed, "liverpool", "", false),
    ).toEqual([]);
    expect(
      tracked([goal], [fixture], followed, "benfica", "fixture", false),
    ).toEqual([goal]);
  });
});
