// The goals-only hub follows midnight; explicit dates are a sample-only bookmark.
import {
  chromium,
  expect,
} from "@playwright/test";
const browser = await chromium.launch();
const base = process.env.TOUCHLINE_URL || "http://127.0.0.1:5195";
try {
  const context = await browser.newContext({ timezoneId: "Europe/Lisbon" });
  const page = await context.newPage();
  await page.clock.install({ time: new Date("2026-11-04T23:59:50Z") });
  const days = [];
  await page.route("**/api/preferences", (route) =>
    route.fulfill({
      json: { teams: [], matches: [], watched: [], spoilers: false },
    }),
  );
  await page.route("**/api/live?*", (route) => route.abort());
  await page.route("**/api/dashboard?*", (route) => {
    const url = new URL(route.request().url());
    days.push(url.searchParams.get("day"));
    return route.fulfill({
      json: {
        teams: [],
        matches: [],
        goals: [],
        sources: [],
        updatedAt: new Date().toISOString(),
        sample: url.searchParams.get("sample") === "true",
      },
    });
  });
  await page.goto(base);
  await expect.poll(() => days.at(-1)).toBe("2026-11-04");
  await page.clock.runFor(30000);
  await expect.poll(() => days.at(-1)).toBe("2026-11-05");
  expect(new URL(page.url()).searchParams.get("day")).toBe(null);
  await page.goto(`${base}/?sample=true&day=2026-11-03`);
  await expect.poll(() => days.at(-1)).toBe("2026-11-03");
  await page.clock.runFor(60000);
  expect(new URL(page.url()).searchParams.get("day")).toBe("2026-11-03");
  console.log(
    "PASS goals follow Lisbon midnight; explicit sample dates remain pinned.",
  );
} finally {
  await browser.close();
}
