---
description: Work out which Appian groups each test login belongs to, plus its language and time zone, by observing the live app. Use when group membership is unknown.
agent: Explorer
---
We don't know yet which Appian groups our test logins belong to. Work it out by observation and evidence. **Read-only:** don't change any settings, and don't submit anything.

1. **What the app checks.** Collect every group condition from the code map:
   - C10 (roles and security), or C4 branch conditions containing `a!isUserMemberOfGroup`, including rules that wrap such a check (follow the call one level down)
   - page and page-group visibility on site pages (C1/C8), record action security (C11), process start rights (C6/C12)
   List each group with the **observable evidence** it controls: a page in the menu, a button, a record action, a section.
2. **For each login in `ROLES`** (`browser_set_storage_state { filename: ".auth/<role>.json" }`):
   - snapshot the site navigation: pages, page groups, Tempo link
   - open the user menu → settings, **read only**: language and time zone. If settings aren't reachable, infer the language from the system text (menu items, "Sign out", paging, required-field messages)
   - for each group from step 1, visit its evidence and note **present / absent**
3. **Infer membership** for each login × group:
   - `✓` the group-gated evidence is present, and no other condition explains it
   - `✗` it's absent, even though the other conditions in the same expression are met (data, record state)
   - `?` can't tell: the evidence also depends on data or state you couldn't control, or it lives outside the export
   Cite the evidence for every cell (screen and element).
4. **Write** `exploration/observations/_roles.md`:
   - a matrix (logins × groups) with ✓ / ✗ / ? and evidence
   - each login's language and time zone (P14). A login whose language isn't Greek is an **environment issue**: report it, don't fix it
   - **coverage gaps**: groups that no login belongs to. Branches gated by those groups can't be tested until someone provides such a login
   - **role classes**: logins with identical ✓/✗ for every group the app checks form one class. Name each class (e.g. `staff`, `read-only`) and list its logins. If C17 is mapped, also note per feature where classes merge, because that feature checks fewer groups. Test rows are planned per role class, not per login, so two logins in one class never get duplicate tests
4b. **Import the classes into the ledger.** Write them with your editor to `exploration/inbox/roles.json`, using the role names from `ROLES` as logins: `{"classes": {"<class>": ["<login>", …]}, "features": {"<feature id>": {"<class>": ["<login>", …]}}}` (`features` only for the features where classes merge). Then run `node tools/ledger.mjs roles import --file exploration/inbox/roles.json --by Explorer`. From then on `test add` fills in each row's role class from its login and refuses a class that doesn't fit, so the duplicate check works across logins. Re-import whenever `_roles.md` changes.
5. **Ledger:** for every target whose `preconditions.roles` was empty and is now known, add a note (`node tools/ledger.mjs note <id> --by Explorer --note "role: <login>"`). Mark targets that need a missing group `blocked --reason "needs a login in group <name>"`.

Finish with the matrix, the language of each login, and the list of logins we still need. That list is the question for whoever administers the environment.
