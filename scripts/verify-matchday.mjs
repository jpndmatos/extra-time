import {
  chromium,
  expect,
} from "../../relay/web/node_modules/@playwright/test/index.mjs";
const base = process.env.TOUCHLINE_URL || "http://127.0.0.1:5195";
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  timezoneId: "Europe/Lisbon",
});
try {
  const page = await context.newPage();
  const beforeMidnight = new Date();
  beforeMidnight.setUTCHours(23, 59, 50, 0);
  await page.clock.install({ time: beforeMidnight });
  await page.goto(`${base}/?sample=true&view=matchday`);
  await expect(
    page.getByRole("button", { name: "Go to today" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(new URL(page.url()).searchParams.has("day")).toBe(false);
  const originalLabel = await page
    .getByRole("button", { name: "Go to today" })
    .innerText();
  await page.clock.fastForward(31_000);
  await expect(
    page.getByRole("button", { name: "Go to today" }),
  ).not.toHaveText(originalLabel);
  expect(new URL(page.url()).searchParams.has("day")).toBe(false);
  await page.getByRole("button", { name: "Previous day" }).click();
  await expect(
    page.getByRole("button", { name: "Go to today" }),
  ).toHaveAttribute("aria-pressed", "false");
  const explicitDay = new URL(page.url()).searchParams.get("day");
  expect(explicitDay).toBeTruthy();
  await page.reload();
  expect(new URL(page.url()).searchParams.get("day")).toBe(explicitDay);
  await expect(
    page.getByRole("button", { name: "Go to today" }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Go to today" }).click();
  await expect(
    page.getByRole("button", { name: "Go to today" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(new URL(page.url()).searchParams.has("day")).toBe(false);
  console.log(
    "PASS matchday: follows midnight, retains explicitly selected days, Today resumes automatic date updates.",
  );
} finally {
  await browser.close();
}
