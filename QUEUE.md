# QUEUE.md — the PR queue (binding order since 2026-10-23)

**Rule:** this file is updated at every PR start and every PR end, in full detail. Statuses: **RUNNING** · **QUEUED** · **FINISHED** (plus SPEC FIRST / NEEDS GO / HELD as sub-notes). One production PR at a time; read-only investigators may run beside it, never more than **2** agents total (all `model: "haiku"`). Every PR: draft at code freeze → CI green on the final commit → squash-merge → registry assertion → release → verified by the orchestrator (WORKING-NOTES II.5) → row flipped to FINISHED here.

Spec paths are under `specs/`. "User decisions" names the binding block inside that spec (the user's answers, with time). When rows are merged (the user may group same-file, same-proof items into one PR), the merged row carries each absorbed item's original cells verbatim under its label and keeps the old item numbers in brackets so the specs still line up; frozen-file, data-rewriting, spec-first and feature items stay alone.

---

## RUNNING

**2026-10-23 — PAUSED before commit.** The detector correction is written and green but **not committed**: branch `fix/visible-challenge-detector` holds `src/experimental/challenge.js` (new), `test/challenge-detector.test.js` (new), `test/operations-session.test.js` (new), and edits to `src/experimental/browser.js`, `src/operations/session.js`, `test/experimental-browser.test.js`, `docs/live-verification.md`, `HANDOFF-2026-10-22.md`. No PR, no push, no bump was authorised. Resume = QUEUED #1.

_(no production PR running)_

---

## QUEUED (in order)

| # | Item | Version / note | Spec + user decisions | What it does and why |
|---|---|---|---|---|
| 1 | **LAND THE VISIBILITY-AWARE CHALLENGE DETECTOR** | 0.3.3 (PATCH), tier T2 | `specs/challenge-detector.md` + USER DECISIONS 2026-10-23 (the user's "fix the detector"; iframe bypass refused, recorded in the spec) | A hidden, zero-size reCAPTCHA Enterprise iframe made a normal HTTP-200 page raise `HUMAN_INTERVENTION_REQUIRED`, so a live read pass was misdiagnosed. `src/experimental/challenge.js` counts only *visible* candidates and also blocks on explicit visible verification prompts, and both browser paths import it. **Proof bar:** the 344-test suite green; the four focused fixtures (hidden frame untouched, visible challenge blocks, hidden→visible transition blocks, auth/rate-limit stops unchanged); a read-only re-check of the same company page with the hidden iframe still present and no false stop. **Not in scope:** any iframe removal/entry, any change to `policy.js` stops, any write. |
| 2 | **REPAIR THE 13 `LAYOUT_UNSUPPORTED` READS** | 0.4.0 (MINOR) or per-surface PATCHes, tier T1/T2, **SPEC FIRST** | spec to be written by an investigator from `docs/live-verification.md` + `src/operations/reads.js` | 13 of 33 reads could not parse the rendered layout: `profile.skills`, `profile.contact`, `invitations.received`, `invitations.sent`, `companies.get`, `companies.posts`, `jobs.get`, `jobs.apply-url`, `jobs.saved`, `search.people`, `search.companies`, `search.posts`, `analytics.profile-views`. **Recommendation:** one investigator spec that proposes a selector ladder per surface *from the observed DOM*, then one implementer per family (profile / companies / jobs / search / invitations / analytics), each with a fixture and a live read of that one surface. **Proof bar:** each repaired adapter returns populated records on the live account, or reports a genuine restriction with evidence. **Not in scope:** changing the catalog shape or adding new operations. |
| 3 | **ROW PARSING ON A NON-EMPTY ACCOUNT** | PATCH if a fix is needed, tier T1, **HELD until the account has data** | none yet | `posts.list`, `inbox.list`, `inbox.search`, `connections.list` only ever proved the **empty-state** path. Their row parsers are unproven. Cannot be done on demand — needs the user's account to have posts, conversations, or connections. |
| 4 | **DOC DRIFT IN `docs/packaging-recommendations.md`** | PATCH (docs), tier T0 | none needed | The doc still says the npm package is **not published** and shows the 0.2.0 target JSON; 0.3.2 is live. A reader is misled. Also fold in the plugin listing icon note. |

---

## FINISHED (this arc, newest first; each verified by the orchestrator per II.5)

| Version | PR | Item | Spec + user decisions | What shipped |
|---|---|---|---|---|
| 0.3.2 | #8 (`37e3386`) | **Live-verification fixes** | PR #8 | SHIPPED: selector ladder keyed on testids/labels/roles; feed post filtering; adapter verdict wins over the service fallback. Gate: 328 tests green, six-job CI matrix green. Merge SHA = tag = `origin/main` = registry `gitHead` (`37e3386…`). Tarball downloaded from the registry, SHA-512 matched `dist.integrity`; SLSA provenance present. Release v0.3.2 published. Residual: three reads only proved the empty-account path; 13 reads `LAYOUT_UNSUPPORTED`; 0 writes verified. |

**Investigations finished (no release):**
- Live read matrix (2026-10-23, no spec file — recorded in `docs/live-verification.md` and `.superpowers/diagnostics/bounded-read-matrix-result.json`): 23 of 33 reads attempted, 19 navigations, 0 mutations, stopped at a genuine HTTP 403 on `sales.search-people`.

---

## HELD — waits until the user says go

- **LIVE WRITE VERIFICATION (21 operations).** Needs, per operation: an exact target the user names (a post URL, a company page, a recipient) and an exact payload they approve, run deliberately and spaced. First candidate already chosen: `reactions.add` / `reactions.remove`. Its own go is required; a challenge stop is a correct outcome, not a failure to retry.
- **OAuth LOGIN AGAINST A REAL DEVELOPER APP.** Needs the user's LinkedIn developer app: Client ID, secret, and a registered HTTPS redirect (e.g. `https://oauth.pstmn.io/v1/callback`). Never ask for the secret in chat; the user runs the flow.
- **`npm deprecate linkedin-api-mcp@0.0.0-stage`** — a registry mutation; needs its own go.
- **PLUGIN LISTING ICON** — cosmetic; `claude plugin validate` warns without one.

---

## THE USER'S OPEN QUESTIONS

1. Should the 13 `LAYOUT_UNSUPPORTED` reads be repaired as one arc (investigator spec → per-family implementers), or re-measured first on a second account?
2. When do you want the first live write verified, and which target/payload?
3. Do you have a LinkedIn developer app available for the OAuth live test?
