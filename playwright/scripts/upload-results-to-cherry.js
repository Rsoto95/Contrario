/**
 * Uploads Playwright test results to Cherry (test management platform).
 *
 * Reads the JSON report produced by the "json" reporter
 * (test-results/results.json), converts it to Cherry's automated-test-run
 * payload and POSTs it to:
 *
 *   POST {CHERRY_API_URL}/api/v1/workspace/automated-test-runs/{CHERRY_PROJECT_SHORT_CODE}
 *
 * Then uploads the self-contained Monocart HTML report for the run's
 * "View report" link, using the runNumber returned by the POST:
 *
 *   PUT {CHERRY_API_URL}/api/v1/workspace/automated-test-runs/{CHERRY_PROJECT_SHORT_CODE}/{runNumber}/report
 *
 * Required environment variables:
 *   CHERRY_API_URL             e.g. https://cherry.example.com
 *   CHERRY_API_KEY             secret, cherry_sk_...
 *   CHERRY_PROJECT_SHORT_CODE  e.g. PC
 * Optional:
 *   CHERRY_RUN_NAME            display name for the run
 *
 * Designed for CI: this script NEVER fails the build. Any problem is
 * logged as a GitHub Actions warning annotation (::warning::) and the
 * script exits 0.
 */

const fs = require("fs");
const path = require("path");

// Load ../.env for local runs. dotenv never overrides variables that are
// already set, so in CI the pipeline-provided values always win.
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const REPORT_FILE = path.resolve(__dirname, "../test-results/results.json");
const HTML_REPORT_FILE = path.resolve(
  __dirname,
  "../monocart-report/index.html",
);
const ATTACHMENTS_DIR = path.resolve(
  __dirname,
  "../monocart-report/attachments",
);
// Cherry rejects report uploads over 25 MB with a 413.
const MAX_HTML_REPORT_BYTES = 25 * 1024 * 1024;
// Report assets (screenshots, videos) over 15 MB are skipped.
const MAX_ASSET_BYTES = 15 * 1024 * 1024;
const ASSET_MIME_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".zip": "application/zip",
  ".md": "text/markdown",
};
// Screenshot budget for the results payload: individual images over 4 MB
// are skipped, and only the first few failed tests carry screenshots so
// the whole request stays under Cherry's 25 MB body limit.
const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;
const MAX_FAILURES_WITH_SCREENSHOTS = 5;

/**
 * Thrown to abort the upload without failing the build. Calling
 * process.exit() here is NOT safe — it can crash Node while the HTTP
 * response is still being cleaned up — so we throw instead and let the
 * process end naturally with exit code 0.
 */
class SkipUpload extends Error {}

function skip(message) {
  throw new SkipUpload(message);
}

/** Log a GitHub Actions warning annotation without aborting the script. */
function warn(message) {
  console.log(`::warning::Cherry ${message}`);
}

