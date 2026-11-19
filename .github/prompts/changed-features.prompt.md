---
description: After a new export. Re-import the features, find what changed, rerun only the affected tests, re-verify changed targets and map new code.
agent: Explorer Lead
---
A new export of the application is in the code map. Find what changed and re-verify only that.

1. **Re-import features**: have the Cartographer run section 0 of its procedure with `--complete` (`features import`). Its output lists added, removed and changed members per feature.
2. **What changed**: `node tools/ledger.mjs changed` (features whose code changed since their own tests last ran; add `--since <date>` if I give one). Show me the list before running anything.
3. **Rerun the affected features' tests**: `node tools/run.mjs --changed --by "Explorer Lead"`. It runs only the features `changed` lists (nothing at all if the list is empty), then `ingest`.
   - failing rows → Test Healer (a changed branch may be an intended change: `SPEC_WRONG`, not a locator fix)
   - passing rows re-prove their targets, so those are no longer flagged as changed
4. **Changed targets no test covers yet** (`node tools/ledger.mjs feature <id>`, "code changed since its last proof") → Explorer.
5. **New members** → Cartographer, then the normal pipeline. **Removed code**: list the targets under "Code removed from the export" for me to confirm as `out_of_scope`; don't change them yourself.

Report per feature: what changed in the code, which tests were rerun and their results, regressions, new targets added, and what still needs re-verification.
