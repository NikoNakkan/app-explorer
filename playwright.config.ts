import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import { parseEnv } from 'node:util';
import { selectionFromLedger } from './tests/support/selection';

// Load .env without extra dependencies (Node ≥ 20.12), with the same parser and rules as process.loadEnvFile
// (variables already set in the environment win). Unlike loadEnvFile, it also reads what Windows tools write:
// UTF-16 (Windows PowerShell's `>` and Out-File), which loadEnvFile silently ignores, and a UTF-8 BOM, which
// would hide the first variable.
function loadEnv(file: string): void {
  let buf: Buffer;
  try { buf = fs.readFileSync(file); } catch { return; } // no .env: rely on the real environment
  const text = buf[0] === 0xff && buf[1] === 0xfe ? buf.toString('utf16le') : buf.toString('utf8');
  for (const [key, value] of Object.entries(parseEnv(text.replace(/^\uFEFF/, '')))) {
    if (process.env[key] === undefined && value !== undefined) process.env[key] = value;
  }
}
loadEnv('.env');

// The env var FEATURES=F12,F7 runs only those features' tests; rows the ledger marks redundant are skipped unless
// RUN_REDUNDANT=1. Set them with `node tools/run.mjs --features F12,F7` / `--redundant`, which works in every shell.
const selection = selectionFromLedger();

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0, // flakiness should be visible to the Healer/Auditor, not hidden by retries
  // Keep the JSON reporter: `node tools/ledger.mjs ingest` reads it. A --reporter flag on the command line replaces this list.
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: process.env.APP_BASE_URL,
    locale: 'el-GR',
    timezoneId: 'Europe/Athens',
    viewport: { width: 1440, height: 900 }, // keep in sync with .vscode/playwright-mcp.json
    testIdAttribute: process.env.TEST_ID_ATTRIBUTE ?? 'data-testid',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Offline checks of the support helpers (no app, no login).
    { name: 'selfcheck', testMatch: /selfcheck\/.*\.spec\.ts/ },
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      dependencies: ['setup'],
      testIgnore: [/auth\.setup\.ts/, /selfcheck\//],
      grep: selection.grep,
      grepInvert: selection.grepInvert,
    },
  ],
});
