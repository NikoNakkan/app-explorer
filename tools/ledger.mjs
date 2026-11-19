#!/usr/bin/env node
// Coverage ledger CLI. The only supported way for agents to change exploration/ledger.json.
// No dependencies (Node ≥ 20.12). Usage: node tools/ledger.mjs <command> [args]   (no args: help)
//
// The ledger holds:
//   targets   what should be tested: one per code element + outcome, tagged with the features it belongs to
//   features  your code map's features (C17), with what changed in each import
//   families  one per sequence of test steps; rows of a family differ only in data or role
//   tests     every test row: what it covers, its last result, its proofs. Duplicates are refused
//   runs      every Playwright JSON report ingested

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const LEDGER = process.env.LEDGER_PATH || path.join('exploration', 'ledger.json');
const REPORT = path.join(path.dirname(LEDGER), 'coverage.md');
const RESULTS = process.env.PW_JSON_REPORT || path.join('test-results', 'results.json');
const IGNORE_PROJECTS = list(process.env.LEDGER_IGNORE_PROJECTS ?? 'setup,selfcheck');
const IGNORE_FILES = list(process.env.LEDGER_IGNORE_FILES ?? 'seed.spec.ts');

const KINDS = ['screen', 'element', 'branch', 'loop', 'transition', 'url', 'validation', 'process_step', 'integration', 'observed'];
const PROGRESS = ['discovered', 'mapped', 'reached', 'specified', 'generated', 'tested'];
const SIDE = ['blocked', 'bug_suspected', 'spec_disputed', 'out_of_scope'];
const STATUSES = [...PROGRESS, ...SIDE];
const NEXT_AGENT = {
  discovered: 'Explorer',
  mapped: 'Explorer',
  reached: 'Scenario Planner',
  specified: 'Test Generator',
  generated: 'Auditor',
};
// Kinds whose targets are one outcome of a code element: without an outcome, two of them on one element would merge.
const OUTCOMES = {
  branch: 'then, else, case-<n>, default',
  loop: 'empty, one, many',
  validation: 'shown, not-shown',
  integration: 'in:<feature id> (one per feature that uses the shared object)',
};
const SLUG = /^[a-z0-9][a-z0-9._-]*$/;
const TEST_KEY = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;
const MAX_LIST = 30;

// ---------- small helpers ----------
function list(s) { return String(s).split(',').map(x => x.trim()).filter(Boolean); }
function now() { return new Date().toISOString(); }
function uniq(a) { return [...new Set(a)]; }
function asArray(x) { return Array.isArray(x) ? x : [x]; }
function firstLine(s) {
  const clean = String(s || '').replace(/\u001b\[[0-9;]*m/g, '');
  const line = clean.split('\n').find(l => l.trim());
  return line ? line.trim().slice(0, 200) : '';
}
function countBy(arr, key) {
  const out = {};
  for (const x of arr) { const k = x[key] ?? '-'; out[k] = (out[k] || 0) + 1; }
  return out;
}
function cell(s) { return String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' '); }
function more(items, fmt, max = MAX_LIST) {
  const lines = items.slice(0, max).map(fmt);
  if (items.length > max) lines.push(`- … and ${items.length - max} more`);
  return lines;
}

// ---------- io ----------
function emptyLedger() {
  return { version: 2, updated: now(), targets: {}, features: {}, families: {}, tests: {}, runs: [] };
}
function upgrade(l) {
  l.version = 2;
  for (const k of ['targets', 'features', 'families', 'tests']) l[k] ??= {};
  l.runs ??= [];
  for (const t of Object.values(l.targets)) {
    t.features ??= [];
    t.tests ??= [];
    t.proofs ??= [];
    t.evidence ??= [];
    t.history ??= [];
    t.ref ??= {};
  }
  return l;
}
// Files written by Windows PowerShell 5.1 (Set-Content/Out-File -Encoding utf8) start with a BOM, which JSON.parse rejects.
function readText(file) { return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''); }
function load() {
  if (!fs.existsSync(LEDGER)) return emptyLedger();
  const raw = readText(LEDGER).trim();
  return raw ? upgrade(JSON.parse(raw)) : emptyLedger();
}
function save(ledger) {
  ledger.updated = now();
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  const tmp = LEDGER + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(ledger, null, 2) + '\n');
  fs.renameSync(tmp, LEDGER);
}
function die(msg) { console.error('ledger: ' + msg); process.exit(1); }

function parseArgs(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) opt[key] = true;
      else { opt[key] = next; i++; }
    } else pos.push(a);
  }
  return { pos, opt };
}
function readInput(opt, what) {
  if (typeof opt.file === 'string') return JSON.parse(readText(opt.file));
  if (typeof opt.json === 'string') {
    try { return JSON.parse(opt.json); } catch (e) {
      die(`${what}: --json is not valid JSON (${e.message}). Windows PowerShell 5.1 strips the double quotes inside '…' ` +
        'when it calls node: write the JSON to a file (e.g. in exploration/inbox/) and pass --file <path> instead');
    }
  }
  die(`${what} needs --file <path> (works in every shell) or --json '<json>'`);
}

// ---------- targets ----------
function validateTarget(t) {
  const errs = [];
  if (!t || typeof t !== 'object') return ['target is not an object'];
  const id = t.id || '(no id)';
  if (!t.id || typeof t.id !== 'string') errs.push('missing id');
  if (!KINDS.includes(t.kind)) errs.push(`${id}: kind must be one of ${KINDS.join(', ')}`);
  if (!t.title) errs.push(`${id}: missing title`);
  if (t.status && !STATUSES.includes(t.status)) errs.push(`${id}: bad status ${t.status}`);
  if (t.priority !== undefined && ![1, 2, 3].includes(Number(t.priority))) errs.push(`${id}: priority must be 1, 2 or 3`);
  if (t.features !== undefined && (!Array.isArray(t.features) || t.features.some(f => typeof f !== 'string' || !f))) {
    errs.push(`${id}: features must be an array of feature ids`);
  }
  if (t.fingerprint !== undefined) {
    const fp = t.fingerprint;
    if (!fp || typeof fp.text !== 'string' || !fp.text) errs.push(`${id}: fingerprint needs a text`);
    else if (fp.mode !== undefined && !['visible', 'absent'].includes(fp.mode)) errs.push(`${id}: fingerprint.mode must be visible or absent`);
  }
  const missing = missingOutcome(t);
  if (missing) errs.push(missing);
  if (t.ref?.members !== undefined && !Array.isArray(t.ref.members)) errs.push(`${id}: ref.members must be an array`);
  return errs;
}
// `add` refuses these; `validate` only warns, so ledgers written before the rule still validate.
function missingOutcome(t) {
  if (!OUTCOMES[t?.kind] || !t.ref?.element || t.outcome) return null;
  return `${t.id || '(no id)'}: ${/^[aeiou]/.test(t.kind) ? 'an' : 'a'} ${t.kind} target with ref.element needs an outcome (${OUTCOMES[t.kind]}). ` +
    'Targets with the same kind, ref.element and outcome are merged into one';
}

function elementKey(t) { return t.ref?.element ? `${t.kind}|${t.ref.element}|${t.outcome ?? ''}` : null; }
// Every code key a target depends on: a change to any of them flags the target, and they count as "referenced".
function targetKeys(t) { return [t.ref?.element, ...(t.ref?.members || [])].filter(Boolean); }
// The keys that decide which features a target belongs to: only its own code element. ref.members (the constants
// it uses) don't count, or a message constant shared by many features would pull the target into all of them.
// An integration target belongs only to the feature it was written for (outcome in:<feature>, given in features).
function ownKeys(t) { return t?.kind === 'integration' || !t?.ref?.element ? [] : [t.ref.element]; }
function registryFeatures(ledger, keys) {
  return Object.values(ledger.features).filter(f => !f.removed && keys.some(k => f.members[k])).map(f => f.id);
}
function rank(status) { return PROGRESS.indexOf(status); }

function resolveId(ledger, id) {
  if (!id) return null;
  if (ledger.targets[id]) return id;
  const hit = Object.values(ledger.targets).find(t => (t.aliases || []).includes(id));
  return hit ? hit.id : null;
}
function getTarget(ledger, id) {
  const r = resolveId(ledger, id);
  if (!r) die(`no target ${id}`);
  return ledger.targets[r];
}
function mergeRef(t, ref) {
  if (!ref) return;
  const merged = { ...(t.ref || {}) };
  for (const [k, v] of Object.entries(ref)) {
    if (v === undefined) continue;
    merged[k] = Array.isArray(v) && Array.isArray(merged[k]) ? uniq([...merged[k], ...v]) : v;
  }
  t.ref = merged;
}

