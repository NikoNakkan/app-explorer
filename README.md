# App Explorer: a code-guided exploration and test system for GitHub Copilot (VS Code)

Seven Copilot custom agents explore your web app with **Playwright MCP**. They use your **code-map MCP** (your parsed Appian export and the features it found) to see what the UI can't show: `if` branches, loops, constants, hidden or role-gated elements, validation messages, direct URLs. What they find becomes Playwright TypeScript tests that pass for the right reason, organised by **feature**, with **no test that repeats another**.

```
                 ┌──────────────────── Explorer Lead (rounds, feature by feature) ─────────────────────┐
                 │                                                                                      │
 code-map MCP ─► Cartographer ─► Explorer ──────► Scenario Planner ─► Test Generator ─► Auditor ─► tested
 features,       targets per     live app via      families (same      registers rows,    proofs, no
 branches,       code element    Playwright MCP;   steps) + rows       writes one         weakening,
 constants       + outcome,      fingerprints,     (one per            parametrized test  marks redundant
                 shared code     verified          equivalence &       per family, ×3        │
                 once            locators          role class)              │                 │
                     │               │                    │                 ▼                 │
                     ▼               ▼                    ▼          Test Healer (classified fixes only)
              exploration/ledger.json ◄── targets · features · families · test rows · runs (tools/ledger.mjs)
                                          ▲
                     npx playwright test → node tools/ledger.mjs ingest (results and proofs flow back per feature)
```

## Features, and how tests are generated

Full rules: `docs/test-generation.md`.

- **Features come from your code map** (capability C17) and are imported into the ledger. Every target (one code element plus one outcome: an `if`'s then/else, a loop's empty/one/many, a validation) lists the features that contain it. **Shared code is one target**, tested once and counted in every feature that uses it.
- **Constants do double duty.** A string constant's text is the **fingerprint** that proves on screen which branch ran. A number constant gives the **edge values** to test (50 and 51 for `> 50`).
- **Families and rows.** Cases with the same steps are one family: one spec, one test file, one parametrized test. Each row is one equivalence class (or role class) of the code's conditions. A new case is a new row, never a copied test.
- **No duplicates, enforced.** The ledger refuses a family with the same steps as another, and a row whose targets another row already proves. After running, the Auditor's `redundancy` check marks rows that proved nothing new; they stay in the repo but are skipped by default. Both checks compare a row with **one** other row at a time: a row whose targets are only covered by two or more other rows together is accepted and kept (on purpose: every finding names the single row that replaces it). Avoiding those is the Scenario Planner's job.
- **Proof, not claims.** A test declares what it covers with `meta()` and proves each target with `proves()`. `ingest` reads the results back, per feature. A target becomes `tested` only with a proof from a run that passed 3 times out of 3.
- **New export?** `/changed-features` re-imports the features, lists what changed, reruns only those features' tests and re-verifies the changed targets.

| Command | Runs |
|---|---|
| `node tools/run.mjs` | every app test except rows marked redundant, then `ingest` |
| `node tools/run.mjs --features F12,F7` | only those features |
| `node tools/run.mjs --changed` | features whose code changed since their tests last ran (runs nothing if none did) |
| `node tools/run.mjs --redundant` | everything |
| `npx playwright test …` then `node tools/ledger.mjs ingest` | the same by hand: after any run, results and proofs go into the ledger |
| `node tools/ledger.mjs features` · `report` | coverage per feature · `exploration/coverage.md` |

These commands work the same in PowerShell, cmd and bash. Don't use `FEATURES=… npx …` or `$(…)`: Windows PowerShell, VS Code's default terminal on Windows, can't run them. JSON input to the ledger goes through a file (`--file`), because Windows PowerShell 5.1 strips the quotes inside `--json '…'`.

## How it handles an incomplete export

The app uses interfaces that aren't in the export, so the system never assumes the code map is complete:

- **The live page is the truth about what exists now.** The code map is the truth about what *should* happen and what is hidden.
- An on-screen element with no code-map match becomes an **`observed`** target. It gets explored like any other, after one reverse lookup (C7 search, including string constants). The coverage report lists these separately.
- A code-map element that isn't visible is a **lead**, not an error. It may be role-gated, conditional or collapsed.

