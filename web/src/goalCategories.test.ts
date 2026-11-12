import { describe, expect, it } from "vitest";
import { bundledCrest, clubCrest, goalCategory } from "./goalCategories";
import type { Goal, Team, Fixture } from "./types";
const data = { teams: [], matches: [] };
const goal = (title: string) =>
  ({
    id: title,
    title,
    homeId: "porto",
    awayId: "napoli",
    homeName: "Porto",
    awayName: "Napoli",
  }) as Goal;
describe("goal categories", () => {
  it.each([
    ["Porto 1-0 Napoli", "main"],
    ["Porto U19 1-0 Napoli U19", "u19"],
    ["Portugal under-21 1-0 England", "u21"],
    ["Arsenal Women 1-0 Chelsea Women", "women"],
    ["France féminine 1-0 Spain", "women"],
    ["WSL: Arsenal 1-0 Chelsea", "women"],
    ["UEFA Youth League: Porto 1-0 Napoli", "youth"],
    ["U17: Portugal 1-0 England", "youth"],
    ["Premier League 2: Liverpool 1-0 Chelsea", "reserves"],
  ])("routes %s to %s", (title, category) =>
    expect(goalCategory(goal(title), data)).toBe(category),
  );
  it("uses competition metadata when the post omits the category", () => {
    expect(
      goalCategory(goal("Porto 1-0 Napoli"), {
        teams: [],
        matches: [
          { homeId: "porto", awayId: "napoli", competition: "UEFA U19" },
        ] as Fixture[],
      }),
    ).toBe("u19");
  });
  it("inherits a verified parent crest without merging the youth team identity", () => {
    const teams = [
      { name: "Borussia Dortmund", aliases: ["Dortmund"], crest: "crest.png" },
    ] as Team[];
    expect(clubCrest(undefined, teams, "Dortmund U19")).toBe("crest.png");
    expect(clubCrest(undefined, teams, "Dortmund Women")).toBe("crest.png");
    expect(clubCrest(undefined, teams, "Unknown Club")).toBeUndefined();
  });
  it("matches provider aliases for Reddit clubs", () => {
    const teams = [
      { name: "PAE AEK", aliases: [], crest: "aek.png" },
    ] as unknown as Team[];
    expect(clubCrest(undefined, teams, "AEK Athens")).toBe("aek.png");
  });
  it.each([
    ["Juventus W", "109.png"],
    ["Bayern Munich W", "5.png"],
    ["Manchester City W", "65.png"],
    ["Inter W", "108.png"],
    ["PSG W", "524.png"],
    ["Roma W", "100.png"],
    ["OL Lyonnes W", "espn-19256.png"],
    ["Servette W", "espn-20835.png"],
    ["Leuven W", "espn-131423.png"],
    ["Koge W", "espn-21127.png"],
    ["Tavernes", "federation-tavernes.png"],
    ["Mijas Las Lagunas", "club-mijas.png"],
    ["Trival Valderas", "club-trival.png"],
    ["Jaen", "club-jaen.png"],
  ])(
    "recovers %s from bundled artwork without API crest metadata",
    (name, file) => {
      expect(clubCrest(undefined, [], name)).toBe(`/crests/${file}`);
    },
  );
  it("prefers a specific women’s badge and retains unknown-club fallbacks", () => {
    expect(bundledCrest("OL Lyonnes W")).not.toBe(bundledCrest("Lyon"));
    expect(bundledCrest("Unknown Club W")).toBeUndefined();
    const team = {
      name: "Juventus W",
      crest: "provider.png",
      aliases: [],
    } as unknown as Team;
    expect(clubCrest(team, [])).toBe("provider.png");
  });
});
