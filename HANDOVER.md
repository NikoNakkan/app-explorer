# Handover: find the gaps in App Explorer

- **For:** a Claude Code session on the user's Windows PC, opened in this `app-explorer` folder. Run it locally, because phases C and D need the user's own code-map MCP and network access to their Appian test environment.
- **To start:** tell Claude Code "Read HANDOVER.md and follow it."
- **Goal:** find everything that would stop this toolkit from working well on this machine, with the user's code-map MCP and their Appian app. Fix what is safe to fix, and report the rest.

## 1. What this is

The user maintains an **Appian application** (they think version 26.5 or later; Greek UI; form login; several roles; test environment). They built their own **code-map MCP** (Python + SQLite) over the application export. It answers questions about the export and groups the code into **features**: the interfaces, rules, constants, `if` / `forEach` blocks and processes that belong together. Parsing the export is the user's work and is **out of scope**.

This folder is an **agentic testing toolkit** for **GitHub Copilot custom agents in VS Code agent mode**. Seven agents (`.github/agents/`) use **Playwright MCP** and the **code-map MCP** to explore the live app, find untested branches, and generate **Playwright TypeScript** tests. It started with a button shown as «ΑΝΑΖΗΤΗΣΗ» (CSS uppercase) whose DOM text is «Αναζήτηση», which an agent working from screenshots couldn't find.

The pipeline:
1. **Cartographer:** code map → ledger targets, one per code element and outcome, tagged with features.
2. **Explorer:** reaches each target in the live app and records verified locators.
3. **Scenario Planner:** groups targets into families (same steps) and rows (one per equivalence class and role class).
4. **Test Generator:** registers the rows, then writes parametrized tests with `meta()` and `proves()`.
5. **Test Healer:** fixes failing rows.
6. **Auditor:** checks proofs and redundancy, and marks targets `tested`.

`tools/ledger.mjs` is the only way agents change `exploration/ledger.json`.

Known unknowns:
- the exact Appian version
- which groups each test login belongs to, and each login's language
- whether the MCP resolves UUIDs to names
- the MCP's real tool list (`docs/codemap-contract.md` is still all TODO)

The user has **no Appian Designer account**, so Appian's own developer tools are not available.

Read in this order (about 20 minutes):
1. `README.md`
2. `.github/copilot-instructions.md`
3. `docs/test-generation.md`
4. `docs/ledger.md`
5. `docs/codemap-contract.md`
6. the seven `.github/agents/*.agent.md`
7. `docs/appian/platform-rules.md`

## 2. Rules for this review

- **Agentic tooling only.** No Python files, no export parsers. No new runtime dependencies unless there's no other way, and then ask the user first.
- **Keep the design** (section 3). Propose design changes in the report; don't make them.
- **Read-only against the app.** Use the test environment only. Never submit, delete or approve anything in the Appian app; stop at confirmation dialogs and cancel.
- **Secrets:** never print `.env` values, passwords, or values from the Import Customization File. The user fills in `.env` themselves.
- **After every change:** `npx playwright test --project=selfcheck` must still pass (18 tests), and `node tools/ledger.mjs validate` must say ok.
- Don't commit or push unless the user asks.

## 3. Design decisions to keep

| Decision | Where |
|---|---|
| Verify live first, then write the test. Never weaken an assertion to make it pass | Test Generator, Test Healer, Auditor agents |
| Every expected result cites an oracle (a code-map ref or an observation file) | `.github/copilot-instructions.md` |
| One target per code element + outcome. Shared code is one target, listed under each feature | `docs/test-generation.md`; `tools/ledger.mjs` (`add` merges by `ref.element` + `outcome`) |
| One family per sequence of steps = one spec = one parametrized test. Rows are equivalence classes and role classes | `docs/test-generation.md`, `docs/spec-format.md` |
| Duplicates are refused at registration (`family add`, `test add`). Rows found redundant after running (`redundancy`) are skipped by default, never deleted automatically | `tools/ledger.mjs`, `tests/support/selection.ts` |
| Only proven coverage counts: `proves()` passing in an ingested run, 3 out of 3 for `tested`. Only the Auditor sets `tested` | `tests/support/coverage.ts`, `tests/support/fixtures.ts` (`coverageGuard`), ledger `set` |
| Agents never parse the export. Everything from it comes through the code-map MCP (capabilities C1–C18, each with a live fallback) | `docs/codemap-contract.md` |

