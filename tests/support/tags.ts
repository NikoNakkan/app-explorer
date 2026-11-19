// Tags shared by the tests, playwright.config.ts and the ledger. No Playwright imports here: the config loads this file.

/** Lowercase slug that keeps letters (Greek included), digits, '.', '_' and '-'. */
export function slug(s: string): string {
  return s
    .normalize('NFC')
    .toLocaleLowerCase('el')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

/** Tag on every test of a feature, so `node tools/run.mjs --features F12` (env FEATURES=F12) selects them. */
export const featureTag = (featureId: string): string => `@f:${slug(featureId)}`;

/** Tag that identifies one test row, so the config can skip rows the ledger marks redundant. */
export const testTag = (key: string): string => `@t:${key}`;

/** Test keys look like `<family>/<row>`: lowercase letters, digits, '.', '_', '-'. */
export const TEST_KEY = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;
