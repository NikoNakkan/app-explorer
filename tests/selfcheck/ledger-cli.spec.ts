// Offline checks of tools/ledger.mjs on a throwaway ledger: shared code is one target, duplicate families and rows
// are refused, proofs gate promotion, ingest reads Playwright's JSON report, redundancy, change tracking.
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildSelection } from '../support/selection';

const CLI = path.resolve('tools/ledger.mjs');
const json = (v: unknown) => JSON.stringify(v);

function ledgerIn(dir: string) {
  const env = { ...process.env, LEDGER_PATH: path.join(dir, 'ledger.json') };
  const run = (...args: string[]) => {
    try {
      return { ok: true, out: execFileSync('node', [CLI, ...args], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string };
      return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
    }
  };
  return { run, read: () => JSON.parse(fs.readFileSync(env.LEDGER_PATH, 'utf8')) };
}

type Row = { key: string; covers: string[]; proved: string[]; passed: boolean };

/** Same shape as Playwright's JSON report (checked against 1.63): each repeat is its own entry. */
function writeReport(file: string, rows: Row[], repeats = 3) {
  const ann = (r: Row) => [{ type: 'key', description: r.key }, ...r.covers.map(c => ({ type: 'covers', description: c }))];
  const specs = rows.flatMap(r => Array.from({ length: repeats }, () => ({
    title: r.key,
    file: 'sample.spec.ts',
    tests: [{
      projectName: 'chromium',
      status: r.passed ? 'expected' : 'unexpected',
      annotations: ann(r),
      results: [{
        status: r.passed ? 'passed' : 'failed',
        duration: 10,
        annotations: [...ann(r), ...r.proved.map(p => ({ type: 'proved', description: p }))],
        ...(r.passed ? {} : { error: { message: 'Error: expect(locator).toBeVisible() failed' } }),
      }],
    }],
  })));
  fs.writeFileSync(file, json({ config: {}, suites: [{ title: 'sample.spec.ts', specs, suites: [] }], errors: [], stats: { startTime: new Date().toISOString() } }));
}

const row = (key: string, covers: string[], role_class = 'staff') => ({ key, file: 'tests/x/fam.spec.ts', role: 'clerk', role_class, covers });

test('ledger: one target per code element, duplicates refused, proofs gate promotion, changes tracked', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-'));
  const { run, read } = ledgerIn(dir);
  run('init');
  expect(run('features', 'import', '--json', json([
    { id: 'F1', name: 'Search', members: [{ key: 'if#1', kind: 'branch', sig: 'a' }, { key: 'if#shared', kind: 'branch' }] },
    { id: 'F2', name: 'Profile', members: [{ key: 'if#shared', kind: 'branch' }] },
  ])).ok).toBe(true);
  expect(run('add', '--json', json([
    { id: 'B:s:then', kind: 'branch', title: 'search then', ref: { element: 'if#1' }, outcome: 'then' },
    { id: 'B:s:else', kind: 'branch', title: 'search else', ref: { element: 'if#1' }, outcome: 'else' },
    { id: 'B:addr:then', kind: 'branch', title: 'address then', ref: { element: 'if#shared' }, outcome: 'then' },
  ])).ok).toBe(true);

  // The shared branch mapped again (from F2, under another id) is merged into the same target.
  expect(run('add', '--json', json({ id: 'B:profile:addr:then', kind: 'branch', title: 'x', ref: { element: 'if#shared' }, outcome: 'then' })).out).toContain('same code element');
  expect(read().targets['B:addr:then'].features).toEqual(['F1', 'F2']);
  expect(Object.keys(read().targets)).toHaveLength(3);

  // A family with the same steps as an existing one is refused.
  const skeleton = ['open:S:search', 'fill:E:query', 'click:E:go'];
  expect(run('family', 'add', '--json', json({ key: 'fam', spec: 'specs/x/fam.md', skeleton })).ok).toBe(true);
  expect(run('family', 'add', '--json', json({ key: 'fam2', spec: 'specs/x/fam2.md', skeleton })).out).toContain('same steps as family fam');

  // Rows: duplicates and subsumed rows are refused; another role class is a different row.
  expect(run('test', 'add', '--json', json([row('fam/a', ['B:s:then']), row('fam/b', ['B:s:else', 'B:addr:then'])])).ok).toBe(true);
  expect(run('test', 'add', '--json', json(row('fam/c', ['B:s:then']))).out).toContain('duplicate of fam/a');
  expect(run('test', 'add', '--json', json(row('fam/d', ['B:s:else']))).out).toContain('subsumed by fam/b');
  expect(run('test', 'add', '--json', json(row('fam/e', ['B:s:then'], 'read-only'))).ok).toBe(true);

  // No proof, no promotion.
  expect(run('set', 'B:s:then', 'generated', '--by', 'Test Generator').ok).toBe(true);
  expect(run('set', 'B:s:then', 'tested', '--by', 'Auditor').out).toContain('no proof yet');

  // A stable run (3 repeats) that proves it allows promotion; a claim without proof is reported.
  const report = path.join(dir, 'results.json');
  writeReport(report, [
    { key: 'fam/a', covers: ['B:s:then'], proved: ['B:s:then'], passed: true },
    { key: 'fam/b', covers: ['B:s:else', 'B:addr:then'], proved: ['B:s:else'], passed: true },
  ]);
  const ingest = run('ingest', report);
  expect(ingest.out).toContain('2 ok');
  expect(ingest.out).toContain('CLAIMED WITHOUT PROOF  fam/b: B:addr:then');
  expect(run('set', 'B:s:then', 'tested', '--by', 'Auditor').ok).toBe(true);

  // The next export changes the branch: its feature and targets are flagged.
  run('features', 'import', '--json', json([{ id: 'F1', name: 'Search', members: [{ key: 'if#1', kind: 'branch', sig: 'b' }, { key: 'if#shared', kind: 'branch' }] }]));
  expect(run('changed', '--ids').out.trim()).toBe('F1');
  expect(run('feature', 'F1').out).toContain('code changed since its last proof');

  // The tested target's test now fails: a regression.
  writeReport(report, [{ key: 'fam/a', covers: ['B:s:then'], proved: [], passed: false }], 1);
  expect(run('ingest', report).out).toContain('REGRESSION  B:s:then was tested');
  expect(run('validate').ok).toBe(true);
});

