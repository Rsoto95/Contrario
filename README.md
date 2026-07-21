# Contrario — ATS Submit-Candidate Tests

Playwright + TypeScript tests for the `submit-candidate` flow.

- `qa-take-home-main/` — the app under test
- `playwright/` — the tests: API (`tests/api/`) and E2E UI (`tests/e2e/`)

## Run locally

```bash
# one-time: set up the app under test
cd qa-take-home-main && npm run setup && cd ..

# one-time: set up the tests
cd playwright && npm install && npx playwright install chromium

# run (Playwright auto-starts the app on :3000)
npm test                 # everything
npm test tests/api       # API only
npm test tests/e2e       # E2E only
npm run report           # open the last report
```

## Run in CI (GitHub Actions)

The suite runs in GitHub Actions (`.github/workflows/qa-smoke.yml`): it installs
+ seeds the app, runs the tests, and **uploads the results to Cherry**, our test
case management tool.

- **Trigger:** Actions tab → **E2E Smoke** → **Run workflow** (or `gh workflow run "E2E Smoke" --ref main`). Also runs daily at 10:00 UTC.
- **Reports in Cherry:** https://tcmanagementfe-production.up.railway.app/automated-runs/CON

  Login: `<redacted>` / `<redacted>` (temporary — you'll be prompted to change it on first sign-in).
