import { test, expect } from '../../fixtures/pages.fixture';
import {
  USERS,
  JOBS,
  RECRUITER_CANDIDATES,
  MESSAGES,
  ANALYTICS_EVENTS,
  STATUS,
  LIMITS,
} from '../../support/constants';
import { analyticsFor, hasAnalyticsEvent, CandidateInput } from '../../support/api-client';

/**
 * API coverage for POST /ats/submit-candidate — the README's 18-case matrix,
 * verified against the flow's three seams:
 *   - the HTTP response (status + body),
 *   - GET /ats/submissions/:id (Contrario's persisted state), and
 *   - GET /test/recorders (the stubbed external side effects: S3/Kombo/Slack/analytics).
 *
 * The `reset` auto-fixture re-seeds before each test, so every case starts from
 * the identical deterministic state.
 */

/** A brand-new candidate: unique email + linkedin so find-or-create makes a fresh RC. */
function freshCandidate(tag: string, overrides: Partial<CandidateInput> = {}): CandidateInput {
  return {
    name: `New Candidate ${tag}`,
    email: `new-${tag}@example.com`,
    linkedin: `https://linkedin.com/in/new-${tag}`,
    resumeTempKey: 'temp-bucket/upload-123.pdf',
    resumeFileName: 'resume.pdf',
    ...overrides,
  };
}

