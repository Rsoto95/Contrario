import { Page, Locator } from '@playwright/test';
import { BasePage } from './common/BasePage';

/**
 * Page object for the "Submit Candidate" form served at `/`.
 *
 * The form is deliberately thin: two dropdowns (recruiter identity + role) and a
 * handful of candidate inputs, a Submit button, then a rendered result —
 * `HTTP <status>` plus the pretty-printed JSON response body.
 *
 * Locators are readonly fields; actions are methods; assertions live in specs.
 */
export interface CandidateFormInput {
  name?: string;
  email?: string;
  linkedin?: string;
  /** Empty string clears the field (relies on résumé already on file). */
  resumeTempKey?: string;
  answer?: string;
}

export class SubmitCandidatePage extends BasePage {
  readonly recruiterSelect: Locator;
  readonly jobSelect: Locator;
  readonly nameInput: Locator;
  readonly emailInput: Locator;
  readonly linkedinInput: Locator;
  readonly resumeTempKeyInput: Locator;
  readonly answerInput: Locator;
  readonly submitButton: Locator;
  readonly status: Locator;
  readonly result: Locator;

  constructor(page: Page) {
    super(page);
    this.recruiterSelect = page.locator('#userId');
    this.jobSelect = page.locator('#jobId');
    this.nameInput = page.locator('#name');
    this.emailInput = page.locator('#email');
    this.linkedinInput = page.locator('#linkedin');
    this.resumeTempKeyInput = page.locator('#resumeTempKey');
    this.answerInput = page.locator('#answer');
    this.submitButton = page.locator('#submit');
    this.status = page.locator('#status');
    this.result = page.locator('#result');
  }

  async open(): Promise<void> {
    await this.goto('/');
  }

  async selectRecruiter(userId: string): Promise<void> {
    await this.recruiterSelect.selectOption(userId);
  }

  async selectJob(jobId: string): Promise<void> {
    await this.jobSelect.selectOption(jobId);
  }

  /** Set only the fields provided; leaves the form's defaults otherwise. */
  async fillCandidate(input: CandidateFormInput): Promise<void> {
    if (input.name !== undefined) await this.nameInput.fill(input.name);
    if (input.email !== undefined) await this.emailInput.fill(input.email);
    if (input.linkedin !== undefined) await this.linkedinInput.fill(input.linkedin);
    if (input.resumeTempKey !== undefined) await this.resumeTempKeyInput.fill(input.resumeTempKey);
    if (input.answer !== undefined) await this.answerInput.fill(input.answer);
  }

  /** Click Submit and wait for the status line to be populated by the fetch. */
  async submit(): Promise<void> {
    // Clear the previous result first. Without this, a repeat submit would see
    // the *stale* "HTTP <status>" from the prior request and pass immediately,
    // reading the old status before the new fetch resolves.
    await this.status.evaluate((el) => (el.textContent = ''));
    await this.result.evaluate((el) => (el.textContent = ''));

    // Tie completion to the actual network response, then wait for the handler
    // to render it — no sleeps, no races.
    const responsePromise = this.page.waitForResponse(
      (r) => r.url().includes('/ats/submit-candidate') && r.request().method() === 'POST',
    );
    await this.submitButton.click();
    await responsePromise;
    await this.status.filter({ hasText: /HTTP \d{3}/ }).waitFor({ state: 'visible' });
  }

  /** The numeric HTTP status shown in the UI (e.g. 200, 403). */
  async statusCode(): Promise<number> {
    const text = (await this.status.textContent()) ?? '';
    const match = text.match(/HTTP (\d{3})/);
    if (!match) throw new Error(`Could not parse status from UI: "${text}"`);
    return Number(match[1]);
  }

  /** The parsed JSON response body rendered in the <pre>. */
  async resultJson<T = any>(): Promise<T> {
    const text = (await this.result.textContent()) ?? '';
    return JSON.parse(text) as T;
  }
}
