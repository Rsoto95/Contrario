import { test, expect } from '../../fixtures/pages.fixture';
import { USERS, JOBS, MESSAGES, STATUS } from '../../support/constants';

/**
 * E2E UI coverage for the Submit Candidate form.
 *
 * The form only exposes a subset of the flow's inputs (recruiter + role
 * dropdowns, name/email/linkedin/résumé-temp-key/one screening answer), so this
 * suite covers what a user can actually drive through the browser: the happy
 * path plus the error states reachable from the form. The exhaustive input
 * permutations (candidate.id reuse, INFORMATION filtering, bypass quota, the
 * async cascade) live in the API suite.
 *
 * Each test asserts on what the UI renders: the `HTTP <status>` line and the
 * pretty-printed JSON body. The `reset` fixture re-seeds before each test.
 */
test.describe('Submit Candidate form (E2E)', () => {
  test.beforeEach(async ({ submitCandidatePage }) => {
    await submitCandidatePage.open();
  });

  test('happy path: direct recruiter submits to active role → HTTP 200', async ({
    submitCandidatePage: page,
  }) => {
    await page.selectRecruiter(USERS.RECRUITER_DIRECT);
    await page.selectJob(JOBS.ACTIVE);
    await page.fillCandidate({ email: 'e2e-happy@example.com' });
    await page.submit();

    expect(await page.statusCode()).toBe(200);
    const body = await page.resultJson();
    expect(body.submission.status).toBe(STATUS.PENDING_ADMIN_APPROVAL);
    expect(body.candidate.email).toBe('e2e-happy@example.com');
  });

  test('non-recruiter → HTTP 403 with recruiter-only message', async ({
    submitCandidatePage: page,
  }) => {
    await page.selectRecruiter(USERS.NON_RECRUITER);
    await page.selectJob(JOBS.ACTIVE);
    await page.fillCandidate({ email: 'e2e-nonrecruiter@example.com' });
    await page.submit();

    expect(await page.statusCode()).toBe(403);
    expect((await page.resultJson()).message).toBe(MESSAGES.NOT_RECRUITER);
  });

  test('inactive role → HTTP 404', async ({ submitCandidatePage: page }) => {
    await page.selectRecruiter(USERS.RECRUITER_DIRECT);
    await page.selectJob(JOBS.INACTIVE);
    await page.fillCandidate({ email: 'e2e-inactive@example.com' });
    await page.submit();

    expect(await page.statusCode()).toBe(404);
    expect((await page.resultJson()).message).toBe(MESSAGES.JOB_NOT_FOUND);
  });

  test('soft-deleted role → HTTP 404', async ({ submitCandidatePage: page }) => {
    await page.selectRecruiter(USERS.RECRUITER_DIRECT);
    await page.selectJob(JOBS.DELETED);
    await page.fillCandidate({ email: 'e2e-deleted@example.com' });
    await page.submit();

    expect(await page.statusCode()).toBe(404);
    expect((await page.resultJson()).message).toBe(MESSAGES.JOB_NOT_FOUND);
  });

  test('exclusive role without access → HTTP 403 exclusive', async ({
    submitCandidatePage: page,
  }) => {
    await page.selectRecruiter(USERS.RECRUITER_SELFSERVE);
    await page.selectJob(JOBS.EXCLUSIVE);
    await page.fillCandidate({ email: 'e2e-exclusive@example.com' });
    await page.submit();

    expect(await page.statusCode()).toBe(403);
    expect((await page.resultJson()).message).toBe(MESSAGES.EXCLUSIVE);
  });

  test('duplicate submission of same candidate+role → HTTP 409', async ({
    submitCandidatePage: page,
  }) => {
    await page.selectRecruiter(USERS.RECRUITER_DIRECT);
    await page.selectJob(JOBS.ACTIVE);
    await page.fillCandidate({ email: 'e2e-duplicate@example.com' });

    await page.submit();
    expect(await page.statusCode()).toBe(200);

    // Submit the exact same candidate again → collision.
    await page.submit();
    expect(await page.statusCode()).toBe(409);
    expect((await page.resultJson()).message).toBe(MESSAGES.COLLISION);
  });
});