function cmdInit() {
  if (fs.existsSync(LEDGER)) { console.log(`exists: ${LEDGER}`); return; }
  save(emptyLedger());
  console.log(`created: ${LEDGER}`);
}

function cmdAdd({ opt }) {
  const items = asArray(readInput(opt, 'add'));
  const errs = items.flatMap(validateTarget);
  if (errs.length) die('invalid targets:\n  ' + errs.join('\n  '));
  const ledger = load();
  const by = opt.by || 'unknown';
  const byElement = new Map();
  for (const t of Object.values(ledger.targets)) { const k = elementKey(t); if (k) byElement.set(k, t.id); }
  let added = 0, merged = 0;
  const notes = [];
  for (const item of items) {
    const at = now();
    const sameId = resolveId(ledger, item.id);
    const key = elementKey(item);
    const fromRegistry = registryFeatures(ledger, ownKeys(item));
    if (sameId) {
      // Same target: update descriptive fields. Never let an import change status or drop evidence/tests/proofs.
      const ex = ledger.targets[sameId];
      const { id, status, history, evidence, tests, proofs, ref, features, aliases, ...rest } = item;
      Object.assign(ex, rest);
      mergeRef(ex, ref);
      ex.features = uniq([...ex.features, ...(features || []), ...fromRegistry]);
      if (Array.isArray(evidence)) ex.evidence.push(...evidence);
      ex.history.push({ at, by, note: 'merged update' });
      merged++;
    } else if (key && byElement.has(key)) {
      // Same code element and outcome under another id (typically a member shared by two features): one target, more features.
      const ex = ledger.targets[byElement.get(key)];
      ex.aliases = uniq([...(ex.aliases || []), item.id]);
      ex.features = uniq([...ex.features, ...(item.features || []), ...fromRegistry]);
      mergeRef(ex, { members: item.ref?.members, labels: item.ref?.labels });
      if (item.priority !== undefined) ex.priority = Math.min(ex.priority, Number(item.priority));
      ex.history.push({ at, by, note: `merged ${item.id} (same code element)` });
      notes.push(`${item.id} → ${ex.id}: same code element; features now ${ex.features.join(', ') || '-'}`);
      merged++;
    } else {
      const status = item.status || 'discovered';
      ledger.targets[item.id] = {
        source: 'codemap',
        ref: {},
        evidence: [],
        tests: [],
        proofs: [],
        ...item,
        features: uniq([...(item.features || []), ...fromRegistry]),
        priority: Number(item.priority ?? 2),
        status,
        created: at,
        history: [{ at, by, to: status, note: 'added' }],
      };
      if (key) byElement.set(key, item.id);
      added++;
    }
  }
  save(ledger);
  console.log(`added ${added}, merged ${merged}`);
  notes.forEach(n => console.log('  ' + n));
}

function activeTestsCovering(ledger, id) {
  return Object.values(ledger.tests).filter(x => x.status === 'active' && x.covers.includes(id));
}
function hasProof(ledger, t) {
  return (t.proofs || []).some(p => p.ok && p.stable && ledger.tests[p.test]?.status === 'active' && ledger.tests[p.test]?.last?.ok);
}

function cmdSet({ pos, opt }) {
  const [id, status] = pos;
  if (!id || !status) die('usage: set <id> <status> [--by X] [--note "..."] [--reason "..."] [--artifact path] [--force]');
  if (!STATUSES.includes(status)) die(`status must be one of ${STATUSES.join(', ')}`);
  if (status === 'blocked' && !opt.reason) die('blocked needs --reason "<exact precondition missing>"');
  if (opt.force && typeof opt.note !== 'string' && typeof opt.reason !== 'string') die('--force needs a --note (or --reason) saying why');
  const ledger = load();
  const t = getTarget(ledger, id);
  const from = t.status;
  if (rank(from) > rank(status) && rank(status) !== -1 && !opt.force) {
    die(`refusing downgrade ${from} → ${status} for ${t.id}; pass --force with a --note explaining why`);
  }
  if (status === 'generated' && !opt.force && !activeTestsCovering(ledger, t.id).length) {
    die(`${t.id} has no registered test. Register the test rows first: node tools/ledger.mjs test add --file <rows.json>`);
  }
  if (status === 'tested') {
    // --force (a human-approved exception) may skip the proof, never the rule that only the Auditor promotes.
    if ((opt.by || '') !== 'Auditor') die('only the Auditor promotes to tested (use --by Auditor)');
    if (!opt.force && !hasProof(ledger, t)) {
      die(`${t.id} has no proof yet. It needs an active test that calls proves('${t.id}', …), run with --repeat-each=3 ` +
        'and passing every time, then ingested: node tools/ledger.mjs ingest');
    }
  }
  t.status = status;
  if (status === 'blocked') t.blocked_reason = opt.reason;
  else delete t.blocked_reason;
  const entry = { at: now(), by: opt.by || 'unknown', from, to: status };
  if (typeof opt.note === 'string') entry.note = opt.note;
  if (typeof opt.reason === 'string') entry.reason = opt.reason;
  t.history.push(entry);
  if (typeof opt.note === 'string' || typeof opt.artifact === 'string') {
    t.evidence.push({ at: entry.at, by: entry.by, note: opt.note, artifact: opt.artifact });
  }
  save(ledger);
  console.log(`${t.id}: ${from} → ${status}`);
}

function cmdNote({ pos, opt }) {
  const [id] = pos;
  if (!id || typeof opt.note !== 'string') die('usage: note <id> --note "..." [--by X] [--artifact path]');
  const ledger = load();
  const t = getTarget(ledger, id);
  t.evidence.push({ at: now(), by: opt.by || 'unknown', note: opt.note, artifact: opt.artifact });
  save(ledger);
  console.log(`${t.id}: note added`);
}

function cmdLink({ pos }) {
  const [id, ref] = pos;
  if (!id || !ref) die('usage: link <id> <test key or file>');
  const ledger = load();
  const t = getTarget(ledger, id);
  t.tests = uniq([...t.tests, ref]);
  save(ledger);
  console.log(`${t.id}: linked ${ref}`);
}

function cmdShow({ pos }) {
  const [id] = pos;
  if (!id) die('usage: show <id>');
  console.log(JSON.stringify(getTarget(load(), id), null, 2));
}

function filterTargets(targets, opt) {
  return targets.filter(t =>
    (!opt.feature || t.features.includes(opt.feature)) &&
    (!opt.area || t.area === opt.area) &&
    (!opt.kind || t.kind === opt.kind) &&
    (!opt.status || t.status === opt.status) &&
    (!opt.role || (t.preconditions?.roles || []).includes(opt.role)));
}

function cmdFrontier({ opt }) {
  const ledger = load();
  const open = Object.values(ledger.targets).filter(t => NEXT_AGENT[t.status]);
  const items = filterTargets(open, opt).sort((a, b) =>
    (a.priority - b.priority) || (rank(b.status) - rank(a.status)) || a.id.localeCompare(b.id));
  const limit = Number(opt.limit || 20);
  if (opt.json) { console.log(JSON.stringify(items.slice(0, limit), null, 2)); return; }
  if (!items.length) { console.log('frontier empty'); return; }
  for (const t of items.slice(0, limit)) {
    const roles = (t.preconditions?.roles || []).join('|') || '-';
    const feats = t.features.join(',') || '-';
    console.log(`P${t.priority}  ${t.status.padEnd(10)} → ${NEXT_AGENT[t.status].padEnd(16)} ${t.id}  [${feats}; ${t.area || '-'}; role ${roles}]  ${t.title}`);
  }
  if (items.length > limit) console.log(`… ${items.length - limit} more`);
}

function cmdStats({ opt }) {
  const ledger = load();
  const all = filterTargets(Object.values(ledger.targets), opt);
  const byFeature = {};
  for (const t of all) for (const f of (t.features.length ? t.features : ['(none)'])) byFeature[f] = (byFeature[f] || 0) + 1;
  const tests = Object.values(ledger.tests);
  console.log(`targets: ${all.length}`);
  console.log('by status: ', JSON.stringify(countBy(all, 'status')));
  console.log('by kind:   ', JSON.stringify(countBy(all, 'kind')));
  console.log('by feature:', JSON.stringify(byFeature));
  console.log('by area:   ', JSON.stringify(countBy(all, 'area')));
  console.log(`tests: ${tests.length}`, JSON.stringify(countBy(tests, 'status')), `· families: ${Object.keys(ledger.families).length} · runs: ${ledger.runs.length}`);
}

