# Contrario — ATS Submit-Candidate Tests

Playwright + TypeScript tests for the `submit-candidate` flow: API tests
(`tests/api/`) and E2E UI tests (`tests/e2e/`).

## Run locally

```bash
# one-time: set up the app under test
cd ../qa-take-home-main && npm run setup && cd ../playwright

# one-time: set up the tests
npm install
npx playwright install chromium

# run (Playwright auto-starts the app on :3000)
npm test                 # everything
npm test tests/api       # API only
npm test tests/e2e       # E2E only
npm run report           # open the last report
```

## Run in CI (GitHub Actions)

Workflow: `.github/workflows/qa-smoke.yml`. It installs + seeds the app, runs
the suite, and uploads reports.

- **Trigger:** Actions tab → **E2E Smoke** → **Run workflow** (or `gh workflow run "E2E Smoke" --ref main`). Also runs daily at 10:00 UTC. No push/PR trigger.
- **Config (optional, for Cherry upload):** repo Settings → Secrets/Variables →
  `CHERRY_API_KEY` (secret), `CHERRY_API_URL`, `CHERRY_PROJECT_SHORT_CODE` (variables).
