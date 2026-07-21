import { test as base } from '@playwright/test';
import { HomePage } from '../pages/HomePage';

/**
 * Custom test fixture that injects page objects, so specs never
 * instantiate them manually:
 *
 *   test('example', async ({ homePage }) => { ... });
 *
 * Add a field here for each new page object you create.
 */
type PageFixtures = {
  homePage: HomePage;
};

export const test = base.extend<PageFixtures>({
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },
});

export { expect } from '@playwright/test';
