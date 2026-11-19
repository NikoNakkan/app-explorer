#!/usr/bin/env node
// Runs the Playwright tests, then `node tools/ledger.mjs ingest`. Works the same in PowerShell, cmd and bash,
// because the options below replace shell-specific environment syntax (FEATURES=… / $env:FEATURES=…), and
// because it starts Playwright with node itself: no npx, which Windows PowerShell blocks when scripts are disabled.
// No dependencies (Node ≥ 20.12). Usage: node tools/run.mjs [options] [playwright test arguments]
//
//   node tools/run.mjs                                   every app test except rows marked redundant
//   node tools/run.mjs --features F12,F7                 only the tests of those features
//   node tools/run.mjs --changed                         only features whose code changed since their tests last ran (nothing runs if none did)
//   node tools/run.mjs --redundant                       include the rows marked redundant
//   node tools/run.mjs tests/search/search-query.spec.ts --repeat-each=3 --by Auditor
//   node tools/run.mjs tests/x/fam.spec.ts -g "row name" --trace=on --by "Test Healer"
//   node tools/run.mjs --project=setup                   log every role in (.auth/<role>.json); nothing to ingest
//
// Options (everything else goes to `playwright test` unchanged):
//   --features <ids>   comma-separated feature ids (sets FEATURES)
//   --changed          add the features listed by `ledger.mjs changed --ids`
//   --redundant        run rows marked redundant or retired too (sets RUN_REDUNDANT=1)
//   --ledger <path>    use another ledger file (sets LEDGER_PATH for the run selection and for ingest)
//   --by <agent>       recorded by ingest (--by)
//   --no-ingest        don't ingest the report afterwards
// Exit code: Playwright's (non-zero when a test failed), or 1 if ingest failed after a green run.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER_CLI = path.join(ROOT, 'tools', 'ledger.mjs');
const PW_CLI = path.join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
const REPORT = path.join(ROOT, 'test-results', 'results.json');

function fail(msg, code = 2) { console.error('run: ' + msg); process.exit(code); }

const own = { features: [], changed: false, redundant: false, ledger: undefined, by: undefined, ingest: true };
const pass = [];
const argv = process.argv.slice(2);
const takeValue = (i, name) => {
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) fail(`${name} needs a value`);
  return v;
};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const [flag, inline] = a.startsWith('--') && a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
  if (flag === '--help' || flag === '-h') {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter(l => l.startsWith('//')).map(l => l.slice(3)).join('\n'));
    process.exit(0);
  } else if (flag === '--features') own.features.push(...String(inline ?? takeValue(i++, flag)).split(',').map(s => s.trim()).filter(Boolean));
  else if (flag === '--changed') own.changed = true;
  else if (flag === '--redundant') own.redundant = true;
  else if (flag === '--ledger') own.ledger = inline ?? takeValue(i++, flag);
  else if (flag === '--by') own.by = inline ?? takeValue(i++, flag);
  else if (flag === '--no-ingest') own.ingest = false;
  else if (flag === '--reporter') fail('--reporter would replace the JSON report that ingest reads. Run without it (the config already prints a list).');
  else pass.push(a);
}

const env = { ...process.env };
if (own.ledger) env.LEDGER_PATH = path.resolve(own.ledger);
if (own.redundant) env.RUN_REDUNDANT = '1';
else delete env.RUN_REDUNDANT;
const node = (args, opts = {}) => spawnSync(process.execPath, args, { cwd: ROOT, env, encoding: 'utf8', ...opts });

if (own.changed) {
  const r = node([LEDGER_CLI, 'changed', '--ids']);
  if (r.status !== 0) fail(`ledger.mjs changed failed: ${(r.stderr || r.stdout).trim()}`, 1);
  const ids = r.stdout.trim().split(',').map(s => s.trim()).filter(Boolean);
  if (!ids.length && !own.features.length) {
    console.log('run: no feature\'s code changed since its tests last ran, so there is nothing to rerun.');
    process.exit(0);
  }
  if (ids.length) console.log(`run: features whose code changed since their tests last ran: ${ids.join(', ')}`);
  own.features.push(...ids);
}
if (own.features.length) env.FEATURES = [...new Set(own.features)].join(',');
else delete env.FEATURES; // an inherited FEATURES would silently narrow the run

if (!fs.existsSync(PW_CLI)) fail('Playwright is not installed here. Run: npm install', 1);
const before = fs.existsSync(REPORT) ? fs.statSync(REPORT).mtimeMs : 0;
console.log(`run: playwright test ${pass.join(' ')}${env.FEATURES ? `  [FEATURES=${env.FEATURES}]` : ''}${own.redundant ? '  [RUN_REDUNDANT=1]' : ''}`);
const pw = spawnSync(process.execPath, [PW_CLI, 'test', ...pass], { cwd: ROOT, env, stdio: 'inherit' });
const pwStatus = pw.status ?? 1;

const listing = pass.includes('--list');
const written = fs.existsSync(REPORT) && fs.statSync(REPORT).mtimeMs > before;
if (!own.ingest || listing) process.exit(pwStatus);
if (!written) {
  console.error('run: Playwright wrote no JSON report this time, so there is nothing to ingest.');
  process.exit(pwStatus || 1);
}
// Runs of only the setup/selfcheck projects carry no app tests; ingesting them would only add an empty run,
// which moves the baseline of `ledger.mjs changed`.
const ignored = (process.env.LEDGER_IGNORE_PROJECTS ?? 'setup,selfcheck').split(',').map(s => s.trim());
const projects = new Set();
const walk = s => { for (const sp of s.specs || []) for (const t of sp.tests || []) projects.add(t.projectName); (s.suites || []).forEach(walk); };
try { (JSON.parse(fs.readFileSync(REPORT, 'utf8')).suites || []).forEach(walk); } catch { projects.add('?'); }
if (![...projects].some(p => !ignored.includes(p))) {
  console.log(`run: only ${[...projects].join(', ') || 'no'} tests ran, nothing to ingest.`);
  process.exit(pwStatus);
}
console.log(`\nrun: node tools/ledger.mjs ingest${own.by ? ` --by "${own.by}"` : ''}`);
const ing = node([LEDGER_CLI, 'ingest', ...(own.by ? ['--by', own.by] : [])], { stdio: 'inherit' });
process.exit(pwStatus || (ing.status ?? 1));
