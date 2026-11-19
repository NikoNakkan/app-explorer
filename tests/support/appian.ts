// Appian-specific helpers. Background: docs/appian/platform-knowledge.md, rules: docs/appian/platform-rules.md.
// DOM shapes marked (verify) come from public sources, not from your app. The Explorer confirms them on the
// first run and records the outcome as a platform rule.
import { expect, type Locator, type Page, type Request } from '@playwright/test';
import { looseName } from './text';

type Name = string | RegExp;
const asName = (n: Name): RegExp => (typeof n === 'string' ? looseName(n) : n);

// ---------------------------------------------------------------------------
// SAIL settling: every interaction is a server round trip (P1 in knowledge §1).
// ---------------------------------------------------------------------------

/** Tracks in-flight Appian requests so tests wait for evaluation to finish instead of sleeping. */
export class SailTracker {
  private inflight = new Set<Request>();
  private lastChange = Date.now();

  constructor(page: Page, private pattern: RegExp = /\/suite\//) {
    page.on('request', r => {
      if (this.pattern.test(r.url())) { this.inflight.add(r); this.lastChange = Date.now(); }
    });
    const done = (r: Request) => { if (this.inflight.delete(r)) this.lastChange = Date.now(); };
    page.on('requestfinished', done);
    page.on('requestfailed', done);
  }

  /** Resolves when no matching request has been in flight for `quietMs`. Throws after `timeoutMs`. */
  async idle(opts: { quietMs?: number; timeoutMs?: number } = {}): Promise<void> {
    const quietMs = opts.quietMs ?? 300;
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const start = Date.now();
    for (;;) {
      if (this.inflight.size === 0 && Date.now() - this.lastChange >= quietMs) return;
      if (Date.now() - start > timeoutMs) {
        const urls = [...this.inflight].map(r => r.url()).join(', ');
        throw new Error(`SAIL not idle after ${timeoutMs} ms; in flight: ${urls || '(none, still settling)'}`);
      }
      await new Promise(res => setTimeout(res, 50));
    }
  }

  get pending(): number { return this.inflight.size; }
}

// ---------------------------------------------------------------------------
// Errors (P13): Appian shows evaluation errors in the page, not the console.
// ---------------------------------------------------------------------------

/** English patterns from Appian; add Greek ones via APPIAN_ERROR_PATTERNS="regex1||regex2" when first seen. */
export const APPIAN_ERROR_PATTERNS: RegExp[] = [
  /Could not display interface/i,
  /Expression evaluation error/i,
  /Error Evaluating UI Expression/i,
  /An error has occurred/i,
  ...(process.env.APPIAN_ERROR_PATTERNS ?? '')
    .split('||')
    .map((s: string) => s.trim())
    .filter(Boolean)
    .map((s: string) => new RegExp(s, 'iu')),
];

/** Returns the visible Appian error texts on the page (empty array = none). */
export async function findAppianErrors(page: Page): Promise<string[]> {
  const found: string[] = [];
  for (const re of APPIAN_ERROR_PATTERNS) {
    const loc = page.getByText(re);
    const n = await loc.count();
    for (let i = 0; i < n; i++) found.push((await loc.nth(i).innerText()).trim());
  }
  return found;
}

/** Web-first assertion that no Appian error box is shown. */
export async function expectNoAppianError(page: Page): Promise<void> {
  // oracle: platform rule P13
  await expect.poll(() => findAppianErrors(page), { message: 'Appian error box on page' }).toEqual([]);
}

// ---------------------------------------------------------------------------
// Dropdowns (P5): custom combobox → listbox; search box when > 11 choices.
// ---------------------------------------------------------------------------

/** Finds the combobox for a field label. Falls back to "the first combobox after the label text". (verify) */
export function dropdown(page: Page | Locator, label: Name): Locator {
  const name = asName(label);
  return page
    .getByRole('combobox', { name })
    .or(page.getByText(name).locator('xpath=following::*[@role="combobox"][1]'))
    .first();
}

/**
 * Selects `option` in the dropdown labelled `label`.
 * If `search` is set (large lists show a search box), types it before choosing.
 */
export async function selectDropdown(
  page: Page,
  label: Name,
  option: Name,
  opts: { search?: string; sail?: SailTracker } = {},
): Promise<void> {
  const combo = dropdown(page, label);
  await combo.click();
  if (opts.search) await page.keyboard.type(opts.search);
  const list = page.getByRole('listbox').last();
  await expect(list).toBeVisible();
  const name = asName(option);
  const choice = list.getByRole('option', { name }).or(list.getByText(name)).first();
  await choice.click();
  if (opts.sail) await opts.sail.idle();
}

// ---------------------------------------------------------------------------
// Confirmation dialogs (P12): Appian modals, not native dialogs.
// ---------------------------------------------------------------------------

/** Answers an Appian confirmation dialog. Labels default to Greek system defaults (verify, then record). */
export async function answerConfirm(
  page: Page,
  answer: 'confirm' | 'cancel',
  labels: { confirm?: Name; cancel?: Name } = {},
): Promise<void> {
  const dialog = page.getByRole('dialog').last();
  await expect(dialog).toBeVisible();
  const label = answer === 'confirm'
    ? labels.confirm ?? /^(ναι|yes)$/iu
    : labels.cancel ?? /^(ακύρωση|άκυρο|cancel|όχι|no)$/iu;
  await dialog.getByRole('button', { name: typeof label === 'string' ? looseName(label) : label }).click();
}

// ---------------------------------------------------------------------------
// Sections and menus (P4, P7): reveal hidden UI before reconciling.
// ---------------------------------------------------------------------------

/** Expands every collapsed section/box exposing aria-expanded="false". Returns how many were expanded. */
export async function expandAllSections(page: Page, sail?: SailTracker): Promise<number> {
  const collapsed = page.locator('[aria-expanded="false"]:not([role="combobox"]):not([aria-haspopup])');
  let count = 0;
  for (let guard = 0; guard < 50; guard++) {
    const n = await collapsed.count();
    if (n === 0) break;
    await collapsed.first().click();
    count++;
    if (sail) await sail.idle();
  }
  return count;
}

// ---------------------------------------------------------------------------
// Dates (P6): the typed format follows the user's Appian locale. /bootstrap confirms it (P6a) and
// stores it in .env as APPIAN_DATE_FORMAT (tokens: dd, d, MM, M, yyyy, yy). Default is the usual Greek format.
// ---------------------------------------------------------------------------

export function formatAppianDate(date: Date, format: string = process.env.APPIAN_DATE_FORMAT ?? 'dd/MM/yyyy'): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const tokens: Record<string, string> = {
    yyyy: String(date.getFullYear()),
    yy: String(date.getFullYear()).slice(-2),
    MM: pad(date.getMonth() + 1),
    M: String(date.getMonth() + 1),
    dd: pad(date.getDate()),
    d: String(date.getDate()),
  };
  return format.replace(/yyyy|yy|MM|M|dd|d/g, t => tokens[t]);
}

// ---------------------------------------------------------------------------
// URLs (knowledge §4). Record URLs are opaque (P11): there is deliberately no recordUrl(id) helper.
// Reach records through lists, search or links; a record URL captured during the same run may be reused.
// ---------------------------------------------------------------------------

export function sitePagePath(site: string, page: string, group?: string): string {
  return group ? `/suite/sites/${site}/group/${group}/page/${page}` : `/suite/sites/${site}/page/${page}`;
}
