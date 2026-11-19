---
description: First-time setup. Records the Appian version, probes the code-map MCP, checks Playwright MCP, logs in every role, works out each login's groups and language, confirms Appian DOM assumptions and seeds the ledger.
agent: agent
tools: ['read', 'search', 'edit', 'execute', 'todo', 'playwright/*', 'codemap/*']
---
Set up the App Explorer workspace. Do these steps in order and stop at the first one that fails, explaining what's needed.

1. **Environment**: check that `.env` exists (copy from `.env.example` if not, then stop and ask me to fill it). Run `npm install` and `npx playwright install chromium` if `node_modules` is missing. If PowerShell answers that running scripts is disabled, use `npm.cmd` and `npx.cmd` instead and tell me (the fix is mine to make: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`). From here on, run Playwright only through `node tools/run.mjs`, which doesn't need `npx`.
2. **Appian version**: ask the code-map MCP for the export's Appian version (probe 12 in `.github/prompts/probe-codemap.prompt.md`). If it can't say, ask me. Record it in `exploration/observations/_environment.md`. Version-dependent behaviour is listed in `docs/appian/platform-knowledge.md` (async placeholders 25.3+, message banners 25.3+, …).
3. **Code-map MCP**: follow `.github/prompts/probe-codemap.prompt.md`. It lists the `codemap` tools, probes what they really return, and fills the mapping table in `docs/codemap-contract.md` for C1–C18.
4. **Playwright MCP**: list the `playwright` tools. Confirm that `browser_set_storage_state`, `browser_generate_locator` and `browser_verify_text_visible` exist. If they don't, the MCP version is too old or the caps are wrong: tell me which, using `docs/playwright-mcp-reference.md`.
5. **Login**: run `node tools/run.mjs --project=setup`. If it fails, use the browser to open the login page, take a snapshot, and update the locators in `tests/support/login.ts` to match. Re-run until every role in `ROLES` gets `.auth/<role>.json`.
6. **Roles**: follow `.github/prompts/discover-roles.prompt.md`. It works out which groups each login belongs to, plus its language and time zone, and writes `exploration/observations/_roles.md`.
7. **Appian DOM assumptions**: on one real, non-submitting screen, confirm or correct these, and update the `status` column in `docs/appian/platform-rules.md` with evidence:
   - P1: button DOM text vs its uppercase display
   - P5: dropdown = combobox plus listbox (and whether options have `role=option`)
   - P12: confirmation = `role=dialog`, and its Greek button labels
   - P13: if any Appian error box appears, its Greek wording
   - P6a: the accepted date input format for a Greek user (type 25/12/2026 into a date field; don't submit). Write it to `.env` as `APPIAN_DATE_FORMAT` (e.g. `dd/MM/yyyy`) so `formatAppianDate()` uses it
   - P17: test labels. With `browser_evaluate`, list every attribute name on the page that contains `test` (e.g. `data-testid`, `data-test-label`, `testlabel`) with a few example values. If components carry one, set `TEST_ID_ATTRIBUTE` in `.env` and `testIdAttribute` in `.vscode/playwright-mcp.json`, and mark P17 `confirmed`
   - P3: for one element that the roles matrix shows is hidden by `showWhen` for this login, check with `browser_evaluate` that its label is absent from `document.body.textContent` (absent from the DOM, not just CSS-hidden)
   - the version cross-check: if the export's version is missing, look for an "Appian version" comment in the page source
8. **Seed**: run `node tools/ledger.mjs init` if the ledger doesn't exist. If C17 (features) is mapped, import the full feature list as section 0 of `.github/agents/cartographer.agent.md` describes (`features import --complete`), then run `node tools/ledger.mjs features`.
9. **Self-check**: `node tools/run.mjs --project=selfcheck` must pass (helpers, coverage tagging, ledger rules).

Finish with a short report: the Appian version, which code-map capabilities are mapped or missing (top 5 gaps), how many features were imported, which roles log in, the roles matrix with its gaps (groups with no login) and role classes, each login's language, and which platform rules are now `confirmed`.
