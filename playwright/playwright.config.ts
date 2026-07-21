import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env") });

/**
 * Playwright configuration for Contrario E2E automation.
 *
 * Tests live under ./tests and follow the Page Object Model — page
 * objects in ./pages, injected into specs via ./fixtures/pages.fixture.ts.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [
        ["junit", { outputFile: "test-results/junit.xml" }],
        ["json", { outputFile: "test-results/results.json" }],
        [
          "monocart-reporter",
          {
            name: "Contrario E2E",
            outputFile: "monocart-report/index.html",
          },
        ],
        ["html", { open: "never" }],
        ["list"],
      ]
    : [
        [
          "monocart-reporter",
          {
            name: "Contrario E2E",
            outputFile: "monocart-report/index.html",
          },
        ],
        ["html", { open: "never" }],
        ["list"],
      ],

  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