// ---------- features (C17) ----------
// A member's change signal: its sig, else (for constants) a hash of its value, so that an edge value or a
// fingerprint text that changes between exports flags its targets. Only the hash is stored, never the value.
function memberSig(m) {
  if (m.sig != null) return String(m.sig);
  if (m.value !== undefined) return 'value#' + crypto.createHash('sha1').update(JSON.stringify(m.value)).digest('hex').slice(0, 12);
  return undefined;
}

function featuresImport(opt) {
  const items = asArray(readInput(opt, 'features import'));
  const errs = [];
  items.forEach((f, i) => {
    if (!f || typeof f.id !== 'string' || !f.id) { errs.push(`item ${i}: missing id`); return; }
    if (!Array.isArray(f.members)) errs.push(`${f.id}: members must be an array`);
    else f.members.forEach((m, j) => { if (!m || typeof m.key !== 'string' || !m.key) errs.push(`${f.id}: member ${j} has no key`); });
  });
  if (errs.length) die('invalid features:\n  ' + errs.join('\n  '));

  const ledger = load();
  const by = opt.by || 'unknown';
  const at = now();
  const out = [];
  const changedKeys = new Set();
  const removedFrom = []; // [featureId, memberKey]
  const seen = new Set();
  for (const f of items) {
    seen.add(f.id);
    const prev = ledger.features[f.id];
    const members = {};
    for (const m of f.members) {
      members[m.key] = { kind: m.kind || 'other', name: m.name || m.key, ...(memberSig(m) !== undefined ? { sig: memberSig(m) } : {}) };
    }
    const ch = { at, by, added: [], removed: [], changed: [] };
    if (prev) {
      for (const [k, m] of Object.entries(members)) {
        const p = prev.members[k];
        if (!p) ch.added.push(k);
        else if (m.sig !== undefined && p.sig !== undefined && m.sig !== p.sig) ch.changed.push(k);
      }
      for (const k of Object.keys(prev.members)) if (!members[k]) ch.removed.push(k);
    }
    const changed = ch.added.length + ch.removed.length + ch.changed.length > 0;
    const history = [...(prev?.history || [])];
    if (!prev) history.push({ at, by, note: 'first import', added: [], removed: [], changed: [] });
    else if (changed || prev.removed) history.push({ ...ch, ...(prev.removed ? { note: 'back in the export' } : {}) });
    ledger.features[f.id] = { id: f.id, name: f.name || prev?.name || f.id, members, imported: at, history };
    ch.changed.forEach(k => changedKeys.add(k));
    ch.removed.forEach(k => removedFrom.push([f.id, k]));
    if (!prev) out.push(`+ ${f.id} (${ledger.features[f.id].name}): ${Object.keys(members).length} members`);
    else if (changed) out.push(`~ ${f.id}: ${ch.added.length} added, ${ch.removed.length} removed, ${ch.changed.length} changed`);
  }
  if (opt.complete) {
    for (const f of Object.values(ledger.features)) {
      if (seen.has(f.id) || f.removed) continue;
      f.removed = at;
      f.history.push({ at, by, note: 'no longer in the export', added: [], removed: Object.keys(f.members), changed: [] });
      Object.keys(f.members).forEach(k => removedFrom.push([f.id, k]));
      out.push(`- ${f.id} (${f.name}): no longer in the export`);
    }
  }

  // Keep targets in step: add features that now contain their code, drop features they left, flag changed/removed code.
  // Without --complete, a member that left an imported feature may have moved to a feature that isn't in the file:
  // it is only marked unresolved, and the next complete import decides (moved: cleared; still missing: removed).
  const stillMember = k => Object.values(ledger.features).some(f => !f.removed && f.members[k]);
  const removedKeys = uniq(removedFrom.map(([, k]) => k));
  let flagged = 0, resolved = 0;
  for (const t of Object.values(ledger.targets)) {
    const keys = targetKeys(t);
    if (!keys.length) continue;
    const before = t.features.join(',');
    t.features = uniq([...t.features, ...registryFeatures(ledger, ownKeys(t))]);
    // A target leaves a feature when the code that made it a member leaves: its own element, or (for targets
    // without one, and integration targets) any of its keys.
    const decide = ownKeys(t).length ? ownKeys(t) : keys;
    for (const [fid, k] of removedFrom) {
      const f = ledger.features[fid];
      if (decide.includes(k) && (f.removed || !decide.some(x => f.members[x]))) t.features = t.features.filter(x => x !== fid);
    }
    if (t.features.join(',') !== before) t.history.push({ at, by, note: `features ${before || '-'} → ${t.features.join(',') || '-'}` });
    const ch = keys.filter(k => changedKeys.has(k));
    const rm = removedKeys.filter(k => keys.includes(k) && !stillMember(k));
    if (ch.length) { t.code_changed = at; t.evidence.push({ at, by, note: `code changed in the export (${ch.join(', ')}): re-verify` }); flagged++; }
    if (rm.length && opt.complete) {
      t.code_removed = at;
      t.code_removed_keys = uniq([...(t.code_removed_keys || []), ...rm]);
      t.evidence.push({ at, by, note: `code removed from the export (${rm.join(', ')})` });
      flagged++;
    } else if (rm.length) {
      const left = uniq(removedFrom.filter(([, k]) => rm.includes(k)).map(([fid]) => fid));
      t.code_unresolved = uniq([...(t.code_unresolved || []), ...rm]);
      t.evidence.push({ at, by, note: `code left ${left.join(', ')} and is in no other imported feature (${rm.join(', ')}): moved to a feature this partial import didn't include, or removed. The next import with --complete tells which` });
      flagged++;
    }
    // Keys left unresolved by an earlier partial import (not the ones this import just marked).
    const pending = (t.code_unresolved || []).filter(k => opt.complete || !rm.includes(k));
    if (pending.length) {
      const back = pending.filter(stillMember);
      const gone = opt.complete ? pending.filter(k => !stillMember(k)) : [];
      if (back.length) {
        t.evidence.push({ at, by, note: `code moved, not removed: ${back.join(', ')} is in ${registryFeatures(ledger, back).join(', ')}` });
        resolved++;
      }
      if (gone.length) {
        t.code_removed = at;
        t.code_removed_keys = uniq([...(t.code_removed_keys || []), ...gone]);
        t.evidence.push({ at, by, note: `code removed from the export (${gone.join(', ')}; confirmed by a complete import)` });
        flagged++;
      }
      t.code_unresolved = t.code_unresolved.filter(k => !back.includes(k) && !gone.includes(k));
      if (!t.code_unresolved.length) delete t.code_unresolved;
    }
    if (t.code_removed && t.code_removed_keys?.length && t.code_removed_keys.every(stillMember)) {
      t.evidence.push({ at, by, note: `code back in the export (${t.code_removed_keys.join(', ')})` });
      delete t.code_removed;
      delete t.code_removed_keys;
      resolved++;
    }
  }
  save(ledger);
  console.log(`features: ${items.length} imported${opt.complete ? ' (complete list)' : ''}; ${flagged} targets flagged for changed or removed code` +
    (resolved ? `; ${resolved} earlier flags resolved` : ''));
  out.forEach(l => console.log('  ' + l));
  if (!out.length) console.log('  no changes');
}

function featureRow(ledger, fid, targets, referenced) {
  const ts = targets.filter(t => t.status !== 'out_of_scope');
  const c = countBy(ts, 'status');
  const tests = Object.values(ledger.tests).filter(x => x.status === 'active' && (fid ? x.features.includes(fid) : !x.features.length));
  const f = fid ? ledger.features[fid] : null;
  const others = uniq(ts.flatMap(t => t.features.filter(x => x !== fid)));
  return {
    id: fid || '(no feature)',
    name: f?.name || (fid?.startsWith('area:') ? fid.slice(5) : ''),
    total: ts.length,
    tested: c.tested || 0,
    open: ts.filter(t => NEXT_AGENT[t.status]),
    blocked: c.blocked || 0,
    bugs: c.bug_suspected || 0,
    disputed: c.spec_disputed || 0,
    tests: tests.length,
    failing: tests.filter(isFailing),
    unmapped: f && !f.removed ? Object.keys(f.members).filter(k => !referenced.has(k)) : [],
    stale: ts.filter(isStale),
    shared: fid ? ts.filter(t => t.features.length > 1).length : 0,
    sharedWith: fid ? others : [],
    removed: f?.removed || null,
  };
}
function featureRows(ledger) {
  const all = Object.values(ledger.targets);
  const referenced = new Set(all.flatMap(targetKeys));
  const ids = uniq([...Object.keys(ledger.features), ...all.flatMap(t => t.features)]).sort((a, b) => a.localeCompare(b));
  const rows = ids.map(fid => featureRow(ledger, fid, all.filter(t => t.features.includes(fid)), referenced));
  const loose = all.filter(t => !t.features.length);
  if (loose.length) rows.push(featureRow(ledger, null, loose, referenced));
  return rows;
}
function plural(n, word) { return `${n} ${word}${n === 1 ? '' : 's'}`; }
function pct(a, b) { return b ? `${Math.round((100 * a) / b)}%` : '-'; }
function isFailing(x) { return !!x.last && !x.last.ok && (x.last.failed > 0 || x.last.flaky > 0); }
function isStale(t) {
  const since = [t.code_changed, t.code_removed].filter(Boolean).sort().at(-1);
  if (!since) return false;
  return !(t.proofs || []).some(p => p.ok && p.at > since);
}

