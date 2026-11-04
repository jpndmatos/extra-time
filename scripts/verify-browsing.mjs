// Controlled local UI data. No preferences or clips are written to the server.
import {
  chromium,
  expect,
} from "../../relay/web/node_modules/@playwright/test/index.mjs";
import AxeBuilder from "../../relay/web/node_modules/@axe-core/playwright/dist/index.mjs";
const base = process.env.TOUCHLINE_URL || "http://127.0.0.1:5195";
const browser = await chromium.launch();
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
  await page.getByRole("searchbox", { name: "Search goals" }).fill("joao");
  await expect(page.locator(".goal-row")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "First test scorer", exact: true }),
  ).toBeVisible();
  expect(loads).toBe(1);
  expect(new URL(page.url()).searchParams.get("q")).toBe("joao");
  await page.getByRole("button", { name: "Next goal", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "João Félix", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next goal", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole("searchbox", { name: "Search goals" }),
  ).toHaveValue("joao");
  await expect(page.locator(".goal-row")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Clear goal search", exact: true })
    .click();
  await expect(page.locator(".goal-row")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Previous goal", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Second test scorer", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Previous goal", exact: true })
    .press("ArrowRight");
  await expect(
    page.getByRole("heading", { name: "João Félix", exact: true }),
  ).toBeVisible();
  await page.locator(".goal-list").focus();
  await page.locator(".goal-list").press("ArrowDown");
  await expect(page.locator(".goal-row").first()).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "João Félix", exact: true }),
  ).toBeVisible();
  await page.locator(".goal-row").first().press("ArrowDown");
  await expect(page.locator(".goal-row").nth(1)).toBeFocused();
  await page.locator(".goal-row").nth(1).press("Enter");
  await expect(
    page.getByRole("heading", { name: "Second test scorer", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Hide spoilers", exact: true })
    .click();
  await expect(page.locator(".post-details")).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search goals" }).fill("Felix");
  await expect(page.locator(".goal-row")).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search goals" }).fill("Atleti");
  await expect(page.locator(".goal-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Next goal", exact: true }).click();
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
      .querySelector(".workspace-toolbar .heading-actions")
      .getBoundingClientRect().y,
    feedsY: document.querySelector(".feed-tabs").getBoundingClientRect().y,
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
  ).toBeLessThanOrEqual(56);
  for (const name of ["All r/soccer", "Following", "Ones to watch"])
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toBeInViewport();
  await page
    .getByRole("button", { name: "Back to goals", exact: true })
    .click();
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.locator(".goal-row").first().click();
  await expect(page.locator("iframe")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Back to goals", exact: true })
    .click();
  await expect(page.locator("iframe")).toHaveCount(0);
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
  expect(errors).toEqual([]);
  console.log(
    "PASS browsing: spoiler-safe search, accent/alias matching, bookmarked query, uninterrupted player, previous/next, keyboard browsing and visible mobile feed choices.",
  );
} finally {
  await browser.close();
}
