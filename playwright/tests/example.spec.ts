import { test, expect } from '../fixtures/pages.fixture';

/**
 * Self-contained smoke test — no app, login, or env config required.
 * It hits a public site to prove the whole setup works end to end
 * (browser launch, navigation, assertions, reporters, CI upload).
 *
 * Delete this once you have real tests for the app under test.
 */
test('dummy: playwright.dev loads', async ({ page }) => {
  await page.goto('https://playwright.dev/');
  await expect(page).toHaveTitle(/Playwright/);
  await expect(
    page.getByRole('heading', { name: /Playwright enables reliable/i }),
  ).toBeVisible();
});
