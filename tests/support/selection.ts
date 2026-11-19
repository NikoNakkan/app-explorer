// Which app tests the `chromium` project runs. Used by playwright.config.ts.
//   FEATURES=F12,F7 (node tools/run.mjs --features F12,F7) → only tests tagged with those features (meta() adds the tags)
//   rows the ledger marks redundant or retired are skipped, unless RUN_REDUNDANT=1 (node tools/run.mjs --redundant)
import fs from 'node:fs';
import { featureTag, testTag } from './tags';

export type Selection = { grep?: RegExp; grepInvert?: RegExp; features: string[]; skipped: string[] };

type LedgerLike = { tests?: Record<string, { key: string; status: string }> };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
// Playwright matches grep against the title followed by the tags, separated by spaces.
const anyTag = (tags: string[]) => (tags.length ? new RegExp(tags.map(t => `${escape(t)}(?=\\s|$)`).join('|')) : undefined);

export function buildSelection(ledger: LedgerLike, env: Record<string, string | undefined>): Selection {
  const features = (env.FEATURES ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const skipped = env.RUN_REDUNDANT === '1'
    ? []
    : Object.values(ledger.tests ?? {}).filter(t => t.status === 'redundant' || t.status === 'retired').map(t => t.key);
  return { grep: anyTag(features.map(featureTag)), grepInvert: anyTag(skipped.map(testTag)), features, skipped };
}

export function selectionFromLedger(env: Record<string, string | undefined> = process.env): Selection {
  let ledger: LedgerLike = {};
  try {
    ledger = JSON.parse(fs.readFileSync(env.LEDGER_PATH ?? 'exploration/ledger.json', 'utf8'));
  } catch { /* no ledger yet: run everything */ }
  return buildSelection(ledger, env);
}
