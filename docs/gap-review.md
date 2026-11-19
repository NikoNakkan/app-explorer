# Gap review: App Explorer on this PC

Review of the toolkit as described in `HANDOVER.md`, run on 2026-11-19 by a Claude Code session on the user's PC.

**Machine:** Windows 11 Pro 10.0.26200 · Node 24.19.0 · npm 11.17.0 · VS Code 1.146.0 (built-in Copilot Chat 0.74.0) · Windows PowerShell 5.1 only (no PowerShell 7) · effective execution policy **Restricted** · Git 2.55 with `core.autocrlf=true` · installed `@playwright/test` **1.65.1** · `@playwright/mcp` **0.0.86** (bundles Playwright 1.66.0-alpha-2026-11-18).

## Result

- **Self-checks:** `npx playwright test --project=selfcheck` → **25 passed**: the 18 original tests, unchanged, plus 7 new ones that cover the fixes below. `node tools/ledger.mjs validate` → `ok`.
- **Phases run:** A, B and E in full. **C did not run**: no code-map MCP is connected here, and its start command isn't known yet (it is in no MCP config on this machine). **D did not run**: there is no `.env`.
- **28 gaps found:** 3 blockers, 17 important, 8 minor. 26 are fixed (#1 and #21 also need an action from you) and 2 are proposed (#6, #27). The proposals are listed below the table: P1–P4 were applied after your go-ahead, and P5–P7 are yours to do.
- No Python files and no new dependencies. `package-lock.json` is new because `npm install` writes it. It pins the two existing dev dependencies.

### How it was tested

- Every ledger command ran on scratch ledgers outside `exploration/`, set with `LEDGER_PATH` or `run.mjs --ledger`. `exploration/ledger.json` is unchanged.
- A small **mock Appian site** in the session's scratch folder, not in this folder. It has an Appian-style login page (`#un`/`#pw`), ids that change on every load, buttons shown in uppercase, and a slow `/suite/` round trip. It was used to run the real `setup` project, `seed.spec.ts`, and a sample family (6 rows with `meta()`/`proves()`, run ×3), then `ingest`, `redundancy`, and the new runner. **Your Appian app was not contacted.**
- A **copy of this folder** with every text file converted to CRLF and a UTF-16 `.env` holding dummy values.
- The Windows checks ran in Windows PowerShell 5.1 with this machine's real execution policy, unless noted.

## Gaps

| # | Phase | Gap | Evidence | Severity | Fix | Status |
|---|---|---|---|---|---|---|
| 1 | B | **`npm` and `npx` don't run in VS Code's terminal here.** The execution policy is `Restricted` (CurrentUser and LocalMachine are `Undefined`), and in PowerShell `npx` resolves to `npx.ps1`. Every `npx playwright test …` in the agents failed. | `powershell -Command "npx --version"` → `File C:\Program Files\nodejs\npx.ps1 cannot be loaded because running scripts is disabled on this system.` `npm` is blocked the same way; `npx.cmd`, `npm.cmd` and `node` work. | blocker | Agents and docs run Playwright with **`node tools/run.mjs`**, which starts Playwright through `node` itself. Re-tested in a `Restricted` shell: all 25 self-checks passed. `README.md` and `/bootstrap` mention `npm.cmd`/`npx.cmd` and the policy change (#6). | fixed (toolkit); the policy itself is your decision (P5) |
| 2 | B | **Bash forms fail in PowerShell:** `FEATURES=F12 npx playwright test`, `RUN_REDUNDANT=1 …`, `FEATURES=$(node tools/ledger.mjs changed --ids) …`. | `FEATURES=F12 npx playwright test` → `The term 'FEATURES=F12' is not recognized as the name of a cmdlet…`. Were in `README.md:35-37`, `docs/test-generation.md:72-79`, `changed-features.prompt.md:9` and the `ledger.mjs changed` hint. | blocker | New **`tools/run.mjs`**, no dependencies, works the same in any shell. Options: `--features`, `--changed` (runs nothing when nothing changed, where an empty `FEATURES` used to run everything), `--redundant`, `--ledger`, `--by`, `--no-ingest`. It refuses `--reporter`, then runs `ingest`, but skips it when only setup/selfcheck ran. Every doc, prompt and agent updated. | fixed. Re-tested against the mock (`--features F12`, `--changed`, then "nothing to rerun") and by a self-check |
| 3 | A, B | **`--json '{…}'` breaks in Windows PowerShell 5.1**, which strips the inner double quotes. The Planner's `family check`/`family add` and the Explorer's `add` of observed targets all failed. | `node tools/ledger.mjs family check --json '{"skeleton":[…]}'` → `ledger: Expected property name or '}' in JSON at position 1`. Node receives `{skeleton:[a:b]}`. Were in `scenario-planner.agent.md:26,39`, `explorer.agent.md:37`, `docs/ledger.md:99-100`, `docs/spec-format.md:44`. | blocker | JSON goes into `exploration/inbox/*.json`, written with the editor and passed with `--file`, which every command already accepted. When `--json` doesn't parse, `ledger.mjs` now says to use `--file`. | fixed (self-check) |
| 4 | A, B | JSON files written by PowerShell 5.1 (`Set-Content`/`Out-File -Encoding utf8`) start with a BOM, which `ledger.mjs` couldn't parse. | `add --file` → `Unexpected token '﻿', "﻿[{"id":"O"... is not valid JSON` | important | `readText()` drops a leading BOM from input files, the ledger and the Playwright report. | fixed (self-check) |
| 5 | B | **PowerShell 5.1's file cmdlets garble Greek.** `Get-Content` reads UTF-8 without a BOM as Windows-1252, `Set-Content` writes ANSI, and `>`/`Out-File` write UTF-16. | `Get-Content features.json` → `Î‘Î½Î±Î¶Î®Ï„Î·ÏƒÎ·…`. A `.env` written with `Set-Content` turns a Greek password into `??d????`. | important | New section "Commands that work in every terminal" in `.github/copilot-instructions.md`: write files with the editor tool, never with redirection. Same note in `docs/ledger.md` and `exploration/inbox/README.md`. | fixed (docs) |
| 6 | B | **VS Code can't load its PowerShell terminal integration** under `Restricted`. It dot-sources `shellIntegration.ps1` inside `try {} catch {}`, so it fails silently. Copilot's terminal tool uses that integration to read output and exit codes. | VS Code's `ptyHostMain.js` starts PowerShell with `-noexit -command 'try { . "…\shellIntegration.ps1" } catch {}'`. Dot-sourcing a `.ps1` under `Restricted` → "cannot be loaded". | important | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or run the agents' terminal in Git Bash (`chat.tools.terminal.terminalProfile.windows`). | proposed (P5). Not verified inside VS Code |
| 7 | A | **Playwright MCP arguments were renamed.** `browser_set_storage_state` takes `filename` (not `path`), and `browser_click`/`browser_generate_locator` take `target` (not `ref`). The schemas have `additionalProperties: false`, so every documented role switch and locator check would be rejected. | `tools/list` from `@playwright/mcp` 0.0.86 with `.vscode/playwright-mcp.json`. Were in `copilot-instructions.md:102`, `explorer.agent.md:23`, `discover-roles.prompt.md:11`, `playwright-mcp-reference.md:23,31,36`. | important | Calls updated. `filename` is relative to the workspace root. | fixed |
| 8 | A | `@playwright/mcp@latest` wasn't pinned. Today it resolves to 0.0.86 on an alpha Playwright, and the renames in #7 came with it. | Server info: `Playwright 1.66.0-alpha-2026-11-18`. | important | Pinned `@playwright/mcp@0.0.86` in `.vscode/mcp.json`. `docs/playwright-mcp-reference.md` records what was checked and how to upgrade. | fixed |
| 9 | A | `browser_run_code_unsafe`, which can run anything (RCE-equivalent), is part of the always-on core capability. The safety rules didn't mention it. | Tool list per capability: core has 25 tools including `browser_run_code_unsafe`. | minor | Safety rule in `copilot-instructions.md`; note in the reference. | fixed |
| 10 | A | **Validation targets merged.** Cartographer §1 said "one validation target", while `test-generation.md` and the Cartographer's Appian section say shown / not shown. `add` silently merged the second validation target on the same element into the first, and the Cartographer is told that merge lines are "as intended". | Walk-through: `V:search:query:required:not-shown → V:search:query:required: same code element` | important | `add` requires `outcome` `shown`/`not-shown` for validation targets that have `ref.element`. Ids are `V:…:shown` / `:not-shown`. `validate` only warns about older targets. | fixed (self-check) |
| 11 | A | **Integration targets merged.** `I:F7:address` and `I:F12:address` became one target, because they have the same `ref.element` and no outcome. | `I:F12:address → I:F7:address: same code element; features now F7, F12` | important | `add` requires outcome `in:<feature>` for integration targets that have `ref.element`. The Cartographer §2 says how to fill them. | fixed (self-check) |
| 12 | A | **A shared constant spreads targets across features.** A target joins every feature that contains any key in its `ref.members`. A common "required" message constant put an F7 profile validation into F12's frontier, and F12's search test into F7's coverage. | `feature F12` lists `V:profile:phone:required`. `feature F7` lists test `search-query/empty` and shows "17% tested" from it. | important | P1 (applied): `add` and `features import` take a target's features from its `ref.element` only. `ref.members` still drive change flags and the "members not in any target" count, and integration targets keep only the feature they were written for. | fixed (self-check). Walk-through re-run: F12 has its 11 targets, F7 its 5, and the shared branch is in both |
| 13 | A | **Constant values were lost.** The Cartographer's normalisation dropped `value`, and so did `features import`. Without a `sig`, a changed constant (an edge 50 → 60, a message text) went unnoticed, so the boundary rows kept testing the old edge. | After import, member `cons-max` = `{"kind":"constant","name":"SRCH_MAX_QUERY"}`. Changing 50 → 60 → "no changes". | important | `features import` uses a hash of `value` as the change signal when a member has no `sig`; the value itself isn't stored. The Cartographer keeps `value`. | fixed (self-check: 50 → 60 flags the target, and the ledger doesn't contain 60) |
| 14 | A | `set <id> tested --force` skipped "only the Auditor sets tested", and `--force` needed no reason. | `ledger.mjs` (before the fix) line 250: `if (status === 'tested' && !opt.force)` | important | `--force` may skip the proof, never the Auditor rule. It needs `--note` or `--reason`. | fixed (self-check) |
| 15 | A | `test reactivate <key>` and `test retire <key>` were documented without the required `--reason`. | CLI: `reactivate needs --reason`. Were in `test-generation.md:65` and `test-healer.agent.md:64`. | minor | Docs updated. | fixed |
| 16 | A | `/bootstrap` ran setup with `--reporter=line`, against "never pass `--reporter`". | `bootstrap.prompt.md:12` | minor | Now `node tools/run.mjs --project=setup`. | fixed |
| 17 | A | Playwright's own `init-agents`, which the docs say to run alongside these agents, **overwrites `tests/seed.spec.ts`** with an empty seed and picks the `selfcheck` project. | In a scratch copy: `npx playwright init-agents --loop=vscode` → `tests\seed.spec.ts` replaced. With `--project chromium` it is kept. `.vscode/mcp.json` is merged correctly. | minor | `playwright-mcp-reference.md` and the seed's comment say to use `--project chromium`. | fixed |
| 18 | B | **`.env` encodings.** `process.loadEnvFile` silently loads nothing from a UTF-16 file (Windows PowerShell's `>` and `Out-File`) and loses the first variable after a UTF-8 BOM. | Dummy files: UTF-16 → every variable `null`, no error. BOM before `APP_BASE_URL` → `APP_BASE_URL=null`. | important | `playwright.config.ts` reads `.env` with the same parser (`util.parseEnv`), decodes UTF-16 and drops a BOM. Variables already in the environment still win, as before. | fixed. Re-tested: the CRLF copy's UTF-16 `.env` logged both mock roles in |
| 19 | B | **`.env`: an unquoted `#` starts a comment**, so a password such as `Κωδικός#1` arrives as `Κωδικός` and that role's login fails after 30 s. | `ROLE_CLERK_PASS=Κωδικός#1` → `"Κωδικός"`. `"pa#ss w0rd"` in quotes → intact. | important | `.env.example` says to quote such values. | fixed (docs) |
| 20 | B | The login check matched the whole URL, so a test host whose name contains `login`, `signin` or `auth` would always look like a failed login. | Mock served as `auth-test.localhost`: `not.toHaveURL /login\|signin\|auth/i` failed on `…/suite/sites/portal/page/search` | minor | `login.ts` and `seed.spec.ts` check only the path and query (`onLoginPage`). | fixed. Both hosts pass, and a rejected login still fails |
| 21 | B | **No git here**, and the Auditor's `git diff -U0 -- tests/` never shows new (untracked) files or staged changes. So check 5 ("no weakening") can't run. | `git rev-parse` → `fatal: not a git repository` | important | The Auditor uses `git status --porcelain -- tests/` plus `git diff -U0 HEAD -- tests/`, and says so when the check can't run. | fixed (docs). You still need to `git init` and commit (P6) |
| 22 | E | **Cross-role journeys collided.** The skeleton had no roles, so a second journey with a different approver was refused as "same steps", and its rows collided on role class. | `family add` → `same steps as family case-approval-sup`. Rows → `duplicate of case-approval-mgr/approve (… role class "staff")`. | important | Every hand-off is a `switch-role:<role class>` step in the skeleton, and a journey row's role class is the sequence (`staff>supervisors`). Updated `spec-format`, the Planner, the Generator, `test-generation`, `test-pattern` and the specs instructions. No CLI change needed. | fixed (self-check: different approvers register; the same journey is still refused) |
| 23 | E | **Partial imports.** A member that moved to a feature missing from the file was flagged `code_removed`, and the flag was **never cleared**, even after a complete import showed the code still existed. | Partial import → `code_removed: true`. Complete import → still `true`, so the target stays under "candidates for out_of_scope". | important | Partial imports mark `code_unresolved`. The next `--complete` import clears it (moved) or sets `code_removed`, and `code_removed` clears when the code comes back. New report section. | fixed (self-check) |
| 24 | E | **Role classes aren't checked.** A row without `role_class` silently becomes its own class (the login name), so a duplicate row for another login of the same class was accepted and never flagged as redundant. | Walk-through: `search-query/at-max-other-login` (login `clerk2`) accepted, passed, and `redundancy` → "no redundant tests". | important | P2 (applied): `/discover-roles` imports the role classes (`roles import`). `test add` then fills in a missing class from the login, and refuses a class that doesn't hold the login or doesn't exist. Journeys also get their class from the family's hand-offs, and are refused when it doesn't match them. Without imported classes, `test add` notes a missing class. | fixed (self-check: a second login of the same class is refused as a duplicate) |
| 25 | E | **`changed` measures from the last run of any tests.** One unrelated run hides features whose tests haven't re-run, and `/changed-features` then reruns nothing. | After a single-row run: `changed --ids` → empty, although 5 of F12's 6 rows hadn't re-run since its code changed. | important | P3 (applied): a feature stays listed until every active row of it has run after the change. A feature with no rows is measured from the last run, and `--since` still overrides. | fixed (self-check). The same walk-through ledger now lists F12 with "5 tests to rerun" |
| 26 | E | `redundancy` and `test add` compare a row with one other row at a time, which is deliberate. The docs stated "every row proves something no other row proves" as if it were enforced. | Rows `x+y`, `y+z`, `x+z`: all accepted, none flagged. | minor | Said plainly in `README`, `test-generation`, `copilot-instructions`, the Planner and the Auditor (who reports such rows for the Planner). | fixed (docs) |
| 27 | A | `HANDOVER.md`'s `.mcp.json` for this review uses bare `npx` and `@latest`. Claude Code on native Windows needs `cmd /c` around `npx`-based servers. | Claude Code's MCP setup notes for Windows | minor | `"command": "cmd", "args": ["/c", "npx", "-y", "@playwright/mcp@0.0.86", "--config", "<absolute path>"]` | proposed (the handover doc was left as it is) |
| 28 | A | `family add` doesn't check that skeleton elements are ledger targets, so a typo creates a "new" family. | Walk-through: a skeleton with `E:search:query` was accepted, though no such target exists. | minor | P4 (applied): `family check` and `family add` note a step whose element isn't a target or alias, and a `switch-role` step naming an unknown role class. These are notes, not refusals. | fixed (self-check) |

## What passed

- **Format is current for VS Code 1.146** (checked in the installed VS Code and its built-in Copilot Chat 0.74.0). The frontmatter fields `name`, `description`, `argument-hint`, `tools`, `agents` and `handoffs` (`label`/`agent`/`prompt`/`send`) are all parsed. The tool names resolve: `read`, `search`, `edit`, `execute` and `agent` are tool sets, `todo` is a tool, and an MCP server's tools are `<server>/*`, here `playwright/*` and `codemap/*`. `.github/agents`, `.github/prompts` and `.github/instructions` are the default folders.
- **Tools and handoffs.** Each agent has the tools its procedure needs (`execute` for the CLI, `edit` where it writes, `playwright/*`, `codemap/*`). Every handoff, every entry in the Explorer Lead's `agents:` list and every prompt's `agent:` names an existing agent.
- **Commands.** Every `ledger.mjs` subcommand and flag used in the docs exists; the only mismatch was a missing required flag (#15). Every `npx playwright …` flag in use is valid in 1.65.1, including `init-agents --loop=vscode`.
- **Playwright MCP.** All 26 `browser_*` tools the docs name exist in 0.0.86 with the configured capabilities, and every key in `.vscode/playwright-mcp.json` is valid. The capability table in the reference matches the server.
- **Windows paths and files.** `.auth/` is created. In 1.65.1 the JSON report's `file` fields use `/` (only suite titles use `\`), so `ingest`'s `endsWith` rule works and `seed.spec.ts` is ignored. The CRLF copy passes all 25 self-checks, the setup and a full run. Greek text passed as an argument reaches `node` intact.
- **Playwright version.** With 1.65.1, a real parametrized run with `meta()`/`proves()` (6 rows, ×3) is read by `ingest` with its proofs (runtime annotations are in `results[].annotations`). Promotion to `tested` worked only after that stable run.
- **Duplicate checks.** A family with the same steps and a row subsumed by one other row are refused; a duplicate journey with `switch-role` steps is still refused.
- **Scale:** no problem. Ledgers built with 5,000 and 20,000 targets (100 features, 2,000 and 8,000 rows):

  | Command | 5,000 targets | 20,000 targets |
  |---|---|---|
  | `add` (200 targets, half merges) | 0.41 s | 1.47 s |
  | `test add` (20 rows) | 0.15 s | 0.37 s |
  | `ingest` (every row ×3) | 0.18 s | 0.54 s |
  | `report` | 0.20 s | 0.68 s |
  | `redundancy` | 0.22 s | 1.41 s |

  The slowest lookup is the alias scan in `add`, which goes through every target for each new id.

## Phases that couldn't run

**Phase C (code-map MCP).** Not run because no code-map MCP is connected here and its start command isn't in any MCP config on this machine. `docs/codemap-contract.md` is therefore still all `TODO`. Once the command is known, the 15 probes can run from Claude Code with a small MCP client and no restart, or from VS Code with `/probe-codemap`. The answers that matter most for C17 are:
- Does each member's `key` stay the same between two exports?
- Is there a `sig`, or anything else that changes when a member's code changes? Without one, only constant values (#13) and added or removed members are noticed.
- Are `if` / `a!match` / `showWhen` / `forEach` blocks members, so that each outcome becomes a target?
- Do constants come with their `value`?
- Can you ask which features contain a given member? That's how shared code is found, and P1 depends on telling "this target's own code" from "a constant it uses".

**Phase D (the live app).** Not run because there is no `.env`. `/bootstrap` step 7 does the same read-only checks: P1, P2, P3, P5, P6a, P12, P13 and P17, plus the language of each login. Also worth checking then, since the helpers assume them:
- `SailTracker` waits for **every** `/suite/` request. A long-poll or notification request would make `sail.idle()` time out.
- `expandAllSections` clicks every `aria-expanded="false"` element up to 50 times, menus and navigation toggles included.
- `#un`/`#pw` and the Greek labels on the real login page.

## Proposals

P1–P4 changed how the ledger behaves, so they were proposed first and applied on 2026-11-19 after your go-ahead. Each has a self-check, and `docs/ledger.md`, `docs/test-generation.md`, the agents and the prompts describe them.

- **P1. Feature membership from the target's own code (#12)**, applied. `add` and `features import` take a target's features from its `ref.element`; `ref.members` still raise code-changed flags and count as "referenced". An integration target keeps only the feature it was written for. Targets already in a ledger keep their features: nothing is taken away.
- **P2. Role classes in the ledger (#24)**, applied. `/discover-roles` writes `exploration/inbox/roles.json` (class → logins, plus per-feature classes where they merge) and runs `roles import`. `test add` fills in and checks every row's class. A journey's class sequence must match its `switch-role` steps. `validate` notes older rows that don't fit.
- **P3. Per-feature baseline for `changed` (#25)**, applied. A feature stays listed until every active row of it has run after its last code change. `--since` still overrides.
- **P4. Unknown skeleton elements (#28)**, applied. `family check` and `family add` note a step whose element isn't a target or alias, and a `switch-role` step naming an unknown role class.
- **P5. Execution policy (#1, #6).** Either run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once (recommended: it unblocks `npm`/`npx` and VS Code's terminal integration), or set `chat.tools.terminal.terminalProfile.windows` to Git Bash for the agents. Optionally add `node tools/ledger.mjs` and `node tools/run.mjs` to `chat.tools.terminal.autoApprove`, so the agents don't stop at every command.
- **P6. git (#21).** Run `git init` and make a first commit, then commit after each audited round. That's what the Auditor's diff is measured against.
- **P7. `HANDOVER.md` snippet (#27).** Switch it to the Windows form shown in row 27.

## Top 5 gaps for you

1. **Execution policy (#1, #6):** `npm`/`npx` are blocked in VS Code's PowerShell here, and so is VS Code's terminal integration. The agents now avoid `npx`, but you need to choose P5.
2. **Code-map MCP not connected (Phase C):** the contract is all `TODO`, and nothing about C17 (stable keys, `sig`, branch members, constant values, reverse lookup) has been verified. P1 relies on C17 telling a target's own code apart from the constants it uses.
3. **Nothing has been checked against the real app (Phase D):** the login page, P1–P17, and the helpers' assumptions (`sail.idle()` with long-poll requests, `expandAllSections`, the Greek confirm and error texts). Fill in `.env` and run `/bootstrap`.
4. **No git (#21):** the Auditor's "no weakened assertions" check can't run until the folder is a repository with commits (P6).
5. **Role classes only count once imported (#24):** until `/discover-roles` has run `roles import`, a row for another login of the same class gets only a note, not a refusal.

## Questions only you can answer

1. What command (and arguments) starts your code-map MCP? Does it resolve UUIDs to object names?
2. P5: set `RemoteSigned` for your user, or run the agents' terminal in Git Bash?
3. The Appian version: 26.5 or later? Or should `/bootstrap` read it from the export?
4. Which test logins go into `ROLES`, and is each one's Appian language Greek?
5. P6: will you `git init` this folder, or should this session do it (with no commits unless you ask)?
6. Which areas, if any, allow destructive actions in the test environment?

## The one check only you can do

Open this folder in VS Code and confirm that the **seven agents** (Explorer Lead, Cartographer, Explorer, Scenario Planner, Test Generator, Test Healer, Auditor) appear in Copilot's agent picker. Then fill in `.env`, set the `codemap` command in `.vscode/mcp.json`, and run **`/bootstrap`**.

## Files changed in this review

- **New:** `tools/run.mjs`; `docs/gap-review.md`.
- **Code:** `tools/ledger.mjs` (including P1–P4 and the new `roles` command); `playwright.config.ts`; `tests/support/login.ts`; `tests/seed.spec.ts`; `tests/selfcheck/ledger-cli.spec.ts` (7 new tests); comments in `tests/support/selection.ts` and `tests/support/tags.ts`.
- **Config:** `.vscode/mcp.json` (pin); `.env.example` (quoting note).
- **Agents and prompts:** `.github/copilot-instructions.md`; all seven agents (the Explorer Lead only for the wording of `changed`); the `bootstrap`, `changed-features` and `discover-roles` prompts; both instructions files.
- **Docs:** `README.md`; `docs/ledger.md`, `docs/test-generation.md`, `docs/spec-format.md`, `docs/playwright-mcp-reference.md`; `docs/appian/platform-rules.md` (P18), `docs/appian/test-pattern.md`; `exploration/inbox/README.md`.
- **Unchanged:** `HANDOVER.md`, `docs/codemap-contract.md` (filled in Phase C), `exploration/ledger.json`.
- Nothing was committed: this folder isn't a git repository.
