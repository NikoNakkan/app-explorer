Batches written by the agents before they're imported into the ledger. Files can be deleted after import.

| File | Written by | Imported with |
|---|---|---|
| `features.json` | Cartographer (C17 features, normalised) | `node tools/ledger.mjs features import --file exploration/inbox/features.json --complete --by Cartographer` |
| `<feature or area>.json` | Cartographer (targets, a JSON array) | `node tools/ledger.mjs add --file exploration/inbox/<feature or area>.json --by Cartographer` |
| `roles.json` | Explorer in `/discover-roles` (role classes: `{"classes":{…},"features":{…}}`) | `node tools/ledger.mjs roles import --file exploration/inbox/roles.json --by Explorer` |
| `observed-<screen>.json` | Explorer (`observed` targets) | `node tools/ledger.mjs add --file exploration/inbox/observed-<screen>.json --by Explorer` |
| `<family>.family.json` | Scenario Planner (`{"key","spec","area","skeleton"}`) | `node tools/ledger.mjs family check --file …`, then `family add --file … --by "Scenario Planner"` |
| `<family>.rows.json` | Test Generator (test rows) | `node tools/ledger.mjs test add --file exploration/inbox/<family>.rows.json --by "Test Generator"` |

Write these files with the editor (UTF-8). JSON goes through files rather than `--json '…'` because Windows PowerShell 5.1 strips the quotes inside `'…'`.
