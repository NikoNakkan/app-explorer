// Links each test row to the ledger: which targets it claims (meta) and which it actually proved (proves).
// `node tools/ledger.mjs ingest` reads both back from the JSON report. See docs/test-generation.md.
import { test } from '@playwright/test';
import { featureTag, testTag, TEST_KEY } from './tags';

export type TestMeta = {
  /** `<family>/<row>`, exactly as registered with `node tools/ledger.mjs test add`. */
  key: string;
  /** Feature ids (code map C17) of the targets this row covers. */
  features: string[];
  /** Ledger target ids this row proves. Each one needs a `proves(id, …)` call in the test. */
  covers: string[];
};

type Details = { tag: string[]; annotation: { type: string; description: string }[] };

/**
 * Details for `test(title, meta({ key, features, covers }), body)`.
 * The tags let `FEATURES=…` select a feature's tests and let the config skip redundant rows.
 * The annotations are what the ledger reads back.
 */
export function meta({ key, features, covers }: TestMeta): Details {
  if (!TEST_KEY.test(key)) throw new Error(`meta(): test key "${key}" must look like <family>/<row> (lowercase, digits, . _ -)`);
  if (!covers.length) throw new Error(`meta(): ${key} covers no targets. Every row must prove at least one`);
  return {
    tag: [testTag(key), ...features.map(featureTag)],
    annotation: [
      { type: 'key', description: key },
      ...features.map(f => ({ type: 'feature', description: f })),
      ...covers.map(id => ({ type: 'covers', description: id })),
    ],
  };
}

/**
 * Runs the assertion(s) that show a target's outcome, as a step named "proves <id>".
 * The proof is recorded only if they pass. The id must be in this test's `covers`.
 *
 *   await proves('B:search:empty:then', () => expect(page.getByText('Συμπληρώστε κριτήριο')).toBeVisible());
 */
export async function proves(targetId: string, assertion: () => Promise<unknown> | unknown): Promise<void> {
  const info = test.info();
  const covers = info.annotations.filter(a => a.type === 'covers').map(a => a.description);
  if (!covers.includes(targetId)) {
    throw new Error(`proves('${targetId}'): not in this test's covers (${covers.join(', ') || 'none: add meta() to the test'})`);
  }
  await test.step(`proves ${targetId}`, async () => { await assertion(); }, { box: true });
  info.annotations.push({ type: 'proved', description: targetId });
}

/** Target ids a test claimed in meta() but never proved. */
export function unproved(annotations: { type: string; description?: string }[]): string[] {
  const covers = annotations.filter(a => a.type === 'covers').map(a => a.description ?? '');
  const proved = new Set(annotations.filter(a => a.type === 'proved').map(a => a.description));
  return covers.filter(id => !proved.has(id));
}