function cmdFeatures({ pos, opt }) {
  if (pos[0] === 'import') return featuresImport(opt);
  const ledger = load();
  const rows = featureRows(ledger);
  if (opt.json) {
    console.log(JSON.stringify(rows.map(r => ({ ...r, open: r.open.map(t => t.id), failing: r.failing.map(t => t.key), stale: r.stale.map(t => t.id) })), null, 2));
    return;
  }
  if (!rows.length) { console.log('no features yet: import them (features import, C17) or give targets a features list'); return; }
  for (const r of rows) {
    const flags = [r.failing.length && `${r.failing.length} failing`, r.stale.length && `${r.stale.length} code changed`, r.unmapped.length && `${r.unmapped.length} members not in any target`, r.removed && 'REMOVED from export'].filter(Boolean);
    console.log(`${r.id.padEnd(14)} ${pct(r.tested, r.total).padStart(4)} tested (${r.tested}/${r.total}) · ${r.open.length} open · ${r.blocked} blocked · ${r.tests} tests${flags.length ? ' · ' + flags.join(' · ') : ''}  ${r.name}`);
  }
}

function cmdFeature({ pos }) {
  const [fid] = pos;
  if (!fid) die('usage: feature <feature id>');
  const ledger = load();
  const all = Object.values(ledger.targets);
  const r = featureRow(ledger, fid, all.filter(t => t.features.includes(fid)), new Set(all.flatMap(targetKeys)));
  const f = ledger.features[fid];
  const tests = Object.values(ledger.tests).filter(x => x.features.includes(fid));
  console.log(`${fid}${r.name ? ' · ' + r.name : ''}: ${r.tested}/${r.total} tested${r.removed ? ' · REMOVED from the export ' + r.removed : ''}`);
  if (f) console.log('members by kind:', JSON.stringify(countBy(Object.values(f.members), 'kind')), `· last import ${f.imported}`);
  console.log('targets by status:', JSON.stringify(countBy(all.filter(t => t.features.includes(fid)), 'status')));
  if (r.sharedWith.length) console.log(`shared targets: ${r.shared} (also in ${r.sharedWith.join(', ')})`);
  const section = (title, items, fmt) => { if (items.length) { console.log(`\n${title}:`); more(items, fmt).forEach(l => console.log('  ' + l)); } };
  section('open', r.open, t => `${t.id} (${t.status} → ${NEXT_AGENT[t.status]})  ${t.title}`);
  section('failing tests', r.failing, x => `${x.key} (${x.last.run}): ${x.last.error || 'failed'}`);
  section('code changed since its last proof', r.stale, t => `${t.id} (${t.status})`);
  section('members not in any target (→ Cartographer)', r.unmapped, k => `${k} (${f.members[k].kind}: ${f.members[k].name})`);
  section('tests', tests, x => `${x.key} [${x.status}${x.redundant_of ? ' of ' + x.redundant_of : ''}] ${x.last ? (x.last.ok ? 'ok' : isFailing(x) ? 'FAILING' : 'not run') + ' ' + x.last.run : 'not run yet'}  covers ${x.covers.join(', ')}`);
}

// Without --since, each feature is measured from its own rows: it stays listed until every active row of it
// has run after its code changed, so a run of a few rows (or of another feature) doesn't hide the change.
// A feature with no rows is measured from the last run.
function cmdChanged({ opt }) {
  const ledger = load();
  const EPOCH = '1970-01-01T00:00:00.000Z';
  const fixed = typeof opt.since === 'string' ? new Date(opt.since).toISOString() : null;
  const lastRun = ledger.runs.at(-1)?.at || EPOCH;
  const res = [];
  for (const f of Object.values(ledger.features)) {
    const tests = Object.values(ledger.tests).filter(x => x.status === 'active' && x.features.includes(f.id));
    const since = fixed ?? (tests.length ? tests.map(x => x.last?.at || EPOCH).sort()[0] : lastRun);
    const hs = (f.history || []).filter(h => h.at > since && (h.added.length || h.removed.length || h.changed.length || h.note === 'no longer in the export'));
    if (!hs.length) continue;
    const changedAt = hs.map(h => h.at).sort().at(-1);
    const added = uniq(hs.flatMap(h => h.added)), removed = uniq(hs.flatMap(h => h.removed)), changed = uniq(hs.flatMap(h => h.changed));
    const keys = new Set([...removed, ...changed]);
    const targets = Object.values(ledger.targets).filter(t => targetKeys(t).some(k => keys.has(k)));
    const rerun = tests.filter(x => !x.last?.at || x.last.at < changedAt);
    res.push({ feature: f.id, name: f.name, since, removed_feature: !!f.removed, added, removed, changed, targets: targets.map(t => t.id), tests: rerun.map(x => x.key) });
  }
  if (opt.ids) { console.log(res.filter(r => !r.removed_feature).map(r => r.feature).join(',')); return; }
  if (opt.json) { console.log(JSON.stringify({ since: fixed || 'per feature: since its active rows last ran', features: res }, null, 2)); return; }
  console.log(fixed ? `features changed since ${fixed}: ${res.length}` : `features whose code changed since their tests last ran: ${res.length}`);
  for (const r of res) {
    console.log(`  ${r.feature} ${r.name}${r.removed_feature ? ' (REMOVED)' : ''}: ${plural(r.added.length, 'member')} added (→ Cartographer), ${r.removed.length} removed, ${r.changed.length} changed · ${plural(r.targets.length, 'target')} to re-verify · ${plural(r.tests.length, 'test')} to rerun`);
  }
  if (res.some(r => !r.removed_feature)) console.log('\nrerun their tests (and ingest): node tools/run.mjs --changed');
}

// ---------- families ----------
function normSkeleton(skeleton) {
  if (!Array.isArray(skeleton) || !skeleton.length) die('skeleton must be a non-empty array of "action:element" steps');
  return skeleton.map(s => {
    const str = String(s).trim().replace(/\s+/g, ' ');
    const i = str.indexOf(':');
    if (i < 1 || i === str.length - 1) die(`bad step "${s}": write it as action:element (e.g. click:E:search:submit)`);
    return str.slice(0, i).toLowerCase() + ':' + str.slice(i + 1);
  });
}
function sigOf(steps) { return crypto.createHash('sha1').update(JSON.stringify(steps)).digest('hex').slice(0, 12); }
function familyMatches(ledger, steps, exceptKey) {
  const sig = sigOf(steps);
  const els = s => new Set(s.map(x => x.slice(x.indexOf(':') + 1)));
  const mine = els(steps);
  const isPrefix = (a, b) => a.length < b.length && a.every((x, i) => x === b[i]);
  const matches = [];
  for (const f of Object.values(ledger.families)) {
    if (f.key === exceptKey) continue;
    if (f.sig === sig) { matches.push({ type: 'same steps', family: f }); continue; }
    if (isPrefix(steps, f.skeleton)) { matches.push({ type: 'its steps start with yours', family: f }); continue; }
    if (isPrefix(f.skeleton, steps)) { matches.push({ type: 'your steps start with its steps', family: f }); continue; }
    const theirs = els(f.skeleton);
    if (theirs.size === mine.size && [...theirs].every(x => mine.has(x))) matches.push({ type: 'same elements, different order', family: f });
  }
  return { sig, matches };
}
function familyRows(ledger, key) { return Object.values(ledger.tests).filter(x => x.family === key && x.status !== 'retired'); }
// Steps whose element isn't a ledger target (or alias), or switch-role steps naming an unknown role class.
// Only notes: a misspelt element makes a family that looks new, so duplicate detection can't see it.
function unknownSteps(ledger, steps) {
  const notes = [];
  steps.forEach((s, i) => {
    const action = s.slice(0, s.indexOf(':')), el = s.slice(s.indexOf(':') + 1);
    if (action === 'switch-role') {
      if (hasRoleClasses(ledger) && !knownClass(ledger, el)) notes.push(`step ${i + 1} ${s}: no role class "${el}" (node tools/ledger.mjs roles lists them)`);
    } else if (!resolveId(ledger, el)) {
      notes.push(`step ${i + 1} ${s}: "${el}" is not a ledger target. Check the spelling, or add the target first (a misspelt step makes a different family)`);
    }
  });
  return notes;
}

