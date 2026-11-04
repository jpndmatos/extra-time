import {
  chromium,
  expect,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route("**/api/dashboard?*", async (route) => {
    const response = await route.fetch(),
      body = await response.json();
    const original = body.goals[0];
    body.goals = [
      ["main", "Dortmund", "Liverpool"],
      ["u19", "Dortmund U19", "Liverpool U19"],
      ["u21", "Dortmund U21", "Liverpool U21"],
      ["women", "Dortmund Women", "Liverpool Women"],
      ["youth", "Dortmund U17", "Liverpool U17"],
      ["reserves", "Dortmund II", "Liverpool II"],
    ].map(([id, homeName, awayName]) => ({
      ...original,
      id,
      homeId: "test-" + id,
      awayId: "away-" + id,
      homeName,
      awayName,
      title: `${homeName} [1]-0 ${awayName}`,
      media: null,
    }));
    body.matches = [];
    body.sources = [
      {
        name: "Reddit",
        state: "connected",
        message: "r/soccer public RSS",
        updatedAt: "2026-11-04T18:00:00Z",
      },
      {
        name: "football-data.org",
        state: "disconnected",
        message: "Add a key",
        updatedAt: null,
      },
    ];
    await route.fulfill({ response, json: body });
  });
  for (const width of [1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: width < 760 ? 844 : 900 });
    await page.goto("http://127.0.0.1:5195/?sample=true");
    await expect(page.locator(".goal-row")).toHaveCount(6);
    await expect(
      page.getByRole("navigation", { name: "Goal categories" }),
    ).toHaveCount(0);
    await expect(page.getByRole("combobox")).toHaveCount(0);
    const history = page.locator(".seen-goals");
    if (width >= 760) {
      await expect(history).toHaveCount(1);
      await expect(history).not.toHaveAttribute("open");
      await expect(history.locator(".goal-row")).toHaveCount(1);
    }
    const crest = page.locator(".goal-row img").first();
    await expect(crest).toHaveAttribute(
      "src",
      "https://crests.football-data.org/4.png",
    );
    await page.getByLabel("Connections and refresh status").click();
    await expect(
      page.getByText("Reddit · public feed", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("OAuth API is not connected.")).toBeVisible();
    await expect(page.getByText("No successful fetch yet")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      results.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    await page.getByLabel("Connections and refresh status").click();
    if (width === 390)
      await page.screenshot({ path: "docs/categories-mobile.png" });
    console.log(
      `PASS ${width}: all goal categories, in-list history, parent crests, source status and accessibility`,
    );
  }
} finally {
  await browser.close();
}
