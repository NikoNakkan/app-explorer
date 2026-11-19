import { test as base, expect, type Browser, type Page } from '@playwright/test';
import { authFile } from './roles';
import { SailTracker, findAppianErrors } from './appian';
import { unproved } from './coverage';

type Fixtures = {
  /** Waits for Appian (SAIL) round trips to finish: `await sail.idle()` after an action. */
  sail: SailTracker;
  /** JS errors, 5xx responses and Appian error boxes seen during the test. Attached to the report; does not fail the test. */
  pageProblems: string[];
  /** Fails a passing test that claims a target in meta() but never proves it with proves(). */
  coverageGuard: void;
};

export const test = base.extend<Fixtures>({
  sail: async ({ page }, use) => {
    await use(new SailTracker(page));
  },
  pageProblems: [
    async ({ page }, use, testInfo) => {
      const problems: string[] = [];
      page.on('pageerror', err => problems.push(`pageerror: ${err.message}`));
      page.on('console', msg => { if (msg.type() === 'error') problems.push(`console: ${msg.text()}`); });
      page.on('response', res => { if (res.status() >= 500) problems.push(`HTTP ${res.status()} ${res.url()}`); });
      await use(problems);
      try {
        for (const e of await findAppianErrors(page)) problems.push(`appian-error-box: ${e}`);
      } catch { /* page already closed */ }
      if (problems.length) {
        await testInfo.attach('page-problems', { body: problems.join('\n'), contentType: 'text/plain' });
      }
    },
    { auto: true },
  ],
  coverageGuard: [
    async ({}, use, testInfo) => {
      await use();
      if (testInfo.status !== 'passed') return;
      const missing = unproved(testInfo.annotations);
      if (missing.length) {
        throw new Error(`meta() claims ${missing.join(', ')} but the test never proved it. Wrap the assertion that shows it in proves('<id>', …)`);
      }
    },
    { auto: true },
  ],
});

export { meta, proves } from './coverage';

/** Run the tests in this file/describe as `role`, using the saved login from the setup project. */
export function useRole(role: string): void {
  test.use({ storageState: authFile(role) });
}

/**
 * Opens a second role inside the same test (P10: process hand-offs, e.g. clerk submits → supervisor gets the task).
 * The new context gets the project's options (baseURL, locale, viewport…) plus that role's saved login.
 * Always `await close()` at the end (or use try/finally).
 */
export async function openAs(
  browser: Browser,
  role: string,
  opts: { storageState?: string } = {},
): Promise<{ page: Page; sail: SailTracker; close: () => Promise<void> }> {
  const context = await browser.newContext({ storageState: opts.storageState ?? authFile(role) });
  const page = await context.newPage();
  return { page, sail: new SailTracker(page), close: () => context.close() };
}

export { expect };
