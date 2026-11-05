import { browserOptions } from "./browser-options.mjs";
// Controlled local UI data. No preferences or clips are written to the server.
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const base = process.env.TOUCHLINE_URL || "http://127.0.0.1:5195";
const browser = await chromium.launch(browserOptions);
async function openSeen(page) {
  const accordion = page.locator(".seen-goals");
  if (
    (await accordion.count()) &&
    (await accordion.getAttribute("open")) === null
  )
    await accordion.locator("summary").click();
}
async function selectFromList(page, id) {
  const row = page.locator(`[data-goal-id="${id}"]`);
  if (!(await row.isVisible())) await openSeen(page);
  await row.click();
}
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const teams = [
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
    {
      id: "atletico",
      name: "Atlético Madrid",
      shortName: "ATM",
      country: "Spain",
      aliases: ["Atleti"],
    },
  ];
  const make = (id, scorer, homeId, awayId) => ({
    id,
    scorer,
    homeId,
    awayId,
    title: `Controlled goal - ${scorer}`,
    homeScore: 1,
    awayScore: 0,
    minute: "18",
    publishedAt: new Date().toISOString(),
    sourceUrl: `https://www.reddit.com/r/soccer/comments/${id}/goal/`,
    media: { kind: "embed", url: `https://streamable.com/e/${id}` },
    alternatives: [],
    sample: false,
  });
  const goals = [
    make("clipa", "First test scorer", "benfica", "porto"),
    make("clipb", "Second test scorer", "porto", "benfica"),
    {
      ...make("clipc", "João Félix", "atletico", "benfica"),
      watchReason: "Great goal",
    },
  ];
  let prefs = { teams: [], matches: [], watched: [], spoilers: false };
  let loads = 0;
  await page.route("**/api/preferences", (route) => {
    if (route.request().method() === "PUT")
      prefs = route.request().postDataJSON();
    return route.fulfill({ json: prefs });
  });
  await page.route("**/api/dashboard?*", (route) =>
    route.fulfill({
      json: {
        teams,
        matches: [],
        goals,
        sources: [],
        updatedAt: new Date().toISOString(),
        sample: false,
      },
    }),
  );
  await page.route("**/api/live?*", (route) => route.abort());
  await page.route("https://streamable.com/e/*", (route) => {
    loads++;
    return route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Controlled player</title><main>Browsing test player</main>",
    });
  });
  await page.goto(base);
  await expect(page.locator(".goal-row")).toHaveCount(3);
  await expect(
    page.frameLocator("iframe").getByText("Browsing test player"),
  ).toBeVisible();
  expect(loads).toBe(1);
  await expect(page.locator(".goal-row.selected")).not.toHaveClass(/watched/);
  expect(prefs.watched).toEqual([]);
  await expect(
    page.locator(".topbar").getByRole("searchbox", { name: "Search goals" }),
  ).toBeVisible();
  await expect(page.locator(".goal-queue .goal-search")).toHaveCount(0);
  await openSeen(page);
  await page.locator(".goal-row.selected").click();
  await expect(page.locator("iframe")).toHaveCount(1);
  expect(loads).toBe(1);
  await page.getByRole("searchbox", { name: "Search goals" }).fill("joao");
  await expect(page.locator(".goal-row")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "First test scorer", exact: true }),
  ).toBeVisible();
  expect(loads).toBe(1);
  expect(new URL(page.url()).searchParams.get("q")).toBe("joao");
  await selectFromList(page, "clipc");
  await expect.poll(() => prefs.watched.includes("clipa")).toBe(true);
  await expect(page.locator(".goal-row.selected")).not.toHaveClass(/watched/);
  await expect(
    page.getByRole("heading", { name: "João Félix", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Goal navigation" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("searchbox", { name: "Search goals" }),
  ).toHaveValue("joao");
  await expect(page.locator(".goal-row")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Clear goal search", exact: true })
    .click();
  await expect(page.locator(".goal-row")).toHaveCount(3);
  await selectFromList(page, "clipb");
  await expect(
    page.getByRole("heading", { name: "Second test scorer", exact: true }),
  ).toBeVisible();
  await selectFromList(page, "clipc");
  await expect(
    page.getByRole("heading", { name: "João Félix", exact: true }),
  ).toBeVisible();
  await page.locator(".goal-list").focus();
  await openSeen(page);
  await page.locator(".goal-list").press("ArrowDown");
  await expect(page.locator(".goal-row").first()).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "João Félix", exact: true }),
  ).toBeVisible();
  await page.locator(".goal-row").first().press("ArrowDown");
  await expect(page.locator(".goal-row").nth(1)).toBeFocused();
  const keyboardTarget = await page
    .locator(".goal-row")
    .nth(1)
    .getAttribute("data-goal-id");
  await page.locator(".goal-row").nth(1).press("Enter");
  await expect(
    page.getByRole("heading", {
      name: goals.find((goal) => goal.id === keyboardTarget).scorer,
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Hide spoilers", exact: true })
    .click();
  await expect(page.locator(".post-details")).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search goals" }).fill("Felix");
  await expect(page.locator(".goal-row")).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search goals" }).fill("Atleti");
  await expect(page.locator(".goal-row")).toHaveCount(1);
  await selectFromList(page, "clipc");
  await page.getByRole("button", { name: "Reveal goal", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search goals" }).fill("Felix");
  await expect(page.locator(".goal-row")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Clear goal search", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Show spoilers", exact: true })
    .click();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations.map((item) => ({
      id: item.id,
      nodes: item.nodes.map((node) => ({
        target: node.target,
        summary: node.failureSummary,
      })),
    })),
  ).toEqual([]);
  await expect(page.locator(".match-scoreboard")).toHaveCount(0);
  await page.getByText("Original post", { exact: true }).click();
  await expect(
    page.getByText("Controlled goal - João Félix", { exact: true }),
  ).toBeVisible();
  await page.getByText("Original post", { exact: true }).click();
  const density = await page.evaluate(() => ({
    controlsY: document
      .querySelector(".header-utilities .heading-actions")
      .getBoundingClientRect().y,
    feedsY: document.querySelector(".goal-search").getBoundingClientRect().y,
    rowHeight: document.querySelector(".goal-row").getBoundingClientRect()
      .height,
    playerHeight: document.querySelector(".video-stage").getBoundingClientRect()
      .height,
  }));
  expect(Math.abs(density.controlsY - density.feedsY)).toBeLessThan(8);
  expect(density.rowHeight).toBeLessThan(100);
  expect(density.playerHeight).toBeGreaterThan(500);
  await expect(page.locator(".app-footer")).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 568 });
  expect(
    await page
      .locator(".topbar")
      .evaluate((element) => element.getBoundingClientRect().height),
  ).toBeLessThanOrEqual(92);
  await expect(page.locator(".main-navigation")).toHaveCount(0);
  await expect(
    page.getByRole("searchbox", { name: "Search goals" }),
  ).toBeInViewport();
  await page
    .getByRole("button", { name: "Back to goals", exact: true })
    .click();
  await expect(page.locator("iframe")).toHaveCount(0);
  await openSeen(page);
  await page.locator(".goal-row").first().click();
  await expect(page.locator("iframe")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Back to goals", exact: true })
    .click();
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search goals" }).focus();
  await expect(
    page.getByRole("searchbox", { name: "Search goals" }),
  ).toBeFocused();
  await page
    .getByRole("searchbox", { name: "Search goals" })
    .fill("no such team");
  await expect(
    page.getByRole("heading", { name: "No matching goals", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(page.locator(".goal-row")).toHaveCount(3);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations.map((item) => ({
      id: item.id,
      nodes: item.nodes.map((node) => ({
        target: node.target,
        summary: node.failureSummary,
      })),
    })),
  ).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 900 });
  const longGoals = Array.from({ length: 20 }, (_, index) =>
    make(`long${index}`, `Queue scorer ${index}`, "benfica", "porto"),
  );
  await page.route("**/api/dashboard?*", async (route) => {
    const response = await route.fetch();
    const dashboard = await response.json();
    await route.fulfill({
      response,
      json: { ...dashboard, teams, matches: [], goals: longGoals },
    });
  });
  await page.goto(base);
  await expect(page.locator(".goal-row")).toHaveCount(20);
  await expect(page.locator(".match-goals > button")).toHaveCount(20);
  for (let index = 1; index <= 12; index++)
    await page.locator(`[data-match-goal-id="long${index}"]`).click();
  const activeTile = await page
    .locator('.match-goals [aria-current="true"]')
    .evaluate((tile) => {
      const bounds = tile.parentElement.getBoundingClientRect();
      const active = tile.getBoundingClientRect();
      return {
        left: active.left - bounds.left,
        right: bounds.right - active.right,
      };
    });
  expect(activeTile.left).toBeGreaterThanOrEqual(0);
  expect(activeTile.right).toBeGreaterThanOrEqual(0);
  expect(
    await page.locator(".goal-list").evaluate((list) => list.scrollTop),
  ).toBe(0);
  await expect(page.locator(".goal-list > .goal-row")).toHaveCount(20);
  await expect(page.locator(".goal-row.selected")).not.toHaveClass(/watched/);
  await expect.poll(() => prefs.watched.includes("long11")).toBe(true);
  await openSeen(page);
  await page.locator(".goal-row.selected").scrollIntoViewIfNeeded();
  const queuePosition = await page.locator(".goal-list").evaluate((list) => {
    const active = list
      .querySelector(".goal-row.selected")
      .getBoundingClientRect();
    const bounds = list.getBoundingClientRect();
    return {
      top: active.top >= bounds.top - 1,
      bottom: active.bottom <= bounds.bottom + 1,
      scrollTop: list.scrollTop,
    };
  });
  expect(queuePosition.top && queuePosition.bottom).toBe(true);
  expect(queuePosition.scrollTop).toBeGreaterThan(0);
  const loadCount = loads;
  await openSeen(page);
  await page.locator(".goal-row.selected").click();
  expect(loads).toBe(loadCount);
  const stableScroll = await page
    .locator(".goal-list")
    .evaluate((list) => list.scrollTop);
  await page.locator('[data-goal-id="long13"]').click();
  expect(
    await page.locator(".goal-list").evaluate((list) => list.scrollTop),
  ).toBe(stableScroll);
  await expect(page.locator('[data-goal-id="long12"]')).toHaveClass(/watched/);
  await expect(page.locator(".goal-row.selected")).not.toHaveClass(/watched/);
  const anchorY = await page
    .locator('[data-goal-id="long13"]')
    .evaluate((row) => row.getBoundingClientRect().y);
  const beforeRefreshLoads = loads;
  longGoals.unshift(
    make("incoming1", "New arrival one", "benfica", "porto"),
    make("incoming2", "New arrival two", "benfica", "porto"),
  );
  await page
    .getByRole("button", { name: "Refresh goals", exact: true })
    .click();
  await expect(page.locator(".goal-row")).toHaveCount(22);
  expect(
    Math.abs(
      (await page
        .locator('[data-goal-id="long13"]')
        .evaluate((row) => row.getBoundingClientRect().y)) - anchorY,
    ),
  ).toBeLessThanOrEqual(1);
  expect(
    await page.locator(".goal-list").evaluate((feed) => feed.scrollTop),
  ).toBeGreaterThan(stableScroll);
  await expect(page.locator(".goal-row.selected")).toHaveAttribute(
    "data-goal-id",
    "long13",
  );
  expect(loads).toBe(beforeRefreshLoads);
  longGoals.splice(0, 2);
  await page
    .getByRole("button", { name: "Refresh goals", exact: true })
    .click();
  await expect(page.locator(".goal-row")).toHaveCount(20);
  expect(
    Math.abs(
      (await page
        .locator('[data-goal-id="long13"]')
        .evaluate((row) => row.getBoundingClientRect().y)) - anchorY,
    ),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(
      (await page.locator(".goal-list").evaluate((feed) => feed.scrollTop)) -
        stableScroll,
    ),
  ).toBeLessThanOrEqual(1);
  await page
    .getByRole("button", { name: "Mark as watched", exact: true })
    .click();
  await expect.poll(() => prefs.watched.includes("long13")).toBe(true);
  prefs = { ...prefs, watched: [], spoilers: true };
  await page.goto(base);
  await expect(
    page.getByRole("button", { name: "Reveal goal", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".goal-row.selected")).not.toHaveClass(/watched/);
  expect(prefs.watched).toEqual([]);
  await page.getByRole("button", { name: "Reveal goal", exact: true }).click();
  await expect(page.locator(".goal-row.selected")).not.toHaveClass(/watched/);
  expect(prefs.watched).toEqual([]);
  await page.locator('[data-match-goal-id="long1"]').click();
  await expect.poll(() => prefs.watched.includes("long0")).toBe(true);
  expect(prefs.watched).not.toContain("long1");
  await selectFromList(page, "long0");
  await page
    .getByRole("button", { name: "Mark as unwatched", exact: true })
    .click();
  await expect(page.locator(".goal-row.selected")).not.toHaveClass(/watched/);
  await expect.poll(() => prefs.watched.includes("long0")).toBe(false);
  await openSeen(page);
  await page.locator(".goal-row.selected").click();
  await expect(page.locator(".goal-row.selected")).not.toHaveClass(/watched/);
  await page
    .getByRole("button", { name: "Mark as watched", exact: true })
    .click();
  await expect(page.locator(".goal-list > .goal-row")).toHaveCount(20);
  await expect.poll(() => prefs.watched.includes("long0")).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Reveal goal", exact: true }).click();
  await expect(
    page.frameLocator("iframe").getByText("Browsing test player"),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Viewing history" }),
  ).toHaveCount(0);
  await expect(page.locator(".goal-list > .goal-row")).toHaveCount(19);
  await expect(page.locator(".seen-goals .goal-row")).toHaveCount(1);
  await page.locator(".goal-list").press("End");
  await expect(page.locator(".goal-row:focus")).toHaveAttribute(
    "data-goal-id",
    "long19",
  );
  await page.locator(".seen-goals").evaluate((node) => (node.open = false));
  await expect(page.locator(".seen-goals .goal-row")).not.toBeVisible();
  const beforeCollapse = loads;
  await page.locator(".seen-goals > summary").click();
  await expect(page.locator(".seen-goals .goal-row")).toBeVisible();
  expect(loads).toBe(beforeCollapse);
  const beforeMirror = loads;
  const originalPost = longGoals[0];
  longGoals[0] = {
    ...originalPost,
    id: "reposted",
    sourceUrl: "https://www.reddit.com/r/soccer/comments/reposted/goal/",
    alternatives: [originalPost.sourceUrl],
  };
  await page
    .getByRole("button", { name: "Refresh goals", exact: true })
    .click();
  await expect(page.locator(".goal-row.selected")).toHaveAttribute(
    "data-goal-id",
    "reposted",
  );
  await expect(page.locator(".goal-row.selected")).toHaveClass(/watched/);
  await expect(
    page.getByRole("heading", { name: "Queue scorer 0", exact: true }),
  ).toBeVisible();
  expect(loads).toBe(beforeMirror);
  await page
    .getByRole("button", { name: "Mark as unwatched", exact: true })
    .click();
  await expect(page.locator(".goal-row.selected")).not.toHaveClass(/watched/);
  expect(prefs.watched).not.toContain("long0");
  expect(prefs.watched).not.toContain("reposted");
  await page.setViewportSize({ width: 390, height: 600 });
  const mobileBack = page.getByRole("button", {
    name: "Back to goals",
    exact: true,
  });
  if (await mobileBack.isVisible()) await mobileBack.click();
  await page.locator('[data-goal-id="long12"]').scrollIntoViewIfNeeded();
  const mobileScroll = await page
    .locator(".goal-list")
    .evaluate((list) => list.scrollTop);
  const mobileY = await page
    .locator('[data-goal-id="long12"]')
    .evaluate((row) => row.getBoundingClientRect().y);
  await page.locator('[data-goal-id="long12"]').click();
  await expect(page.locator(".goal-row.selected")).not.toHaveClass(/watched/);
  await page.getByRole("button", { name: "Reveal goal", exact: true }).click();
  await expect(page.locator(".goal-row.selected")).not.toHaveClass(/watched/);
  const mobileControls = await page.locator(".goal-info").evaluate((info) => {
    const caption = info.querySelector(".clip-caption").getBoundingClientRect();
    const actions = info.querySelector(".clip-actions").getBoundingClientRect();
    return {
      overlap:
        Math.min(caption.bottom, actions.bottom) -
        Math.max(caption.top, actions.top),
      fits: actions.right <= info.getBoundingClientRect().right,
    };
  });
  expect(mobileControls.overlap).toBeGreaterThan(0);
  expect(mobileControls.fits).toBe(true);
  await page
    .getByRole("button", { name: "Back to goals", exact: true })
    .click();
  expect(
    await page.locator(".goal-list").evaluate((list) => list.scrollTop),
  ).toBe(mobileScroll);
  expect(
    await page
      .locator('[data-goal-id="long12"]')
      .evaluate((row) => row.getBoundingClientRect().y),
  ).toBe(mobileY);
  await expect(page.locator('[data-goal-id="long12"]')).toHaveClass(/watched/);
  expect(errors).toEqual([]);
  console.log(
    "PASS browsing: spoiler-safe search, accent/alias matching, bookmarked query, uninterrupted player, same-match goal selection, keyboard browsing and visible mobile search.",
  );
} finally {
  await browser.close();
}