function cmdFamily({ pos, opt }) {
  const sub = pos[0] || 'list';
  const ledger = load();
  if (sub === 'check') {
    const input = readInput(opt, 'family check');
    const steps = normSkeleton(input.skeleton);
    const { matches } = familyMatches(ledger, steps, input.key);
    if (!matches.length) console.log('new: no family has these steps');
    for (const m of matches) {
      const verb = m.type === 'same steps' ? 'EXISTS' : 'similar';
      console.log(`${verb}: ${m.family.key} (${m.type}) → ${m.family.spec}; ${familyRows(ledger, m.family.key).length} rows`);
    }
    if (matches.some(m => m.type === 'same steps')) console.log('→ add rows to that spec instead of writing a new one');
    unknownSteps(ledger, steps).forEach(n => console.log('  note: ' + n));
    return;
  }
  if (sub === 'add') {
    const input = readInput(opt, 'family add');
    if (!SLUG.test(input.key || '')) die('family key must be a lowercase slug (a-z, 0-9, . _ -)');
    if (!input.spec) die('family needs spec (path of its spec file)');
    const steps = normSkeleton(input.skeleton);
    const { sig, matches } = familyMatches(ledger, steps, input.key);
    const same = matches.find(m => m.type === 'same steps');
    if (same && !opt.force) die(`same steps as family ${same.family.key} (${same.family.spec}): add rows to that spec instead. Override only with --force --reason "…"`);
    if (opt.force && typeof opt.reason !== 'string') die('--force needs --reason');
    const prev = ledger.families[input.key];
    const at = now();
    ledger.families[input.key] = {
      key: input.key,
      title: input.title || prev?.title || input.key,
      spec: input.spec,
      area: input.area || prev?.area,
      skeleton: steps,
      sig,
      created: prev?.created || at,
      updated: at,
      by: opt.by || 'unknown',
      ...(opt.force ? { forced_reason: opt.reason } : {}),
    };
    save(ledger);
    console.log(`${prev ? 'updated' : 'added'} family ${input.key} (${steps.length} steps)`);
    matches.filter(m => m.type !== 'same steps').forEach(m => console.log(`  note: similar to ${m.family.key} (${m.type}); check its rows before adding new ones`));
    unknownSteps(ledger, steps).forEach(n => console.log('  note: ' + n));
    return;
  }
  if (sub === 'show') {
    const f = ledger.families[pos[1]];
    if (!f) die(`no family ${pos[1]}`);
    console.log(JSON.stringify({ ...f, rows: familyRows(ledger, f.key).map(x => ({ key: x.key, status: x.status, role: x.role, role_class: x.role_class, covers: x.covers, last: x.last ? `${x.last.ok ? 'ok' : isFailing(x) ? 'FAILING' : 'not run'} ${x.last.run}` : 'not run yet' })) }, null, 2));
    return;
  }
  if (sub === 'list') {
    const fams = Object.values(ledger.families);
    if (!fams.length) { console.log('no families yet'); return; }
    for (const f of fams) {
      const rows = familyRows(ledger, f.key);
      const feats = uniq(rows.flatMap(x => x.features)).join(',') || '-';
      console.log(`${f.key.padEnd(28)} ${String(rows.length).padStart(3)} rows · features ${feats} · ${f.spec}`);
    }
    return;
  }
  die('usage: family check|add|show <key>|list');
}

// ---------- role classes (from /discover-roles) ----------
// ledger.roles = { classes: { "<class>": ["<login>", …] }, features: { "<feature>": { "<class>": [logins] } } }
// `features` holds the classes of a feature where they differ (merge) because the feature checks fewer groups.
function hasRoleClasses(ledger) { return !!Object.keys(ledger.roles?.classes || {}).length; }
function classOf(ledger, login) {
  return Object.entries(ledger.roles?.classes || {}).find(([, logins]) => logins.includes(login))?.[0];
}
function knownClass(ledger, name) {
  return !!(ledger.roles?.classes?.[name] || Object.values(ledger.roles?.features || {}).some(per => per?.[name]));
}
function classLogins(ledger, name, features = []) {
  for (const f of features) { const l = ledger.roles?.features?.[f]?.[name]; if (l) return l; }
  return ledger.roles?.classes?.[name];
}
/** The role classes a journey hands over to, in order: the family's switch-role:<class> steps. */
function handoffsOf(family) {
  return (family?.skeleton || []).filter(s => s.startsWith('switch-role:')).map(s => s.slice('switch-role:'.length));
}
/** What's wrong with a row's role class, given the family's hand-offs and the imported role classes. */
function roleProblems(ledger, row) {
  const problems = [];
  const handoffs = handoffsOf(ledger.families[row.family]);
  const seq = String(row.role_class).split('>').map(s => s.trim());
  if ((handoffs.length || seq.length > 1) && seq.slice(1).join('>') !== handoffs.join('>')) {
    problems.push(`${row.key}: role class "${row.role_class}" doesn't match the family's hand-offs ` +
      `(${handoffs.map(h => 'switch-role:' + h).join(', ') || 'none'}): expected "${[seq[0], ...handoffs].join('>')}"`);
  }
  if (hasRoleClasses(ledger)) {
    for (const c of uniq(seq)) if (!knownClass(ledger, c)) problems.push(`${row.key}: unknown role class "${c}" (node tools/ledger.mjs roles lists them)`);
    const logins = classLogins(ledger, seq[0], row.features || []);
    if (logins && !logins.includes(row.role)) {
      const own = classOf(ledger, row.role);
      problems.push(`${row.key}: login "${row.role}" isn't in role class "${seq[0]}" (${logins.join(', ')})${own ? `; its class is "${own}"` : ''}`);
    }
  }
  return problems;
}

function cmdRoles({ pos, opt }) {
  const sub = pos[0] || 'show';
  const ledger = load();
  if (sub === 'import') {
    const input = readInput(opt, 'roles import');
    const errs = [];
    const checkMap = (m, where) => {
      if (!m || typeof m !== 'object' || Array.isArray(m)) { errs.push(`${where}: must be an object of "<class>": ["<login>", …]`); return; }
      const seen = new Map();
      for (const [c, logins] of Object.entries(m)) {
        if (!c.trim() || c.includes('>')) errs.push(`${where}: bad class name "${c}" (it can't contain ">")`);
        if (!Array.isArray(logins) || !logins.length || logins.some(l => typeof l !== 'string' || !l)) { errs.push(`${where}.${c}: must list at least one login`); continue; }
        for (const l of logins) { if (seen.has(l)) errs.push(`${where}: login "${l}" is in both "${seen.get(l)}" and "${c}"`); seen.set(l, c); }
      }
    };
    checkMap(input?.classes, 'classes');
    for (const [f, per] of Object.entries(input?.features || {})) checkMap(per, `features.${f}`);
    if (errs.length) die('invalid roles (nothing saved):\n  ' + errs.join('\n  '));
    ledger.roles = { classes: input.classes, features: input.features || {}, imported: now(), by: opt.by || 'unknown' };
    save(ledger);
    console.log(`roles: ${Object.keys(input.classes).length} classes, ${Object.keys(ledger.roles.features).length} features with their own classes`);
    const stale = Object.values(ledger.tests).filter(x => x.status === 'active').flatMap(x => roleProblems(ledger, x));
    stale.forEach(p => console.log(`  note: ${p}. Register that row again (test add) with the right role_class`));
    return;
  }
  if (sub === 'show' || sub === 'list') {
    if (!hasRoleClasses(ledger)) { console.log('no role classes yet: /discover-roles writes exploration/inbox/roles.json, then: roles import --file …'); return; }
    for (const [c, logins] of Object.entries(ledger.roles.classes)) console.log(`${c.padEnd(24)} ${logins.join(', ')}`);
    for (const [f, per] of Object.entries(ledger.roles.features || {})) {
      for (const [c, logins] of Object.entries(per)) console.log(`${(`${f}: ${c}`).padEnd(24)} ${logins.join(', ')}`);
    }
    console.log(`(imported ${ledger.roles.imported} by ${ledger.roles.by})`);
    return;
  }
  die('usage: roles [show] | roles import --file <json> [--by A]');
}

