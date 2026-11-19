---
description: Take one code branch (or any target id) through the whole pipeline — explore, spec, generate, heal, audit.
agent: Explorer Lead
---
Take this target through the full pipeline until it is `tested`, `blocked` or `bug_suspected`:

Target: ${input:target:e.g. B:search:empty-query:then}

If it isn't in the ledger yet, have the Cartographer add it first (both sides of the branch). Report each hand-off as it happens.
