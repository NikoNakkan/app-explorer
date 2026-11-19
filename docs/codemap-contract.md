# Code-map MCP contract

The agents never guess tool names on the code-map server. They ask for a **capability** (C1–C18), and this file says which real tool provides it. Fill in the mapping table at the bottom, or let the `bootstrap` prompt fill it from your server's tool list.

The MCP server must be registered as **`codemap`** in `.vscode/mcp.json`, because the agents' `tools:` lists reference `codemap/*`. If you name it differently, rename it in all `.github/agents/*.agent.md` files.

> The export is partial: the app also uses interfaces and components that aren't in it. Every capability may return "not found" for things that really exist on screen. Agents treat that as *unmapped*, not as an error.

## Capabilities

Field names are the **meaning** the agents need. Your tool's field names can differ; describe the mapping in the table below.

### C1: Find screens · *required*
- **In:** free text, a URL/route, or a screen title
- **Out:** list of `{ screen_id, name, route_or_url?, source_file?, process? }`
- **Used by:** Cartographer, Explorer (to identify the current page from its URL)
- **Fallback:** C7 search on the text, then group hits by file

### C2: Screen elements · *required*
- **In:** `screen_id`
- **Out:** list of `{ element_id, type (button/input/select/link/grid/tab/...), dom_id?, dom_name?, test_id?, label_key?, label_text?, visible_if?, enabled_if?, handler? }`
- **Used by:** Cartographer, Explorer (reconciling the screen), Generator
- **Fallback:** none. Without C2 the Explorer can only work from the snapshot, and every element will be "unmapped"

### C3: Strings / labels · *strongly recommended*
- **In:** `screen_id` or `label_key`
- **Out:** `{ key, texts: { el?: string, en?: string, ... }, transform_hint? (e.g. "uppercase") }`
- **Used by:** Explorer (fallback ladder step 3), Generator
- **Why it matters:** this is the capability that would have found «Αναζήτηση» when the screenshot showed «ΑΝΑΖΗΤΗΣΗ»
- **Fallback:** `label_text` from C2

### C4: Branches (`if` blocks) · *required*
- **In:** `screen_id` or `handler` / function name
- **Out:** list of `{ branch_id, condition_text, variables[], file, line, then_effect, else_effect, related_messages? }`
- **Used by:** Cartographer (creates both outcomes as targets), Scenario Planner (boundary values)
- **Fallback:** none. This is the main reason the system exists

### C5: Transitions / navigation · *recommended*
- **In:** `screen_id`
- **Out:** list of `{ from_screen, to_screen, trigger_element_id?, condition? }`
- **Used by:** Cartographer, Explorer (how to reach a screen without a direct URL)
- **Fallback:** C8 URLs plus the Explorer finding its way through the menus

### C6: Process models · *optional*
- **In:** process name or id
- **Out:** ordered `{ step, screen_id, actor_role?, condition? }`
- **Used by:** Cartographer (`process_step` targets), Scenario Planner (end-to-end scenarios)

### C7: Full-text search · *required*
- **In:** text (any case or accents. Ideally the server normalises, otherwise agents call it twice: as seen and lower-cased)
- **Out:** hits `{ kind (screen/element/string/branch/url), id, screen_id?, snippet }`
- **Used by:** everyone. It's the reverse lookup from "I see this text" to "this is where it's defined". When the hit is a string constant, its uses tell which branch shows it, and C17 tells which feature that is (a **fingerprint**)

### C8: URLs and endpoints · *recommended*
- **In:** `screen_id` (or none for all)
- **Out:** list of `{ url_or_route, method?, kind (page/api), params? }`
- **Used by:** Explorer (direct navigation, watching network calls), Generator (`waitForResponse`)

### C9: Validations · *recommended*
- **In:** `screen_id` or field
- **Out:** list of `{ field, rule, message_key, message_text }`
- **Used by:** Cartographer, Scenario Planner (negative tests), Generator (exact expected messages)
- **Fallback:** C4 branches whose effect is a message

