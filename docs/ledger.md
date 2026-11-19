# Coverage ledger

`exploration/ledger.json` is the record of what should be tested, what is, and what changed. Change it **only** with `node tools/ledger.mjs` (run it with no arguments for help). It holds:

| Registry | What | Written by |
|---|---|---|
| **targets** | what should be tested: one per code element and outcome, with the features it belongs to | Cartographer, Explorer (status by everyone) |
| **features** | your code map's features (C17) and what changed in each import | Cartographer (`features import`) |
| **families** | one per sequence of test steps | Scenario Planner (`family add`) |
| **tests** | every test row: covers, role class, last result, status (`active`, `redundant`, `retired`) | Test Generator (`test add`), Auditor (`redundancy`) |
| **runs** | each ingested Playwright JSON report | whoever runs tests (`ingest`) |
| **roles** | the role classes: which logins see and may do the same things, overall and per feature where they merge | `/discover-roles` (`roles import`) |

How the families and rows are chosen: `docs/test-generation.md`.

## Target kinds and id prefixes

| Kind | Id pattern | Created by |
|---|---|---|
| `screen` | `S:<screen>` | Cartographer |
| `element` | `E:<screen>:<element>` | Cartographer |
| `branch` | `B:<screen or object>:<branch>:then` / `:else` / `:case-<n>` / `:default` | Cartographer (every outcome) |
| `loop` | `L:<screen or object>:<loop>:empty` / `:one` / `:many` | Cartographer (`forEach` over data) |
| `transition` | `T:<from>:<to>` | Cartographer |
| `url` | `U:<slug>` | Cartographer |
| `validation` | `V:<screen>:<field>:<rule>:shown` / `:not-shown` | Cartographer (both outcomes) |
| `process_step` | `P:<process>:<step>` | Cartographer |
| `integration` | `I:<feature>:<shared object>`, outcome `in:<feature>` | Cartographer (shared code used by another feature) |
| `observed` | `O:<screen>:<slug>` | Explorer (seen in the app, not in the code export) |

## Target fields

```json
{
  "id": "B:search:too-long:then",
  "kind": "branch",
  "title": "A query over 50 characters is rejected",
  "features": ["F12"],
  "ref": { "element": "<code element key from C17>", "members": ["<cons!MAX_QUERY key>", "<cons!SEARCH_TOO_LONG key>"], "screen_id": "…", "labels": [] },
  "outcome": "then",
  "fingerprint": { "text": "Έως 50 χαρακτήρες", "mode": "visible", "source": "cons!SEARCH_TOO_LONG" },
  "condition": "len(query) > cons!MAX_QUERY (50)",
  "preconditions": { "roles": ["clerk"], "inputs": { "query": "51 × α (edge: 50 / 51)" } },
  "expected": "message «Έως 50 χαρακτήρες», no search request",
  "priority": 1
}
```

- **`ref.element` + `outcome`** identify the target. Adding a target with the same element and outcome under another id **merges** it into the existing one (its id becomes an alias, features are combined). That's how shared code stays one target. So `branch`, `loop`, `validation` and `integration` targets that have a `ref.element` must have an `outcome` (`then`/`else`/`case-<n>`/`default`, `empty`/`one`/`many`, `shown`/`not-shown`, `in:<feature>`); `add` refuses them without one, because two outcomes of one element would otherwise merge.
- **`features`** is filled from the imported features automatically, plus any you give: every feature that contains the target's own code, its `ref.element`. `ref.members` don't add features: a message constant used by many features would otherwise pull the target into all of them. An `integration` target gets no automatic features, only the one it was written for.
- **`ref.members`**: other feature members this target uses, such as the constants in its fingerprint or boundary. A change to one of them flags the target (`code_changed`), and the report's "members not in any target" counts members that no target's `element` or `members` mention.
- Set by the CLI: `proofs` (from `ingest`), `tests` (from `test add`), `aliases`, `code_changed` / `code_removed` / `code_unresolved` (from `features import`).
- **Change signals** (`features import`): a member's `sig`; for a constant without a `sig`, a hash of its `value` (the value itself isn't stored), so a changed edge value or message flags its targets. An import **without** `--complete` can't tell a member that moved to a feature missing from the file from one that was removed: such targets get `code_unresolved`, and the next `--complete` import either clears it (moved) or sets `code_removed`. `code_removed` is cleared again if the code comes back.

## Status lifecycle

```
discovered → mapped → reached → specified → generated → tested
                 ↘         ↘          ↘           ↘
                  blocked · bug_suspected · spec_disputed · out_of_scope
```

| Status | Meaning | Set by | Next agent |
|---|---|---|---|
| `discovered` | in the code map, not yet seen live | Cartographer / Explorer | Explorer |
| `mapped` | element found on screen, locator verified | Explorer | Explorer |
| `reached` | condition triggered live, outcome observed | Explorer | Scenario Planner |
| `specified` | in a row of a spec under `specs/` | Scenario Planner | Test Generator |
| `generated` | a registered test row covers it; green and stable ×3 | Test Generator | Auditor |
| `tested` | passed the audit, with a proof | **Auditor only** | — |
| `blocked` | can't be reached; `--reason` says exactly what's missing | any | human |
| `bug_suspected` | app contradicts the code map or errors | Explorer / Healer | human |
| `spec_disputed` | spec and app disagree; unclear which is right | Planner / Healer | human |
| `out_of_scope` | deliberately skipped | human / Lead | — |

