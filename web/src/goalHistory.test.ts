import { describe, expect, it } from "vitest";
import { goalPostIds, hasSeenGoal, setGoalSeen } from "./goalHistory";
import type { Goal } from "./types";
const goal = {
  id: "newpost",
  sourceUrl: "https://www.reddit.com/r/soccer/comments/newpost/goal/",
  alternatives: ["https://www.reddit.com/r/soccer/comments/oldpost/goal/"],
  mirrors: [
    {
      media: { kind: "embed", url: "https://streamable.com/e/mirror" },
      sourceUrl: "https://old.reddit.com/r/soccer/comments/mirror/",
    },
  ],
} as Goal;
describe("viewing history across alternate posts", () => {
  it("recognises a watched goal when a different playable post becomes primary", () => {
    expect(hasSeenGoal(goal, new Set(["oldpost"]))).toBe(true);
    expect(hasSeenGoal(goal, new Set(["mirror"]))).toBe(true);
    expect(hasSeenGoal(goal, new Set(["other"]))).toBe(false);
  });
  it("marking a grouped goal unwatched removes its related posts while preserving other goals", () => {
    expect(
      setGoalSeen(goal, ["oldpost", "mirror", "newpost", "other"], false),
    ).toEqual(["other"]);
    expect(setGoalSeen(goal, ["other", "newpost"], true)).toEqual([
      "other",
      "newpost",
    ]);
  });
  it("cannot inherit history from an unrelated host, path or credential-bearing URL", () => {
    const unsafe = {
      ...goal,
      alternatives: [
        "https://reddit.com.evil.test/r/soccer/comments/unrelated/",
        "https://www.reddit.com/user/comments/notapost/",
        "https://secret@www.reddit.com/r/soccer/comments/credential/",
      ],
      mirrors: [],
    };
    expect(goalPostIds(unsafe)).toEqual(["newpost"]);
    expect(
      hasSeenGoal(unsafe, new Set(["unrelated", "notapost", "credential"])),
    ).toBe(false);
  });
});
