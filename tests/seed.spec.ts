// Seed test: proves that a saved role session opens the app.
// Also usable as the seed for Playwright's built-in test agents (npx playwright init-agents --loop=vscode --project chromium;
// without --project it picks the selfcheck project and overwrites this file with an empty seed).
import { test, expect, useRole } from './support/fixtures';
import { ROLES } from './support/roles';
import { onLoginPage } from './support/login';

useRole(process.env.SEED_ROLE ?? ROLES[0]);

test('seed: app opens with a saved session', async ({ page }) => {
  await page.goto('/');
  // oracle: observed — after login the app must not bounce back to the login page
  await expect(page).not.toHaveURL(onLoginPage);
});
