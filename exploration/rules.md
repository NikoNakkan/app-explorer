# Learned app rules (this project)

Every agent reads `docs/appian/platform-rules.md` first, then this file. Add one line per lesson: **ID · date · rule · evidence**. Rules about Appian in general go through the promotion gate (measured, noun-free, rule-shaped) into the platform rules.

- **R1** · 2026-11-18 · *Promoted to platform rule P1.* The search button rendered «ΑΝΑΖΗΤΗΣΗ», but the DOM has «Αναζήτηση». This is Appian's uppercase button styling, not app-specific CSS. · Evidence: first exploratory run; `tests/selfcheck/greek-text.spec.ts`.
