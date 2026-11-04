// Crest fallback in the goals-only hub; no stored preferences are changed.
import {
  chromium,
  expect,
} from "../../relay/web/node_modules/@playwright/test/index.mjs";
const browser = await chromium.launch();
const base = process.env.TOUCHLINE_URL || "http://127.0.0.1:5195";
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  await page.route("**/api/preferences", (route) =>
    route.fulfill({
      json: { teams: [], matches: [], watched: [], spoilers: false },
    }),
  );
  await page.route("**/api/live?*", (route) => route.abort());
  await page.route("**/api/dashboard?*", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.teams.find((team) => team.id === "braga").crest =
      "https://crests.football-data.org/5613.svg";
    body.goals = [
      {
        id: "crest-test",
        title: "Sample goal",
        homeId: "braga",
        awayId: "porto",
        homeScore: 1,
        awayScore: 0,
        minute: "18",
        scorer: "Sample scorer",
        sample: true,
        sourceUrl: "",
        media: null,
        alternatives: [],
        publishedAt: new Date().toISOString(),
      },
    ];
    await route.fulfill({ response, json: body });
  });
  await page.route("https://crests.football-data.org/5613.svg", (route) =>
    route.fulfill({ status: 404, body: "Controlled missing SVG" }),
  );
  await page.goto(base);
  const crest = page.locator(".goal-row .goal-team").first().locator("img");
  await expect(crest).toHaveAttribute(
    "src",
    "https://crests.football-data.org/5613.png",
  );
  await expect
    .poll(() =>
      crest.evaluate((image) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  console.log(
    "PASS goal crest recovers a missing SVG through its PNG alternative.",
  );
} finally {
  await browser.close();
}
