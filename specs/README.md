# specs/

One spec per unit of work, written before an implementer is dispatched, and kept after the work ships.

- Structure: `C:\Users\fgghk\.claude\skills\working-notes\templates\SPEC.template.md`.
- Each spec asks NUMBERED plain-language questions, each with a recommendation.
- The user's answers are appended verbatim as a binding `USER DECISIONS (<time>)` block. The implementer treats that block as authoritative over every other paragraph in the spec.
- Specs are never rewritten after a USER DECISIONS block is added — corrections go in a new dated block below it, and superseded text moves to `WORKING-NOTES-ARCHIVE.md`.

| Spec | Status |
|---|---|
| `challenge-detector.md` | shipped in 0.3.3 |
| `read-adapter-repair.md` | written 2026-10-23 by a read-only investigator; **awaiting the user's answers** to its 6 questions (probe budget, family order, empty-state policy, second-account data, Sales 403 timing, Easy Apply) |
