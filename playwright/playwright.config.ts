import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env") });

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

/**
 * Playwright configuration for the ATS submit-candidate suite.
 *
 * Tests live under ./tests (api + e2e) and follow the Page Object Model — page
 * objects in ./pages, injected into specs via ./fixtures/pages.fixture.ts.
 *
 * The app under test is a single, stateful NestJS instance (one SQLite DB + one
 * in-memory recorder) whose POST /test/reset resets *global* state. Tests
 * therefore run SERIALLY (workers: 1): parallel workers would reset the DB out
 * from under each other. This is a deliberate trade-off for a shared-state app.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
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
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  /**
   * Boot the app under test automatically. `npm start` runs the NestJS app on
   * :3000 (see qa-take-home-main/.env PORT). Locally we reuse an already-running
   * instance for fast reruns; in CI we always start fresh. Requires the app to
   * have been set up once (`npm run setup` in qa-take-home-main) so the SQLite
   * schema exists — POST /test/reset then handles seeding per test.
   */
  webServer: {
    command: "npm start",
    cwd: path.resolve(__dirname, "../qa-take-home-main"),
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