test('ledger: Windows-safe input, and outcomes keep validation and integration targets apart', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-'));
  const { run, read } = ledgerIn(dir);
  // Windows PowerShell 5.1 writes UTF-8 files with a BOM.
  const bom = path.join(dir, 'bom.json');
  fs.writeFileSync(bom, '\uFEFF' + json([{ id: 'O:search:export', kind: 'observed', title: 'Εξαγωγή' }]));
  expect(run('add', '--file', bom).ok).toBe(true);
  // ...and strips the quotes inside --json '…': the error says what to do instead.
  expect(run('add', '--json', '{id:O:x,kind:observed}').out).toContain('--file');
  // A validation has two outcomes; without them the second would silently merge into the first.
  const v = (id: string, outcome?: string) => ({ id, kind: 'validation', title: id, ref: { element: 'ifc#val@1' }, ...(outcome ? { outcome } : {}) });
  expect(run('add', '--json', json([v('V:s:q:required:shown'), v('V:s:q:required:not-shown')])).out).toContain('needs an outcome (shown, not-shown)');
  expect(run('add', '--json', json([v('V:s:q:required:shown', 'shown'), v('V:s:q:required:not-shown', 'not-shown')])).out).toContain('added 2, merged 0');
  // One integration target per feature that uses a shared object.
  const i = (fid: string) => ({ id: `I:${fid}:address`, kind: 'integration', title: fid, ref: { element: 'ifc-address' }, outcome: `in:${fid}`, features: [fid] });
  expect(run('add', '--json', json([i('F7'), i('F12')])).out).toContain('added 2, merged 0');
  expect(Object.keys(read().targets)).toHaveLength(5);
});

