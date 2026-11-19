# Appian screen checklist (Explorer, Generator, Healer)

Run this on every screen you explore, every time. Each line either creates or updates a ledger target, or produces evidence in the observation file. Rule numbers (P1…) refer to `platform-rules.md`.

## A. On arrival

1. **Settle.** Wait for SAIL to go idle (no requests to `/suite/…` in flight) and for **no placeholder skeletons** to be showing (P9).
2. **Errors.** Look for an Appian error box (P13). If there is one, take a screenshot, add the target or note, set `bug_suspected`, and copy the exact error text and evaluation id.
3. **Where am I?** Note the page type: site page, page in a page group, record view (which view stub), record action dialog, task, start form, or portal. Record the URL shape (§4 of the knowledge file).
4. **Who am I?** Note the role (storage state) on every observation (P16).
5. **Reveal hidden UI before reconciling:**
   - expand every collapsible section and box (P4)
   - open every record action menu and overflow menu (P7)
   - open the site's page groups and the user menu
   - click through tabs, record view tabs and wizard steps (reading only, no submits)
   - check iframes for plug-in components (P8)
6. **Reconcile** the snapshot with C2/C3 (code-map elements and strings). Button names follow P1. Anything unmatched goes through one C7 search, then becomes an `observed` target.
7. **Language:** with a Greek user (P14), any non-Greek label that the code map shows as a `translation!` string with an `el` value is a **missing-translation finding**. English *system* text in a Greek session is also a finding.

## B. For each input field

| Check | How | Expected source |
|---|---|---|
| Required | Clear it, press the submit/validate button that covers its `validationGroup` | `requiredMessage` from C2, otherwise the system default (record its Greek text once) |
| Each validation | Values just inside and just outside each rule's boundary (C9) | Message text from C9 |
| Max length | `length` from the CDT/record field (C15) and length + 1 | DB/CDT limit, or a validation |
| Dropdown choices | Open it and compare the list with the code-map `choiceLabels` (static lists); more than 11 choices means a search box | C2 |
| Date | Accepted format (P6), past/future limits, empty | C9/C4 |
| Picker | A search that matches, one that matches nothing, and selection | Behaviour |
| `disabled` / `readOnly` conditions | Make the condition true and false (C4) | C4 |
| `showWhen` | Make it true and false. False means absent (P3) | C4 |
| File upload | Upload a small allowed file, a disallowed extension, and one over the size limit (if a validation exists); remove it again. Use tiny fixture files only | C9 / behaviour |
| AI components (chat field, AI skills) | Only check that they load and accept input. Mark exact-output targets `out_of_scope` (non-deterministic) | — |

> **Environment-specific expectations:** if an expected value comes from a constant marked `⚠ env-specific` (C16, Import Customization File), the export's value may be wrong for this environment. Use the **observed** value as the oracle, and add a note asking a human to confirm it.

## B2. For each grid or record list

| Check | How |
|---|---|
| Loads | Rows appear (wait for async content, P9). Note the empty-state text when there are none |
| Paging | Next/previous change the rows. The paging text (localised) matches the counts |
| Sorting | Clicking a sortable header reorders the rows (check the first row before and after) |
| Search box (record lists) | A term that matches, one that doesn't, and clearing it |
| User filters (record lists) | Each filter option narrows the rows. Combining filters works. Reset works |
| Selection | Selecting rows enables the buttons that depend on the selection (C4 conditions) |
| Row links and actions | Each link or record action in a row opens the right record or form |
| Export (if enabled) | The export button exists for the right roles. Don't assert file contents unless asked |

## C. For each button

1. **Kind:** does it submit (`submit: true`), validate only, or just save values? (C2)
2. **Validation group:** only the fields in its group should block it. Check that a field *outside* the group does **not** block it.
3. **Confirmation:** if there's a `confirmMessage`, open the dialog, **cancel** first (nothing should change), then confirm (P12).
4. **Where it goes:** after it succeeds, record what follows: a chained next form (P10), a return to the site page, a dialog closing with a refresh (P7), or a new tab. Note any **message banner** ("saved", "submitted"). Some banners are only announced to screen readers and are visible only in the accessibility snapshot, not on screen.
5. **Readback (P15):** reopen the affected record or grid as the same role and check the stored values.

## D. For each branch target (`if`, `a!match`, `choose`, `showWhen`, `disabled`, `required`)

- Cover **both outcomes** (`:then` and `:else`, every `a!match` case, every `choose` index).
- **Role conditions** (`a!isUserMemberOfGroup`, group constants): run once as a role that satisfies the condition and once as one that doesn't.
- **Comparison conditions:** cover the boundary (value − 1, value, value + 1) on the same side the code compares.
- **Null conditions** (`a!isNullOrEmpty`, `isnull`): empty, whitespace, and a real value.

## E. For each record action

1. **Visibility:** which roles see it in the list, the record view, or the menu (C11 security).
2. **Access:** click it, because with MENU styles security is checked on click (P7). Unauthorised roles must be denied.
3. **Form flow:** dialog or tab, a start form, chained tasks, and the refresh after submit.
4. **Readback.**

## F. For each process scenario (C12)

1. Start: the action, a record action, or a start-process link, as the initiator role.
2. Every user input task on the path: **who** gets it (role), **where** it appears (chained, task list, or site report), Accept when it's a group task.
3. Every gateway branch reached once, with the data that drives it. (Branches whose steps are the same become rows of one family; paths with different steps become separate families.)
4. The end state: a record status changed, a new record, a message. Verify by readback.
5. A negative check: the task must **not** be visible to roles outside its assignment.

## G. Security sweep, once per area and role

- Pages missing from the menu: open them by direct URL as this role, and expect "no access" behaviour.
- A record that shouldn't be visible to this role: open it through a URL captured as a role that *can* see it. Expect it to be denied.
- Hidden actions stay hidden, and disabled ones stay disabled.

## H. Recording

- Every finding gets a ledger update (`set` or `note`) and a line in the observation file.
- Anything that holds beyond this app goes through the promotion gate into `platform-rules.md`. Everything else goes into `exploration/rules.md`.
