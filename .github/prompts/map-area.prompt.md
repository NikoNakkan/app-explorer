---
description: Read the code map for a feature, area, screen or process and add every testable target to the ledger (features first, shared code once).
agent: Cartographer
---
Map this scope into the ledger: ${input:scope:feature id, area, screen or process name}

Import the features first if they aren't in the ledger yet. Then every outcome of every branch, loop cases over data, every validation message, every transition, each with its features, fingerprint and edge values. Shared code is mapped once. End with the counts per kind and per feature, the merged (shared) targets, the top 10 by priority, and the members still not in any target.
