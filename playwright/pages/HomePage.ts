import { Page, Locator } from '@playwright/test';
import { BasePage } from './common/BasePage';

/**
 * Example page object — replace with real pages for the app under test.
 *
 * Page objects extend BasePage, expose locators as readonly fields and
 * actions as methods, and never contain assertions (those live in specs).
 * Register new pages in fixtures/pages.fixture.ts so specs can inject them.
 */
export class HomePage extends BasePage {
  readonly heading: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.locator('h1');
  }

  async open(): Promise<void> {
    await this.goto('/');
  }
}
