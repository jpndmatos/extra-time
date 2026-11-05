// CI can use the runner's installed Chrome; local checks default to the pinned
// Playwright browser installed with `npx playwright install chromium`.
export const browserOptions = process.env.TOUCHLINE_BROWSER_CHANNEL
  ? { channel: process.env.TOUCHLINE_BROWSER_CHANNEL }
  : {};
