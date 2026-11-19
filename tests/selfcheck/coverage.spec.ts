// Offline checks of the coverage helpers: meta() tags and annotations, proves(), the guard that fails
// unproved claims, and the run selection (FEATURES=…, redundant rows skipped).
import { test, expect } from '../support/fixtures';
import { meta, proves, unproved } from '../support/coverage';
import { buildSelection } from '../support/selection';
import { featureTag, slug } from '../support/tags';

test('meta() tags a row for selection and annotates it for the ledger', () => {
  const d = meta({ key: 'search-query/empty', features: ['F12', 'Αιτήσεις Πολιτών'], covers: ['B:search:empty:then'] });
  expect(d.tag).toEqual(['@t:search-query/empty', '@f:f12', '@f:αιτήσεις-πολιτών']);
  expect(d.annotation).toContainEqual({ type: 'key', description: 'search-query/empty' });
  expect(d.annotation).toContainEqual({ type: 'covers', description: 'B:search:empty:then' });
  expect(() => meta({ key: 'Search Query', features: [], covers: ['x'] })).toThrow(/<family>\/<row>/);
  expect(() => meta({ key: 'a/b', features: [], covers: [] })).toThrow(/covers no targets/);
  expect(slug('  F 12 / Αιτήσεις ')).toBe('f-12-αιτήσεις');
});

test('proves() records a proof only when its assertion passes', meta({ key: 'selfcheck/proves', features: [], covers: ['T:one', 'T:two'] }), async () => {
  await proves('T:one', () => expect(1).toBe(1));
  await expect(proves('T:other', () => undefined)).rejects.toThrow(/not in this test's covers/);
  let failed = false;
  try {
    await proves('T:two', () => expect(1, 'deliberately failing assertion').toBe(2));
  } catch {
    failed = true;
  }
  expect(failed).toBe(true);
  expect(unproved(test.info().annotations)).toEqual(['T:two']);
  await proves('T:two', () => expect(2).toBe(2));
  expect(unproved(test.info().annotations)).toEqual([]);
});

test('the guard fails a passing test that claims a target it never proves', meta({ key: 'selfcheck/guard', features: [], covers: ['T:claimed'] }), async () => {
  // Expected to fail: the body passes, then the coverageGuard fixture rejects the unproved claim.
  test.fail();
});

test('selection: FEATURES picks features, redundant rows are skipped unless RUN_REDUNDANT=1', () => {
  const ledger = { tests: { a: { key: 'fam/a', status: 'active' }, b: { key: 'fam/b', status: 'redundant' } } };
  // What Playwright matches grep against: the title path, then the tags.
  const title = (key: string, ...features: string[]) => `tests/x.spec.ts Search row ${['@t:' + key, ...features.map(featureTag)].join(' ')}`;
  const sel = buildSelection(ledger, { FEATURES: 'F12' });
  expect(sel.grep!.test(title('fam/a', 'F12'))).toBe(true);
  expect(sel.grep!.test(title('fam/a', 'F120'))).toBe(false);
  expect(sel.grepInvert!.test(title('fam/b', 'F12'))).toBe(true);
  expect(sel.grepInvert!.test(title('fam/bb', 'F12'))).toBe(false);
  expect(buildSelection(ledger, { RUN_REDUNDANT: '1' }).grepInvert).toBeUndefined();
  expect(buildSelection({}, {}).grep).toBeUndefined();
});
