# Appian platform rules

These rules hold for **any** Appian app, not just this one. Every agent reads them before `exploration/rules.md`, which holds project-specific rules.

**Promotion gate:** a lesson moves from `exploration/rules.md` to this file only when it is
1. **measured**: seen in the live app, with evidence, or documented by Appian;
2. **noun-free**: it names no screen, record, user or business term from this project;
3. **rule-shaped**: it says what to do, not only what happened.

Status values: `documented` (Appian docs), `reported` (community or known issue), `confirmed` (seen in our app; add the evidence path).

| ID | Rule | Status |
|---|---|---|
| P1 | **Button labels are displayed in UPPERCASE; the DOM keeps the original case and accents.** Never take a button name from a screenshot. Use the snapshot name, the code-map label, or `looseName()`. Playwright's default matching ignores case but not accents, so `{ name: 'ΑΝΑΖΗΤΗΣΗ' }` won't find «Αναζήτηση». | reported (since ~17.1) · confirmed: first run, search button; `tests/selfcheck/greek-text.spec.ts` |
| P2 | **DOM ids are generated and change on reload.** Never use `id`-based locators, except on the login page (`#un`, `#pw`). | reported |
| P3 | **`showWhen: false` removes the element entirely.** Assert `toHaveCount(0)`, not `toBeHidden()`. | documented ("hidden and not evaluated") · verify DOM absence on first run |
| P4 | **Collapsed sections still evaluate their contents and validations.** Expand them before reconciling. A validation on load expands them by itself. | documented (expands on validation) · reported (contents evaluate) |
| P5 | **Dropdowns are custom comboboxes, not `<select>`.** Click to open, then choose from the listbox. A search box appears when there are more than 11 choices. Use `selectDropdown()`. | documented (search) · reported (DOM) |
| P6 | **Date fields:** the typed format follows the user locale, but placeholders and validation messages may say `mm/dd/yyyy`. Find the accepted format with a day above 12 and record it here as P6a. | reported (el placeholder; AN-84725 message) |
| P7 | **Record actions in MENU or MENU_ICON style check security on click** (`securityOnDemand` defaults to true). A visible item can still be denied, so click to find out. Actions open in a **dialog** by default; submitting closes it and refreshes the action field. | documented |
| P8 | **Component plug-ins render in sandboxed iframes** on another origin. If something is visible but missing from the snapshot, look in the frames. | documented |
| P9 | **Async placeholders (25.3+)** mean data is still loading, and submit is blocked until it finishes. Wait for the real content before asserting or submitting. | documented |
| P10 | **Activity chaining** keeps the same user and the same URL. When the chain breaks, the task goes to the assignee's task list. Group tasks may need Accept. A hand-off to another role means switching storage state. | documented |
| P11 | **Record URLs are opaque.** Don't build them from database ids. Navigate through lists, search or links. | documented |
| P12 | **Confirmation dialogs are Appian modals** (`role=dialog`), not native browser dialogs. `browser_handle_dialog` doesn't apply. | documented |
| P13 | **Interface errors show in the page, not the console.** Check for the error box after every navigation and action (`expectNoAppianError`). The Greek wording is not yet recorded; add it here when seen. | reported |
| P14 | **The language comes from the Appian user profile, not the browser.** Before blaming translations, check that the test user's locale is `el`. | documented |
| P15 | **Verify submits by readback.** After a submit, reopen the record or grid and check the stored values. A success banner isn't proof. | practice (Dev MCP method) |
| P16 | **Explore as the persona, never as designer or admin** (unless that is the role under test). Their views differ in both directions. | practice (Dev MCP method) |
| P17 | **Look for Appian test labels.** SAIL components can carry a `testLabel` (appian-locust targets it; pickers add a `test-` prefix). If it reaches the DOM as an attribute, it's the most stable locator there is: set `TEST_ID_ATTRIBUTE` in `.env` and `testIdAttribute` in `.vscode/playwright-mcp.json`, then prefer `getByTestId`. | reported (SAIL JSON) · verify DOM on first run |
| P18 | **Sessions expire.** If a navigation after `browser_set_storage_state` lands on the login page, re-run `node tools/run.mjs --project=setup` once and retry. If it happens twice, it's `ENV`: stop and report. | practice |
