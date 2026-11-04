import {
  chromium,
  expect,
} from "@playwright/test";
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    }),
    page = await context.newPage();
  const now = Date.now();
  await page.clock.install({ time: now });
  await page.route("**/api/live?*", (r) => r.abort());
  await page.route("**/api/preferences", (r) =>
    r.fulfill({
      json: { teams: [], matches: [], watched: [], spoilers: false },
    }),
  );
  const goals = ["expiring", "fresh"].map((id, index) => ({
    id,
    title: `Benfica [1]-0 Porto - ${id} 18'`,
    homeId: "benfica",
    awayId: "porto",
    homeScore: 1,
    awayScore: 0,
    scorer: id,
    minute: "18",
    publishedAt: new Date(
      index ? now - 3600000 : now - 48 * 3600000 + 2000,
    ).toISOString(),
    sourceUrl: "",
    media: null,
    alternatives: [],
    sample: false,
  }));
  await page.route("**/api/dashboard?*", (r) =>
    r.fulfill({
      json: {
        teams: [],
        matches: [],
        goals,
        sources: [],
        updatedAt: new Date(now).toISOString(),
        sample: false,
      },
    }),
  );
  await page.goto("http://127.0.0.1:5195/");
  await expect(page.locator(".goal-row")).toHaveCount(2);
  await context.setOffline(true);
  await page.clock.fastForward(2001);
  await expect(page.locator('[data-goal-id="expiring"]')).toHaveCount(0);
  await expect(page.locator('[data-goal-id="fresh"]')).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "fresh", exact: true }),
  ).toBeVisible();
  console.log(
    "PASS publication +48h expiry removes the goal and related player context while offline.",
  );
} finally {
  await browser.close();
}
