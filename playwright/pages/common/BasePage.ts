import { Page } from '@playwright/test';

/**
 * Base class for all page objects. Holds the Playwright Page and
 * shared helpers so individual page objects stay focused on their
 * own locators and actions.
 */
export abstract class BasePage {
  constructor(readonly page: Page) {}

  async goto(path: string = '/'): Promise<void> {
    await this.page.goto(path);
  }
}