test('ledger: a partial import marks moved code unresolved, a complete one decides; constant values are change signals', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-'));
  const { run, read } = ledgerIn(dir);
  const F12 = (...members: object[]) => ({ id: 'F12', name: 'Search', members: [{ key: 'if#1', kind: 'branch', sig: 'a' }, ...members] });
  const F20 = (...members: object[]) => ({ id: 'F20', name: 'Reports', members: [{ key: 'ifc-report', kind: 'interface', sig: 'r' }, ...members] });
  const shared = { key: 'cons-shared', kind: 'constant', value: 50 };
  run('features', 'import', '--complete', '--json', json([F12(shared), F20()]));
  run('add', '--json', json({ id: 'B:s:edge:then', kind: 'branch', title: 'edge', ref: { element: 'if#1', members: ['cons-shared'] }, outcome: 'then' }));
  const target = () => read().targets['B:s:edge:then'];

  // The constant moves to F20, but only F12 is in the file: not "removed", just unresolved.
  run('features', 'import', '--json', json([F12()]));
  expect(target().code_removed).toBeUndefined();
  expect(target().code_unresolved).toEqual(['cons-shared']);
  // The complete import shows it moved.
  expect(run('features', 'import', '--complete', '--json', json([F12(), F20(shared)])).out).toContain('1 earlier flags resolved');
  expect(target().code_unresolved).toBeUndefined();
  expect(target().code_removed).toBeUndefined();

  // Its value changes (an edge 50 → 60): the target is flagged, and only a hash of the value is stored.
  run('features', 'import', '--complete', '--json', json([F12(), F20({ ...shared, value: 60 })]));
  expect(target().code_changed).toBeTruthy();
  expect(JSON.stringify(read().features)).not.toContain('60');

  // Really removed: flagged by the complete import, and cleared again when the code comes back.
  run('features', 'import', '--complete', '--json', json([F12(), F20()]));
  expect(target().code_removed).toBeTruthy();
  run('features', 'import', '--complete', '--json', json([F12(), F20(shared)]));
  expect(target().code_removed).toBeUndefined();
  expect(run('validate').ok).toBe(true);
});

test('ledger: cross-role journeys differ by their switch-role steps; only the Auditor sets tested, even with --force', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-'));
  const { run } = ledgerIn(dir);
  run('add', '--json', json([
    { id: 'T:case:to-supervisor', kind: 'transition', title: 'to supervisor' },
    { id: 'T:case:to-manager', kind: 'transition', title: 'to manager' },
    { id: 'P:case:approve', kind: 'process_step', title: 'approve' },
  ]));
  const journey = (key: string, approver: string) => ({ key, spec: `specs/cases/${key}.md`,
    skeleton: ['open:S:cases', 'click:E:case:submit', `switch-role:${approver}`, 'open:S:tasks', 'click:E:task:approve'] });
  expect(run('family', 'add', '--json', json(journey('approve-sup', 'supervisors'))).ok).toBe(true);
  expect(run('family', 'add', '--json', json(journey('approve-mgr', 'managers'))).ok).toBe(true);
  expect(run('family', 'add', '--json', json(journey('approve-sup-again', 'supervisors'))).out).toContain('same steps as family approve-sup');
  // A journey row's role class is the sequence of role classes.
  const jrow = (key: string, role_class: string, covers: string[]) => ({ key, file: 't.spec.ts', role: 'clerk', role_class, covers });
  expect(run('test', 'add', '--json', json([
    jrow('approve-sup/approve', 'staff>supervisors', ['T:case:to-supervisor', 'P:case:approve']),
    jrow('approve-mgr/approve', 'staff>managers', ['T:case:to-manager', 'P:case:approve']),
  ])).ok).toBe(true);
  // A row without role_class is accepted, with a note that duplicates across logins of one class can't be seen.
  run('family', 'add', '--json', json({ key: 'solo', spec: 's.md', skeleton: ['open:S:solo'] }));
  expect(run('test', 'add', '--json', json({ key: 'solo/a', file: 's.spec.ts', role: 'clerk2', covers: ['P:case:approve'] })).out).toContain('no role_class');

  expect(run('set', 'P:case:approve', 'tested', '--by', 'Explorer', '--force', '--note', 'x').out).toContain('only the Auditor');
  expect(run('set', 'P:case:approve', 'reached', '--by', 'Explorer', '--force').out).toContain('--force needs a --note');
  expect(run('set', 'P:case:approve', 'tested', '--by', 'Auditor', '--force', '--note', 'human-approved').ok).toBe(true);
});