## 4. Set up

1. `node -v` must show 20.12 or newer.
2. `npm install`, then `npx playwright install chromium`.
3. `npx playwright test --project=selfcheck` should report **18 passed**. If anything fails here, that's the first gap: fix it before anything else.
4. `node tools/ledger.mjs validate` should say ok.
5. For phases C and D, give **this Claude Code session** the same two MCP servers the Copilot agents use. Claude Code reads `.mcp.json` at the folder's root, with servers under `mcpServers` (VS Code's `.vscode/mcp.json` uses `servers` instead):
   ```json
   {
     "mcpServers": {
       "playwright": { "command": "npx", "args": ["-y", "@playwright/mcp@latest", "--config", ".vscode/playwright-mcp.json"] },
       "codemap": { "command": "<the command that starts the user's code-map MCP>", "args": ["<its arguments>"] }
     }
   }
   ```
   Ask the user for the code-map command. Approve both servers when Claude Code asks, then restart it. If the Playwright server doesn't start, give `--config` an absolute path.

## 5. The review

Work through the phases in order and log every finding as you go (section 6). A finding is anything that would make an agent guess or fail, or produce a wrong or duplicate test.

### Phase A: the toolkit against itself (no app, no MCP)

1. **The commands exist.** Collect every `node tools/ledger.mjs …` and `npx playwright …` command in `.github/` and `docs/`. Check each subcommand and flag against the CLI's help (`node tools/ledger.mjs`) and its code. Run them on a scratch ledger by setting `LEDGER_PATH` to a file outside `exploration/`.
2. **Each agent has the tools its procedure needs**: `execute` to run the CLI, `edit` to write files, `playwright/*` for the browser, `codemap/*` for the code map. Every handoff names an existing agent, and every prompt's `agent:` exists.
3. **The VS Code format is current.** Compare the frontmatter fields and tool names (`read`, `search`, `edit`, `execute`, `todo`, `playwright/*`, `codemap/*`, `handoffs`, `argument-hint`) with the current VS Code custom-agent docs (links in `docs/references.md`), for the VS Code version installed here (`code --version`). Tool-set names have changed between VS Code releases.
4. **The Playwright MCP tools exist.** Every `browser_*` tool the agents name (see `docs/playwright-mcp-reference.md`) must exist in the installed `@playwright/mcp`, with the capabilities set in `.vscode/playwright-mcp.json`.
5. **Walk one feature through on paper.** Invent a feature with:
   - an `if` comparing a field's length with a number constant
   - a `forEach` over records
   - a validation
   - an interface shared with another feature

   Follow each agent file literally, from the Cartographer to the Auditor, running the real CLI commands on the scratch ledger. Each of these is a finding:
   - a place where you had to guess
   - a command that refused something valid
   - a command that accepted a duplicate

### Phase B: this machine (Windows)

1. **Shell syntax.** The docs and prompts use bash forms: `FEATURES=F12 npx playwright test`, `RUN_REDUNDANT=1 …`, `FEATURES=$(node tools/ledger.mjs changed --ids) …`, `LEDGER_PATH=…`. VS Code's terminal on Windows is usually PowerShell, where these fail, and that's where the Copilot agents run their commands.
   - Confirm which shell VS Code uses here.
   - Fix it in a way that works on any OS, without new dependencies. For example, a small Node runner `tools/run.mjs` that sets the variables, runs Playwright, then runs `ledger.mjs ingest`.
   - Update every doc, prompt and agent that shows a bash form.
2. **Paths and files:**
   - `.auth/` gets created
   - `process.loadEnvFile('.env')` loads `.env`
   - backslashes in the JSON report's `file` fields still work with `ingest`, whose ignore rule uses `endsWith`
   - nothing breaks if git converts line endings to CRLF