// ---------- tests ----------
function testAdd(opt) {
  const items = asArray(readInput(opt, 'test add'));
  const ledger = load();
  const by = opt.by || 'unknown';
  if (opt.force && typeof opt.reason !== 'string') die('--force needs --reason "<why this row is worth running anyway>"');
  const problems = [];
  const warnings = [];
  const staged = new Map();
  for (const it of items) {
    const key = it?.key;
    if (!TEST_KEY.test(key || '')) { problems.push(`${key}: key must look like <family>/<row> (lowercase letters, digits, . _ -)`); continue; }
    const fam = key.split('/')[0];
    if (it.family && it.family !== fam) problems.push(`${key}: family "${it.family}" doesn't match the key's prefix "${fam}"`);
    if (!ledger.families[fam]) problems.push(`${key}: no family "${fam}" (the Scenario Planner registers it: family add)`);
    if (!it.file) problems.push(`${key}: missing file`);
    if (!it.role) problems.push(`${key}: missing role`);
    const covers = [];
    for (const id of it.covers || []) {
      const r = resolveId(ledger, id);
      if (!r) problems.push(`${key}: covers unknown target ${id}`);
      else covers.push(r);
    }
    if (!covers.length) problems.push(`${key}: covers no targets. Every row must prove at least one target`);
    if (staged.has(key)) problems.push(`${key}: listed twice`);
    // Role class: given, or filled from the imported role classes (plus the family's hand-offs for a journey).
    let roleClass = it.role_class;
    if (it.role && !roleClass) {
      const first = hasRoleClasses(ledger) ? classOf(ledger, it.role) : it.role;
      if (!first) problems.push(`${key}: login "${it.role}" is in no imported role class (node tools/ledger.mjs roles); give role_class, or import the roles again`);
      else {
        if (!hasRoleClasses(ledger)) {
          warnings.push(`${key}: no role_class and no imported role classes, so the login "${it.role}" counts as its own class. A row for ` +
            'another login of the same class (exploration/observations/_roles.md) would not be caught as a duplicate');
        }
        roleClass = [first, ...handoffsOf(ledger.families[fam])].join('>');
      }
    }
    const rec = {
      key,
      family: fam,
      file: it.file,
      title: it.title || key,
      role: it.role,
      role_class: roleClass || it.role,
      covers: uniq(covers).sort(),
      features: uniq(covers.flatMap(id => ledger.targets[id]?.features || [])).sort(),
    };
    if (it.role && roleClass && ledger.families[fam]) problems.push(...roleProblems(ledger, rec));
    staged.set(key, rec);
  }
  if (problems.length) die('invalid test rows (nothing saved):\n  ' + problems.join('\n  '));

  // A row must prove something no other row with the same role class proves.
  const pool = [...Object.values(ledger.tests).filter(x => x.status === 'active' && !staged.has(x.key)), ...staged.values()];
  for (const rec of staged.values()) {
    const mine = new Set(rec.covers);
    for (const other of pool) {
      if (other.key === rec.key || other.role_class !== rec.role_class) continue;
      const theirs = new Set(other.covers);
      const sub = rec.covers.every(x => theirs.has(x));
      const sup = other.covers.every(x => mine.has(x));
      if (sub && sup) problems.push(`${rec.key}: duplicate of ${other.key} (same targets, same role class "${rec.role_class}")`);
      else if (sub) problems.push(`${rec.key}: subsumed by ${other.key}, which already proves all of: ${rec.covers.join(', ')}`);
      else if (sup && !staged.has(other.key)) warnings.push(`${rec.key} proves everything ${other.key} proves, and more: ${other.key} becomes redundant (the Auditor confirms with: redundancy)`);
    }
  }
  if (problems.length && !opt.force) {
    die('refused (nothing saved):\n  ' + uniq(problems).join('\n  ') +
      '\nDrop the row, or make it prove a target that no other row proves (add that target first). Override only with --force --reason "…".');
  }

  const at = now();
  for (const rec of staged.values()) {
    const prev = ledger.tests[rec.key];
    const dropped = (prev?.covers || []).filter(id => !rec.covers.includes(id));
    ledger.tests[rec.key] = {
      ...prev,
      ...rec,
      status: prev?.status && prev.status !== 'retired' ? prev.status : 'active',
      created: prev?.created || at,
      updated: at,
      by,
      history: [...(prev?.history || []), { at, by, note: prev ? 'updated' : 'registered' }],
      ...(opt.force ? { forced_reason: opt.reason } : {}),
    };
    for (const id of rec.covers) ledger.targets[id].tests = uniq([...ledger.targets[id].tests, rec.key]);
    for (const id of dropped) if (ledger.targets[id]) ledger.targets[id].tests = ledger.targets[id].tests.filter(x => x !== rec.key);
  }
  save(ledger);
  console.log(`registered ${staged.size} test row(s)${opt.force ? ' (forced: ' + opt.reason + ')' : ''}`);
  for (const rec of staged.values()) console.log(`  ${rec.key}  [${rec.role_class}]  features ${rec.features.join(',') || '-'}  covers ${rec.covers.join(', ')}`);
  uniq(warnings).forEach(w => console.log('  note: ' + w));
}

function cmdTest({ pos, opt }) {
  const sub = pos[0] || 'list';
  if (sub === 'add') return testAdd(opt);
  const ledger = load();
  if (sub === 'show') {
    const x = ledger.tests[pos[1]];
    if (!x) die(`no test ${pos[1]}`);
    console.log(JSON.stringify(x, null, 2));
    return;
  }
  if (sub === 'list') {
    const xs = Object.values(ledger.tests).filter(x =>
      (!opt.family || x.family === opt.family) && (!opt.feature || x.features.includes(opt.feature)) && (!opt.status || x.status === opt.status));
    if (!xs.length) { console.log('no tests'); return; }
    for (const x of xs) {
      const last = x.last ? (x.last.ok ? `ok ${x.last.run}` : isFailing(x) ? `FAILING ${x.last.run}` : `not run ${x.last.run}`) : 'not run yet';
      console.log(`${x.key.padEnd(36)} ${x.status.padEnd(9)} ${last.padEnd(16)} [${x.role_class}] ${x.covers.join(', ')}${x.redundant_of ? '  (redundant of ' + x.redundant_of + ')' : ''}`);
    }
    return;
  }
  if (sub === 'reactivate' || sub === 'retire') {
    const x = ledger.tests[pos[1]];
    if (!x) die(`no test ${pos[1]}`);
    if (typeof opt.reason !== 'string') die(`${sub} needs --reason`);
    const at = now();
    if (sub === 'reactivate') {
      x.status = 'active';
      delete x.redundant_of;
      delete x.reason;
      for (const id of x.covers) if (ledger.targets[id]) ledger.targets[id].tests = uniq([...ledger.targets[id].tests, x.key]);
    } else {
      x.status = 'retired';
      for (const id of x.covers) if (ledger.targets[id]) ledger.targets[id].tests = ledger.targets[id].tests.filter(k => k !== x.key);
    }
    x.history.push({ at, by: opt.by || 'unknown', note: `${sub}: ${opt.reason}` });
    save(ledger);
    console.log(`${x.key}: ${x.status}`);
    return;
  }
  die('usage: test add|show <key>|list [--family f] [--feature F] [--status s]|reactivate <key> --reason ""|retire <key> --reason ""');
}