/** Remove ANSI color codes so error messages are readable in Cherry. */
function stripAnsi(text) {
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

/**
 * Base64-encode up to two failure screenshots for a test attempt so Cherry
 * can show them inline on failed results. Only image attachments are
 * considered (videos and traces are far too large for the payload and live
 * in the report artifact), Playwright's own "screenshot" attachments are
 * preferred over other images, and anything over 4 MB or missing on disk
 * is skipped silently.
 */
function collectScreenshots(attempt) {
  const images = (attempt.attachments ?? []).filter(
    (attachment) =>
      attachment.contentType?.startsWith("image/") && attachment.path,
  );
  images.sort(
    (a, b) => Number(b.name === "screenshot") - Number(a.name === "screenshot"),
  );

  const screenshots = [];
  for (const image of images) {
    let data;
    try {
      data = fs.readFileSync(image.path);
    } catch {
      continue; // File missing on disk — skip it.
    }
    if (data.length > MAX_SCREENSHOT_BYTES) continue;

    screenshots.push({
      name: image.name || "screenshot",
      contentType: image.contentType,
      base64Data: data.toString("base64"),
    });
    if (screenshots.length === 2) break;
  }
  return screenshots;
}

/**
 * Path of the spec file relative to the REPO root (Cherry uses this to
 * link results to test cases). The JSON report stores file paths relative
 * to Playwright's rootDir (the tests folder), so rebuild the repo-relative
 * path from GITHUB_WORKSPACE when available, with a sensible fallback for
 * local runs.
 */
function repoRelativePath(report, specFile) {
  const repoRoot = process.env.GITHUB_WORKSPACE;
  const absolute = path.join(report.config.rootDir, specFile);
  const relative = repoRoot
    ? path.relative(repoRoot, absolute)
    : path.join("playwright", "tests", specFile);
  return relative.split(path.sep).join("/");
}

/** Walk the report's nested suites and flatten every spec into Cherry results. */
function collectResults(report) {
  const results = [];
  let failuresWithScreenshots = 0;
  let failuresWithoutScreenshots = 0;

  function visitSuite(suite) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        // A test can have several attempts (retries); the last one is the outcome.
        const lastAttempt = test.results[test.results.length - 1];
        if (!lastAttempt) continue;

        // Honor Playwright's expected-status semantics: a test marked with
        // test.fail() that fails is an EXPECTED failure (tracked known bug)
        // and the suite stays green — report it as PASS so Cherry agrees
        // with the build result, keeping the known-bug context in the
        // error message.
        const expectedStatus = test.expectedStatus ?? "passed";
        const isExpectedOutcome = lastAttempt.status === expectedStatus;
        const status =
          lastAttempt.status === "skipped"
            ? "SKIP"
            : isExpectedOutcome
              ? "PASS"
              : "FAIL";

        let errorMessage = lastAttempt.error?.message
          ? stripAnsi(lastAttempt.error.message)
          : undefined;
        if (isExpectedOutcome && lastAttempt.status === "failed") {
          errorMessage =
            `[known bug — expected failure via test.fail()] ${errorMessage ?? ""}`.trim();
        } else if (!isExpectedOutcome && lastAttempt.status === "passed") {
          errorMessage =
            "Marked with test.fail() but passed — the known bug may be fixed; remove the marker.";
        }

        let screenshots = [];
        if (status === "FAIL") {
          if (failuresWithScreenshots < MAX_FAILURES_WITH_SCREENSHOTS) {
            screenshots = collectScreenshots(lastAttempt);
            if (screenshots.length) failuresWithScreenshots++;
          } else {
            failuresWithoutScreenshots++;
          }
        }

        results.push({
          title: spec.title,
          status,
          filePath: repoRelativePath(report, spec.file),
          durationMs: Math.round(lastAttempt.duration),
          ...(errorMessage ? { errorMessage } : {}),
          ...(screenshots.length ? { attachments: screenshots } : {}),
        });
      }
    }
    for (const child of suite.suites ?? []) visitSuite(child);
  }

  for (const suite of report.suites ?? []) visitSuite(suite);

  if (failuresWithoutScreenshots > 0) {
    warn(
      `screenshots omitted for ${failuresWithoutScreenshots} failed test(s) beyond the first ` +
        `${MAX_FAILURES_WITH_SCREENSHOTS} to keep the upload under 25 MB — see the report artifact for all screenshots`,
    );
  }

  return results;
}

async function main() {
  const apiUrl = process.env.CHERRY_API_URL;
  const apiKey = process.env.CHERRY_API_KEY;
  const projectShortCode = process.env.CHERRY_PROJECT_SHORT_CODE;

  if (!apiUrl) skip("CHERRY_API_URL is not set");
  if (!apiKey) skip("CHERRY_API_KEY is not set");
  if (!projectShortCode) skip("CHERRY_PROJECT_SHORT_CODE is not set");
  if (!fs.existsSync(REPORT_FILE)) skip(`report not found at ${REPORT_FILE}`);

  const report = JSON.parse(fs.readFileSync(REPORT_FILE, "utf8"));
  const results = collectResults(report);
  if (results.length === 0) skip("report contains no test results");

  // Link back to the GitHub Actions run, where the uploaded artifacts
  // (playwright-report, monocart-report) hold the full debug output
  // (screenshots, videos, traces).
  const serverUrl = process.env.GITHUB_SERVER_URL;
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  const runUrl =
    serverUrl && repository && runId
      ? `${serverUrl}/${repository}/actions/runs/${runId}`
      : undefined;

  // GitHub does not expose a stable public download URL for artifacts
  // (they require an authenticated API call), so point Cherry's "Artifact"
  // link at the run page where the artifacts are listed. Cherry ignores the
  // field until it supports it.
  const reportUrl = runUrl;

  const payload = {
    ...(process.env.CHERRY_RUN_NAME
      ? { name: process.env.CHERRY_RUN_NAME }
      : {}),
    branch: process.env.GITHUB_REF_NAME,
    commitSha: process.env.GITHUB_SHA,
    triggeredBy: runUrl
      ? `GitHub Actions #${process.env.GITHUB_RUN_NUMBER} — full report: ${runUrl}`
      : `GitHub Actions #${process.env.GITHUB_RUN_NUMBER}`,
    startedAt: report.stats?.startTime,
    durationMs: Math.round(report.stats?.duration ?? 0),
    ...(reportUrl ? { reportUrl } : {}),
    results,
  };

  const endpoint = `${apiUrl.replace(/\/$/, "")}/api/v1/workspace/automated-test-runs/${projectShortCode}`;
  console.log(`Uploading ${results.length} results to ${endpoint}`);

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    skip(`request failed: ${error.message}`);
  }

  const body = await response.json().catch(() => ({}));

  if (response.status === 401) {
    skip("Cherry rejected the API key (401) — check CHERRY_API_KEY");
  }
  if (!response.ok || body.status === "ERROR") {
    skip(
      `Cherry rejected the upload (HTTP ${response.status}): ${body.message ?? "no message"}`,
    );
  }

  const run = body.data ?? {};
  console.log(
    `Cherry run #${run.runNumber ?? "?"} recorded: ` +
      `${run.passCount ?? "?"} passed, ${run.failCount ?? "?"} failed, ${run.skipCount ?? "?"} skipped.`,
  );

  await uploadHtmlReport(apiUrl, apiKey, projectShortCode, run.runNumber);
}

