import { browserOptions } from "./browser-options.mjs";
import { chromium, devices, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
const base = process.env.TOUCHLINE_URL || "http://127.0.0.1:5195";
const browser = await chromium.launch(browserOptions);
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
  const footer = await page.locator(".workspace-footer").boundingBox();
  expect(footer, `${label} shared footer`).not.toBeNull();
  expect(
    Math.abs(footer.y + footer.height - size.height),
    `${label} footer stays at the bottom`,
  ).toBeLessThanOrEqual(1);
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
    [844, 390],
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
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Settings", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("searchbox", { name: "Search goals" }),
    ).toBeInViewport();
    await fits(page, `Goal room ${width}`);
    if (width <= 760) {
      for (const name of ["Refresh goals", "Hide spoilers"]) {
        const button = await page
          .getByRole("button", { name, exact: true })
          .boundingBox();
        expect(
          button.width,
          `${name} phone target width`,
        ).toBeGreaterThanOrEqual(44);
        expect(
          button.height,
          `${name} phone target height`,
        ).toBeGreaterThanOrEqual(44);
      }
    }
    const header = await page.evaluate(() => {
      const bounds = (selector) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { left: r.left, right: r.right, center: (r.left + r.right) / 2 };
      };
      return {
        width: innerWidth,
        search: bounds(".goal-search"),
        left: bounds(innerWidth > 1250 ? ".header-browse" : ".brand"),
        right: bounds(".header-utilities"),
      };
    });
    expect(
      header.search.left - header.left.right,
      "Search fills the space after the logo",
    ).toBeLessThanOrEqual(16);
    expect(
      header.right.left - header.search.right,
      "Search fills the space up to the tools",
    ).toBeLessThanOrEqual(16);
    expect(
      header.left.right,
      "Browsing does not overlap search",
    ).toBeLessThanOrEqual(header.search.left);
    expect(
      header.search.right,
      "Search does not overlap utilities",
    ).toBeLessThanOrEqual(header.right.left);
    expect(
      header.right.right,
      "Status stays at the right edge",
    ).toBeGreaterThan(width - 24);

    if (width === 1440 || width === 390)
      await accessible(page, `Sample goal room ${width}`);
    await page.screenshot({
      path: new URL(
        `../docs/${width === 1440 ? "workspace" : "viewport-" + width}.png`,
        import.meta.url,
      ).pathname.replace(/^\/(\w:)/, "$1"),
      fullPage: true,
    });
    const firstGoal = page.locator('[data-goal-id="sample-1"]');
    if (!(await firstGoal.isVisible()))
      await page.locator(".seen-goals > summary").click();
    await firstGoal.click();
    if (width >= 760)
      await expect(firstGoal).toHaveAccessibleName(/Sample scorer/);
    await expect(
      page.getByRole("heading", { name: "Sample goal" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Hide spoilers", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Goal hidden" }),
    ).toBeVisible();
    if (width >= 760)
      await expect(firstGoal).not.toHaveAccessibleName(
        /Sample scorer|67 minutes/,
      );
    await page
      .getByRole("button", { name: "Reveal goal", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Sample goal" }),
    ).toBeVisible();
    await fits(page, `Player ${width}`);
    if (width <= 760 && height >= 740) {
      await expect(page.locator(".goal-queue")).toBeVisible();
      const feed = await page.locator(".goal-list").boundingBox();
      expect(
        feed.height,
        "Phone feed remains usable below the player",
      ).toBeGreaterThan(100);
    }
    await page.locator(".connection-status > summary").click();
    await expect(page.locator(".connection-panel")).toBeVisible();
    const sourcePanel = await page.locator(".connection-panel").boundingBox();
    expect(
      sourcePanel.y,
      "Connection details remain on screen",
    ).toBeGreaterThanOrEqual(0);
    expect(
      sourcePanel.y + sourcePanel.height,
      "Connection details open above the footer",
    ).toBeLessThanOrEqual(height);
    await page.locator(".connection-status > summary").click();
    const controlBounds = await page
      .locator(".clip-actions")
      .evaluate((node) => node.getBoundingClientRect().bottom);
    expect(
      controlBounds,
      "Playback controls fit the viewport",
    ).toBeLessThanOrEqual(height);
    if (width === 390) {
      await accessible(page, "Mobile player");
      await page.screenshot({
        path: new URL("../docs/mobile.png", import.meta.url).pathname.replace(
          /^\/(\w:)/,
          "$1",
        ),
      });
    }
    const opened = page.locator(".goal-row.selected");
    await expect(opened).not.toHaveClass(/watched/);
    if (width < 760)
      await page
        .getByRole("button", { name: "Back to goals", exact: true })
        .click();
    else await page.locator('[data-match-goal-id="sample-2"]').click();
    await page.reload();
    await expect(page.locator(".goal-row.watched")).not.toHaveCount(0);
    await page
      .getByRole("searchbox", { name: "Search goals" })
      .fill("no such team");
    await expect(
      page
        .getByRole("heading", { name: "No matching goals", exact: true })
        .first(),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Clear search", exact: true })
      .click();
    await expect(page.locator(".goal-row")).toHaveCount(4);
    if (width === 1440) {
      await expect(page.locator(".match-goals > button")).toHaveCount(3);
      await expect(
        page.getByRole("navigation", { name: "Goal navigation" }),
      ).toHaveCount(0);
      await page.locator('[data-match-goal-id="sample-3"]').click();
      await expect(page.locator(".match-scoreline > strong")).toHaveText(
        "— : —",
      );
      await page
        .getByRole("button", { name: "Reveal goal", exact: true })
        .click();
      await expect(page.locator(".match-scoreline > strong")).toHaveText(
        "1 : 0",
      );
      await expect(
        page.getByText("Score at this goal", { exact: true }),
      ).toBeVisible();
    }
    expect(errors).toEqual([]);
    await context.close();
    console.log(
      `PASS ${width}x${height}: all goals, search, spoilers, seen state, player and viewport.`,
    );
  }
} finally {
  await browser.close();
}
