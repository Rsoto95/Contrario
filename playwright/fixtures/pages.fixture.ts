import { test as base, request as playwrightRequest } from '@playwright/test';
import { SubmitCandidatePage } from '../pages/SubmitCandidatePage';
import { ApiClient } from '../support/api-client';
import { env } from '../utils/env';

/**
 * Custom fixtures for the ATS suite.
 *
 *   - `api`                 -> ApiClient bound to the app's baseURL (header auth).
 *   - `submitCandidatePage` -> the form's page object.
 *
 * A `reset` auto-fixture calls POST /test/reset before every test so each one
 * starts from the identical deterministic seed (per the README). It runs via a
 * standalone request context so it works for both API and E2E specs.
 *
 *   test('example', async ({ api, submitCandidatePage }) => { ... });
 */
type Fixtures = {
  api: ApiClient;
  submitCandidatePage: SubmitCandidatePage;
  reset: void;
};

export const test = base.extend<Fixtures>({
  // Reset first, automatically, for every test. `auto: true` means specs don't
  // have to list it; ordering it before the others guarantees a clean DB.
  reset: [
    async ({}, use) => {
      const context = await playwrightRequest.newContext({ baseURL: env.baseUrl });
      const client = new ApiClient(context);
      await client.reset();
      await use();
      await context.dispose();
    },
    { auto: true },
  ],

  api: async ({ request }, use) => {
    await use(new ApiClient(request));
  },

  submitCandidatePage: async ({ page }, use) => {
    await use(new SubmitCandidatePage(page));
  },
});

export { expect } from '@playwright/test';
