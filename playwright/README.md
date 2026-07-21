# Contrario E2E — ATS Submit-Candidate Test Suite

Automated test coverage for the ATS **submit-candidate** flow, built with
[Playwright](https://playwright.dev/) + TypeScript using the Page Object Model.

The suite has two layers, matching the strategy from the intake call:

- **API tests** (`tests/api/`) — the primary coverage. They drive
  `POST /ats/submit-candidate` and verify results across three seams: the HTTP
  response, Contrario's persisted state (`GET /ats/submissions/:id`), and the
  stubbed external side effects (`GET /test/recorders`: S3 / Kombo / Slack /
  analytics). This is where the full README test matrix lives.
- **E2E UI tests** (`tests/e2e/`) — browser automation against the Submit
  Candidate form for the subset a user can actually drive, asserting on the
  rendered `HTTP <status>` and JSON result.

## Project structure

```
playwright/
├── playwright.config.ts        # chromium project, reporters, webServer (boots the app)
├── pages/
│   ├── common/BasePage.ts       # base class every page object extends
│   └── SubmitCandidatePage.ts   # the Submit Candidate form
├── fixtures/
│   └── pages.fixture.ts         # injects `api` + `submitCandidatePage`; resets DB per test
├── support/
│   ├── api-client.ts            # APIRequestContext wrapper (submit/get/reset/recorders)
│   └── constants.ts             # seeded ids + server messages, mirrored from the app
├── utils/
│   └── env.ts                   # typed BASE_URL access
├── tests/
│   ├── api/submit-candidate.api.spec.ts   # 18-case matrix + Contrario⇄ATS sync test
│   └── e2e/submit-candidate.e2e.spec.ts   # UI happy path + reachable error states
├── scripts/upload-results-to-cherry.js    # pushes results to Cherry (CI)
└── .env / .env.example                     # BASE_URL (+ optional Cherry vars)
```

## Setup

```bash
# 1) Set up the app under test once (installs deps, creates + seeds the SQLite DB)
cd ../qa-take-home-main && npm run setup && cd ../playwright

# 2) Set up the test suite
npm install
npx playwright install chromium
cp .env.example .env   # optional — BASE_URL defaults to http://localhost:3000
```

## Running tests

```bash
npm test                 # full suite (Playwright auto-starts the app on :3000)
npm test tests/api       # API layer only
npm test tests/e2e       # E2E UI layer only
npm run test:headed      # headed browser
npm run test:ui          # Playwright UI mode
npm run report           # open the last Monocart report
```

Playwright's `webServer` boots the app via `npm start` and, locally, reuses an
already-running instance — so you can also `npm start` the app yourself in
`../qa-take-home-main` and reruns will be fast.

## How state is kept deterministic

- **`POST /test/reset` before every test** (a `reset` auto-fixture) re-seeds the
  identical data and clears the recorders, so tests are order-independent.
- **The suite runs serially (`workers: 1`).** The app is a single stateful
  instance (one SQLite DB + one in-memory recorder) with a *global* reset;
  parallel workers would reset each other's state mid-test. This is a deliberate
  trade-off for a shared-state app under test.
- **The async cascade** (auto-approve) is awaited via
  `GET /test/recorders?awaitPending=true` before asserting on Kombo/Slack/status.

## Coverage — README test matrix

All 18 matrix cases are covered in `tests/api/submit-candidate.api.spec.ts`
(1: non-recruiter 403 · 2: answer >5000 400 · 3: résumé required 400 · 4:
résumé-on-file 200/no-S3 · 5–7: job 404s · 8–10: exclusivity · 11–12: no-access
messages · 13–14: bypass quota · 15: collision 409 · 16: S3 move · 17:
INFORMATION filtered · 18: Kombo auto-approve cascade). The **sync test**
compares the Kombo/Slack push payloads against Contrario's persisted submission
to prove the two systems stay aligned. The E2E suite re-drives the
form-reachable cases (200, 403 non-recruiter, 404 inactive/deleted, 403
exclusive, 409 duplicate) through the browser.

## Conventions

- **Page objects** extend `BasePage`, expose locators as readonly fields and
  actions as methods (no assertions — those live in specs).
- **Specs import from the fixture**, not `@playwright/test` directly:
  ```ts
  import { test, expect } from "../../fixtures/pages.fixture";
  ```
- **No hardcoded URLs** — `BASE_URL` comes from `utils/env.ts` (backed by `.env`).
- **Quarantine flaky tests** with `@flaky` in the title; the CI smoke run
  excludes them (`--grep-invert "@flaky"`).

## Continuous integration

A scheduled smoke run (`.github/workflows/qa-smoke.yml`) runs daily at 10:00 UTC
and on manual dispatch. It installs + seeds the app under test, runs the suite
(Playwright boots the app), and uploads JUnit, Monocart, and Playwright HTML
reports as artifacts. Results are pushed to Cherry by
`scripts/upload-results-to-cherry.js`.

Configure under **Settings → Secrets and variables → Actions**:

| Type     | Name                        |
| -------- | --------------------------- |
| Secret   | `CHERRY_API_KEY`            |
| Variable | `BASE_URL` (optional)       |
| Variable | `CHERRY_API_URL`            |
| Variable | `CHERRY_PROJECT_SHORT_CODE` |
