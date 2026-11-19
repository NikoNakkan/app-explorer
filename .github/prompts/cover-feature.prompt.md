---
description: Take one feature from the code map through the whole pipeline (map, explore, plan families, generate, heal, audit) until every target is tested, blocked or flagged.
agent: Explorer Lead
---
Cover this feature end to end: ${input:feature:feature id from the code map, e.g. F12}

1. `node tools/ledger.mjs feature <id>`. If the feature isn't imported, or members are not in any target, have the Cartographer map it first (shared code is mapped once).
2. Run rounds limited to this feature (`frontier --feature <id>`) until no target is left in `discovered`, `mapped`, `reached`, `specified` or `generated`, or three rounds pass without progress.
3. The Scenario Planner plans **families** for the feature (`docs/test-generation.md`): one per sequence of steps, with one row per equivalence class and role class. No row may repeat what another row proves.
4. After the Auditor: `node tools/ledger.mjs redundancy`, then `node tools/ledger.mjs feature <id>`.

Report: the feature's coverage before → after, its families and rows, what is `tested`, what is blocked and what it needs, suspected bugs, rows refused or marked redundant, and members still not in any target.
