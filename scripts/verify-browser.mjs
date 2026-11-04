import {
  chromium,
  devices,
  expect,
} from "../../relay/web/node_modules/@playwright/test/index.mjs";
import AxeBuilder from "../../relay/web/node_modules/@axe-core/playwright/dist/index.mjs";
import { mkdir } from "node:fs/promises";
const base = process.env.TOUCHLINE_URL || "http://127.0.0.1:5195";
const browser = await chromium.launch();
const api = await browser.newContext();
await mkdir(new URL("../docs/", import.meta.url), { recursive: true });
async function fits(page, label) {
  const size = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    sw: document.scrollingElement.scrollWidth,
    sh: document.scrollingElement.scrollHeight,
  }));
  expect(size.sw, `${label} horizontal overflow`).toBeLessThanOrEqual(
    size.width + 1,
  );
  expect(size.sh, `${label} page overflow`).toBeLessThanOrEqual(
    size.height + 1,
  );
}
async function accessible(page, label) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
    label,
  ).toEqual([]);
}
try {
  for (const [width, height] of [
    [1440, 900],
    [1280, 800],
    [1024, 768],
    [390, 844],
    [375, 812],
    [320, 568],
  ]) {
    if (process.env.WIDTH && Number(process.env.WIDTH) !== width) continue;
    const context = await browser.newContext({
      ...(width < 760 ? devices["iPhone 13"] : {}),
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.log("PAGE ERROR", e.message);
    });
    await page.goto(`${base}/?sample=true`);
    await expect(page.locator(".goal-row")).toHaveCount(4);
    await fits(page, `Goal room ${width}`);
    if (width === 1440 || width === 390)
      await accessible(page, `Sample goal room ${width}`);
    await page.screenshot({
      path: new URL(
        `../docs/${width === 1440 ? "workspace" : "viewport-" + width}.png`,
        import.meta.url,
      ).pathname.replace(/^\/(\w:)/, "$1"),
      fullPage: true,
    });
    await page.locator(".goal-row").first().click();
    await expect(
      page.getByRole("heading", { name: "67 minutes. In the net." }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Hide spoilers", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "A goal worth waiting for." }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Reveal goal", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "67 minutes. In the net." }),
    ).toBeVisible();
    await fits(page, `Player ${width}`);
    if (width === 390) {
      await accessible(page, "Mobile player");
      await page.screenshot({
        path: new URL("../docs/mobile.png", import.meta.url).pathname.replace(
          /^\/(\w:)/,
          "$1",
        ),
      });
    }
    await page.getByRole("button", { name: "Your teams", exact: true }).click();
    await page
      .getByRole("searchbox", { name: "Search teams" })
      .fill("Sporting");
    await page
      .getByRole("button", { name: "Follow Sporting CP", exact: true })
      .click();
    await page.reload();
    await page
      .getByRole("searchbox", { name: "Search teams" })
      .fill("Sporting");
    await expect(
      page.getByRole("button", { name: "Unfollow Sporting CP", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    if (width === 1440 || width === 390)
      await accessible(page, `Teams ${width}`);
    await page.getByRole("button", { name: "Goal room", exact: true }).click();
    if (width <= 1120)
      await page.getByRole("button", { name: /^Matches/ }).click();
    await page
      .getByRole("button", {
        name: "Follow match: Benfica versus FC Porto",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Unfollow match: Benfica versus FC Porto",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await fits(page, `Match sidebar ${width}`);
    if (width === 390) await accessible(page, "Mobile matches drawer");
    if (width <= 1120)
      await page
        .getByRole("button", { name: "Close matches sidebar", exact: true })
        .click();
    await page.getByRole("button", { name: "Sources", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Reddit goal feed" }),
    ).toBeVisible();
    if (width === 1440 || width === 390)
      await accessible(page, `Sources ${width}`);
    await fits(page, `Sources ${width}`);
    expect(errors).toEqual([]);
    await context.close();
    console.log(
      `PASS ${width}x${height}: favourites, match follows, spoilers, player, persistence and viewport.`,
    );
  }

  // Run only against a disposable local database: this branch exercises real API writes.
  if (process.env.TOUCHLINE_ALLOW_WRITES === "1") {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    const original = await (
      await page.request.get(`${base}/api/preferences`)
    ).json();
    let goal;
    try {
      await page.route("https://streamable.com/e/testclip*", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><title>Test clip host</title><main>Isolated playback test</main>",
        }),
      );
      await page.goto(base);
      await page.getByRole("button", { name: "Add clip", exact: true }).click();
      await page
        .getByLabel("Reddit post title")
        .fill("Benfica [1]-0 FC Porto - Test player 18'");
      await page
        .getByLabel("Reddit thread URL")
        .fill("https://www.reddit.com/r/soccer/comments/touchlinetest/goal/");
      await page.getByLabel("Clip URL").fill("https://streamable.com/testclip");
      await page
        .getByRole("button", { name: "Add to goal room", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Test player", exact: true }),
      ).toBeVisible();

      await expect(
        page.frameLocator("iframe").getByText("Isolated playback test"),
      ).toBeVisible();
      const data = await (
        await page.request.get(`${base}/api/dashboard`)
      ).json();
      goal = data.goals.find((g) => g.sourceUrl.includes("touchlinetest"));
      expect(goal.media.url).toBe("https://streamable.com/e/testclip");
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Test player", exact: true }),
      ).toBeVisible();
      await accessible(page, "Real mode manual goal");
      console.log(
        "PASS real mode: manual goal import, SQLite persistence and isolated iframe playback.",
      );
    } finally {
      if (goal) await page.request.delete(`${base}/api/clips/${goal.id}`);
      await page.request.put(`${base}/api/preferences`, { data: original });
      await context.close();
    }
  }
} finally {
  await api.close();
  await browser.close();
}
