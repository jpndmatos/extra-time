// Controlled failures against the local UI. No real preferences or clips are written.
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const base = process.env.TOUCHLINE_URL || "http://127.0.0.1:5195";
const browser = await chromium.launch();
const backup = {
  media: { kind: "embed", url: "https://streamable.com/e/backup01" },
  sourceUrl: "https://www.reddit.com/r/soccer/comments/backup01/goal/",
};
const primary = { kind: "resolve", url: "https://streamin.link/v/primary01" };
const goal = {
  id: "controlled-goal",
  title: "Benfica [1]-0 Porto - Controlled test 18'",
  homeId: "benfica",
  awayId: "porto",
  homeScore: 1,
  awayScore: 0,
  scorer: "Controlled test",
  minute: "18",
  publishedAt: new Date().toISOString(),
  sourceUrl: "https://www.reddit.com/r/soccer/comments/primary01/goal/",
  media: primary,
  mirrors: [backup],
  alternatives: [backup.sourceUrl],
  sample: false,
};

async function scenario(item, handler, clock = false) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  if (clock) await page.clock.install();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/preferences", (route) =>
    route.fulfill({
      json: { teams: [], matches: [], watched: [], spoilers: false },
    }),
  );
  await page.route("**/api/dashboard?*", (route) =>
    route.fulfill({
      json: {
        teams: [
          {
            id: "benfica",
            name: "Benfica",
            shortName: "SLB",
            country: "Portugal",
            aliases: [],
          },
          {
            id: "porto",
            name: "Porto",
            shortName: "POR",
            country: "Portugal",
            aliases: [],
          },
        ],
        matches: [],
        goals: [
          item,
          {
            ...goal,
            id: "different-goal",
            minute: "25",
            homeScore: 2,
            media: { kind: "embed", url: "https://streamable.com/e/different" },
            mirrors: [],
          },
        ],
        sources: [],
        updatedAt: new Date().toISOString(),
        sample: false,
      },
    }),
  );
  await page.route("**/api/live?*", (route) => route.abort());
  await page.route("**/api/media", handler);
  await page.route("**/broken-test-video.mp4", (route) =>
    route.fulfill({ status: 404, body: "Controlled missing video" }),
  );
  await page.route("**/slow-test-video.mp4", () => {});
  await page.route("https://streamable.com/e/backup01*", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Test mirror</title><main>Working mirror of the same goal - controlled test</main>",
    }),
  );
  await page.route("https://streamable.com/e/different*", () => {
    throw new Error("Recovery must never play a different goal");
  });
  await page.route("https://streamable.com/e/primary01*", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Host error</title><main>This controlled host has removed the clip</main>",
    }),
  );
  await page.goto(base);
  return { context, page, errors };
}