test('ledger: a target belongs to the features of its own code, not to those of the constants it uses', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-'));
  const { run, read } = ledgerIn(dir);
  const features = (message: string) => json([
    { id: 'F12', name: 'Search', members: [{ key: 'ifc-search#val@1', kind: 'validation', sig: 'v' }, { key: 'cons-required', kind: 'constant', value: message },
      { key: 'ifc-address', kind: 'interface' }, { key: 'ifc-address#showWhen@1', kind: 'branch', sig: 'p' }] },
    { id: 'F7', name: 'Profile', members: [{ key: 'ifc-profile#val@1', kind: 'validation', sig: 'w' }, { key: 'cons-required', kind: 'constant', value: message },
      { key: 'ifc-address', kind: 'interface' }, { key: 'ifc-address#showWhen@1', kind: 'branch', sig: 'p' }] },
  ]);
  run('features', 'import', '--complete', '--json', features('Υποχρεωτικό πεδίο'));
  expect(run('add', '--json', json([
    { id: 'V:search:q:required:shown', kind: 'validation', title: 'q', ref: { element: 'ifc-search#val@1', members: ['cons-required'] }, outcome: 'shown' },
    { id: 'V:profile:phone:required:shown', kind: 'validation', title: 'p', ref: { element: 'ifc-profile#val@1', members: ['cons-required'] }, outcome: 'shown' },
    { id: 'B:address:postcode:then', kind: 'branch', title: 'shared', ref: { element: 'ifc-address#showWhen@1' }, outcome: 'then' },
    { id: 'I:F7:address', kind: 'integration', title: 'in F7', ref: { element: 'ifc-address' }, outcome: 'in:F7', features: ['F7'] },
  ])).ok).toBe(true);
  const feats = (id: string) => read().targets[id].features;
  // The shared message constant doesn't pull either validation into the other feature; shared code is in both.
  expect(feats('V:search:q:required:shown')).toEqual(['F12']);
  expect(feats('V:profile:phone:required:shown')).toEqual(['F7']);
  expect(feats('B:address:postcode:then')).toEqual(['F12', 'F7']);
  expect(feats('I:F7:address')).toEqual(['F7']);
  // The next import keeps it so, and a change to the shared constant still flags both validations.
  run('features', 'import', '--complete', '--json', features('Συμπληρώστε το πεδίο'));
  expect(feats('V:profile:phone:required:shown')).toEqual(['F7']);
  expect(read().targets['V:search:q:required:shown'].code_changed).toBeTruthy();
  expect(read().targets['V:profile:phone:required:shown'].code_changed).toBeTruthy();
});

test('ledger: imported role classes fill and check every row, journeys included; unknown steps are pointed out', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-'));
  const { run } = ledgerIn(dir);
  run('add', '--json', json([
    { id: 'B:x:then', kind: 'branch', title: 'x' }, { id: 'B:y:then', kind: 'branch', title: 'y' },
    { id: 'P:case:approve', kind: 'process_step', title: 'approve' },
  ]));
  run('family', 'add', '--json', json({ key: 'fam', spec: 'f.md', skeleton: ['open:S:a'] }));
  run('family', 'add', '--json', json({ key: 'journey', spec: 'j.md', skeleton: ['open:S:cases', 'switch-role:supervisors', 'click:E:task:approve'] }));
  expect(run('roles', 'import', '--json', json({ classes: { staff: ['clerk'], readonly: ['clerk'] } })).out).toContain('is in both');
  expect(run('roles', 'import', '--json', json({ classes: { staff: ['clerk', 'clerk2'], readonly: ['viewer'], supervisors: ['supervisor'] } })).ok).toBe(true);
  const r = (key: string, role: string, covers: string[], role_class?: string) => ({ key, file: 't.spec.ts', role, covers, ...(role_class ? { role_class } : {}) });
  // The class comes from the login, so a row for another login of the same class is a duplicate.
  expect(run('test', 'add', '--json', json(r('fam/a', 'clerk', ['B:x:then']))).out).toContain('[staff]');
  expect(run('test', 'add', '--json', json(r('fam/b', 'clerk2', ['B:x:then']))).out).toContain('duplicate of fam/a');
  // A class that doesn't hold the login, an unknown class, a login in no class: refused.
  expect(run('test', 'add', '--json', json(r('fam/c', 'viewer', ['B:y:then'], 'staff'))).out).toContain(`login "viewer" isn't in role class "staff"`);
  expect(run('test', 'add', '--json', json(r('fam/d', 'viewer', ['B:y:then'], 'admins'))).out).toContain('unknown role class "admins"');
  expect(run('test', 'add', '--json', json(r('fam/e', 'ghost', ['B:y:then']))).out).toContain('in no imported role class');
  // A journey's class is filled from the family's hand-offs; one that contradicts them is refused.
  expect(run('test', 'add', '--json', json(r('journey/approve', 'clerk', ['P:case:approve']))).out).toContain('[staff>supervisors]');
  expect(run('test', 'add', '--json', json(r('journey/approve-2', 'clerk', ['P:case:approve', 'B:y:then'], 'staff'))).out).toContain(`doesn't match the family's hand-offs`);
  // A misspelt step or an unknown role class in a skeleton is pointed out (a note, not a refusal).
  const check = run('family', 'check', '--json', json({ skeleton: ['open:S:a', 'click:E:task:aprove', 'switch-role:managers'] }));
  expect(check.out).toContain('"E:task:aprove" is not a ledger target');
  expect(check.out).toContain('no role class "managers"');
  expect(run('validate').ok).toBe(true);
});

