# Appian platform knowledge (25.x – 26.x)

Reference for every agent. It explains **why** an Appian UI behaves the way it does in a browser, and what that means for exploring and testing it. Each section ends with its sources. Statements marked *(verify)* come from community reports or our inference. Confirm them against your app the first time, then record the result in `docs/appian/platform-rules.md`.

---

## 0. Versions

- Appian Cloud has released monthly since **26.1** (Jan 2026). Self-managed installs upgrade quarterly (.3, .6, .9, .12). The UI can change between test runs, so record the Appian version in every run report.
- **Finding the version without Designer access:** the export ZIP's `META-INF/MANIFEST.MF` contains `Appian-Version: …`, the version the export was made on. The code-map MCP can report it (probe 12 in `/probe-codemap`). Other routes community members mention: an "Appian version" comment in the page source (older versions), and `/suite/logs/hc-build.info` (may be blocked or inaccurate). Packages can only be imported into the same or a later version, so the test environment is at least the export's version.
- When Appian changes a component incompatibly, the old version keeps working under a suffixed name, for example `a!buttonWidget_23r3` or `a!cardGroupLayout_26r6`. Treat `a!xyz_NNrN` as the **same component type** as `a!xyz`, though possibly with older parameters or rendering.

Sources: community "Appian Upgrade Clarification" (Mar 2026); docs `self-managed-support.html`; docs `function_versions.html`; community threads 25571, 13518, 8020, 3187 (MANIFEST.MF, page source, hc-build.info); docs `Application_Deployment_Guidelines.html` 26.8 (deploy only from earlier to later versions).

---

## 1. How a SAIL UI works, and why that matters for tests

- **The UI is server-driven.** An interface is an expression evaluated on the server. Each user interaction (typing, selecting, clicking) sends a request carrying the component id and a context token. The server re-evaluates and returns the updated UI. Practical consequences:
  - after **every** action, wait until that round trip has finished before asserting (`SailTracker.idle()` in `tests/support/appian.ts`, or a web-first assertion on the expected result);
  - **DOM ids are generated and change between page loads.** Never use them in locators. Appian also gives developers no way to assign stable DOM ids;
  - Appian shows its own loading indicator while it runs `saveInto` operations, before it updates the UI.
- **`showWhen: false` means hidden and not evaluated** (Appian docs). We expect the element to be *absent* from the DOM rather than CSS-hidden *(verify)*, so assert `toHaveCount(0)`, not `toBeHidden()`.
- **Collapsed sections still evaluate.** `isInitiallyCollapsed` only affects display. Contents and validations run anyway, and a validation that fires on load expands the section.
- **Async loading (25.3+).** `a!asyncVariable()` and `loadDataAsync` show *placeholder skeletons* while data loads. Submit buttons are **blocked** while an async variable is still loading or has failed, and a validation message appears under the placeholder. Don't assert on, or submit, a screen that is still showing placeholders.
- **Component plug-ins run in sandboxed iframes** served from the *dynamic content domain*, which is a different origin. Use `frameLocator`, and look for iframes whenever an element is visible but missing from the main snapshot.
- **Content Security Policy:** Appian's CSP blocks script-injection tools (such as ANDI). Playwright's CDP-based `evaluate` works, but don't depend on adding `<script>` tags to the page.

Sources: JMeter for Appian guide (cID/context); community posts on DOM ids (2025) and the saveInto loading indicator; docs `Section_Layout.html`, `fnc_evaluation_a_asyncvariable.html`, `async_loading.html`, `component-security-performance.html`, `testing-applications.html`.

---

## 2. Text, labels and language

- **Button labels are always displayed in UPPERCASE**, and have been since the ~17.1 UI overhaul. The DOM keeps the original case. In Greek, uppercasing also **drops the accents** («Αναζήτηση» appears as «ΑΝΑΖΗΤΗΣΗ»), so on-screen text and DOM text disagree for every button. The `ΑΝΑΖΗΤΗΣΗ` button the first exploration run couldn't find was this: platform behaviour, not a bug in your app.
- Labels may contain **non-breaking spaces**. `normalizeText()` already folds them, because JS `\s` matches U+00A0.
- **Translation sets (`translation!` domain):** labels can be translation strings. They render in the **user's locale** (an Appian profile setting) and fall back to the set's *primary translation locale* when there is no value for that locale. A Greek user who sees English (or another primary-language) text usually means a translation is missing. That's worth reporting.
- **Appian-generated text** (default required messages, date validation, paging, confirm dialog defaults, error pages) also follows the user locale, and **Greek (`el`) is a supported locale**. So the system text is Greek too. Record each exact Greek system string the first time you see it.
- The **user locale and time zone are Appian profile settings**, not browser settings. Playwright's `locale: 'el-GR'` doesn't change the language Appian serves. Each test user's profile must be set to Greek, or the environment's primary locale must be Greek.

