import { test as setup } from '@playwright/test';
import fs from 'node:fs';
import { ROLES, credentials, authFile } from './support/roles';
import { login } from './support/login';

// Checks run inside tests (not at import time) so other projects still load without a .env.
if (!ROLES.length) {
  setup('configure roles', () => {
    throw new Error('Set ROLES=role1,role2 (and ROLE_<NAME>_USER / _PASS) in .env');
  });
}

for (const role of ROLES) {
  setup(`authenticate as ${role}`, async ({ page }) => {
    if (!process.env.APP_BASE_URL) throw new Error('Set APP_BASE_URL in .env');
    fs.mkdirSync('.auth', { recursive: true });
    await login(page, credentials(role));
    await page.context().storageState({ path: authFile(role) });
  });
}
