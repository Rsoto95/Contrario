/**
 * Seeded ids and server messages, mirrored from the app under test so specs
 * read like the README's spec/test-matrix.
 *
 *   - USERS / JOBS: the deterministic seed (POST /test/reset re-creates these).
 *   - MESSAGES:     the exact strings thrown by SubmissionCreationService, so
 *                   assertions pin the *reason* a request failed, not just the
 *                   HTTP status.
 *
 * Source of truth: qa-take-home-main/src/test-support/seed-data.ts and
 * qa-take-home-main/src/ats/submission-creation.service.ts.
 */

export const USERS = {
  RECRUITER_DIRECT: 'u_recruiter_direct',
  RECRUITER_SELFSERVE: 'u_recruiter_selfserve',
  RECRUITER_AGENCY: 'u_recruiter_agency',
  NON_RECRUITER: 'u_non_recruiter',
  RECRUITER_AUTOAPPROVE: 'u_recruiter_autoapprove',
  RECRUITER_BYPASS1: 'u_recruiter_bypass1',
  RECRUITER_BYPASS0: 'u_recruiter_bypass0',
} as const;

export const JOBS = {
  ACTIVE: 'job_active',
  INACTIVE: 'job_inactive',
  DELETED: 'job_deleted',
  EXCLUSIVE: 'job_exclusive',
  KOMBO: 'job_kombo',
} as const;

/** Seeded RecruiterCandidate rows (both owned by RECRUITER_DIRECT). */
export const RECRUITER_CANDIDATES = {
  WITH_RESUME: 'rc_with_resume', // résumé already on file -> no upload needed
  NO_RESUME: 'rc_no_resume', // needs a resumeTempKey in the request
} as const;

/** Exact error messages from SubmissionCreationService.MESSAGES. */
export const MESSAGES = {
  NOT_RECRUITER: 'Only recruiters can submit candidates.',
  ANSWER_TOO_LONG: 'A screening answer exceeds the maximum allowed length.',
  RESUME_REQUIRED: 'A resume must be uploaded before submitting.',
  JOB_NOT_FOUND: 'Job not found.',
  EXCLUSIVE: 'This role is currently in an exclusive access period.',
  NO_ACCESS_AGENCY: 'Your agency does not have access to this role.',
  NO_ACCESS_SELF: 'You do not have access to this role.',
  BYPASS_EXHAUSTED: 'Role approval bypass quota exhausted.',
  COLLISION: 'This candidate has already been submitted to this role.',
} as const;

/** Analytics event names recorded by the stubbed PostHog. */
export const ANALYTICS_EVENTS = {
  SUBMITTED: 'api_candidate_submitted',
  FAILED: 'api_candidate_submission_failed',
  COLLISION: 'api_candidate_submission_collision',
} as const;

/** Submission status values (SQLite has no enums; these are plain strings). */
export const STATUS = {
  PENDING_ADMIN_APPROVAL: 'PENDING_ADMIN_APPROVAL',
  PENDING_COMPANY_APPROVAL: 'PENDING_COMPANY_APPROVAL',
  APPROVED: 'APPROVED',
} as const;

export const LIMITS = {
  MAX_ANSWER_LENGTH: 5000,
} as const;