try {
  const transientRequests = [];
  const transient = await scenario({ ...goal, mirrors: [] }, (route) => {
    transientRequests.push(route.request().postDataJSON());
    return transientRequests.length === 1
      ? route.fulfill({
          status: 503,
          json: { detail: "Controlled temporary deployment interruption" },
        })
      : route.fulfill({ json: backup.media });
  });
  await expect(
    transient.page
      .frameLocator("iframe")
      .getByText("Working mirror of the same goal - controlled test"),
  ).toBeVisible();
  expect(transientRequests).toHaveLength(2);
  expect(transientRequests[1].refresh).toBe(true);
  await expect(
    transient.page.getByRole("heading", { name: "No working clip right now" }),
  ).toHaveCount(0);
  expect(transient.errors).toEqual([]);
  await transient.context.close();
  console.log(
    "PASS temporary metadata failure retries once before declaring the clip unavailable.",
  );
  let state = await scenario(goal, (route) =>
    route.fulfill({
      status: 422,
      json: { detail: "Controlled unavailable host" },
    }),
  );
  await expect(
    state.page
      .frameLocator("iframe")
      .getByText("Working mirror of the same goal - controlled test"),
  ).toBeVisible();
  await expect(
    state.page.getByRole("status").filter({ hasText: "Backup, Source 2/2" }),
  ).toBeVisible();
  expect(
    await state.page
      .getByRole("link", { name: "Open Reddit post for source 2" })
      .getAttribute("href"),
  ).toBe(backup.sourceUrl);
  expect(
    (
      await new AxeBuilder({ page: state.page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations.map((item) => item.id),
  ).toEqual([]);
  expect(state.errors).toEqual([]);
  await state.context.close();
  console.log(
    "PASS unavailable host: automatic same-goal mirror, source attribution and accessibility.",
  );

  const requests = [];
  state = await scenario(goal, (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({
      json: { kind: "video", url: `${base}/broken-test-video.mp4` },
    });
  });
  await expect(
    state.page
      .frameLocator("iframe")
      .getByText("Working mirror of the same goal - controlled test"),
  ).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1].refresh).toBe(true);
  expect(state.errors).toEqual([]);
  await state.context.close();
  console.log(
    "PASS missing video: one fresh publisher lookup, then automatic mirror without a retry loop.",
  );

  const slowRequests = [];
  state = await scenario(
    goal,
    (route) => {
      slowRequests.push(route.request().postDataJSON());
      return route.fulfill({
        json: { kind: "video", url: `${base}/slow-test-video.mp4` },
      });
    },
    true,
  );
  await expect(state.page.locator("video")).toHaveCount(1);
  await state.page.clock.fastForward(15_100);
  await expect.poll(() => slowRequests.length).toBe(2);
  await expect(state.page.locator("video")).toHaveCount(1);
  await state.page.clock.fastForward(15_100);
  await expect(
    state.page
      .frameLocator("iframe")
      .getByText("Working mirror of the same goal - controlled test"),
  ).toBeVisible();
  expect(slowRequests).toHaveLength(2);
  await state.page.clock.fastForward(20_000);
  await expect(
    state.page
      .frameLocator("iframe")
      .getByText("Working mirror of the same goal - controlled test"),
  ).toBeVisible();
  expect(state.errors).toEqual([]);
  await state.context.close();
  console.log(
    "PASS stalled video: bounded timeout and refresh, then mirror; loaded frames stay mounted.",
  );

  let healthy = false;
  const other = {
    media: { kind: "resolve", url: "https://streamin.me/v/backup02" },
    sourceUrl: backup.sourceUrl,
  };
  state = await scenario({ ...goal, mirrors: [other] }, (route) =>
    healthy
      ? route.fulfill({ json: backup.media })
      : route.fulfill({
          status: 422,
          json: { detail: "Controlled unavailable host" },
        }),
  );
  await expect(
    state.page.getByRole("heading", { name: "No working clip right now" }),
  ).toBeVisible();
  await expect(
    state.page.getByRole("button", { name: "Retry sources" }),
  ).toBeVisible();
  healthy = true;
  await state.page.getByRole("button", { name: "Retry sources" }).click();
  await expect(
    state.page
      .frameLocator("iframe")
      .getByText("Working mirror of the same goal - controlled test"),
  ).toBeVisible();
  expect(state.errors).toEqual([]);
  await state.context.close();
  console.log(
    "PASS exhausted sources: honest failure, original posts and successful retry after host recovery.",
  );

  state = await scenario(
    {
      ...goal,
      media: { kind: "embed", url: "https://streamable.com/e/primary01" },
    },
    (route) => route.fulfill({ status: 422 }),
  );
  await expect(
    state.page
      .frameLocator("iframe")
      .getByText("This controlled host has removed the clip"),
  ).toBeVisible();
  await state.page.getByRole("button", { name: "Try next source" }).click();
  await expect(
    state.page
      .frameLocator("iframe")
      .getByText("Working mirror of the same goal - controlled test"),
  ).toBeVisible();
  expect(state.errors).toEqual([]);
  await state.page.setViewportSize({ width: 320, height: 568 });
  await state.page.locator(".seen-goals > summary").click();
  await state.page.locator('[data-goal-id="controlled-goal"]').click();
  await state.page.getByRole("button", { name: "Try next source" }).click();
  await expect(
    state.page
      .frameLocator("iframe")
      .getByText("Working mirror of the same goal - controlled test"),
  ).toBeVisible();
  await state.page.getByRole("button", { name: "Clip not playing?" }).click();
  await expect(
    state.page.getByRole("heading", { name: "No working clip right now" }),
  ).toBeVisible();
  await state.page
    .getByRole("button", { name: "Retry sources" })
    .scrollIntoViewIfNeeded();
  await expect(
    state.page.getByRole("button", { name: "Retry sources" }),
  ).toBeInViewport();
  const bounds = await state.page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scrollWidth: document.scrollingElement.scrollWidth,
    scrollHeight: document.scrollingElement.scrollHeight,
  }));
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.width + 1);
  expect(bounds.scrollHeight).toBeLessThanOrEqual(bounds.height + 1);
  expect(
    (
      await new AxeBuilder({ page: state.page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations.map((item) => item.id),
  ).toEqual([]);
  await state.context.close();
  console.log(
    "PASS embedded host errors and 320px recovery UI: manual switch, retry visibility, viewport and accessibility.",
  );
} finally {
  await browser.close();
}