// ---------- runs ----------
function cmdIngest({ pos, opt }) {
  const file = pos[0] || RESULTS;
  if (!fs.existsSync(file)) die(`no report at ${file}. Run the tests without --reporter, so the JSON reporter in playwright.config.ts writes it`);
  const report = JSON.parse(readText(file));
  const ledger = load();
  const by = opt.by || 'unknown';
  const at = report.stats?.startTime ? new Date(report.stats.startTime).toISOString() : now();
  if (ledger.runs.some(r => r.at === at && r.report === file)) { console.log(`already ingested: ${file} (${at})`); return; }

  const agg = new Map();
  const untracked = [];
  const walk = suite => {
    for (const spec of suite.specs || []) {
      for (const t of spec.tests || []) {
        if (IGNORE_PROJECTS.includes(t.projectName)) continue;
        if (IGNORE_FILES.some(f => String(spec.file || '').endsWith(f))) continue;
        const ann = t.annotations || [];
        const key = ann.find(a => a.type === 'key')?.description;
        if (!key) { untracked.push(`${spec.file}: ${spec.title}`); continue; }
        const results = t.results || [];
        const final = results[results.length - 1];
        const resAnn = final?.annotations?.length ? final.annotations : ann;
        const a = agg.get(key) || {
          key, file: spec.file, title: spec.title, runs: 0, passes: 0, failed: 0, flaky: 0, skipped: 0, duration: 0,
          proved: new Set(), covers: new Set(ann.filter(x => x.type === 'covers').map(x => x.description)), errors: [],
        };
        a.runs++;
        a.duration += results.reduce((s, r) => s + (r.duration || 0), 0);
        if (t.status === 'skipped') a.skipped++;
        else if (t.status === 'flaky') a.flaky++;
        else if (t.status === 'expected' && final?.status === 'passed') {
          a.passes++;
          resAnn.filter(x => x.type === 'proved').forEach(x => a.proved.add(x.description));
        } else {
          a.failed++;
          const msg = final?.error?.message || final?.errors?.[0]?.message;
          if (msg) a.errors.push(firstLine(msg));
        }
        agg.set(key, a);
      }
    }
    (suite.suites || []).forEach(walk);
  };
  (report.suites || []).forEach(walk);

  const n = (ledger.runs.at(-1)?.n || 0) + 1;
  const run = `run-${n}`;
  const out = { failed: [], regressions: [], unproved: [], extra: [], unknown: [], fixme: [] };
  let okCount = 0;
  for (const a of agg.values()) {
    const x = ledger.tests[a.key];
    if (!x) { out.unknown.push(a.key); continue; }
    const ok = a.failed === 0 && a.flaky === 0 && a.passes > 0;
    const proved = [...a.proved].map(id => resolveId(ledger, id) || id);
    x.last = {
      run, at, runs: a.runs, passes: a.passes, failed: a.failed, flaky: a.flaky, skipped: a.skipped, ok,
      stable: ok && a.passes >= 3, duration_ms: Math.round(a.duration / Math.max(1, a.runs)), proved,
      ...(a.errors.length ? { error: a.errors[0] } : {}),
    };
    x.history = [...(x.history || []), { at, run, ok, runs: a.runs }].slice(-20);
    if (ok) okCount++;
    if (a.runs === a.skipped) { out.fixme.push(a.key); continue; }
    if (!ok) out.failed.push(`${a.key} (${x.features.join(',') || '-'}): ${a.flaky ? 'flaky' : a.errors[0] || 'failed'}`);
    for (const id of proved) {
      const t = ledger.targets[id];
      if (!t) continue;
      t.proofs = [...(t.proofs || []), { at, run, test: a.key, ok, stable: x.last.stable }].slice(-10);
    }
    if (!ok) {
      for (const id of x.covers) {
        const t = ledger.targets[id];
        if (t?.status === 'tested') {
          out.regressions.push(`${id} was tested; ${a.key} now fails`);
          t.evidence.push({ at, by, note: `REGRESSION in ${run}: ${a.key} fails (${a.errors[0] || 'flaky'})` });
        }
      }
    } else {
      const missing = x.covers.filter(id => !proved.includes(id));
      if (missing.length) out.unproved.push(`${a.key}: ${missing.join(', ')}`);
      const extra = proved.filter(id => !x.covers.includes(id));
      if (extra.length) out.extra.push(`${a.key}: ${extra.join(', ')}`);
    }
  }
  ledger.runs = [...ledger.runs, {
    n, id: run, at, report: file, by, tests: agg.size, ok: okCount, failed: out.failed.length, fixme: out.fixme.length, untracked: untracked.length,
  }].slice(-50);
  save(ledger);

  console.log(`${run}: ${agg.size} tracked tests: ${okCount} ok, ${out.failed.length} failing, ${out.fixme.length} fixme/skipped · ${untracked.length} untracked`);
  const show = (label, items) => more(items, s => `${label}  ${s}`).forEach(l => console.log(l));
  show('FAILING', out.failed);
  show('REGRESSION', out.regressions);
  show('CLAIMED WITHOUT PROOF', out.unproved);
  show('PROVED BUT NOT CLAIMED', out.extra);
  show('NOT REGISTERED (test add)', out.unknown);
  show('UNTRACKED (no meta(), not counted)', untracked);
}

function cmdRedundancy({ opt }) {
  const ledger = load();
  const active = Object.values(ledger.tests).filter(x => x.status === 'active');
  const judged = active.filter(x => x.last?.ok && !x.forced_reason);
  const notJudged = active.filter(x => !x.last?.ok && !x.forced_reason).map(x => x.key);
  const evidence = x => new Set(x.last.proved?.length ? x.last.proved : x.covers);
  const groups = new Map();
  for (const x of judged) groups.set(x.role_class, [...(groups.get(x.role_class) || []), x]);
  const findings = [];
  for (const [roleClass, xs] of groups) {
    const sorted = xs.map(x => ({ x, e: evidence(x) })).sort((a, b) =>
      (b.e.size - a.e.size) || ((a.x.last.duration_ms ?? Infinity) - (b.x.last.duration_ms ?? Infinity)) || String(a.x.created).localeCompare(String(b.x.created)));
    const keepers = [];
    for (const item of sorted) {
      const keeper = keepers.find(k => [...item.e].every(id => k.e.has(id)));
      if (keeper) findings.push({ key: item.x.key, of: keeper.x.key, why: keeper.e.size === item.e.size ? 'proves the same targets' : 'proves a subset of its targets', roleClass });
      else keepers.push(item);
    }
  }
  const stalePointers = Object.values(ledger.tests).filter(x => x.status === 'redundant' && !(ledger.tests[x.redundant_of]?.status === 'active' && ledger.tests[x.redundant_of]?.last?.ok));
  if (!findings.length) console.log('no redundant tests among the passing ones');
  for (const f of findings) console.log(`REDUNDANT  ${f.key}  ${f.why} as ${f.of}  [role class ${f.roleClass}]`);
  if (notJudged.length) console.log(`not judged (no passing run yet): ${notJudged.join(', ')}`);
  for (const x of stalePointers) console.log(`REVIEW  ${x.key} is marked redundant of ${x.redundant_of}, which is no longer active and passing: reactivate it`);
  if (!opt.apply) {
    if (findings.length) console.log('\nTo mark them (they stay in the repo, but are skipped by default): node tools/ledger.mjs redundancy --apply --by Auditor');
    return;
  }
  if ((opt.by || '') !== 'Auditor' && !opt.force) die('only the Auditor marks tests redundant (use --by Auditor)');
  const at = now();
  for (const f of findings) {
    const x = ledger.tests[f.key];
    x.status = 'redundant';
    x.redundant_of = f.of;
    x.reason = f.why;
    x.history.push({ at, by: opt.by, note: `redundant: ${f.why} as ${f.of}` });
  }
  save(ledger);
  console.log(`marked ${findings.length} test(s) redundant`);
}

