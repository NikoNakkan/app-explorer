# Playwright MCP: what the agents use

Server: `@playwright/mcp`, configured in `.vscode/mcp.json` with options in `.vscode/playwright-mcp.json`. Official docs: https://playwright.dev/mcp/introduction

## Capabilities enabled here

`capabilities: ["testing", "storage", "network", "devtools"]`

| Capability | Tools the agents rely on | Who uses them |
|---|---|---|
| core (always on) | `browser_navigate`, `browser_snapshot`, `browser_find`, `browser_click`, `browser_type`, `browser_fill_form`, `browser_select_option`, `browser_press_key`, `browser_hover`, `browser_wait_for`, `browser_tabs`, `browser_handle_dialog`, `browser_take_screenshot`, `browser_console_messages`, `browser_network_requests`, `browser_evaluate` | Explorer, Generator, Healer |
| `storage` | `browser_set_storage_state` (switch role), `browser_storage_state` | Explorer, Generator, Healer |
| `testing` | `browser_generate_locator`, `browser_verify_element_visible`, `browser_verify_text_visible`, `browser_verify_list_visible`, `browser_verify_value` | Generator, Healer |
| `network` | `browser_route` (mock a backend answer to reach a branch, if the user allows it), `browser_network_state_set` | Explorer (only when a branch needs it) |
| `devtools` | `browser_start_tracing` / `browser_stop_tracing`, video | Healer (evidence) |

`vision` (coordinate clicks) is **deliberately off**: coordinates make locators that can't be reused in tests.

## Patterns

Argument names below are those of `@playwright/mcp` 0.0.86 (checked 2026-11-19). Older and newer releases have renamed them (`path` → `filename`, `ref` → `target`): when in doubt, the tool's own schema wins.

**Switch role**
```
browser_set_storage_state { filename: ".auth/clerk.json" }     relative to the workspace root
browser_navigate { url: "<APP_BASE_URL>/search" }
browser_snapshot
```

**Verify a locator before writing it in code**
```
browser_snapshot                       → find the element's ref
browser_generate_locator { element: "Search button", target: "e42" }
```

**Observe the effect of an action**
```
browser_click { element: "Search button", target: "e42" }
browser_snapshot
browser_console_messages
browser_network_requests
```

## Appian notes

- `timeouts.settle` is set to **1000 ms** in `.vscode/playwright-mcp.json`, so the MCP waits for Appian's server round trip after each action. Raise it if snapshots often show half-updated forms.
- Confirmation prompts are **Appian modals** (`role=dialog`). Click their buttons. `browser_handle_dialog` is only for native browser dialogs (P12).
- Plug-in components live in **iframes** from another origin (P8). Snapshot refs inside frames work like any other ref.
- Record actions may open in a **new tab** (`openActionsIn: NEW_TAB`). Use `browser_tabs` to switch.
- Integrations run server-side, so `browser_route` can't mock them. Only browser-side requests can be mocked.

## Notes

- **Snapshot, not screenshot.** `browser_snapshot` returns the accessibility tree with element refs. Screenshots are evidence only.
- **Version check.** The `storage`, `testing` and `network` capability names exist in current releases of `@playwright/mcp`. Older builds only had `vision`, `pdf` and `devtools`. If `browser_set_storage_state` is missing, update the package. If you can't update, use the fallback below.
- **Fallback for roles without `storage`**: define one server per role in `.vscode/mcp.json` with `--isolated --storage-state .auth/<role>.json` (e.g. `playwright-clerk`, `playwright-admin`), and add `playwright-*/*` to the agents' tools.
- **Pinned version.** `.vscode/mcp.json` pins `@playwright/mcp@0.0.86`, the release every tool name and argument in this file was checked against (2026-11-19: all 26 tools above exist with these capabilities; it bundles Playwright 1.66.0-alpha). `@latest` changed argument names between releases. To upgrade, change the pin, list the tools again (`/bootstrap` step 4) and update this file.
- **Always on:** the core capability also exposes `browser_run_code_unsafe`, which runs arbitrary code in the MCP server process. The agents don't use it (see Safety in `.github/copilot-instructions.md`).
- **Relative paths** in the MCP config (`outputDir`) resolve against the server's working directory. If artifacts end up somewhere unexpected, make them absolute.
- `--secrets <dotenv file>` keeps values hidden from the model if an agent ever has to type credentials. Normally it doesn't, because logins come from `.auth/`.

## Playwright's own test agents (optional, side by side)

`npx playwright init-agents --loop=vscode --project chromium` generates Playwright's built-in planner, generator and healer agents. They work from the UI only, without the code map. You can keep them next to these agents and use them for areas the export doesn't cover. Regenerate them whenever Playwright is updated. `tests/seed.spec.ts` doubles as their seed test. Keep `--project chromium`: without it (checked with Playwright 1.65.1) the command picks the first project, `selfcheck`, and **replaces `tests/seed.spec.ts` with an empty seed**. It also adds a `playwright-test` server to `.vscode/mcp.json` (the existing servers stay) and writes `.github/workflows/copilot-setup-steps.yml`.
