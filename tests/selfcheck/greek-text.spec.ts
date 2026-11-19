// Self-check: runs without the app (no login, no APP_BASE_URL). `npx playwright test --project=selfcheck`
// Reproduces the «ΑΝΑΖΗΤΗΣΗ» vs «Αναζήτηση» problem and proves looseName() handles it.
import { test, expect } from '@playwright/test';
import { looseName, normalizeText, sameText } from '../support/text';

const PAGE = `<html lang="el"><body>
  <button style="text-transform:uppercase">Αναζήτηση</button>
  <button>Εκκαθάριση φίλτρων</button>
  <label>Όνομα χρήστη <input></label>
</body></html>`;

test('screen shows uppercase, DOM keeps accents', async ({ page }) => {
  await page.setContent(PAGE);
  const btn = page.getByRole('button').first();
  // What a screenshot (and innerText) shows:
  expect(await btn.innerText()).toBe('ΑΝΑΖΗΤΗΣΗ');
  // What the accessibility tree holds:
  await expect(page.locator('body')).toMatchAriaSnapshot(`- button "Αναζήτηση"`);
  // Plain Playwright text matching is case-insensitive but NOT accent-insensitive:
  await expect(page.getByRole('button', { name: 'ΑΝΑΖΗΤΗΣΗ' })).toHaveCount(0);
});

test('looseName matches regardless of case, accents and final sigma', async ({ page }) => {
  await page.setContent(PAGE);
  for (const seen of ['ΑΝΑΖΗΤΗΣΗ', 'αναζητηση', 'Αναζήτηση']) {
    await expect(page.getByRole('button', { name: looseName(seen) })).toHaveCount(1);
  }
  await expect(page.getByRole('button', { name: looseName('ΕΚΚΑΘΑΡΙΣΗ ΦΙΛΤΡΩΝ') })).toHaveCount(1);
  await expect(page.getByLabel(looseName('ονομα χρηστη'))).toHaveCount(1);
  await expect(page.getByRole('button', { name: looseName('ΑΝΑΖΗΤ', { exact: false }) })).toHaveCount(1);
});

test('normalizeText', () => {
  expect(normalizeText('  ΑΝΑΖΗΤΗΣΗ ')).toBe('αναζητηση');
  expect(sameText('ΑΝΑΖΗΤΗΣΕΙΣ', 'Αναζητήσεις')).toBe(true);
  expect(sameText('Αποθήκευση', 'Ακύρωση')).toBe(false);
});