Sources: community thread 13841 "buttonWidget" (always uppercase since ~17.1); robo_appian ButtonUtils (NBSP); docs `translation-set-object.html`, `reference-translation-strings.html`, `admin-internationalization.html` (Greek [el] supported; locale affects Appian-generated text and date/number formats).

---

## 3. Components: how they behave and how to drive them

| Component | Behaviour to know | How to interact / assert |
|---|---|---|
| `a!buttonWidget` | Uppercase display (§2). `submit: true` submits the form. `validate` runs validations. `validationGroup` limits *which* required/validation rules fire. `confirmMessage` opens an **Appian modal dialog** (not a native browser dialog), with confirm/cancel labels defaulting to "Yes"/"Cancel", localised. Styles: SOLID / OUTLINE / GHOST / LINK, plus `color`. | `getByRole('button', { name })` using the DOM text or `looseName()`. For a confirm, look for `getByRole('dialog')`, not `page.on('dialog')`. |
| `a!dropdownField` | A **custom combobox, not a `<select>`**. It opens a listbox, and a **search box appears when there are more than 11 choices** (`searchDisplay: "AUTO"`). The placeholder shows when the value is null. | `selectDropdown()` helper: click the combobox, then pick the option in the listbox. Never `selectOption()`. |
| Multiple dropdown, checkbox, radio | Choices can come from record fields. | Snapshot the choices. For static lists, compare them with the code-map `choiceLabels`. |
| Pickers (users, records, custom) | Server-side search as you type. Suggestions arrive asynchronously. "No suggestions" is a real state. | Type, wait for the suggestion list, then pick. Assert the chip/token that appears. |
| `a!dateField` | The format follows the user locale. *(verify)* With locale `el`, the field placeholder has been reported showing `mm/dd/yyyy` while values are saved as dd/MM/yyyy, and the "not a valid date" message names `mm/dd/yyyy` whatever the locale (KB, AN-84725). | Work out the accepted typed format **empirically** with a day above 12 (e.g. 25/12/2026), or use the date picker. Record the result as a platform rule. |
| `a!sectionLayout` | `isCollapsible` / `isInitiallyCollapsed`. Validations show above the section. Heading tags matter for accessibility. | Expand collapsed sections before reconciling. Content inside is already evaluated (§1). |
| `a!gridField` (read-only) | Paging, sorting, selection. A records-powered grid can have a search box and user filters. Async loading is possible. | Wait for rows. Paging text is localised. Read cells by column header. |
| `a!gridLayout` (editable) | Adding a row moves focus to the new row (25.3). Rows are independent sets of fields. | Scope locators to the row (`getByRole('row').filter(...)`). |
| `a!recordActionField` | Styles: TOOLBAR, LINKS, CARDS, SIDEBAR, CALL_TO_ACTION, **MENU, MENU_ICON**, TOOLBAR_PRIMARY, SIDEBAR_PRIMARY. `openActionsIn`: **DIALOG (default)**, NEW_TAB, SAME_TAB. Submitting in a dialog **closes it and refreshes** the launching record action field. With MENU styles, `securityOnDemand` defaults to true: **security is checked when the action is clicked**, so a visible menu item can still be denied. | Open menus to find actions. Click to learn whether access is allowed. Handle new tabs (`browser_tabs`). Wait for the refresh after a dialog submit. |
| Links (`a!dynamicLink`, record links, start-process links, rich text links) | Clickable text inside rich text, link fields or cards. | `getByRole('link', { name })`. Cards with links may be the only clickable element. |
| Message Banner (25.3) | Status messages such as "Item saved". Some modes announce through a live region (DISPLAY_AND_ANNOUNCE / ANNOUNCE_ONLY), and ANNOUNCE_ONLY shows **nothing visible**. | Assert visible banners by text. An ANNOUNCE_ONLY message only exists in the accessibility tree. |
| Chat field (25.4), AI components | AI output is non-deterministic. | Mark exact-output targets `out_of_scope`. Test only that the component loads and accepts input. |
| Form / wizard layouts, milestones, sidebar template, pane layout (25.3) | Multi-step flows. Panes scroll independently. | Track the current step. Scroll inside the pane, not the page. |
| File upload | Previews and editable names (25.3). Uploads of 10 MB+ exist in real apps. | Use `browser_file_upload` with small fixture files. |