// ---------- report ----------
function cmdReport() {
  const ledger = load();
  const all = Object.values(ledger.targets);
  const tests = Object.values(ledger.tests);
  const byStatus = countBy(all, 'status');
  const lastRun = ledger.runs.at(-1);
  const active = tests.filter(x => x.status === 'active');
  const lines = [];
  lines.push('# Coverage report', '', `Generated ${now()} from \`${LEDGER}\`.`);
  if (lastRun) lines.push(`Last run: ${lastRun.id} (${lastRun.at}): ${lastRun.ok} ok, ${lastRun.failed} failing, ${lastRun.fixme} fixme/skipped.`);
  lines.push('', `**${all.length} targets**: ` + STATUSES.filter(s => byStatus[s]).map(s => `${s} ${byStatus[s]}`).join(' · '));
  lines.push(`**${tests.length} test rows** in ${Object.keys(ledger.families).length} families: ${active.length} active ` +
    `(${active.filter(x => x.last?.ok).length} passing, ${active.filter(isFailing).length} failing, ${active.filter(x => !x.last).length} not run yet) · ` +
    `${tests.filter(x => x.status === 'redundant').length} redundant (skipped by default) · ${tests.filter(x => x.status === 'retired').length} retired`, '');

  const rows = featureRows(ledger);
  lines.push('## By feature', '', '| Feature | Name | Targets | Tested | Open | Blocked | Bugs | Failing tests | Code changed | Members not in any target |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    lines.push(`| ${cell(r.id)}${r.removed ? ' (removed)' : ''} | ${cell(r.name)} | ${r.total} | ${r.tested} (${pct(r.tested, r.total)}) | ${r.open.length} | ${r.blocked} | ${r.bugs} | ${r.failing.length} | ${r.stale.length} | ${r.unmapped.length} |`);
  }
  if (!rows.length) lines.push('| _none yet_ | | | | | | | | | |');

  const unfinished = rows.filter(r => r.tested < r.total || r.failing.length || r.stale.length || r.unmapped.length);
  lines.push('', '## Features not fully tested', '');
  if (!unfinished.length) lines.push('_None._');
  for (const r of unfinished) {
    lines.push(`### ${r.id}${r.name ? ' · ' + r.name : ''}: ${r.tested} of ${r.total} tested`);
    if (r.sharedWith.length) lines.push(`- Shares ${plural(r.shared, 'target')} with ${r.sharedWith.join(', ')} (tested once, counted in each)`);
    lines.push(...more(r.failing, x => `- **Failing:** \`${x.key}\` (${x.last.run}): ${x.last.error || 'failed'}`, 10));
    lines.push(...more(r.stale, t => `- **Code changed since its last proof:** \`${t.id}\` (${t.status})`, 10));
    lines.push(...more(r.open, t => `- Open: \`${t.id}\` (${t.status} → ${NEXT_AGENT[t.status]}): ${t.title}`, 15));
    if (r.unmapped.length) {
      const f = ledger.features[r.id];
      lines.push(`- Members not in any target yet (→ Cartographer): ` + r.unmapped.slice(0, 15).map(k => `\`${k}\` (${f.members[k].kind})`).join(', ') + (r.unmapped.length > 15 ? `, … ${r.unmapped.length - 15} more` : ''));
    }
    lines.push('');
  }

  const section = (title, items, fmt) => {
    lines.push('', `## ${title}`, '');
    if (!items.length) lines.push('_None._');
    else lines.push(...more(items, fmt));
  };
  const lastNote = t => [...(t.evidence || [])].reverse().find(e => e.note);
  section('Redundant tests (skipped by default; safe to delete after review)', tests.filter(x => x.status === 'redundant'),
    x => `- \`${x.key}\` ${x.reason || 'redundant'} as \`${x.redundant_of}\` (${x.file})`);
  section('Regressions (tested targets whose test fails now)', all.filter(t => t.status === 'tested' && activeTestsCovering(ledger, t.id).some(isFailing)),
    t => `- **${t.id}**: ${t.title} (${activeTestsCovering(ledger, t.id).filter(isFailing).map(x => x.key).join(', ')})`);
  section('Coverage claims without proof (last run)', active.filter(x => x.last?.ok && x.covers.some(id => !x.last.proved.includes(id))),
    x => `- \`${x.key}\`: ${x.covers.filter(id => !x.last.proved.includes(id)).join(', ')}`);
  section('Needs from a human (blocked)', all.filter(t => t.status === 'blocked'),
    t => `- **${t.id}**: ${t.title}. Needs: ${t.blocked_reason || '(no reason given)'}`);
  section('Suspected bugs', all.filter(t => t.status === 'bug_suspected'),
    t => { const e = lastNote(t); return `- **${t.id}**: ${t.title}${e ? ` (${e.note}${e.artifact ? `, ${e.artifact}` : ''})` : ''}`; });
  section('Disputed specs', all.filter(t => t.status === 'spec_disputed'),
    t => { const e = lastNote(t); return `- **${t.id}**: ${t.title}${e ? `: ${e.note}` : ''}`; });
  section('Code removed from the export (candidates for out_of_scope)', all.filter(t => t.code_removed && t.status !== 'out_of_scope'),
    t => `- ${t.id} (${t.status}): ${t.title}`);
  section('Code that left a feature in a partial import (moved or removed: the next import with --complete tells)', all.filter(t => t.code_unresolved?.length),
    t => `- ${t.id} (${t.status}): ${t.title} · ${t.code_unresolved.join(', ')}`);
  section('Unmapped elements (seen in the app, not in the code export)', all.filter(t => t.kind === 'observed'),
    t => `- ${t.id} (${t.status}): ${t.title}`);

  const md = lines.join('\n') + '\n';
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, md);
  console.log(md);
}

function cmdValidate() {
  const ledger = load();
  const outcomeNotes = Object.values(ledger.targets).map(missingOutcome).filter(Boolean);
  const errs = Object.values(ledger.targets).flatMap(validateTarget).filter(e => !outcomeNotes.includes(e));
  for (const [k, t] of Object.entries(ledger.targets)) if (k !== t.id) errs.push(`key ${k} != id ${t.id}`);
  for (const [k, x] of Object.entries(ledger.tests)) {
    if (k !== x.key) errs.push(`test key ${k} != ${x.key}`);
    if (!ledger.families[x.family]) errs.push(`test ${k}: unknown family ${x.family}`);
    for (const id of x.covers) if (!ledger.targets[id]) errs.push(`test ${k}: covers unknown target ${id}`);
    if (x.status === 'redundant' && !ledger.tests[x.redundant_of]) errs.push(`test ${k}: redundant of unknown test ${x.redundant_of}`);
  }
  for (const [k, f] of Object.entries(ledger.families)) if (f.sig !== sigOf(f.skeleton)) errs.push(`family ${k}: signature out of date`);
  if (ledger.roles !== undefined && (typeof ledger.roles?.classes !== 'object' || Array.isArray(ledger.roles.classes))) errs.push('roles: classes must be an object of "<class>": [logins]');
  const warn = uniq(Object.values(ledger.targets).flatMap(t => t.features)).filter(f => !ledger.features[f] && !f.startsWith('area:'));
  const roleNotes = Object.values(ledger.tests).filter(x => x.status === 'active').flatMap(x => roleProblems(ledger, x));
  if (errs.length) die('invalid:\n  ' + errs.join('\n  '));
  console.log(`ok: ${Object.keys(ledger.targets).length} targets, ${Object.keys(ledger.features).length} features, ${Object.keys(ledger.families).length} families, ${Object.keys(ledger.tests).length} test rows, ${ledger.runs.length} runs` +
    (hasRoleClasses(ledger) ? `, ${Object.keys(ledger.roles.classes).length} role classes` : ''));
  if (warn.length) console.log(`note: features used by targets but not imported: ${warn.join(', ')}`);
  if (outcomeNotes.length) console.log(`note: ${outcomeNotes.length} target(s) from before the outcome rule (add refuses these now):\n  ${outcomeNotes.join('\n  ')}`);
  if (roleNotes.length) console.log(`note: ${roleNotes.length} row(s) whose role class doesn't fit (test add refuses these now):\n  ${roleNotes.join('\n  ')}`);
}

const HELP = `ledger.mjs: coverage ledger (${LEDGER})

Targets
  init                                     create an empty ledger
  add --file <json> | --json '<json>'      add/merge targets [--by A]. Same code element + outcome as an existing target = merged into it
  set <id> <status> [--by A] [--note ""] [--reason ""] [--artifact path] [--force]
  note <id> --note "" [--by A] [--artifact path]
  show <id>
  frontier [--feature F] [--area a] [--kind k] [--role r] [--status s] [--limit n] [--json]
  stats [--feature F] [--area a]

Features (your code map's features, C17)
  features import --file <json> [--complete] [--by A]   upsert features and their members; reports what changed
  features [--json]                        coverage per feature
  feature <id>                             one feature: open targets, failing tests, changed code, members not in any target
  changed [--since <date>] [--ids|--json]  features whose code changed since their own rows last ran (or since <date>)

Role classes (from /discover-roles)
  roles import --file <json> [--by A]      {"classes":{"<class>":["<login>",…]},"features":{"<F>":{"<class>":[…]}}}
  roles                                    list them. Once imported, test add fills and checks each row's role_class

Families and test rows
  family check --file <json>               does a family with these steps exist? ({"skeleton":[…]})
  family add --file <json> [--by A] [--force --reason ""]   ({"key","spec","area","skeleton":[…]})
                                           both note steps whose element isn't a ledger target
  family show <key> | family list
  test add --file <json> [--by A]          register rows; refuses duplicates, subsumed rows and wrong role classes
  test list [--family f] [--feature F] [--status s] | test show <key>
  test reactivate|retire <key> --reason "" [--by A]

Runs
  ingest [report.json] [--by A]            read the Playwright JSON report (default ${RESULTS}): results, proofs, regressions
                                           (node tools/run.mjs runs the tests and then this, in any shell)
  redundancy [--apply --by Auditor]        passing rows whose proofs one other row of the same role class already gives

  report                                   write ${REPORT} (by feature) and print it
  validate

JSON input: --file <path> works in every shell. --json '<json>' also works in bash and PowerShell 7.3+,
but not in Windows PowerShell 5.1, which strips the double quotes inside '…'.

statuses: ${STATUSES.join(', ')}
kinds:    ${KINDS.join(', ')}`;

const [cmd, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
const commands = {
  init: cmdInit, add: cmdAdd, set: cmdSet, note: cmdNote, link: cmdLink, show: cmdShow, frontier: cmdFrontier, stats: cmdStats,
  features: cmdFeatures, feature: cmdFeature, changed: cmdChanged, family: cmdFamily, test: cmdTest, roles: cmdRoles,
  ingest: cmdIngest, redundancy: cmdRedundancy, report: cmdReport, validate: cmdValidate,
};
if (!cmd || !commands[cmd]) { console.log(HELP); process.exit(cmd ? 1 : 0); }
try { commands[cmd](args); } catch (e) { die(e.message); }
