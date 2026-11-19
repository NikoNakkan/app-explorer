# Observations: <screen name> (`<screen_id>`)

- **URL:** /...
- **Reached via:** direct URL | Home → menu «...» → ...
- **Features:** F12 (from C17)
- **Roles tried:** clerk (✓), viewer (menu item missing)
- **Last updated:** YYYY-MM-DD by Explorer

## Element reconciliation

| Observed (role · accessible name) | Code-map element | Feature(s) | Match method | Verified locator | Notes |
|---|---|---|---|---|---|
| button · «Αναζήτηση» | `btnSearch` | F12 | label constant `SEARCH` (C7/C3) | `getByRole('button', { name: 'Αναζήτηση' })` | shown uppercase via CSS (R1) |
| textbox · «Κριτήριο» | `txtQuery` | F12 | dom name | `getByLabel('Κριτήριο')` | |
| button · «Εξαγωγή» | — | — | none (C7 search: no hits) | `getByRole('button', { name: 'Εξαγωγή' })` | **unmapped** → O:search:export |

## In the code map but not visible

| Code-map element | Why not visible (hypothesis) | Lead |
|---|---|---|
| `btnDelete` | `visible_if: user.role == ADMIN` | try role admin |

## Targets

### B:search:too-long:then
- **Preconditions met:** role clerk, query of 51 characters (edge 50 / 51)
- **Steps:** 1) type 51 × «α» in «Κριτήριο» 2) click «Αναζήτηση»
- **Fingerprints seen:** «Έως 50 χαρακτήρες» visible (cons!SEARCH_TOO_LONG) → the `then` branch ran
- **Observed:** message shown; no request to the search endpoint
- **Expected (code map):** same → ✓
- **Console / network:** none
- **Evidence:** exploration/artifacts/search-too-long.png
- **Status set:** reached
