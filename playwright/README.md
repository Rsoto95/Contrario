# Contrario E2E Playwright Automation

End-to-end test automation built with [Playwright](https://playwright.dev/) + TypeScript using the Page Object Model (POM).

## Project structure

```
playwright/
├── playwright.config.ts        # Playwright config (chromium project, reporters)
├── pages/                      # Page Object Model classes
│   ├── common/
│   │   └── BasePage.ts         #   Base class every page object extends
│   └── HomePage.ts             #   Example page object — replace with real pages
├── fixtures/
│   └── pages.fixture.ts        # Custom test fixture that injects page objects
├── utils/
│   └── env.ts                  # Typed access to .env variables
├── tests/
│   └── example.spec.ts         # Placeholder spec — replace with real tests
├── scripts/
│   └── upload-results-to-cherry.js  # Pushes results to Cherry (used in CI)
├── .github/workflows/
│   └── qa-smoke.yml            # Scheduled GitHub Actions smoke run
├── .env                        # Local config + credentials (git-ignored)
└── .env.example                # Template — copy to .env
```

## Setup

```bash
cd playwright
npm install
npx playwright install chromium
cp .env.example .env   # then fill in BASE_URL + credentials
```

## Running tests

```bash
npm test               # run the suite
npm run test:headed    # headed browser
npm run test:ui        # Playwright UI mode
npm run report         # open last Monocart report
```

## Conventions

- **Page objects live in `pages/`.** Extend `BasePage`, expose locators as
  readonly fields and actions as methods (no assertions — those live in specs).
- **Register each page object** in `fixtures/pages.fixture.ts` so specs can
  inject it.
- **Specs import from the fixture**, not `@playwright/test` directly:
  ```ts
  import { test, expect } from "../fixtures/pages.fixture";
  ```
- **No hardcoded URLs or credentials** — read them via `utils/env.ts` (backed by `.env`).
- **Quarantine flaky tests** by adding `@flaky` to the test title; the CI smoke
  run excludes them (`--grep-invert "@flaky"`).

## Continuous integration

A scheduled smoke test runs via **GitHub Actions** (`.github/workflows/qa-smoke.yml`).
It has no push/PR triggers — it runs daily at 10:00 UTC and can be started
manually from the **Actions** tab ("Run workflow").

Results are pushed to Cherry by `scripts/upload-results-to-cherry.js` (which
reads GitHub Actions' `GITHUB_*` env vars for the run link, branch, and commit).
JUnit, Monocart, and Playwright HTML reports are uploaded as run artifacts. The
run goes red when a test fails but still uploads everything first.

Configure these under **Settings → Secrets and variables → Actions**:

| Type     | Name                        |
| -------- | --------------------------- |
| Secret   | `APP_USERNAME`              |
| Secret   | `APP_PASSWORD`              |
| Secret   | `CHERRY_API_KEY`            |
| Variable | `BASE_URL`                  |
| Variable | `CHERRY_API_URL`            |
| Variable | `CHERRY_PROJECT_SHORT_CODE` |