The CLI refuses:
- moving a target backwards along the main line without `--force`
- `--force` without a `--note` (or `--reason`) saying why
- `blocked` without `--reason`
- `generated` when no registered test row covers the target
- `tested` from anyone but `--by Auditor` (even with `--force`), or without a **proof**: an active row that called `proves('<id>', …)` and passed 3 times out of 3 in an ingested run

## Commands

Every command below works the same in PowerShell, cmd and bash. JSON input always goes through a file (`--file`), usually in `exploration/inbox/`: `--json '…'` works in bash, but Windows PowerShell 5.1 strips the double quotes inside it. Write those files with the editor tool, not with PowerShell redirection (`>`, `Out-File`, `Set-Content`), which in Windows PowerShell 5.1 writes UTF-16 or a BOM and garbles Greek text.

```text
# targets
node tools/ledger.mjs init
node tools/ledger.mjs add --file exploration/inbox/F12.json --by Cartographer
node tools/ledger.mjs frontier --feature F12 --limit 10
node tools/ledger.mjs show B:search:too-long:then
node tools/ledger.mjs set B:search:too-long:then reached --by Explorer --note "message shown" --artifact exploration/artifacts/x.png
node tools/ledger.mjs set E:search:export blocked --by Explorer --reason "needs a login in group 'Exporters'"
node tools/ledger.mjs note B:search:too-long:then --by Auditor --note "audit fail #2"

# features (C17)
node tools/ledger.mjs features import --file exploration/inbox/features.json --complete --by Cartographer
node tools/ledger.mjs features                 # coverage per feature
node tools/ledger.mjs feature F12              # open targets, failing tests, changed code, unmapped members
node tools/ledger.mjs changed                  # features whose code changed since their own rows last ran (node tools/run.mjs --changed reruns them)

# role classes (from /discover-roles)
node tools/ledger.mjs roles import --file exploration/inbox/roles.json --by Explorer
node tools/ledger.mjs roles                    # list them

# families and rows (search-query.family.json: {"key":"search-query","spec":"specs/search/search-query.md","area":"search",
#                                             "skeleton":["open:S:search","fill:E:search:query","click:E:search:submit"]})
node tools/ledger.mjs family check --file exploration/inbox/search-query.family.json   # also notes steps that aren't ledger targets
node tools/ledger.mjs family add --file exploration/inbox/search-query.family.json --by "Scenario Planner"
node tools/ledger.mjs family show search-query
node tools/ledger.mjs test add --file exploration/inbox/search-query.rows.json --by "Test Generator"
node tools/ledger.mjs test list --feature F12

# runs
node tools/run.mjs tests/search/search-query.spec.ts --repeat-each=3 --by "Test Generator"   # runs ingest too; no --reporter
node tools/ledger.mjs ingest --by "Test Generator"   # only after a plain `npx playwright test …`
node tools/ledger.mjs redundancy                # then --apply --by Auditor

node tools/ledger.mjs stats
node tools/ledger.mjs report                    # writes exploration/coverage.md, by feature
node tools/ledger.mjs validate
```

Row batch for `test add` (one object per row):

```json
[{ "key": "search-query/empty", "file": "tests/search/search-query.spec.ts", "title": "an empty query is rejected",
   "role": "clerk", "role_class": "staff", "covers": ["B:search:empty:then", "V:search:query:required:shown"] }]
```

**Role classes.** `/discover-roles` writes them to `exploration/inbox/roles.json` and imports them:

```json
{ "classes": { "staff": ["clerk", "clerk2"], "supervisors": ["supervisor"], "read-only": ["viewer"] },
  "features": { "F12": { "everyone": ["clerk", "clerk2", "supervisor", "viewer"] } } }
```

The logins are the role names from `ROLES` in `.env`; a login belongs to one class (per feature, too). `features` is optional: it lists the classes of a feature where they merge, because that feature checks fewer groups. Once classes are imported, `test add`:
- fills in a missing `role_class` from the row's login, and for a cross-role journey adds the family's hand-offs (`switch-role:<class>` steps), e.g. `staff>supervisors`
- refuses a row whose class doesn't contain its login, a class that doesn't exist (overall or in one of the row's features), or a journey's class sequence that doesn't match the family's hand-offs

So two logins of one class get the same class, and a second row for the same targets is refused as a duplicate. Without imported classes, a row with no `role_class` counts its login as its own class (`test add` prints a note), and only the journey check applies.

**`changed`** measures each feature from its own rows: a feature stays listed until every active row of it has run after its code changed, so a run of a few rows (or of another feature) doesn't hide it. A feature with no rows is measured from the last run. `--since <date>` measures every feature from that date instead.
