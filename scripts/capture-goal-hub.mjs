// Capture actual playback in the local app without changing stored preferences.
import {
  chromium,
  expect,
} from "../../relay/web/node_modules/@playwright/test/index.mjs";
const base = process.env.TOUCHLINE_URL || "http://127.0.0.1:5195";
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const pending = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/dashboard" && response.ok(),
  );
  await page.goto(base);
  const data = await (await pending).json();
  await expect(page.locator(".goal-row")).not.toHaveCount(0);
  if (await page.locator(".seen-goals").count())
    await page.locator(".seen-goals").evaluate((node) => (node.open = true));
  const visibleIds = await page
    .locator(".goal-row")
    .evaluateAll((rows) => rows.map((row) => row.dataset.goalId));
  const index = data.goals.findIndex(
    (goal) => visibleIds.includes(goal.id) && goal.media?.kind === "resolve",
  );
  if (index < 0)
    throw new Error(
      "No native-playback goal is available in the current feed. Capture is not fabricated.",
    );
  await page
    .locator(".goal-row")
    .nth(visibleIds.indexOf(data.goals[index].id))
    .click();
  const reveal = page.getByRole("button", { name: "Reveal goal", exact: true });
  if (await reveal.isVisible()) await reveal.click();
  await expect(
    page.getByRole("heading", { name: data.goals[index].scorer, exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      () =>
        page
          .locator("video")
          .evaluate(
            (video) =>
              video.currentTime > 0 && !video.paused && video.readyState >= 3,
          ),
      { timeout: 30_000 },
    )
    .toBe(true);
  if (await page.locator(".seen-goals").count())
    await page.locator(".seen-goals").evaluate((node) => (node.open = false));
  await page.screenshot({ path: "docs/goal-room-live.png" });
  console.log("PASS actual playback captured: " + data.goals[index].title);
} finally {
  await browser.close();
}