test.describe('POST /ats/submit-candidate — matrix', () => {
  test('1) non-recruiter → 403 + api_candidate_submission_failed', async ({ api }) => {
    const res = await api.submitCandidate(USERS.NON_RECRUITER, {
      jobId: JOBS.ACTIVE,
      candidate: freshCandidate('case1'),
    });

    expect(res.status()).toBe(403);
    expect((await res.json()).message).toBe(MESSAGES.NOT_RECRUITER);

    const recorders = await api.getRecorders();
    expect(hasAnalyticsEvent(recorders, ANALYTICS_EVENTS.FAILED)).toBeTruthy();
    // The failed event is attributed to the caller, even when they're not a recruiter.
    expect(analyticsFor(recorders, USERS.NON_RECRUITER).some(
      (c) => c.payload.name === ANALYTICS_EVENTS.FAILED,
    )).toBeTruthy();
    expect(hasAnalyticsEvent(recorders, ANALYTICS_EVENTS.SUBMITTED)).toBeFalsy();
  });

  test('2) screening answer over 5000 chars → 400', async ({ api }) => {
    const res = await api.submitCandidate(USERS.RECRUITER_DIRECT, {
      jobId: JOBS.ACTIVE,
      candidate: freshCandidate('case2'),
      screeningAnswers: [{ type: 'QUESTION', answer: 'x'.repeat(LIMITS.MAX_ANSWER_LENGTH + 1) }],
    });

    expect(res.status()).toBe(400);
    expect((await res.json()).message).toBe(MESSAGES.ANSWER_TOO_LONG);
  });

  test('3) new candidate with no résumé anywhere → 400 résumé required', async ({ api }) => {
    const res = await api.submitCandidate(USERS.RECRUITER_DIRECT, {
      jobId: JOBS.ACTIVE,
      // No resumeTempKey and no resumeUrl, and a fresh identity (no RC on file).
      candidate: freshCandidate('case3', { resumeTempKey: undefined, resumeFileName: undefined }),
    });

    expect(res.status()).toBe(400);
    expect((await res.json()).message).toBe(MESSAGES.RESUME_REQUIRED);
  });

  test('4) candidate.id with résumé on file, no upload → 200, no S3 move', async ({ api }) => {
    const res = await api.submitCandidate(USERS.RECRUITER_DIRECT, {
      jobId: JOBS.ACTIVE,
      candidate: {
        id: RECRUITER_CANDIDATES.WITH_RESUME,
        name: 'ignored — identity comes from the RC row',
        email: 'ignored@example.com',
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.recruiterCandidateId).toBe(RECRUITER_CANDIDATES.WITH_RESUME);
    // Identity is pulled from the seeded RC (Ada), not the request.
    expect(body.candidate.email).toBe('ada@example.com');

    const recorders = await api.getRecorders();
    expect(recorders.grouped.s3, 'no résumé upload → no S3 move').toHaveLength(0);
  });

  test('5) unknown job → 404', async ({ api }) => {
    const res = await api.submitCandidate(USERS.RECRUITER_DIRECT, {
      jobId: 'job_missing',
      candidate: freshCandidate('case5'),
    });

    expect(res.status()).toBe(404);
    expect((await res.json()).message).toBe(MESSAGES.JOB_NOT_FOUND);
  });

  test('6) inactive job → 404', async ({ api }) => {
    const res = await api.submitCandidate(USERS.RECRUITER_DIRECT, {
      jobId: JOBS.INACTIVE,
      candidate: freshCandidate('case6'),
    });
    expect(res.status()).toBe(404);
    expect((await res.json()).message).toBe(MESSAGES.JOB_NOT_FOUND);
  });

  test('7) soft-deleted job → 404', async ({ api }) => {
    const res = await api.submitCandidate(USERS.RECRUITER_DIRECT, {
      jobId: JOBS.DELETED,
      candidate: freshCandidate('case7'),
    });
    expect(res.status()).toBe(404);
    expect((await res.json()).message).toBe(MESSAGES.JOB_NOT_FOUND);
  });

  test('8) self-serve, exclusive role → 403 exclusive', async ({ api }) => {
    const res = await api.submitCandidate(USERS.RECRUITER_SELFSERVE, {
      jobId: JOBS.EXCLUSIVE,
      candidate: freshCandidate('case8'),
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).message).toBe(MESSAGES.EXCLUSIVE);
  });

  test('9) bypass does NOT override exclusivity; quota unchanged', async ({ api }) => {
    const exclusive = await api.submitCandidate(USERS.RECRUITER_BYPASS1, {
      jobId: JOBS.EXCLUSIVE,
      candidate: freshCandidate('case9-excl'),
    });
    expect(exclusive.status()).toBe(403);
    expect((await exclusive.json()).message).toBe(MESSAGES.EXCLUSIVE);

    // Prove the quota was NOT consumed: the same recruiter can still spend its
    // single bypass on a non-exclusive role and land isRoleApprovalBypass=true.
    const active = await api.submitCandidate(USERS.RECRUITER_BYPASS1, {
      jobId: JOBS.ACTIVE,
      candidate: freshCandidate('case9-active'),
    });
    expect(active.status()).toBe(200);
    expect((await active.json()).submission.isRoleApprovalBypass).toBe(true);
  });

  test('10) direct access beats exclusivity → 200', async ({ api }) => {
    const res = await api.submitCandidate(USERS.RECRUITER_DIRECT, {
      jobId: JOBS.EXCLUSIVE,
      candidate: freshCandidate('case10'),
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).submission.status).toBe(STATUS.PENDING_ADMIN_APPROVAL);
  });

  test('11) self-serve, no access → 403 self-serve message', async ({ api }) => {
    const res = await api.submitCandidate(USERS.RECRUITER_SELFSERVE, {
      jobId: JOBS.ACTIVE,
      candidate: freshCandidate('case11'),
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).message).toBe(MESSAGES.NO_ACCESS_SELF);
  });

  test('12) agency, no access → 403 agency message', async ({ api }) => {
    const res = await api.submitCandidate(USERS.RECRUITER_AGENCY, {
      jobId: JOBS.ACTIVE,
      candidate: freshCandidate('case12'),
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).message).toBe(MESSAGES.NO_ACCESS_AGENCY);
  });

  test('13) bypass available → 200, isRoleApprovalBypass=true, quota now 0', async ({ api }) => {
    const first = await api.submitCandidate(USERS.RECRUITER_BYPASS1, {
      jobId: JOBS.ACTIVE,
      candidate: freshCandidate('case13-a'),
    });
    expect(first.status()).toBe(200);
    expect((await first.json()).submission.isRoleApprovalBypass).toBe(true);

    // Quota is now 0 → a second bypass attempt is rejected as exhausted.
    const second = await api.submitCandidate(USERS.RECRUITER_BYPASS1, {
      jobId: JOBS.ACTIVE,
      candidate: freshCandidate('case13-b'),
    });
    expect(second.status()).toBe(403);
    expect((await second.json()).message).toBe(MESSAGES.BYPASS_EXHAUSTED);
  });

  test('14) bypass quota exhausted → 403', async ({ api }) => {
    const res = await api.submitCandidate(USERS.RECRUITER_BYPASS0, {
      jobId: JOBS.ACTIVE,
      candidate: freshCandidate('case14'),
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).message).toBe(MESSAGES.BYPASS_EXHAUSTED);
  });

  test('15) duplicate email+role → 409 + collision analytics', async ({ api }) => {
    const candidate = freshCandidate('case15');

    const first = await api.submitCandidate(USERS.RECRUITER_DIRECT, {
      jobId: JOBS.ACTIVE,
      candidate,
    });
    expect(first.status()).toBe(200);

    const second = await api.submitCandidate(USERS.RECRUITER_DIRECT, {
      jobId: JOBS.ACTIVE,
      candidate,
    });
    expect(second.status()).toBe(409);
    expect((await second.json()).message).toBe(MESSAGES.COLLISION);

    const recorders = await api.getRecorders();
    const collision = recorders.grouped.analytics.find(
      (c) => c.payload.name === ANALYTICS_EVENTS.COLLISION,
    );
    expect(collision, 'collision analytics event fired').toBeTruthy();
    expect(collision!.payload.attributedTo).toBe(USERS.RECRUITER_DIRECT);
  });

  test('16) résumé temp key → 200, S3 move recorded, profile résumé URL updated', async ({ api }) => {
    const tempKey = 'temp-bucket/upload-case16.pdf';
    const res = await api.submitCandidate(USERS.RECRUITER_DIRECT, {
      jobId: JOBS.ACTIVE,
      candidate: freshCandidate('case16', { resumeTempKey: tempKey }),
    });
    expect(res.status()).toBe(200);
    const submissionId = (await res.json()).submission.id;

    const recorders = await api.getRecorders();
    expect(recorders.grouped.s3).toHaveLength(1);
    const move = recorders.grouped.s3[0];
    expect(move.event).toBe('move_resume');
    expect(move.payload.from).toBe(tempKey);
    expect(move.payload.deletedTemp).toBe(true);

    // The persisted profile résumé URL is the new public URL from the S3 move.
    const persisted = await (await api.getSubmission(submissionId)).json();
    expect(persisted.candidateProfile.resumeUpload).toBe(move.payload.to);
  });

  test('17) INFORMATION answers dropped from persisted filteredAnswers → 200', async ({ api }) => {
    const res = await api.submitCandidate(USERS.RECRUITER_DIRECT, {
      jobId: JOBS.ACTIVE,
      candidate: freshCandidate('case17'),
      screeningAnswers: [
        { type: 'QUESTION', answer: 'keep me' },
        { type: 'INFORMATION', answer: 'drop me before persistence' },
      ],
    });
    expect(res.status()).toBe(200);
    const submissionId = (await res.json()).submission.id;

    const persisted = await (await api.getSubmission(submissionId)).json();
    const answers = JSON.parse(persisted.filteredAnswers);
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({ type: 'QUESTION', answer: 'keep me' });
  });

  test('18) auto-approve Kombo cascade → async advance to APPROVED', async ({ api }) => {
    const res = await api.submitCandidate(USERS.RECRUITER_AUTOAPPROVE, {
      jobId: JOBS.KOMBO,
      candidate: freshCandidate('case18'),
    });

    // The HTTP response returns BEFORE the fire-and-forget cascade runs, so the
    // synchronous body still reports the initial status.
    expect(res.status()).toBe(200);
    const body = await res.json();
    const submissionId = body.submission.id;
    expect(body.submission.status).toBe(STATUS.PENDING_ADMIN_APPROVAL);

    // Flush the cascade, then assert the external pushes landed.
    const recorders = await api.getRecorders({ awaitPending: true });

    expect(recorders.grouped.kombo).toHaveLength(1);
    expect(recorders.grouped.kombo[0].payload).toMatchObject({
      jobId: JOBS.KOMBO,
      blockedReason: null,
      pushed: true,
    });

    expect(recorders.grouped.slack).toHaveLength(1);
    // co_autoapprove_true → autoApproveAfterAdminApproval on → Slack has NO buttons.
    expect(recorders.grouped.slack[0].payload.hasActionButtons).toBe(false);

    // And Contrario itself has cascaded all the way to APPROVED.
    const persisted = await (await api.getSubmission(submissionId)).json();
    expect(persisted.status).toBe(STATUS.APPROVED);
  });
});

test.describe('Contrario ⇄ external ATS sync', () => {
  /**
   * The "sync test" from the call: after the auto-approve cascade, the data
   * pushed to the external ATS (Kombo recorder) and to Slack must line up with
   * what Contrario persisted for the same submission — no drift between systems.
   */
  test('Kombo push + Slack intro match Contrario’s persisted submission', async ({ api }) => {
    const res = await api.submitCandidate(USERS.RECRUITER_AUTOAPPROVE, {
      jobId: JOBS.KOMBO,
      candidate: freshCandidate('sync'),
    });
    expect(res.status()).toBe(200);
    const submissionId = (await res.json()).submission.id;

    const recorders = await api.getRecorders({ awaitPending: true });
    const persisted = await (await api.getSubmission(submissionId)).json();

    const kombo = recorders.grouped.kombo[0]?.payload;
    const slack = recorders.grouped.slack[0]?.payload;
    expect(kombo, 'Kombo push recorded').toBeTruthy();
    expect(slack, 'Slack intro recorded').toBeTruthy();

    // External ATS (Kombo) ⇄ Contrario
    expect(kombo.jobId).toBe(persisted.jobId);
    expect(kombo.candidateId).toBe(persisted.candidateProfileId);

    // Slack intro ⇄ Contrario
    expect(slack.companyId).toBe(persisted.companyId);
    expect(slack.candidateId).toBe(persisted.candidateProfileId);

    // Both sides agree the candidate advanced past admin approval.
    expect(persisted.status).toBe(STATUS.APPROVED);
    const stageNames = persisted.stages.map((s: any) => s.stageName);
    expect(stageNames).toEqual(
      expect.arrayContaining(['Application Review', 'Company Review']),
    );
  });
});
