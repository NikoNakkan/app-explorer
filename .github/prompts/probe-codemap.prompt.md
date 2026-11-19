---
description: Find out what the code-map MCP can actually do (UUID→name resolution, external references, accent-insensitive search, translations, Appian branch forms, groups, processes, records, sites, features and their changes) and fill the contract table with evidence.
agent: Cartographer
---
Probe the code-map MCP (`codemap/*`) and record what it really returns, so every agent knows which capabilities to rely on and which live fallbacks to use (`docs/codemap-contract.md`).

Run each probe, keep the raw result short, and judge it **OK / PARTIAL / MISSING**:

| # | Probe | How | OK means |
|---|---|---|---|
| 1 | Tool inventory | List the `codemap` tools with their parameters | — (fill the C1–C18 mapping columns) |
| 2 | Names vs UUIDs | Fetch an interface that calls other rules or interfaces | references come back with **names** (or are resolvable to names with another call) |
| 3 | External references | Find a reference whose target the MCP can't return (an object outside the export) | it's shown and marked external, not silently dropped |
| 4 | Accent/case search | Search a button label three ways: as shown on screen in capitals (e.g. `ΑΝΑΖΗΤΗΣΗ`), lowercase without accents (`αναζητηση`), and as written (`Αναζήτηση`) | all three find the same objects |
| 5 | Translations | Fetch a label that uses `translation!` (if the app uses translation sets) | the Greek (and other) values are returned |
| 6 | Appian branch forms | Fetch an interface that uses `a!match`, `choose` or `showWhen` | each form comes back as a branch with its condition |
| 7 | Group checks | Fetch an object that contains `a!isUserMemberOfGroup` (directly or through a rule) | the group is identified by name |
| 8 | Processes | Fetch a process model | nodes, assignments and gateway conditions are returned |
| 9 | Record types | Fetch a record type | actions, views and security are returned |
| 10 | Sites | Fetch a site | pages with web addresses and visibility are returned |
| 11 | Raw export forms | Fetch a definition that originally contains `#"SYSTEM_SYSRULES_…"`, `#"<uuid>"(` or `urn:appian:record-…` tokens (see `docs/appian/platform-knowledge.md` §8) | they come back decoded (`a!gridColumn`, `rule!<name>`, `recordType!<name>`), or at least with names alongside the UUIDs |
| 12 | Version | Ask for the Appian version of the export (its `MANIFEST.MF`) | the version is returned |
| 13 | Features | List the features, then fetch one with its members | each member has a stable `key`, a `kind` (branch, constant, loop, screen, …) and a `name`; constants come with their `value` |
| 14 | Feature reverse lookup | Ask which features contain one shared interface or rule, and which contain a string constant found by C7 | every feature that uses it is returned (this is how shared code and fingerprints are found) |
| 15 | Feature changes | Ask whether members carry a content hash / version (`sig`), or whether two exports can be compared | changes between exports are detectable (C17 `sig` or C18) |

Then:
1. Fill the "Mapping to your server" table in `docs/codemap-contract.md` (tool name, argument mapping, output fields, status) for C1–C18.
2. Write `exploration/observations/_codemap-probe.md`: the probe table with results and short raw excerpts.
3. Reply with the **top 5 gaps**, ordered by how much they block testing. For each, name the live fallback the agents will use meanwhile.
