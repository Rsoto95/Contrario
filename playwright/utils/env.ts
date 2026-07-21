/**
 * Typed access to environment variables (loaded from .env by playwright.config.ts).
 *
 * The app under test uses header-based auth (x-user-id) selected per request, so
 * there are no login credentials — `baseUrl` is the only value the suite needs,
 * and it defaults to the local app. Cherry variables are read only by the CI
 * upload script.
 */
function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const env = {
  /** Base URL of the app under test. Defaults to the local NestJS app. */
  get baseUrl(): string {
    return optional("BASE_URL", "http://localhost:3000");
  },
};
