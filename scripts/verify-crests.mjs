// Validate the bundled artwork and recover from a broken provider image.
import { chromium, expect } from "@playwright/test";
import { browserOptions } from "./browser-options.mjs";
import { readFile } from "node:fs/promises";
const browser = await chromium.launch(browserOptions);
const base = process.env.TOUCHLINE_URL || "http://127.0.0.1:5195";
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  let recoveryNames = [];
  await page.route("**/api/preferences", (route) =>
    route.fulfill({
      json: { teams: [], matches: [], watched: [], spoilers: false },
    }),
  );
  await page.route("**/api/live?*", (route) => route.abort());
  await page.route("**/api/dashboard?*", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    if (recoveryNames.length) {
      body.teams = recoveryNames.map((name, i) => ({
        id: `badge-${i}`,
        name,
        shortName: name.slice(0, 3),
        country: "",
        aliases: [],
        crest: null,
        crestFallback: null,
      }));
      body.matches = [];
      body.goals = recoveryNames
        .filter((_, i) => i % 2 === 0)
        .map((name, i) => ({
          id: `badge-goal-${i}`,
          title: `${name} 1-0 ${recoveryNames[i * 2 + 1]}`,
          homeId: `badge-${i * 2}`,
          awayId: `badge-${i * 2 + 1}`,
          homeName: name,
          awayName: recoveryNames[i * 2 + 1],
          homeScore: 1,
          awayScore: 0,
          minute: "18",
          scorer: "Test scorer",
          sample: true,
          sourceUrl: "",
          media: null,
          alternatives: [],
          publishedAt: new Date().toISOString(),
        }));
      await route.fulfill({ response, json: body });
      return;
    }
    const braga = body.teams.find((team) => team.id === "braga");
    braga.crest = "https://crests.football-data.org/5613.svg";
    braga.crestFallback = "/crests/5613.png";
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
  await page.route(
    /^https:\/\/crests\.football-data\.org\/5613\.(svg|png)$/,
    (route) =>
      route.fulfill({ status: 404, body: "Controlled unavailable provider" }),
  );
  await page.goto(`${base}/?sample=true`);
  const crest = page.locator(".goal-row .goal-team").first().locator("img");
  await expect(crest).toHaveAttribute("src", /(?:^|\/)crests\/5613\.png$/);
  await expect
    .poll(() =>
      crest.evaluate((image) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);

  recoveryNames = [
    "Juventus W",
    "OL Lyonnes W",
    "Servette W",
    "Bayern Munich W",
    "Koge W",
    "Leuven W",
    "Manchester City W",
    "Inter W",
    "PSG W",
    "Roma W",
    "Tavernes",
    "Trival Valderas",
    "Mijas Las Lagunas",
    "Jaen",
    "Amorebieta",
    "UD Logrones",
    "Bangladesh",
    "Sri Lanka",
  ];
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/?sample=true`);
    await expect(page.locator(".goal-row")).toHaveCount(9);
    await expect(page.locator(".goal-row .crest-fallback")).toHaveCount(0);
    // Navigating away marks the selected clip as seen; open history before checking lazy images.
    await page.locator(".seen-goals").evaluate((node) => {
      node.open = true;
    });
    const images = page.locator(".goal-row .team-crest img");
    await expect(images).toHaveCount(18);
    await expect(page.locator(".goal-queue")).toBeVisible();
    for (const image of await images.all()) {
      await image.scrollIntoViewIfNeeded();
      await expect(image).toBeInViewport();
      await expect
        .poll(
          () => image.evaluate((img) => img.complete && img.naturalWidth > 0),
          {
            message: `${width}px ${await image.getAttribute("src")} decodes`,
          },
        )
        .toBe(true);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }

  const catalogue = JSON.parse(
    await readFile(
      new URL("../src/Touchline.Api/crest-catalogue.json", import.meta.url),
      "utf8",
    ),
  );
  const files = [...new Set(catalogue.map((item) => item.file))];
  const failed = await page.evaluate(async (files) => {
    const failures = [];
    for (let offset = 0; offset < files.length; offset += 16) {
      await Promise.all(
        files.slice(offset, offset + 16).map(async (file) => {
          const image = new Image();
          image.src = new URL(`crests/${file}`, location.href).href;
          try {
            await image.decode();
            if (!image.naturalWidth) failures.push(file);
          } catch {
            failures.push(file);
          }
        }),
      );
    }
    return failures;
  }, files);
  expect(
    failed,
    "Every bundled club badge decodes from the deployed static path",
  ).toEqual([]);
  console.log(
    `PASS ${files.length} bundled crests decode; broken provider SVG and PNG recover locally.`,
  );
} finally {
  for (const context of browser.contexts())
    for (const page of context.pages())
      await page.unrouteAll({ behavior: "ignoreErrors" });
  await browser.close();
}
