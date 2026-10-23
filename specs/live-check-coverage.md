# SPEC — let the live check cover every read (2026-10-23, T1/T2)

## 0. Answer in five lines
`linkedin experimental live-check` accepts only the seven names in `LIVE_READ_OPERATIONS` (`src/experimental/live-check.js`) and rejects everything else with "Unknown operation(s) … Live checks are read-only", so it could not verify any of the adapters this arc is repairing. The catalog already knows every read operation. The safe change is an **opt-in `--all-reads` flag** that derives the list from the catalog; the default output stays byte-identical. That makes it a PATCH (0.3.5), not a MINOR. The read-only guard, the never-retry rule and the no-page-body rule stay exactly as they are.

## 1. The problem as observed
```
$ linkedin experimental live-check --operations profile.get,search.companies,search.posts,analytics.profile-views ...
Unknown operation(s): search.companies, search.posts, analytics.profile-views. Live checks are read-only.
```
Measured 2026-10-23 against 0.3.4. The refusal is correct for unknown names; the problem is that legitimate read operations are treated as unknown because the list is a constant, not derived from `src/operations/catalog.js` (`OPERATIONS`, where `access === 'read'`).

## 2. Options
| Option | What changes | What stays byte-identical | Risk | Verdict |
|---|---|---|---|---|
| Derive the default from the catalog | every run checks all reads | nothing | the default command's output changes and grows from 7 lines to ~33; a longer run costs more navigations on the user's account without them asking | rejected for the default |
| **Add `--all-reads` (opt-in)** | a new flag selects every catalog read | the default run, its output and its navigation count | none beyond the flag itself | **chosen** |
| Accept any catalog read in `--operations` | validation widens | the default | an explicit list could still mix a write name; the guard must keep rejecting writes | **chosen as well** — it is the same fix seen from the other side |

## 3. Scope
1. `src/experimental/live-check.js`: keep `LIVE_READ_OPERATIONS` as the default export used when no flag is passed; add `catalogReadOperations(operations)` (or equivalent) that filters the catalog to `access === 'read'`.
2. `src/experimental/live-check-cli.js`: add `--all-reads`; when present, run every catalog read. Widen `--operations` validation so any **catalog read** is accepted, and keep rejecting write names and unknown names with the same message shape.
3. Tests in `test/live-check.test.js`: default list unchanged (byte-identical), `--all-reads` covers every catalog read, a write name is still rejected, an unknown name is still rejected, and no operation is retried.
4. Docs: `docs/live-verification.md` (the command section) and `README.md` if it shows the flag list.

## 4. NOT in scope
- Any change to the adapters, the catalog, the service, approvals, the challenge detector, or the read/write boundary.
- Any live call in tests.
- Changing what the default run checks.

## 5. Verification bar
- Default invocation output byte-identical (run it on fixtures before and after, `cmp`).
- `--all-reads` runs exactly the catalog's read operations, in catalog order, once each.
- Mutation: remove the write filter from the widened validation and watch the write-name test fail.

## 6. QUESTIONS for the user
1. Should the default run grow to every read? — Rec: **no**; add `--all-reads`, keep the default as it is.
2. Should `--operations` accept any catalog read? — Rec: **yes**; the current refusal of `search.companies` is the bug.
3. Version? — Rec: **PATCH** (0.3.5), because the default behaviour does not change.

by FiredMosquito831

## USER DECISIONS (2026-10-23 15:20 UTC+03, binding)
The user's instruction: "now resume the work and finish the whole queue". The queue item carried these three questions with recommendations. The orchestrator resolves them as recommended, under the standing rule "safest, 100 % working, break nothing": default run unchanged, `--all-reads` opt-in, `--operations` widened to catalog reads, PATCH 0.3.5. Any deviation must be reported in the PR body.

by FiredMosquito831
