import { defineConfig, devices } from "@playwright/test";

/**
 * Browser smoke tests.
 *
 * These are deliberately few and behavioural: they drive the real screens in a
 * real browser to prove the flows work end to end, and they assert on what the
 * page SAYS happened. The detailed rules are covered by the unit and
 * integration suites; this catches the class of failure those cannot — a screen
 * that does not render, a form that does not submit, a button wired to nothing.
 *
 * Run against a production build so what is tested is what would deploy.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "off",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Some environments ship a preinstalled Chromium that does not match
        // the version this Playwright release downloads. Point at it rather
        // than pulling a second copy.
        ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
          : {}),
      },
    },
  ],
  webServer: {
    command: "npm run build && npx next start -p 3100",
    url: "http://127.0.0.1:3100/api/health",
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      // Demo mode with the fixture WordPress: no real site, no credentials.
      NEXT_PUBLIC_DEMO_MODE: "1",
      WORDPRESS_USE_MOCK: "1",
      SEO_ENABLE_PRODUCTION_WRITES: "0",
    },
  },
});
