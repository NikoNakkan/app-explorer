# Test pattern for Appian (template for the Test Generator)

The shapes every generated test follows. Names, labels and pages here are **illustrative**: real locators come from the observation files, real expected values from the spec's oracles, and real keys and target ids from the ledger. Why families and rows: `docs/test-generation.md`.

What it shows:
- the header (`spec`, `family`); one test file per family
- **a parametrized family**: one `ROWS` table, one row per equivalence class, each row registered in the ledger and tagged with `meta()`
- `proves(id, …)` around the assertion that shows each target's outcome, with an `oracle:` comment
- a persona per file (`useRole`), a second role mid-test (`openAs`, P10), and a role per row
- waiting for SAIL (`sail.idle()`) instead of sleeping; Appian error boxes (P13)
- custom dropdowns (P5), confirmation modals (P12), dates (P6)
- readback through the list, never a built record URL (P11, P15)
- a negative security family (checklist G)

## 1. A parametrized family

```ts
// spec: specs/search/search-query.md
// family: search-query
import { test, expect, useRole, meta, proves } from '../support/fixtures';
import { expectNoAppianError, sitePagePath } from '../support/appian';
import { looseName } from '../support/text';
import type { Page } from '@playwright/test';

useRole('clerk');

const FEATURES = ['F12'];
const SEARCH = sitePagePath('portal', 'search');

type Row = {
  key: string; // <family>/<row>, exactly as registered with `ledger.mjs test add`
  name: string;
  query: string; // the input this family varies
  covers: string[]; // the target ids this row proves
  fixme?: string; // set for a ⚠ disputed row: 'disputed: <reason>'
  verify: (page: Page) => Promise<void>;
};

// One row per equivalence class (spec: Rows). A new case is a new row, never a copy of the test.
const ROWS: Row[] = [
  {
    key: 'search-query/empty',
    name: 'an empty query is rejected',
    query: '',
    covers: ['B:search:empty:then', 'V:search:query:required:shown'],
    verify: async page => {
      // oracle: codemap C9 V:search:query:required (fingerprint: cons!SEARCH_EMPTY)
      await proves('V:search:query:required:shown', () => expect(page.getByText('Συμπληρώστε κριτήριο αναζήτησης')).toBeVisible());
      // oracle: codemap C4 if:search#1 then → no results grid
      await proves('B:search:empty:then', () => expect(page.getByRole('grid')).toHaveCount(0));
    },
  },
  {
    key: 'search-query/at-max',
    name: 'a 50-character query runs the search',
    query: 'α'.repeat(50),
    covers: ['B:search:empty:else', 'B:search:too-long:else'],
    verify: async page => {
      // oracle: codemap C4 if:search#1 else → the results grid is shown
      await proves('B:search:empty:else', () => expect(page.getByRole('grid')).toBeVisible());
      // oracle: codemap C4 if:search#2 (len(query) > cons!MAX_QUERY, 50) else → no length message
      await proves('B:search:too-long:else', () => expect(page.getByText('Έως 50 χαρακτήρες')).toHaveCount(0));
    },
  },
  {
    key: 'search-query/over-max',
    name: 'a 51-character query is rejected',
    query: 'α'.repeat(51),
    covers: ['B:search:too-long:then'],
    verify: async page => {
      // oracle: codemap C3 cons!SEARCH_TOO_LONG
      await proves('B:search:too-long:then', () => expect(page.getByText('Έως 50 χαρακτήρες')).toBeVisible());
    },
  },
];

test.describe('Search by query', () => {
  for (const row of ROWS) {
    test(row.name, meta({ key: row.key, features: FEATURES, covers: row.covers }), async ({ page, sail }) => {
      test.fixme(!!row.fixme, row.fixme);

      await test.step('Open search', async () => {
        await page.goto(SEARCH);
        await sail.idle();
        await expectNoAppianError(page);
      });

      await test.step('Search', async () => {
        // locator: observations/search.md
        await page.getByLabel('Κριτήριο').fill(row.query);
        await sail.idle();
        // shown as «ΑΝΑΖΗΤΗΣΗ», DOM «Αναζήτηση» (P1)
        await page.getByRole('button', { name: looseName('Αναζήτηση') }).click();
        await sail.idle();
      });

      await test.step('Check the outcome', () => row.verify(page));
    });
  }
});
```

## 2. A cross-role journey, and a negative security family

The journey's skeleton names every hand-off, so a journey where a different role class approves is a different family:
`["open:S:cases", "click:E:cases:new", "fill:E:case:title", "click:E:case:submit", "switch-role:supervisors", "open:S:my-tasks", "click:E:task:approve", "switch-role:staff", "readback:S:case"]`.
Its row is registered with `"role": "clerk", "role_class": "staff>supervisors"`.