Sources: docs `Button_Component.html` (25.3/25.4/26.7), `Dropdown_Component.html` (searchDisplay: search box when choiceValues > 11), `Record_Action_Component.html`, `sail/ux-accessibility.html` (message banner live region), 25.3 release notes; robo_appian SearchDropdownUtils (combobox → listbox DOM); community threads on Greek date fields (2025) and KB "Date format validation is not translated".

---

## 4. Navigation and URLs

| Target | URL shape | Notes |
|---|---|---|
| Site page | `/suite/sites/<site-web-address>/page/<page-web-address>` | Both identifiers come from the site object. A blank page identifier becomes a random string. |
| Page in a page group | `/suite/sites/<site>/group/<group>/page/<page>` | Page group visibility overrides page visibility. |
| Record in a site | `/suite/sites/<site>/page/<page>/records/item/<opaque-id>/view/<view-stub>` | The view stub defaults to `summary`. |
| Record in Tempo | `/suite/tempo/records/item/<opaque-id>/view/summary` | The record list is `/suite/tempo/records/type/<stub>/view/all`. |
| Interface page with parameters | `…/page/<page>?<params>` | URL parameters are **encrypted by default**. |
| Tasks | Tempo Tasks list. A task URL ends in `…/tasks/task/<id>` | Activity-chained tasks keep the same URL. Tasks from **autoscaled** processes don't appear in the Tempo list. Sites have no task list unless the app builds one (a task report). |
| Portal (public) | `/<portal>/page/<page>` | No login. |

- **Record identifiers in URLs are opaque** (e.g. `lIBBmtkdu05df`). You can't build them from a database id. Reach records through lists, search, or a link the app shows. Appian's own SAIL CLI refuses record URLs built from a type and an id for the same reason.
- **Page visibility** can be set per page and per page group ("Only show when" expressions), so **navigation differs by role**. Snapshot the menu for each role (`exploration/observations/_roles.md`).
- Report objects as site pages are deprecated from 25.3.

Sources: docs `fnc_scripting_urlforrecord.html` (25.1–26.9), `fnc_scripting_urlforsite.html`, `sites_object.html`, `Tasks.html`, `Process_Model_Recipes.html`; community thread on activity-chaining URLs; Appian Dev MCP release notes.

---

## 5. Processes and tasks

- A **process model** has a start form (the "action"), **user input tasks** assigned to users or groups (often through swimlanes), gateways (**XOR, OR, AND, Complex**) whose outgoing flows have conditions, subprocesses, timers and escalations, and MNI (multiple node instances).
- **Activity chaining** carries the *same user* straight into the next form. If the chain breaks (other assignee, too many nodes in between, the user navigates away), the task goes to the task inbox instead. A user who is a member of the next task's group is forwarded directly.
- Group-assigned tasks may need **Accept** before they can be completed.
- **Testing implication:** many scenarios cross roles. Role A submits, role B gets a task. The Explorer must switch role (`browser_set_storage_state`), find the task (task list, site task report or record view), open it, and continue. Every hand-off is a target.
- **Record actions are process models.** By default, a user with **Initiator** permission on the process model can see a record *list* action. A *related* action also requires that the user can see the record. Security rules or expressions on the action can restrict it further.

Sources: docs `Gateways.html`, `XOR_Node.html`, `Process_Model_Recipes.html` (activity chaining), `Tasks.html`, `record-action-security.html`; community threads on activity chaining.

---

## 6. Security model and test roles

Appian layers its security, and each layer gives you targets:
1. **Object security:** role maps on design objects (groups as Administrator / Editor / Viewer, Initiator for process models, Deny).
2. **Record-level security** (row access), **record view security**, **record action security** (rules or expressions), and **field-level security** (25.1).
3. **Site and page visibility** expressions.
4. **Interface conditions**, typically `a!isUserMemberOfGroup(loggedInUser(), cons!SOME_GROUP)` inside `showWhen`, `disabled` or `if()`.

Lessons from teams already running agents against Appian:
- **Test as the real persona.** Designer or admin views and persona views disagree *in both directions*. A restricted-data leak showed up **only** in the persona's view. Never explore with a designer or admin account unless that is the role under test.
- **Verify by readback, not by status.** After a submit, open the record or grid again and check the persisted values. Don't trust a success banner or a returned status.

