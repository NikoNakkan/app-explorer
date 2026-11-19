# How tests are generated: features, families, rows

The goal: **every target proven once, by as few tests as possible, and no test that proves nothing new.** The ledger CLI enforces most of this; the rules below say how to plan so it never has to refuse.

## Terms

| Term | Meaning |
|---|---|
| **Feature** | A group of code your code map found in the export (C17): screens, interfaces, rules, constants, `if` / `forEach` blocks, processes. Imported with `ledger.mjs features import`. |
| **Target** | One code element plus one outcome: an `if` gives `then` and `else`, a `forEach` over data gives `empty` / `one` / `many`, a validation gives `shown` / `not-shown`. A target lists **every** feature that contains its code. |
| **Shared code** | A member that belongs to several features (a common interface or rule). It is **one** target, tested once and counted in each feature. Each other feature gets one `integration` target: "the shared part works here" (outcome `in:<feature>`, so these don't merge). |
| **Fingerprint** | What on screen proves an outcome happened. Usually the text of a string constant that the branch shows (`visible`) or hides (`absent`). |
| **Family** | All test cases that take the **same steps**: the same actions on the same elements, in the same order, with the same hand-offs between roles (`switch-role:<role class>` steps). One family = one spec file = one test file. |
| **Row** | One case of a family: its input data and role. Rows differ only in data or role. |
| **Equivalence class** | All inputs that drive the code down the same outcomes. One row per class is enough. |
| **Role class** | Logins that see and may do the same things in a feature (from `exploration/observations/_roles.md`, imported into the ledger with `roles import`). One row per role class, not per login. A cross-role journey's row has the sequence as its role class, e.g. `staff>supervisors`. |
| **Proof** | A passing `proves(id, …)` assertion in a test run, read back by `ledger.mjs ingest`. Only proofs count as coverage. |

## The pipeline

1. **Cartographer:** features (C17) → targets, one per code element and outcome, with features, fingerprints (from string constants), boundaries (from number constants) and loop cases (from `forEach`). Shared code is mapped once.
2. **Explorer:** reaches each target live, checks its fingerprint, records verified locators.
3. **Scenario Planner:** groups reached targets by their steps into families and picks the rows (below). Checks for an existing family first (`family check`), registers new ones (`family add`).
4. **Test Generator:** registers the rows (`test add`, which refuses duplicates), writes one parametrized test per family with `meta()` and `proves()`, runs it ×3, then `ingest`.
5. **Test Healer:** fixes one failing row at a time, within its allowed fix classes.
6. **Auditor:** checks the tests, runs `redundancy`, and promotes targets to `tested`. The CLI only allows this with a proof.

## Choosing rows (Scenario Planner)

For each family:

1. **List the targets** its steps can reach (same screen, same entry, same actions).
2. **Derive the classes from the code**, not from intuition:
   - `if`, `a!match`, `choose`, `showWhen`, `required`, `disabled`: each outcome is a class.
   - **comparison with a number** (often a number constant: `len(query) > cons!MAX_QUERY`, MAX = 50): **two rows**, the last value with one outcome (50) and the first with the other (51). A third value on the same side is a duplicate.
   - **dates**: the same rule, with the dates on either side of the edge (e.g. today and tomorrow).
   - **`forEach` over data**: empty, one, many, but only the cases the data can actually produce.
   - **text fields**: empty, at the maximum length, over it (C15).
   - **roles**: one row per role class that the feature's conditions tell apart.
   - Alphabet, accents, upper/lower case and similar variations are **not** classes unless the code or an observation shows they behave differently. If they do, add a target for that behaviour first (kind `observed`, with the evidence), and the row proves it.
3. **Combine:** one row can meet several outcomes (a valid input takes every `else`). Use the fewest rows such that every target is proven by some row.
4. **Every row must prove at least one target that no other row with the same role class proves.** A case that proves nothing new goes under "Not added" in the spec, with the row it duplicates. This rule is yours to keep: the ledger only catches a row that **one** other row already covers (below), not a row whose targets two or more other rows cover between them.
5. **Different steps, different family.** A negative security case (a role that must not get in) usually stops at the first step, so it's its own small family with one row per role class. A journey that hands over to a different role class is a different family too: the hand-off is a `switch-role:<role class>` step in its skeleton.

## What the ledger refuses

| When | Command | Refuses |
|---|---|---|
| Planner registers a family | `family add` | the same steps as an existing family (add rows to that spec instead). It also notes steps whose element isn't a ledger target: a misspelt step would make the family look new |
| Generator registers rows | `test add` | a row with the **same targets** and role class as another row (duplicate); a row whose targets one other row **already proves** (subsumed). A row covered only by several rows together is accepted |
| Generator registers rows | `test add` | once role classes are imported (`roles import`, from `/discover-roles`): a role class that doesn't contain the row's login, or that doesn't exist. Always: a journey's class sequence that doesn't match the family's `switch-role` steps. A missing class is filled in from the login |
| Generator marks a target `generated` | `set … generated` | a target that no registered row covers |
| Auditor promotes | `set … tested` | a target without a proof from a run that passed 3 times out of 3 |
| Marking rows redundant | `redundancy --apply` | anyone but the Auditor |

And while the tests run:
- `proves(id, …)` throws if `id` isn't in the row's `covers`.
- A passing test that claims a target in `meta()` but never proves it **fails** (the `coverageGuard` fixture).

`--force --reason "…"` exists for a human-approved exception. A forced row is never marked redundant.

## Duplicates found after running

`node tools/ledger.mjs redundancy` compares what each passing row **actually proved** (from the last ingested run), not what it claims. A row is redundant when **one** other row with the same role class proved everything it proved. The row that proves more is kept (on a tie, the faster one).

It deliberately never flags a row whose proofs are only covered by two or more other rows together (rows `x+y`, `y+z` and `x+z`: each is covered by the other two, none is flagged). Every finding names the one row that replaces it, so a human can check it by comparing two rows. Spotting the "covered by several rows" case is the Scenario Planner's job when choosing rows, and the Auditor's when reading the rows of a family.

`redundancy --apply --by Auditor` marks them. Redundant rows **stay in the repo**, but `playwright.config.ts` skips them. `node tools/run.mjs --redundant` runs them anyway, `test reactivate <key> --reason "…"` undoes the mark, and the coverage report lists them as "safe to delete after review". Deleting a row from a file is a human decision; afterwards, `test retire <key> --reason "…"`.

## Running

`tools/run.mjs` runs Playwright and then `ingest`, and works the same in PowerShell, cmd and bash. Options it doesn't know (files, `-g`, `--repeat-each`, `--trace`) go to `playwright test` unchanged.

| Command | Runs |
|---|---|
| `node tools/run.mjs` | every app test except redundant rows |
| `node tools/run.mjs --features F12,F7` | only the tests of those features (tags from `meta()`) |
| `node tools/run.mjs --changed` | the features whose code changed since their own rows last ran (a feature stays listed until all its rows have run again); nothing at all if none did |
| `node tools/run.mjs --redundant` | everything, including redundant rows |
| `node tools/run.mjs <file> --repeat-each=3 --by Auditor` | the stability run the Auditor's promotion needs |

`npx playwright test …` followed by `node tools/ledger.mjs ingest` does the same by hand. After **every** run, `ingest`. Don't pass `--reporter` (`run.mjs` refuses it): a reporter flag replaces the config's JSON reporter, which `ingest` reads.

Don't write `FEATURES=F12 npx playwright test` or `$(…)`: those are bash forms, and on Windows VS Code's terminal (and so the agents' terminal) is PowerShell, where they fail.

## Features when the code map has none

If C17 isn't available, the Cartographer gives targets the pseudo-feature `area:<area>` (a site page, record type or process). Reports still group by it; it just can't track code changes between exports.

## A family in code

The full template, with Appian helpers and a cross-role journey, is `docs/appian/test-pattern.md`. The shape:

```ts
const ROWS: Row[] = [
  { key: 'search-query/empty', name: 'an empty query is rejected', query: '', covers: ['B:search:empty:then'],
    verify: async page => {
      // oracle: codemap C9 V:search:query:required:shown
      await proves('B:search:empty:then', () => expect(page.getByText('Συμπληρώστε κριτήριο')).toBeVisible());
    } },
  // … one row per equivalence class
];

for (const row of ROWS) {
  test(row.name, meta({ key: row.key, features: FEATURES, covers: row.covers }), async ({ page, sail }) => {
    // the family's shared steps, using row.query
    await row.verify(page);
  });
}
```