### C17: Features · *strongly recommended*
- **In:** nothing (list all), a feature id, or a member key / text (reverse lookup: which features contain it)
- **Out:** `{ feature_id, name, members: [{ key, kind, name, value?, sig? }] }`
  - `key`: a member id that stays the **same between exports** (for a branch: the object's UUID plus its position in the expression)
  - `kind`: screen, interface, rule, constant, branch, loop, validation, process, record_type, …
  - `value`: for constants (the text a string constant shows, the number a number constant holds)
  - `sig`: anything that changes when the member's code changes (hash, version, the condition text). Without it, only added and removed members are detected
- **Used by:** Cartographer (targets per feature; `ledger.mjs features import`), Explorer (which feature a text on screen belongs to), Scenario Planner (a family's features), Explorer Lead (feature rounds), coverage report (per feature)
- **Fallback:** the Cartographer uses pseudo-features `area:<area>` (site page, record type or process). Reports still group by them, but code changes between exports can't be tracked

### C18: Feature changes between exports · *optional*
- **In:** two export versions (or "previous vs current")
- **Out:** `{ feature_id, added[], removed[], changed[] }` (member keys)
- **Used by:** `/changed-features`
- **Fallback:** not needed when C17 returns `sig`: `features import` compares each import with the previous one itself, and `ledger.mjs changed` lists the result. Without either, ask the user which features changed

## Mapping to your server

| Cap | Your tool name | Argument mapping | Output field mapping | Status |
|---|---|---|---|---|
| C1 | | | | TODO |
| C2 | | | | TODO |
| C3 | | | | TODO |
| C4 | | | | TODO |
| C5 | | | | TODO |
| C6 | | | | TODO |
| C7 | | | | TODO |
| C8 | | | | TODO |
| C9 | | | | TODO |
| C10 roles/security matrix | | | | TODO |
| C11 record types | | | | TODO |
| C12 process paths | | | | TODO |
| C13 external references | | | | TODO |
| C14 oracle catalogue | | | | TODO |
| C15 data boundaries | | | | TODO |
| C16 environment-specific values | | | | TODO |
| C17 features | | | | TODO |
| C18 feature changes between exports | | | | TODO |

Status values: `OK`, `PARTIAL (what's missing)`, `MISSING (fallback used)`.

## Appian capabilities (C10–C16)

The app is an Appian application. Beyond C1–C9 and C17–C18, the agents use these capabilities when your MCP provides them. Each one has a live fallback, so nothing blocks if it's missing.

| Cap | What the agents ask for | Used by | Live fallback when missing |
|---|---|---|---|
| C10 Roles and security | Which groups grant which pages, record actions, process starts and `showWhen` conditions (e.g. `a!isUserMemberOfGroup(…, <group>)`, page visibility, action security) | Cartographer, Planner, `/discover-roles` | `/discover-roles` infers group membership per login from what each login can see (`_roles.md`) |
| C11 Record types | URL stub, list (columns, search, user filters), views (stub, security), record actions (list/related, process model, security, dialog/tab) | Cartographer, Explorer | Treat record lists, views and actions as screens and elements found live |
| C12 Process paths | Paths through each process model: user input tasks with assignee group, chained or not, gateway conditions | Cartographer, Planner | Follow the process live, one form at a time, and record the hand-offs |
| C13 External references | References from an object to objects **not in the export** (`in_export: false`) | Explorer, Cartographer | Trust the live snapshot for those parts of the screen; record them as `observed` |
| C14 Oracles | Expression-rule test cases (inputs + expected output), validation/required/confirmation messages | Planner | C9 messages only |
| C15 Data boundaries | Field types and lengths (CDT / record fields) | Cartographer, Explorer | Probe lengths live (e.g. type 256 / 4001 characters and observe) |
| C16 Environment-specific values | Constants and connected-system settings set per environment (import customization file) | Planner | Use the observed value as the oracle and ask a human to confirm |

**Reading raw definitions.** If your MCP returns expressions as stored in the export, they contain internal forms: `#"SYSTEM_SYSRULES_gridColumn"(` means `a!gridColumn(`, `#"<uuid>"(` is a call to another object by UUID, and `#"urn:appian:record-type:v1:<uuid>"` / `…record-field:v1:<type>/<field>` are record references. The full table is in `docs/appian/platform-knowledge.md` §8. Agents decode these forms when reasoning and keep the UUIDs in `ref`.
