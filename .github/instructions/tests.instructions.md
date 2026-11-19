---
applyTo: "tests/**/*.ts"
---
# Playwright test conventions

- Import from the project fixtures, not directly from `@playwright/test`:
  ```ts
  import { test, expect, useRole, meta, proves } from '../support/fixtures';
  import { looseName } from '../support/text';
  ```
- **One file per family**: `tests/<area>/<family>.spec.ts`, with the same `<area>/<family>` as the spec. Header on lines 1–2: `// spec: specs/<area>/<family>.md` and `// family: <family>`.
- **Rows, not copies**: the family's cases are a `ROWS` table with one `test()` per row in a loop. A new case is a new row (registered first with `node tools/ledger.mjs test add`), never a copied test. A single-row family can be one plain `test()`.
- Every test gets `meta({ key: '<family>/<row>', features, covers })` as its details argument: the key and covers exactly as registered.
- Every covered target's outcome is asserted inside `await proves('<target id>', () => expect(…)…)`, with an `// oracle:` comment above it. A passing test that never proves one of its covers fails.
- Call `useRole('<role>')` at the top of the file, inside `test.describe`, or per row inside `test.describe(() => { useRole(row.role); … })`. Never log in inside a test.
- Wrap each spec step in `await test.step('<step text from spec>', async () => { ... })`.
- Only web-first assertions: `await expect(locator).toHaveText(...)`, `toBeVisible()`, `toHaveValue()`, `toHaveURL()`. No `expect(await locator.textContent())`.
- Greek labels: use the exact DOM text when the snapshot gave it. Otherwise use `looseName('...')`, which ignores case, accents and final sigma.
- To wait for a backend call, use `page.waitForResponse(r => r.url().includes('<endpoint from C8>'))`. Never `waitForTimeout`.
- Appian: take the `sail` fixture (`async ({ page, sail }) => …`) and call `await sail.idle()` after actions that trigger a round trip. Import `expectNoAppianError`, `selectDropdown`, `answerConfirm`, `expandAllSections` and `formatAppianDate` from `../support/appian`. Never use Appian DOM ids or generated class names. Every submit is followed by a readback.
- Hidden by condition: assert `toHaveCount(0)`, not `toBeHidden()` (P3). Async data: assert on the real content, not the placeholder (P9). Plug-in components: `page.frameLocator(...)` (P8).
- A second role in the same test: `openAs(browser, role)` from `../support/fixtures`, closed in `finally` (P10).
- A text locator that matches more than one element (common with `looseName()`, which ignores case and accents): scope it to a section, dialog or row.
- A `⚠ disputed` row: `fixme: 'disputed: <reason>'` on the row, and the body starts with `test.fixme(!!row.fixme, row.fixme)`.
- Run with `node tools/run.mjs <file> --by "<agent>"`, which runs `ingest` afterwards. Never add `--reporter` (it would replace the JSON report).
- Template: `docs/appian/test-pattern.md`.
