import { APIRequestContext, APIResponse, expect } from '@playwright/test';

/**
 * Thin wrapper over Playwright's APIRequestContext for the ATS app.
 *
 * It keeps specs declarative: they say *what* they submit and *who* submits it,
 * not how the HTTP call is shaped. Header-based auth (x-user-id) is applied here
 * so no spec repeats it. Requests never throw on non-2xx (`failOnStatusCode`
 * stays off) — asserting the status/body is the point of these tests.
 */

export interface ScreeningAnswer {
  type: string; // "QUESTION" | "INFORMATION" | ...
  answer: string;
}

export interface CandidateInput {
  id?: string;
  name: string;
  email: string;
  linkedin?: string;
  resumeUrl?: string;
  resumeTempKey?: string;
  resumeFileName?: string;
}

export interface SubmitCandidateBody {
  candidate: CandidateInput;
  jobId: string;
  notes?: string;
  screeningAnswers?: ScreeningAnswer[];
}

/** Shape of GET /test/recorders (grouped side effects). */
export interface RecordedCall {
  seq: number;
  service: 's3' | 'kombo' | 'slack' | 'analytics';
  event: string;
  payload: Record<string, any>;
  timestamp: string;
}
export interface Recorders {
  all: RecordedCall[];
  grouped: {
    s3: RecordedCall[];
    kombo: RecordedCall[];
    slack: RecordedCall[];
    analytics: RecordedCall[];
  };
}

export class ApiClient {
  constructor(private readonly request: APIRequestContext) {}

  /** POST /ats/submit-candidate as `userId` (sent via the x-user-id header). */
  submitCandidate(userId: string | undefined, body: SubmitCandidateBody): Promise<APIResponse> {
    return this.request.post('/ats/submit-candidate', {
      headers: userId ? { 'x-user-id': userId } : {},
      data: body,
    });
  }

  /** GET /ats/submissions/:id — Contrario's own persisted record. */
  getSubmission(id: string): Promise<APIResponse> {
    return this.request.get(`/ats/submissions/${id}`);
  }

  /** POST /test/reset — deterministic truncate + re-seed, clears recorders. */
  async reset(): Promise<void> {
    const res = await this.request.post('/test/reset');
    // A failed reset would silently corrupt every downstream assertion, so we
    // fail loud and early here rather than in some unrelated test.
    expect(res.ok(), `POST /test/reset failed: HTTP ${res.status()}`).toBeTruthy();
  }

  /**
   * GET /test/recorders. Pass awaitPending to flush the fire-and-forget
   * auto-approve cascade first, so Kombo/Slack/status assertions are race-free.
   */
  async getRecorders(opts: { awaitPending?: boolean } = {}): Promise<Recorders> {
    const res = await this.request.get('/test/recorders', {
      params: opts.awaitPending ? { awaitPending: 'true' } : {},
    });
    expect(res.ok(), `GET /test/recorders failed: HTTP ${res.status()}`).toBeTruthy();
    return res.json();
  }
}

/** Analytics events attributed to `userId`, newest-agnostic (seq order). */
export function analyticsFor(recorders: Recorders, userId: string): RecordedCall[] {
  return recorders.grouped.analytics.filter((c) => c.payload?.attributedTo === userId);
}

/** True if an analytics event with `name` fired at all. */
export function hasAnalyticsEvent(recorders: Recorders, name: string): boolean {
  return recorders.grouped.analytics.some((c) => c.payload?.name === name);
}