test('ledger: changed keeps a feature listed until all its rows have run after the change', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-'));
  const { run } = ledgerIn(dir);
  const feature = (sig: string) => json([{ id: 'F1', name: 'Search', members: [{ key: 'if#1', kind: 'branch', sig }] }]);
  run('features', 'import', '--complete', '--json', feature('a'));
  run('add', '--json', json([
    { id: 'B:s:then', kind: 'branch', title: 'then', ref: { element: 'if#1' }, outcome: 'then' },
    { id: 'B:s:else', kind: 'branch', title: 'else', ref: { element: 'if#1' }, outcome: 'else' },
  ]));
  run('family', 'add', '--json', json({ key: 'fam', spec: 'f.md', skeleton: ['open:S:search'] }));
  run('test', 'add', '--json', json([row('fam/a', ['B:s:then']), row('fam/b', ['B:s:else'])]));
  const report = path.join(dir, 'results.json');
  const a = { key: 'fam/a', covers: ['B:s:then'], proved: ['B:s:then'], passed: true };
  const b = { key: 'fam/b', covers: ['B:s:else'], proved: ['B:s:else'], passed: true };
  writeReport(report, [a, b], 1);
  run('ingest', report);
  expect(run('changed', '--ids').out.trim()).toBe('');

  run('features', 'import', '--complete', '--json', feature('b'));
  expect(run('changed', '--ids').out.trim()).toBe('F1');
  // Only one row runs again (as the Healer would): the feature is still listed, with the row still to rerun.
  writeReport(report, [a], 1);
  run('ingest', report);
  expect(run('changed', '--ids').out.trim()).toBe('F1');
  expect(run('changed').out).toContain('1 test to rerun');
  // Every row has run since the change: nothing left.
  writeReport(report, [a, b], 1);
  run('ingest', report);
  expect(run('changed', '--ids').out.trim()).toBe('');
});

test('run.mjs: refuses --reporter, and runs nothing when no feature changed', () => {
  const RUN = path.resolve('tools/run.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-'));
  const runner = (...args: string[]) => {
    try {
      return { code: 0, out: execFileSync('node', [RUN, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
    }
  };
  const refused = runner('--reporter=line', '--ledger', path.join(dir, 'ledger.json'));
  expect(refused.code).toBe(2);
  expect(refused.out).toContain('--reporter would replace the JSON report');
  const nothing = runner('--changed', '--ledger', path.join(dir, 'ledger.json'));
  expect(nothing.code).toBe(0);
  expect(nothing.out).toContain('nothing to rerun');
});

test('ledger: redundancy keeps the row that proves more, and the run selection skips the other', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-'));
  const { run, read } = ledgerIn(dir);
  run('add', '--json', json([
    { id: 'B:x:then', kind: 'branch', title: 'x', features: ['F1'] },
    { id: 'B:y:then', kind: 'branch', title: 'y', features: ['F1'] },
  ]));
  run('family', 'add', '--json', json({ key: 'small', spec: 's.md', skeleton: ['open:S:a', 'click:E:b'] }));
  run('family', 'add', '--json', json({ key: 'journey', spec: 'j.md', skeleton: ['open:S:a', 'click:E:b', 'click:E:c'] }));
  expect(run('test', 'add', '--json', json(row('small/x', ['B:x:then']))).ok).toBe(true);
  // A bigger row may be added; it warns that the smaller one becomes redundant.
  expect(run('test', 'add', '--json', json(row('journey/xy', ['B:x:then', 'B:y:then']))).out).toContain('small/x becomes redundant');

  const report = path.join(dir, 'results.json');
  writeReport(report, [
    { key: 'small/x', covers: ['B:x:then'], proved: ['B:x:then'], passed: true },
    { key: 'journey/xy', covers: ['B:x:then', 'B:y:then'], proved: ['B:x:then', 'B:y:then'], passed: true },
  ]);
  run('ingest', report);
  expect(run('redundancy').out).toContain('REDUNDANT  small/x  proves a subset of its targets as journey/xy');
  expect(run('redundancy', '--apply', '--by', 'Explorer').ok).toBe(false);
  expect(run('redundancy', '--apply', '--by', 'Auditor').ok).toBe(true);
  expect(read().tests['small/x'].status).toBe('redundant');
  expect(buildSelection(read(), {}).skipped).toEqual(['small/x']);
  expect(buildSelection(read(), { RUN_REDUNDANT: '1' }).skipped).toEqual([]);
});