Sources: docs `record-action-security.html`, Appian community "How to use Appian Records"; Appian 25.1 announcement (field-level security); README of the `appian-devmcp-method` repository (persona discipline, readback, silent failures).

---

## 7. Errors and oracles

- **Interface failures** appear on the page (a red/pink error box), not in the console. English patterns: "Could not display interface. Please check definition and inputs.", "Expression evaluation error … at function … [line N]", "Error Evaluating UI Expression", "[evaluation ID = …]". The Greek wording isn't documented: record it the first time you see it, then add it to `APPIAN_ERROR_PATTERNS` (env) and to the platform rules.
- **Validation messages:** field-level (below the field), section-level (above the section), and form-level banners (25.3 styling: no border, decorative bar). Required-field messages use `requiredMessage` when set, otherwise the localised system default.
- **Expression rule test cases** are stored with the rules (inputs plus an assertion using `test!output`), and the package inspector warns about missing test coverage. Each one is a ready-made **oracle** for business logic. The Cartographer should surface them.
- Since 25.3, `a!queryRecordType()`, `a!recordData()` and `a!gridField()` with an empty `fields` parameter return **only the primary key**. Keep this in mind when a grid or readback looks "empty".

Sources: community threads 17344 and 25355 (error texts); docs `Expression_Rules.html` (test cases, assertions), `testing-applications.html` (inspection reminds about test coverage), 25.3 release notes.

---

## 8. The application export: what the code-map MCP parses

- An export is a **ZIP of XML files, one file per object**, in per-type directories. Root elements use **"…Haul"** names (e.g. `processModelHaul/process_model_port/pm/…` with `meta/uuid`, `meta/name`, `pvs/pv/name`, and `RecordTypeHaul`).

### Confirmed from a real export

A public repository holds an unzipped Appian application export under version control: `github.com/o-guseva/appian-api`. It has 234 commits. What it shows:

| Item | What it looks like |
|---|---|
| Folders | `META-INF/`, `application/`, `content/`, `datatype/`, `group/`, `groupType/`, `processModel/`, `processModelFolder/`, `recordType/`, plus `patches.xml`, an import customization `.properties` file and SQL scripts |
| File names | the object's UUID, e.g. `content/<uuid>.xml` |
| Expression rule | `<contentHaul xmlns:a="http://www.appian.com/ae/types/2009">` → `<rule>` with `name`, `uuid`, `description`, `parentUuid`, `definition`, rule inputs in `<namedTypedValue>` (`name`, `type/name`, `type/namespace`), `preferredEditor`, `roleMap`, `history` |
| Record type | `<recordTypeHaul>` → `<recordType a:uuid="…" name="…">`: id and name are **attributes**. Children are prefixed `a:`: `pluralName`, `urlStub` (the record list URL stub, e.g. `j_ZExA`), `listViewTemplateExpr`, `detailViewCfg` (view `urlStub` e.g. `summary`, `uiExpr`, `recordUiSecurityType`), `visibilityExpr`, `recordActionLaunchType` (e.g. `DIALOG`), `security`, `sourceConfiguration` (fields: `fieldName`, `displayName`, `sourceFieldType`, `isRecordId`…), `recordRelationshipCfg` (`targetRecordTypeUuid`, `relationshipType`) |
| Role maps | `<roleMap public="…">` → `<role name="readers / authors / administrators / denyReaders / denyAuthors / denyAdministrators">` → `<users/>`, `<groups><groupUuid>…</groupUuid></groups>` |
| Patch manifest | `patches.xml`: `<applicationPatches>/<applicationPatch>` with `applicationUuid` and `patchContents/item` (`type` = content / group / recordType, plus a list of `uuids`) |
| UUID shapes | content `_a-0000efa8-…_250563` **or** plain UUIDs; groups `_e-0000efa8-…_4115` **or** plain UUIDs; record types plain UUIDs |

**How expressions are stored, which matters when reading raw definitions:**

| In the export | Means |
|---|---|
| `#"_a-0000efa8-…_250535"(…)` | a call to another rule (or a constant) **by UUID**. There are no `rule!Name` tokens |
| `#"SYSTEM_SYSRULES_gridColumn"(…)` | the system component/function `a!gridColumn`. Also `recordGridField`, `linkField`, `recordLink`, `queryFilter`, `forEach`… |
| `a!isNullOrEmpty(…)`, `a!localVariables(…)`, `if(…)`, `isnull(…)` | some functions stay in plain form |
| `#"urn:appian:record-type:v1:<uuid>"` | a record type reference |
| `#"urn:appian:record-field:v1:<typeUuid>/<fieldUuid>"` | a record field reference |
| `ri!x`, `fv!row[…]`, `rv!record[…]`, `fv!identifier` | rule inputs, function variables, record variables |

