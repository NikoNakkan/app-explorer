---
description: Investigate an element the agents could not find (e.g. a button visible in a screenshot) using the code map and the fallback ladder, and record the lesson.
agent: Explorer
---
The agents could not find this element:

- What was expected: ${input:element:e.g. button "ΑΝΑΖΗΤΗΣΗ"}
- Screen / URL: ${input:screen}
- Role: ${input:role}

Go through the fallback ladder from your instructions step by step. Report which step found it (or why none did), the verified locator, and the line you added to `exploration/rules.md`.
