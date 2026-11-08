// Static project path and a separate read-only API; both are disposable local hosts.
import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    }),
    page = await context.newPage();
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("http://127.0.0.1:5197/touchline/");
  await expect(
    page.getByRole("heading", { name: "Pages scorer", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".hub-status")).toHaveAttribute(
    "data-state",
    "connected",
  );
  await expect(page.locator(".brand img")).toHaveAttribute(
    "src",
    "/touchline/icon.svg?v=12",
  );
  await expect(page.locator(".brand")).toHaveAttribute("href", "/touchline/");
  await expect
    .poll(() =>
      page
        .locator(".brand img")
        .evaluate((img) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("touchline.preferences"))?.watched ||
          [],
      ),
    )
    .toEqual([]);
  await page
    .getByRole("button", { name: "Hide spoilers", exact: true })
    .click();
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("touchline.preferences"))?.watched ||
          [],
      ),
    )
    .toEqual(["pages-goal"]);
  await expect(
    page.getByRole("button", { name: "Show spoilers", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(requests.some((url) => url.includes("/api/preferences"))).toBe(false);
  expect(
    requests.some((url) =>
      url.startsWith("http://127.0.0.1:5196/api/dashboard"),
    ),
  ).toBe(true);
  expect(
    requests.some((url) => url.startsWith("http://127.0.0.1:5196/api/live")),
  ).toBe(true);
  const status = await page.evaluate(
    async () =>
      (
        await fetch("http://127.0.0.1:5196/api/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: "https://not-a-clip.example.test/" }),
        })
      ).status,
  );
  expect(status).toBe(422);
  const visitor = await browser.newContext();
  const other = await visitor.newPage();
  await other.goto("http://127.0.0.1:5197/touchline/");
  await expect(
    other.getByRole("button", { name: "Hide spoilers", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await visitor.close();
  console.log(
    "PASS Pages project path, separate REST/SSE/media API with real CORS, favicon/home path, local seen persistence and visitor isolation.",
  );
} finally {
  await browser.close();
}
