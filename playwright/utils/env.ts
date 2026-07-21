/**
 * Typed access to environment variables (loaded from .env by playwright.config.ts).
 * Throws early with a clear message when a required variable is missing.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

export const env = {
  get baseUrl(): string {
    return required('BASE_URL');
  },
  /** Username/email for the account the suite signs in with. */
  get username(): string {
    return required('APP_USERNAME');
  },
  get password(): string {
    return required('APP_PASSWORD');
  },
};
