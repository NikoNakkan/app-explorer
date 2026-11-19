---
description: Run one exploration round from the ledger frontier, optionally limited to a feature or area.
agent: Explorer Lead
---
Run one exploration round.

Feature or area: ${input:scope:feature id or area; leave empty for the whole app}

Follow your round procedure, end with `node tools/ledger.mjs report`, and give me the round summary, including coverage per feature and "Needs from a human".