## Appian layer

The app under test is an Appian (25.x / 26.x) application, so the agents carry Appian knowledge:

| File | Purpose |
|---|---|
| `docs/appian/platform-rules.md` | P1–P18: rules for any Appian app (uppercase buttons, dynamic ids, `showWhen` removal, custom dropdowns, record action menus, iframes, async placeholders, activity chaining, opaque record URLs, in-page errors, profile locale, readback, persona, test labels, session expiry). Read first by every agent. |
| `docs/appian/explorer-checklist.md` | What to check on every screen, input, button, branch, record action, process and role |
| `docs/appian/platform-knowledge.md` | The research behind it, with sources: how SAIL works, components, URLs, processes, security, export structure, Appian's own test tools |
| `tests/support/appian.ts` | `SailTracker` (wait for server round trips), `expectNoAppianError`, `selectDropdown`, `answerConfirm`, `expandAllSections`, `formatAppianDate`, `sitePagePath`. Plus `openAs()` in `fixtures.ts` for a second role inside one test |
| `docs/appian/test-pattern.md` | The templates generated tests follow (type-checked): a parametrized family, a cross-role journey, a negative security family |

### Things we don't know yet, and how the system finds out

| Unknown | Who finds out | How |
|---|---|---|
| Appian version | `/bootstrap` | asks the code-map MCP for the export's version (or asks you) → `exploration/observations/_environment.md` |
| What the code-map MCP really returns, including features | `/probe-codemap` | 15 probes → fills `docs/codemap-contract.md` (C1–C18), lists the top 5 gaps and the live fallback for each |
| Which groups each test login belongs to, and which logins are interchangeable | `/discover-roles` | group conditions from the code map, then observing each login (✓ / ✗ / ? with evidence) → `exploration/observations/_roles.md`, with role classes and the groups no login covers. The classes also go into the ledger (`roles import`), which then checks every test row's role class |
| Each login's language (Greek or not) | `/discover-roles` | reads the user settings (read-only) or infers from system text |

## Quick start

