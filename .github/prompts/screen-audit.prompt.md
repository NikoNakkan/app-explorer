---
description: Run the full Appian screen checklist (docs/appian/explorer-checklist.md) on one screen as one role, and turn every finding into ledger targets.
agent: Explorer
---
Audit this screen with the Appian checklist:

- Screen / URL: ${input:screen:site page URL, record view, or screen name}
- Role: ${input:role}

Run checklist section A completely, then B (every input), C (every button) and E (every record action) for what's on the screen. Don't submit anything destructive. Stop at confirmation dialogs and cancel. Record everything in `exploration/observations/<screen>.md` and the ledger. Finish with: new targets, findings (`bug_suspected` / missing translations / unexpected access), and any rule candidates for the platform rules.