3. **git:** the Auditor runs `git diff -U0 -- tests/`. Is this folder a git repository? If not, say what the user should do.

### Phase C: the real code-map MCP (if connected)

1. Run the 15 probes in `.github/prompts/probe-codemap.prompt.md`. Fill in the mapping table in `docs/codemap-contract.md` (C1–C18) with the real tool names and evidence.
2. Look hardest at **C17 (features)**: feature coverage and duplicate detection depend on it.
   - Does each member's `key` stay the same between two exports?
   - Is there a `sig`, or anything else that changes when a member's code changes? Without it, `/changed-features` can't see edits.
   - Are `if` / `a!match` / `showWhen` / `forEach` blocks members, so that each outcome can become a target?
   - Do constants come with their values? Those values are the fingerprints and the edge values.
   - Can you ask which features contain a given member? That's how shared code is found.
3. Convert one real feature into the `features import` format (`docs/ledger.md`) and import it into the **scratch** ledger. Run `features` and `feature <id>`: do the counts make sense?
4. List what the agents expect that the MCP doesn't provide, with the live fallback for each.

### Phase D: the real Appian app (only if the user has filled in `.env`; read-only)

1. `npx playwright test --project=setup` should log every role in. If it fails, compare `tests/support/login.ts` with the real login page.
2. With Playwright MCP, open one ordinary screen per role. Check the assumptions in `docs/appian/platform-rules.md` against what `tests/support/appian.ts` expects:
   - P1: buttons shown in uppercase
   - P2: dynamic ids
   - P3: `showWhen` removes elements
   - P5: the dropdown's DOM
   - P6a: the date format
   - P12: the confirmation dialog
   - P13: the error box texts
   - P17: test labels in the DOM

   Mark each one confirmed or contradicted, with evidence.
3. Check each login's language: is the system text Greek for every role?

### Phase E: the ledger and the generation logic

Test these known weak spots on the scratch ledger and, where useful, with a small sample spec run (the self-checks show how):
- **Cross-role journeys:** a family's skeleton is a list of `action:element` steps without roles. So two journeys with the same steps but a different sequence of roles count as "same steps". Check whether the Planner writes `switch-role:<role>` steps into the skeleton. If it doesn't, fix the spec format and the Planner.
- **Partial feature imports:** `features import` without `--complete` can mark a member as removed when it actually moved to a feature that wasn't in the file.
- **Role classes:** `test add` trusts the `role_class` it is given. Nothing checks it against `exploration/observations/_roles.md`.
- **Redundancy:** only finds a row that one other row fully covers, never a row covered by two others together. That's deliberate; check the docs say so wherever it matters.
- **Playwright version:** the JSON report shape and runtime annotations were checked on Playwright 1.63, but `package.json` allows `^1.56`. Check the installed version: run a tiny parametrized test with `meta()` and `proves()`, then `ingest` it.
- **Scale:** time `add`, `test add` and `report` on a generated ledger with a few thousand targets. Some lookups scan every target.

## 6. Report

Write `docs/gap-review.md`:

| # | Phase | Gap | Evidence (file:line, or command + output) | Severity | Fix | Status |
|---|---|---|---|---|---|---|

Severity:
- **blocker:** an agent can't do its job
- **important:** wrong or duplicate tests, or wasted runs
- **minor:** everything else

Then:
- Fix the blocker and important gaps that are clearly safe to fix: wrong commands, missing tool names, Windows syntax, mismatches between docs. Re-run the self-checks after each fix.
- Mark as "proposed": design changes, anything that touches the app, and anything that needs the user's knowledge.
- End with the top 5 gaps for the user and the questions only they can answer. Also name the one check only they can do: open this folder in VS Code, confirm the seven agents appear in Copilot's agent picker, and run `/bootstrap`.

## 7. Done when

- the self-checks pass and `node tools/ledger.mjs validate` says ok
- every phase that could run has run, and each one that couldn't says why (no MCP connection, no `.env`)
- `docs/gap-review.md` exists, and every row marked fixed was tested again
- no Python files and no new dependencies were added
