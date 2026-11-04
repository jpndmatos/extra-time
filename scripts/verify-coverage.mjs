// Controlled coverage fixtures exercise the local UI without saving user data.
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
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const source = "https://www.reddit.com/r/soccer/comments/controlled/goal/";
  const regular = {
    id: "regular",
    title: "Portsmouth [1]-0 Swansea - Regular scorer 18'",
    homeId: "rss-portsmouth",
    awayId: "rss-swansea",
    homeName: "Portsmouth",
    awayName: "Swansea",
    homeScore: 1,
    awayScore: 0,
    scorer: "Regular scorer",
    minute: "18",
    publishedAt: yesterday,
    sourceUrl: source,
    media: { kind: "embed", url: "https://streamable.com/e/controlled" },
    alternatives: [],
    sample: false,
  };
  const great = {
    ...regular,
    id: "great",
    title: "Manchester United [1]-0 AS Roma - Tagged scorer 32' (Great goal)",
    homeId: "man-utd",
    awayId: "rss-as-roma",
    homeName: "Manchester United",
    awayName: "AS Roma",
    scorer: "Tagged scorer",
    minute: "32",
    watchReason: "Great goal",
    watchSourceUrl: source,
  };
  const teams = ["Portsmouth", "Swansea", "Manchester United", "AS Roma"].map(
    (name, index) => ({
      id: [regular.homeId, regular.awayId, great.homeId, great.awayId][index],
      name,
      shortName: name.slice(0, 3),
      country: "Test",
      aliases: [],
    }),
  );
  const matches = [
    {
      id: "provider",
      homeId: "rss-portsmouth-fc",
      awayId: "rss-swansea-city-afc",
      homeName: "Portsmouth FC",
      awayName: "Swansea City AFC",
      kickoff: yesterday,
      competition: "Championship",
      status: "FINISHED",
      homeScore: 1,
      awayScore: 0,
      source: "football-data",
      goalIds: ["regular"],
    },
    {
      id: "discovered",
      homeId: great.homeId,
      awayId: great.awayId,
      homeName: great.homeName,
      awayName: great.awayName,
      kickoff: yesterday,
      competition: "r/soccer goal posts",
      status: "GOALS_AVAILABLE",
      homeScore: null,
      awayScore: null,
      source: "reddit",
      goalIds: ["great"],
    },
    {
      id: "upcoming",
      homeId: "arsenal",
      awayId: "chelsea",
      homeName: "Arsenal",
      awayName: "Chelsea",
      kickoff: now.toISOString(),
      competition: "Premier League",
      status: "SCHEDULED",
      homeScore: null,
      awayScore: null,
      source: "football-data",
      goalIds: [],
    },
  ];
  let prefs = { teams: [], matches: [], watched: [], spoilers: false };
  await page.route("**/api/preferences", (route) => {
    if (route.request().method() === "PUT")
      prefs = route.request().postDataJSON();
    return route.fulfill({ json: prefs });
  });
  await page.route("**/api/dashboard?*", (route) =>
    route.fulfill({
      json: {
        teams,
        matches,
        goals: [regular, great],
        sources: [],
        updatedAt: now.toISOString(),
        sample: false,
      },
    }),
  );
  await page.route("**/api/live?*", (route) => route.abort());
  await page.route("https://streamable.com/e/controlled*", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Controlled clip</title><main>Coverage test player</main>",
    }),
  );
  await page.goto(
    `${base}/?view=teams&feed=following&team=old-club&match=old-match`,
  );
  await expect(page.locator(".goal-row")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("feed")).toBe(null);
  expect(new URL(page.url()).searchParams.get("team")).toBe(null);
  await page.locator(".goal-row").nth(1).click();
  await expect(
    page.getByRole("heading", { name: "Tagged scorer", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Great goal, tagged on Reddit/ }),
  ).toHaveAttribute("href", source);
  await page.locator(".goal-row").first().click();
  await expect(
    page.getByRole("heading", { name: "Regular scorer", exact: true }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations.map((item) => item.id),
  ).toEqual([]);
  console.log(
    "PASS goals-only coverage: old favourite and match URLs cannot hide goals; tagged and regular goals remain available.",
  );
} finally {
  await browser.close();
}
