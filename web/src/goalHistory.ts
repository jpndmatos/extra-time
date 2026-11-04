import type { Goal } from "./types";

const posts = new WeakMap<Goal, readonly string[]>();
export function goalPostIds(goal: Goal): readonly string[] {
  const cached = posts.get(goal);
  if (cached) return cached;
  const ids = new Set([goal.id]);
  for (const source of [
    goal.sourceUrl,
    ...(goal.alternatives || []),
    ...(goal.mirrors || []).map((mirror) => mirror.sourceUrl),
  ]) {
    try {
      const url = new URL(source);
      if (
        url.protocol !== "https:" ||
        url.port ||
        url.username ||
        url.password ||
        !["reddit.com", "www.reddit.com", "old.reddit.com"].includes(
          url.hostname,
        )
      )
        continue;
      const match = url.pathname.match(
        /^\/r\/[^/]+\/comments\/([a-z0-9]+)(?:\/|$)/i,
      );
      if (match) ids.add(match[1].toLowerCase());
    } catch {
      /* Unsupported source links do not identify viewing history. */
    }
  }
  const result = [...ids];
  posts.set(goal, result);
  return result;
}
export function hasSeenGoal(goal: Goal, watched: ReadonlySet<string>) {
  return goalPostIds(goal).some((id) => watched.has(id));
}
export function setGoalSeen(goal: Goal, watched: string[], seen: boolean) {
  if (seen) return [...new Set([...watched, goal.id])].slice(-1000);
  const ids = new Set(goalPostIds(goal));
  return watched.filter((id) => !ids.has(id));
}