/**
 * PUT the raw Monocart HTML report to Cherry so the run gets a
 * "View report" link. The results are already recorded at this point, so
 * any problem here only logs a warning — it never aborts or fails the
 * build, and the run keeps its reportUrl zip link as a fallback.
 */
async function uploadHtmlReport(apiUrl, apiKey, projectShortCode, runNumber) {
  if (runNumber == null) {
    warn("report upload skipped: results response contained no runNumber");
    return;
  }
  if (!fs.existsSync(HTML_REPORT_FILE)) {
    warn(`report upload skipped: ${HTML_REPORT_FILE} not found`);
    return;
  }

  const html = fs.readFileSync(HTML_REPORT_FILE);
  if (html.length > MAX_HTML_REPORT_BYTES) {
    const sizeMb = (html.length / 1024 / 1024).toFixed(1);
    warn(`report upload skipped: report is ${sizeMb} MB (Cherry limit 25 MB)`);
    return;
  }

  const endpoint = `${apiUrl.replace(/\/$/, "")}/api/v1/workspace/automated-test-runs/${projectShortCode}/${runNumber}/report`;
  try {
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "text/html",
      },
      body: html,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.status !== "SUCCESS") {
      warn(
        `report upload failed (HTTP ${response.status}): ${body.message ?? "no message"}`,
      );
      return;
    }
    const sizeKb = Math.round(html.length / 1024);
    console.log(`Cherry report uploaded for run #${runNumber} (${sizeKb} KB).`);
  } catch (error) {
    warn(`report upload failed: ${error.message}`);
    return;
  }

  await uploadReportAssets(apiUrl, apiKey, projectShortCode, runNumber);
}

/**
 * PUT every file in monocart-report/attachments/ to Cherry so the report's
 * relative screenshot/video links resolve when Cherry serves the report.
 * The `path` query param must exactly match the relative path the report
 * uses. Passing runs usually have no attachments folder at all — that is
 * normal, not a warning. Any per-file problem warns and moves on.
 */
async function uploadReportAssets(apiUrl, apiKey, projectShortCode, runNumber) {
  if (!fs.existsSync(ATTACHMENTS_DIR)) {
    console.log("No report attachments folder — nothing else to upload.");
    return;
  }

  const files = fs.readdirSync(ATTACHMENTS_DIR);
  let uploaded = 0;
  for (const filename of files) {
    let data;
    try {
      data = fs.readFileSync(path.join(ATTACHMENTS_DIR, filename));
    } catch {
      continue; // Subdirectory or unreadable entry — skip it.
    }

    if (data.length > MAX_ASSET_BYTES) {
      const sizeMb = (data.length / 1024 / 1024).toFixed(1);
      warn(
        `report asset skipped: attachments/${filename} is ${sizeMb} MB (limit 15 MB)`,
      );
      continue;
    }

    const contentType =
      ASSET_MIME_TYPES[path.extname(filename).toLowerCase()] ??
      "application/octet-stream";
    const endpoint =
      `${apiUrl.replace(/\/$/, "")}/api/v1/workspace/automated-test-runs/${projectShortCode}/${runNumber}` +
      `/report-asset?path=attachments/${encodeURIComponent(filename)}`;

    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": contentType,
        },
        body: data,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        warn(
          `report asset upload failed for attachments/${filename} ` +
            `(HTTP ${response.status}): ${body.message ?? "no message"}`,
        );
        continue;
      }
      uploaded++;
    } catch (error) {
      warn(
        `report asset upload failed for attachments/${filename}: ${error.message}`,
      );
    }
  }

  console.log(
    `Cherry report assets uploaded: ${uploaded}/${files.length} for run #${runNumber}.`,
  );
}

// Single exit door: log every problem (expected skip or unexpected crash)
// as a warning and let the process end naturally with exit code 0.
main().catch((error) => {
  console.log(`::warning::Cherry upload skipped: ${error.message}`);
});
