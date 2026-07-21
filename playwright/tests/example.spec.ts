import { test, expect } from '../fixtures/pages.fixture';

/**
 * Placeholder spec so the suite runs out of the box — replace with real
 * tests for the app under test. Specs import { test, expect } from the
 * fixture (not from @playwright/test directly) so page objects are injected.
 */
test('home page loads', async ({ homePage }) => {
  await homePage.open();
  await expect(homePage.heading).toBeVisible();
});
