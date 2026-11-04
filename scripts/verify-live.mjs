// Run against a disposable .NET database, never a shared/operational workspace.
import {
  chromium,
  expect,
} from "@playwright/test";
if (process.env.TOUCHLINE_ALLOW_WRITES !== "1" || !process.env.TOUCHLINE_URL)
  throw new Error(
    "Set TOUCHLINE_URL to a disposable host and TOUCHLINE_ALLOW_WRITES=1.",
  );
const base = process.env.TOUCHLINE_URL;
const browser = await chromium.launch();
const writer = await browser.newContext();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const original = await (
  await writer.request.get(`${base}/api/preferences`)
).json();
const ids = [];
const suffix = Date.now().toString(36);
try {
  await writer.request.put(`${base}/api/preferences`, {
    data: { teams: ["benfica"], matches: [], spoilers: false, watched: [] },
  });
  const page = await context.newPage();
  let dashboardRequests = 0,
    embedLoads = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/dashboard")
      dashboardRequests++;
  });
  await page.route("https://streamable.com/e/liveclip*", (route) => {
    embedLoads++;
    return route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Controlled clip</title><main>Playback stays mounted</main>",
    });
  });
  await page.goto(base);
  await expect(page.locator(".live-status")).toHaveAttribute(
    "data-state",
    "connected",
  );
  const initialRequests = dashboardRequests;
  async function add(number, minute, clip) {
    const response = await writer.request.post(`${base}/api/clips`, {
      data: {
        title: `Benfica [${number}]-0 Porto - Live player ${number} ${minute}'`,
        redditUrl: `https://www.reddit.com/r/soccer/comments/live${suffix}${number}/goal/`,
        clipUrl: clip ? "https://streamable.com/liveclip" : null,
      },
    });
    expect(response.ok()).toBe(true);
    const goal = await response.json();
    ids.push(goal.id);
    return goal;
  }
  await add(1, 18, true);
  await expect(
    page.getByRole("heading", { name: "Live player 1", exact: true }),
  ).toBeVisible({ timeout: 6000 });
  await expect(
    page.frameLocator("iframe").getByText("Playback stays mounted"),
  ).toBeVisible();
  await add(2, 30, false);
  await expect(page.locator(".goal-row")).toHaveCount(2, { timeout: 6000 });
  await expect(
    page.getByRole("heading", { name: "Live player 1", exact: true }),
  ).toBeVisible();
  expect(embedLoads).toBe(1);
  expect(dashboardRequests).toBe(initialRequests);
  await page.getByRole("button", { name: "Expand player" }).click();
  await expect(page.locator(".goal-queue")).not.toBeVisible();
  const player = await page.locator(".player-column").boundingBox();
  expect(player.width).toBeGreaterThan(1300);
  await page.keyboard.press("Escape");
  await expect(page.locator(".goal-queue")).toBeVisible();
  await context.setOffline(true);
  await expect(page.locator(".live-status")).toHaveAttribute(
    "data-state",
    "offline",
  );
  await add(3, 42, false);
  await context.setOffline(false);
  await expect(page.locator(".goal-row")).toHaveCount(3, { timeout: 8000 });
  await expect(page.locator(".live-status")).toHaveAttribute(
    "data-state",
    "connected",
  );
  await expect(
    page.getByRole("heading", { name: "Live player 1", exact: true }),
  ).toBeVisible();
  expect(embedLoads).toBe(1);
  expect(dashboardRequests).toBe(initialRequests);
  console.log(
    "PASS push updates: new goals without REST polling, uninterrupted playback, cinema/Escape, offline recovery.",
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
  const shell = await page.locator(".app-shell").boundingBox();
  expect(shell.width).toBe(1920);
  console.log(
    "PASS full-screen layout: all 1920px are available to the workspace.",
  );
} finally {
  for (const id of ids) await writer.request.delete(`${base}/api/clips/${id}`);
  await writer.request.put(`${base}/api/preferences`, { data: original });
  await browser.close();
}
