// Self-check of the Appian helpers against mock pages shaped like the DOM described in public sources
// (robo_appian docs, Appian docs). This proves the helpers' logic, not Appian's real markup:
// the Explorer confirms the real DOM on the first run (platform-rules P5, P12, P13).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { SailTracker, selectDropdown, answerConfirm, findAppianErrors, expandAllSections, sitePagePath, formatAppianDate } from '../support/appian';
import { openAs } from '../support/fixtures';

const ORIGIN = 'http://appian.mock';

test.beforeEach(async ({ page }) => {
  // Fake Appian endpoint that answers slowly, like a SAIL re-evaluation.
  await page.route(`${ORIGIN}/suite/rest/a/eval`, async route => {
    await new Promise(r => setTimeout(r, 400));
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
});

async function open(page: import('@playwright/test').Page, html: string) {
  await page.route(`${ORIGIN}/`, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  await page.goto(`${ORIGIN}/`);
}

test('SailTracker waits for in-flight /suite/ requests', async ({ page }) => {
  await open(page, `<html><body><button onclick="fetch('/suite/rest/a/eval').then(()=>document.body.dataset.done='1')">Go</button></body></html>`);
  const sail = new SailTracker(page);
  await page.getByRole('button', { name: 'Go' }).click();
  await sail.idle({ quietMs: 100, timeoutMs: 5000 });
  expect(sail.pending).toBe(0);
  await expect(page.locator('body')).toHaveAttribute('data-done', '1');
});

test('selectDropdown: combobox labelled by aria, options with role=option', async ({ page }) => {
  await open(page, `<html lang="el"><body>
    <span id="lbl">Κατάσταση</span>
    <div role="combobox" aria-labelledby="lbl" tabindex="0" id="x1_value"
         onclick="document.getElementById('lb').hidden=false">Επιλέξτε...</div>
    <ul role="listbox" id="lb" hidden>
      <li role="option" onclick="document.getElementById('x1_value').textContent=this.textContent;document.getElementById('lb').hidden=true">Ανοιχτή</li>
      <li role="option" onclick="document.getElementById('x1_value').textContent=this.textContent;document.getElementById('lb').hidden=true">Κλειστή</li>
    </ul></body></html>`);
  await selectDropdown(page, 'ΚΑΤΑΣΤΑΣΗ', 'κλειστη');
  await expect(page.getByRole('combobox')).toHaveText('Κλειστή');
});

test('selectDropdown: label without aria link, options without role (robo_appian shape)', async ({ page }) => {
  await open(page, `<html lang="el"><body>
    <div><span>Υπάλληλος</span>
      <div role="combobox" id="employee_value" onclick="document.getElementById('employee_list').hidden=false">Επιλέξτε...</div></div>
    <ul id="employee_list" role="listbox" hidden>
      <li><div onclick="document.getElementById('employee_value').textContent=this.textContent">Γιάννης Παπαδόπουλος</div></li>
      <li><div onclick="document.getElementById('employee_value').textContent=this.textContent">Μαρία Οικονόμου</div></li>
    </ul></body></html>`);
  await selectDropdown(page, 'Υπάλληλος', 'ΜΑΡΙΑ ΟΙΚΟΝΟΜΟΥ');
  await expect(page.getByRole('combobox')).toHaveText('Μαρία Οικονόμου');
});

test('answerConfirm uses the Appian modal, not a native dialog', async ({ page }) => {
  await open(page, `<html lang="el"><body>
    <div role="dialog" aria-label="Επιβεβαίωση"><p>Θέλετε να συνεχίσετε;</p>
      <button onclick="document.body.dataset.answer='yes'">Ναι</button>
      <button onclick="document.body.dataset.answer='no'">Ακύρωση</button></div></body></html>`);
  await answerConfirm(page, 'cancel');
  await expect(page.locator('body')).toHaveAttribute('data-answer', 'no');
  await answerConfirm(page, 'confirm');
  await expect(page.locator('body')).toHaveAttribute('data-answer', 'yes');
});

test('findAppianErrors detects the interface error box', async ({ page }) => {
  await open(page, `<html><body><div class="err">Could not display interface. Please check definition and inputs.</div></body></html>`);
  expect(await findAppianErrors(page)).toHaveLength(1);
  await open(page, `<html><body><p>Όλα καλά</p></body></html>`);
  expect(await findAppianErrors(page)).toHaveLength(0);
});

test('expandAllSections opens collapsed sections', async ({ page }) => {
  await open(page, `<html><body>
    <button aria-expanded="false" onclick="this.setAttribute('aria-expanded','true');this.nextElementSibling.hidden=false">Στοιχεία</button><div hidden>Α</div>
    <button aria-expanded="false" onclick="this.setAttribute('aria-expanded','true');this.nextElementSibling.hidden=false">Ιστορικό</button><div hidden>Β</div>
    </body></html>`);
  expect(await expandAllSections(page)).toBe(2);
  await expect(page.locator('[aria-expanded="false"]')).toHaveCount(0);
});

test('formatAppianDate formats with the configured pattern', () => {
  const d = new Date(2026, 11, 5); // 5 Dec 2026
  expect(formatAppianDate(d, 'dd/MM/yyyy')).toBe('05/12/2026');
  expect(formatAppianDate(d, 'M/d/yy')).toBe('12/5/26');
  expect(formatAppianDate(d, 'yyyy-MM-dd')).toBe('2026-12-05');
});

test('openAs gives a second role its own context, with project options and its saved login', async ({ browser }, testInfo) => {
  const state = testInfo.outputPath('roleB.json');
  fs.writeFileSync(state, JSON.stringify({
    cookies: [],
    origins: [{ origin: ORIGIN, localStorage: [{ name: 'who', value: 'roleB' }] }],
  }));
  const b = await openAs(browser, 'roleB', { storageState: state });
  try {
    await b.page.route(`${ORIGIN}/`, route => route.fulfill({ contentType: 'text/html', body: '<html><body>B</body></html>' }));
    await b.page.goto(`${ORIGIN}/`);
    expect(await b.page.evaluate(() => localStorage.getItem('who'))).toBe('roleB');
    expect(await b.page.evaluate(() => navigator.language)).toBe('el-GR'); // inherited from playwright.config `use`
  } finally {
    await b.close();
  }
});

test('sitePagePath builds site and page-group URLs', () => {
  expect(sitePagePath('case-management', 'cases')).toBe('/suite/sites/case-management/page/cases');
  expect(sitePagePath('case-management', 'openCases', 'cases')).toBe('/suite/sites/case-management/group/cases/page/openCases');
});
