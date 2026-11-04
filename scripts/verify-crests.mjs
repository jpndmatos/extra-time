// Real crest loading plus one controlled format failure, without changing follows.
import {
  chromium,
  expect,
} from "../../relay/web/node_modules/@playwright/test/index.mjs";
const base = process.env.TOUCHLINE_URL || "http://127.0.0.1:5195";
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  await page.goto(base);
  await page.getByRole("button", { name: "Your teams", exact: true }).click();
  for (const name of [
    "Portsmouth",
    "Swansea",
    "LASK",
    "Slovan",
    "Preston",
    "Sheffield",
    "Braga",
  ]) {
    await page.getByRole("searchbox", { name: "Search teams" }).fill(name);
    const images = page.locator(".team-row .team-crest img");
    await expect.poll(() => images.count()).toBeGreaterThan(0);
    await expect
      .poll(() =>
        images.evaluateAll((items) =>
          items.every((image) => image.complete && image.naturalWidth > 0),
        ),
      )
      .toBe(true);
    await expect(page.locator(".team-row .crest-fallback")).toHaveCount(0);
  }
  await page.close();
  const context = await browser.newContext();
  const fallback = await context.newPage();
  await fallback.route("**/api/live?*", (route) => route.abort());
  await fallback.route("**/api/dashboard?*", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.teams.find((team) => team.id === "braga").crest =
      "https://crests.football-data.org/5613.svg";
    await route.fulfill({ response, json: body });
  });
  await fallback.route("https://crests.football-data.org/5613.svg", (route) =>
    route.fulfill({ status: 404, body: "Controlled missing SVG" }),
  );
  await fallback.goto(base);
  await fallback
    .getByRole("button", { name: "Your teams", exact: true })
    .click();
  await fallback
    .getByRole("searchbox", { name: "Search teams" })
    .fill("SC Braga");
  const image = fallback.locator(".team-row .team-crest img");
  await expect(image).toHaveAttribute(
    "src",
    "https://crests.football-data.org/5613.png",
  );
  await expect
    .poll(() =>
      image.evaluate((item) => item.complete && item.naturalWidth > 0),
    )
    .toBe(true);
  await context.close();
  console.log(
    "PASS real crests for RSS aliases, corrected Braga ID and SVG-to-PNG recovery.",
  );
} finally {
  await browser.close();
}