**Import customization file:** constants appear as `content.<uuid>.VALUE=…`, preceded by `## Constant: <NAME>` and `## Type: <type>` comments. Record type resync entries look like `recordType.<uuid>.forceSync=true`. Lines starting with `#` are inactive. These files can hold connected-system credentials: agents may use constant **names** from it (C16), never print values.

- An object's export includes its **properties, definition, user rights** (role map), and a **reference to its parent folder**. Process models also include the flow definition and folder references.
- **UUID shapes:** design objects look like `_a-0000d6a7-d30b-8000-ee2a-010000010000_2357`. Data types are namespaced names like `{urn:com:appian:types:APN}APN_Account`.
- **Precedents:** an object can reference objects that aren't in the package. Inspection reports them as *"…was not imported because a required precedent is missing: content [uuid=… location=…]"*. **This is exactly the "items that aren't in the export" problem.** The code-map MCP should list such references explicitly rather than drop them (capability C13 in `docs/codemap-contract.md`).
- **Environment-specific values** (constants, connected systems) live in the **Import Customization File** (`.properties`), *not* in the ZIP. Database scripts and plug-ins travel separately. A constant's exported value may not be what the test environment uses.
- **Reference domains:** `rule!` (interfaces, expression rules, decisions, integrations) and `cons!` are *indirect*. `recordType!`, `site!`, `translation!`, `type!`, `portal!` and `controlPanel!` are *direct* object references.
- Exports can be automated: the **Deployment REST API** (v1/v2/v3) exports packages and applications and **inspects** packages, which lists missing precedents. Since 25.4, object UUIDs are shown in the Properties dialog, which helps match Designer objects to export files.

Sources: docs `Application_Deployment_Guidelines.html`, `manual-deployment.html`, `Get_Inspection_Results_API.html`, `Export_Package_API.html`, `Deployment_Rest_API.html`, `reference-objects.html`, 26.3 release notes; community threads on xpathdocument (processModelHaul) and record type visibility (RecordTypeHaul).

---

## 9. Appian's own testing tools, and where this system fits

| Tool | What it is | Use for us |
|---|---|---|
| FitNesse for Appian, Cucumber for Appian, **Appian Selenium API** | Appian's officially supported UI test tools. They find components by **label**, and FitNesse lowercases labels (ASCII only) before matching. The Selenium API is open source on GitLab (`appian-oss/appian-selenium-api`) since 2025. | Reference for how Appian components are located. Their ASCII-only case folding would fail on Greek, which `looseName()` handles. |
| **appian-locust** | Appian's load-testing library. It drives the SAIL JSON directly and can target components by their **`testLabel`** attribute (pickers add a `test-` prefix). | Evidence that SAIL components carry a `testLabel`. *(verify whether it reaches the DOM in your version)* |
| **Appian Dev MCP** (AppMarket, compatible with 26.5). *Not usable in this project: it needs a Designer account, which the test environment doesn't provide.* | An MCP server for IDE agents: list, read, create and update design objects (record types, interfaces, expression rules, process models, sites…) on a **live** environment. The **read-only** edition has 56+ inspection tools, including `getObjectSecurity`, `getObjectDependents`, `listObjects` and `validateExpression`. Needs a Designer or System Administrator role. Community-supported. | A **live fallback** for objects missing from the export, and a source for security and dependents. |
| **SAIL CLI** (bundled with the full Dev MCP since 26.6.90). *It ships with the Dev MCP, so it's most likely unavailable here too.* | Lets an agent click through sites, process forms and record actions "the same way an end user would". Appian says it uses far fewer tokens than browser tools like Playwright. Commands include `sail login`, `sail navigate`, `sail interact`. | A **complement to Playwright**: SAIL CLI for semantics (content, field state, visibility, behaviour per persona), Playwright for what only a browser shows (rendering, CSS case transforms, iframes, layout, real network timing). |

Sources: docs `testing-applications.html`; AppMarket listings "Appian Selenium API", "Appian Dev MCP", "Appian Dev MCP (read-only)"; docs `devmcp.html` (26.10); appian-locust docs (uiform); community FitNesse threads.