1. Copy this folder into a repo (or open it as its own workspace) in **VS Code 1.106+** with GitHub Copilot.
2. `cp .env.example .env` and fill in `APP_BASE_URL`, `ROLES` and the per-role credentials. Name each role after the test login. Group membership doesn't need to be known in advance, because `/discover-roles` works it out.
3. `npm install`, then `npx playwright install chromium` (two commands: Windows PowerShell 5.1 has no `&&`)
   On Windows, if PowerShell says running scripts is disabled, `npm` and `npx` are blocked by the execution policy: run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once (it also lets VS Code load its PowerShell terminal integration, which the agents' terminal uses), or use `npm.cmd` / `npx.cmd`. The agents run Playwright through `node tools/run.mjs`, which doesn't need `npx`.
4. `node tools/run.mjs --project=selfcheck` (or `npx playwright test --project=selfcheck`) runs offline. It proves the Greek text and Appian helpers, the coverage tagging and the ledger's duplicate checks work (it reproduces the «ΑΝΑΖΗΤΗΣΗ» case).
5. In `.vscode/mcp.json`, point the **`codemap`** server at your code-map MCP. Keep the name `codemap`.
6. In Copilot Chat run **`/bootstrap`**. It records the Appian version, probes your code-map MCP (`/probe-codemap`), checks Playwright MCP, logs in every role, works out each login's groups, language and role class (`/discover-roles`), confirms the Appian page-structure assumptions, and imports your features into the ledger.
7. Run **`/cover-feature`** for one feature. Or **`/map-area`** then **`/next-round`**, or pick **Explorer Lead** in the agent dropdown and say "next round for F12".

## Agents (`.github/agents/`)

| Agent | Responsibility | Browser | Edits tests |
|---|---|---|---|
| Explorer Lead | coordinates rounds feature by feature: reads the ledger, picks what's next, hands it to the right agent, writes the round report | – | – |
| Cartographer | turns your code map's features into targets: every outcome of every branch, loop cases, validations, fingerprints, edge values. Shared code once | – | – |
| Explorer | reaches targets in the real app, checks fingerprints, records verified locators and what really happened | ✓ | – |
| Scenario Planner | groups reached targets into families and picks the fewest rows that prove them all; checks the ledger for existing families first | – | – |
| Test Generator | registers the rows (duplicates refused), replays them live, writes one parametrized test per family, runs it until it passes 3 times | ✓ | ✓ |
| Test Healer | finds out why a row fails before changing anything (LOCATOR/TIMING/DATA/ENV/APP_BUG/SPEC_WRONG); reports possible app bugs instead of bending tests | ✓ | ✓ |
| Auditor | independent check that each row proves what it claims; marks redundant rows; the only one that can mark a target `tested` | – | – |

Prompts (`.github/prompts/`, run as `/name` in chat): `bootstrap`, `probe-codemap`, `discover-roles`, `map-area`, `next-round`, `cover-feature`, `cover-branch`, `changed-features`, `why-not-found`, `screen-audit` (the full Appian checklist on one screen).

## Files

```
HANDOVER.md                         instructions for a Claude Code session to review this toolkit for gaps on your PC
.github/copilot-instructions.md     shared rules: truth hierarchy, Greek text, locators, features/families/proof, safety, stop conditions
.github/agents/*.agent.md           the seven agents (tools, handoffs, procedures)
.github/prompts/*.prompt.md         entry points
.github/instructions/*.md           conventions applied to tests/ and specs/
.vscode/mcp.json                    playwright + codemap servers
.vscode/playwright-mcp.json         Playwright MCP config (el-GR, caps: testing, storage, network, devtools)
docs/test-generation.md             features, families, rows, what counts as a duplicate, proofs, running by feature
docs/codemap-contract.md            capabilities C1–C18 the agents expect from your MCP + mapping table (filled by /probe-codemap)
docs/playwright-mcp-reference.md    which Playwright MCP tools each agent uses, patterns, version notes
docs/ledger.md · docs/spec-format.md · docs/references.md
tools/ledger.mjs                    ledger CLI (no dependencies): targets, features, families, test rows, runs, reports
tools/run.mjs                       runs Playwright with feature selection (--features, --changed, --redundant), then ingest; any shell
exploration/rules.md                learned app rules (agents read it first and append to it)
exploration/observations/           one file per screen: reconciliation table + target outcomes
exploration/coverage.md             generated report: coverage per feature, failing rows, changed code, redundant rows, "Needs from a human"
specs/                              Markdown test plans, one per family
tests/support/                      fixtures (useRole, sail, page problems, coverage guard), meta()/proves(), run selection, login, roles, Greek text and Appian helpers
docs/appian/                        Appian platform rules, checklist, knowledge base, test templates
tests/auth.setup.ts                 logs in each role → .auth/<role>.json
```

## Design decisions

- **Verify first, then write.** The Generator confirms every locator and assertion live before it writes a test file. Iterating is normal, but on evidence, not by patching guesses until something passes.
- **Green for the right reason.** Agents may never weaken an assertion to pass. A suspected app bug becomes a `fixme` row plus `bug_suspected` with evidence, and the Auditor checks the diff for weakened assertions.
- **Every expectation has an oracle**: a code-map ref or an observation file. That way you can tell "the test checks what the code says" from "the test checks what we happened to see".
- **Coverage is proven, not declared.** Only assertions wrapped in `proves()` that passed in an ingested, stable run count.
- **Fewest tests that prove everything.** Equivalence classes and role classes come from the code's own conditions, and the ledger refuses rows that add nothing.
- **Memory.** `exploration/rules.md` turns one-off discoveries (like CSS upper-casing) into rules every agent applies.
- **Explicit blocks.** A target that can't be reached ends as `blocked` with the exact missing precondition. The report collects these for you.

## Still to do (needs your input)

1. **Your code-map MCP connected** in `.vscode/mcp.json`. Then `/probe-codemap` fills the contract table itself, including how your features map to C17. (You don't need to know its capabilities in advance.)
2. Confirm the login form locators in `tests/support/login.ts` (or let `/bootstrap` adjust them). The defaults try Appian's standard `#un` / `#pw` fields first.
3. Optional: say which areas allow destructive actions in the test environment.
4. Later, from whoever administers the environment: **test logins for groups that no current login covers**. `/discover-roles` produces that list.