```ts
// spec: specs/cases/case-approval.md
// family: case-approval
import { test, expect, useRole, openAs, meta, proves } from '../support/fixtures';
import { expectNoAppianError, selectDropdown, answerConfirm, formatAppianDate, sitePagePath } from '../support/appian';
import { looseName } from '../support/text';

const FEATURES = ['F3'];
const CASES = sitePagePath('case-management', 'cases');

test.describe('Case approval', () => {
  useRole('clerk');

  // A journey is usually a family with a single row: no ROWS table needed.
  test(
    'clerk submits, supervisor approves, clerk reads back',
    meta({ key: 'case-approval/approve', features: FEATURES, covers: ['T:approveCase:clerk-supervisor', 'P:approveCase:review', 'B:case:status:approved'] }),
    async ({ page, sail, browser }) => {
      const title = `E2E ${Date.now()}`;

      await test.step('Clerk fills in and submits', async () => {
        await page.goto(CASES);
        await sail.idle();
        await expectNoAppianError(page);
        // locator: observations/cases.md (button shown as «ΝΕΑ ΥΠΟΘΕΣΗ», DOM «Νέα υπόθεση», P1)
        await page.getByRole('button', { name: looseName('Νέα υπόθεση') }).click();
        await sail.idle();
        const form = page.getByRole('dialog');
        await form.getByLabel('Τίτλος').fill(title);
        await sail.idle();
        await selectDropdown(page, 'Κατηγορία', 'Επιστροφή χρημάτων', { sail });
        await form.getByLabel('Ημερομηνία αίτησης').fill(formatAppianDate(new Date()));
        await sail.idle();
        await form.getByRole('button', { name: looseName('Υποβολή') }).click();
        await answerConfirm(page, 'confirm');
        await sail.idle();
        // oracle: platform rule P13
        await expectNoAppianError(page);
      });

      const supervisor = await openAs(browser, 'supervisor');
      try {
        await test.step('Supervisor gets the task and approves', async () => {
          await supervisor.page.goto(sitePagePath('case-management', 'my-tasks'));
          await supervisor.sail.idle();
          // oracle: codemap C12 approveCase: the review task is assigned to group «Supervisors»
          await proves('T:approveCase:clerk-supervisor', () => expect(supervisor.page.getByRole('link', { name: title })).toBeVisible());
          await supervisor.page.getByRole('link', { name: title }).click();
          await supervisor.sail.idle();
          await supervisor.page.getByRole('button', { name: looseName('Έγκριση') }).click();
          await supervisor.sail.idle();
          // oracle: codemap C12 approveCase review task; platform rule P13
          await proves('P:approveCase:review', () => expectNoAppianError(supervisor.page));
        });
      } finally {
        await supervisor.close();
      }

      await test.step('Clerk reads back the stored status (P15)', async () => {
        await page.goto(CASES);
        await sail.idle();
        // locator: observations/cases.md (record list search box)
        await page.getByRole('textbox', { name: looseName('Αναζήτηση') }).fill(title);
        await page.keyboard.press('Enter');
        await sail.idle();
        await page.getByRole('link', { name: title }).click();
        await sail.idle();
        // oracle: codemap C4 case status (APPROVED → «Εγκρίθηκε»)
        await proves('B:case:status:approved', () => expect(page.getByText('Εγκρίθηκε', { exact: true })).toBeVisible());
      });
    },
  );
});

// Negative security is its own family: it stops at the first step. One row per role class without access
// (from _roles.md), not one per login.
const NO_ACCESS = [{ key: 'approvals-access/clerk', role: 'clerk', covers: ['B:approvals:visible:else'] }];

for (const row of NO_ACCESS) {
  test.describe(() => {
    useRole(row.role);
    test(`negative: ${row.role} does not see the approvals page`, meta({ key: row.key, features: FEATURES, covers: row.covers }), async ({ page, sail }) => {
      await page.goto(sitePagePath('case-management', 'approvals'));
      await sail.idle();
      // oracle: codemap C10 page visibility (group «Supervisors» only), observations/_roles.md
      await proves('B:approvals:visible:else', () => expect(page.getByRole('heading', { name: 'Εγκρίσεις' })).toHaveCount(0));
    });
  });
}
```

Notes:
- **Register before you write**: every row's `key`, `role`, `role_class` and `covers` go to `node tools/ledger.mjs test add` first. Write only the rows it accepts, with exactly those keys.
- **`proves()` wraps the assertion that shows the outcome**: the fingerprint text, the element's presence or absence, the stored value on readback. Steps that only get you there stay outside it. A passing test that never proves one of its `covers` fails.
- `looseName()` is for labels whose exact DOM text you're unsure of (buttons especially, P1). When the observation file gives the exact DOM text, an exact string is fine.
- Create unique test data (`E2E ${Date.now()}`) so reruns don't collide, and so readback can find *this* run's record.
- Never `waitForTimeout`. If a wait is needed, it's `sail.idle()` or a web-first assertion.
- Run with `node tools/run.mjs <file>` (no `--reporter`, so the JSON report is written); it runs `node tools/ledger.mjs ingest` afterwards.
