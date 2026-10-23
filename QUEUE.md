# QUEUE.md — the PR queue (binding order since 2026-10-23)

**Rule:** this file is updated at every PR start and every PR end, in full detail. Statuses: **RUNNING** · **QUEUED** · **FINISHED** (plus SPEC FIRST / NEEDS GO / HELD as sub-notes). One production PR at a time; read-only investigators may run beside it, never more than **2** agents total (all `model: "haiku"`). Every PR: draft at code freeze → CI green on the final commit → squash-merge → **check the registry before the next bump** → release → verified by the orchestrator (WORKING-NOTES II.5) → row flipped to FINISHED here.

Spec paths are under `specs/`. "User decisions" names the binding block inside that spec. Frozen-file, data-rewriting, spec-first and feature items stay alone.

---

## RUNNING

**2026-10-23 — RUNNING: item 1, the two real defects.** One haiku implementer, worktree `.claude/worktrees/impl-company-job`, branch `fix/company-and-job-detail`, targeting 0.3.7: `companies.get` must read a page with no `<main>`; `jobs.get` must accept an `h2` title. The five likely-empty-state reads are **not** in that PR — they need an empty-state wording measurement first.

**Live state after 0.3.6:** `search.people` 3 rows with title+url; `companies.posts` 3 rows with text only (no title, no permalink).

_(no production PR running)_

---

## QUEUED (in order)

| # | Item | Version / note | Spec + user decisions | What it does and why |
|---|---|---|---|---|
| 1 | **REMAINING READ FAMILIES** | RUNNING (0.3.7) for the two real defects; the rest needs a decision | `specs/read-adapter-repair.md` + PROBE 5 + USER DECISIONS 2026-10-23 | **Real defects, in flight:** `companies.get` (the page renders over a million characters with **no `<main>`**, and the reader requires `main h1`), `jobs.get`/`jobs.apply-url` (title is an `h2`, the reader wants `h1`). **Most likely empty states, not selector drift:** `jobs.saved`, `invitations.received`, `invitations.sent`, `profile.skills`, `profile.contact` — probe 5 found no rows at all on any of them (no job links, no list in any section, no skills or contact section). Proving that needs the empty-state wording measured, which means reading page text; that needs the user's decision. `companies.posts` title/permalink is a field-coverage gap, not row matching. |
| 2 | **ROW PARSING ON A NON-EMPTY ACCOUNT** | PATCH if a fix is needed, tier T1, **HELD until the account has data** | none yet | `posts.list`, `inbox.list`, `inbox.search`, `connections.list` only ever proved the empty-state path. Cannot be done on demand. |

---

## FINISHED (this arc, newest first; each verified by the orchestrator per II.5)

| Version | PR | Item | Spec + user decisions | What shipped |
|---|---|---|---|---|
| 0.3.6 | #13 (`5400528`) | **COMPANY POSTS + PEOPLE SEARCH** | `specs/read-adapter-repair.md` + PROBE 4 | `companies.posts` rows = `main [role="article"]`; `search.people` rows = `main [role="listitem"]` with title and url from the card. 366 tests, 0 fail (my run); eight mutations verified by the agent; six CI jobs green; publish success; registry `latest` = 0.3.6 with matching integrity and provenance; release v0.3.6. **Live: people 3/3 title+url; company posts 3 rows text-only.** |
| 0.3.5 | #11 (`ce8ec52`) + #12 (`3b4a078`) | **LIVE CHECK COVERS EVERY READ** | `specs/live-check-coverage.md` + USER DECISIONS 2026-10-23 | `--operations` accepts any catalog read; `--all-reads` is opt-in; the default run is byte-identical; an input that does not match is `skipped`, never `failed`. 364 tests (my run); mutations A and B proven; six CI jobs green after two Windows flakes (see below). Publish succeeded from `3b4a078`; release v0.3.5. |
| 0.3.5 (follow-up) | #12 (`3b4a078`) | **WINDOWS TEST CLEANUP** | none (test-only) | Main CI failed twice on the merge commit: `pack:smoke` `ETIMEDOUT`, then `EBUSY` unlinking a Chromium `chrome_debug.log` during cleanup. Browser-backed tests now pass `maxRetries: 10, retryDelay: 100` to `rm`. 76 tests green locally; six CI jobs green. Test-only, no bump — which is exactly what let 0.3.5 publish from this commit. |
| 0.3.4 | #10 (`98e34c0`) | **SEARCH COMPANIES + SEARCH POSTS + ANALYTICS** | `specs/read-adapter-repair.md` + USER DECISIONS | Per-kind row and title ladders; `analytics.profile-views` → `ACCESS_RESTRICTED` via `redirectRestricted`. 349 tests; six CI jobs; publish `39937631339`; release v0.3.4. Live: 3 + 3 populated rows. |
| 0.3.3 | #9 (`96909b2`) | **VISIBILITY-AWARE CHALLENGE DETECTOR** | `specs/challenge-detector.md` | Hidden 0×0 reCAPTCHA no longer counts as a challenge; visible prompts still stop. 344 tests; publish `39865260123`; release v0.3.3. |
| 0.3.2 | #8 (`37e3386`) | **LIVE-VERIFICATION FIXES** | PR #8 | Selector ladder keyed on testids/labels/roles; feed post filtering; adapter verdict wins over the service fallback. 328 tests; tarball verified. |
| docs | — | **DOC DRIFT** (was item 3) | none | `docs/packaging-recommendations.md` now states the package is published and marks the JSON as the 0.2.0 decision snapshot. |

**Investigations finished (no release):**
- Live read matrix (2026-10-23): 23 of 33 reads attempted, 19 navigations, 0 mutations, stopped at HTTP 403 on `sales.search-people`.
- Read-repair spec + probes 1-4 (`.superpowers/diagnostics/read-probe*.json`), all recorded in `specs/read-adapter-repair.md`.

---

## HELD — waits until the user says go

- **LIVE WRITE VERIFICATION (21 operations).** Needs, per operation, an exact target and an exact payload the user names and approves, run deliberately and spaced. First candidate: `reactions.add` / `reactions.remove`. A challenge stop is a correct outcome.
- **OAUTH LOGIN AGAINST A REAL DEVELOPER APP.** Needs the user's LinkedIn app: Client ID, secret, and a registered HTTPS redirect. Never ask for the secret in chat.
- **`npm deprecate linkedin-api-mcp@0.0.0-stage`** — a registry mutation; needs its own go.
- **PLUGIN LISTING ICON** — cosmetic; `claude plugin validate` warns without one.
- **SALES NAVIGATOR 403** — one spaced read-only re-check permitted after the current arc; no bypass ever.

---

## THE USER'S OPEN QUESTIONS

1. **Empty-state wording.** Five reads (`jobs.saved`, both invitation reads, `profile.skills`, `profile.contact`) show no rows at all on this account, so they are probably empty rather than broken. Proving it means reading the page text to learn the empty-state wording — a step this project has avoided so far. Approve that measurement, or leave those five failing closed?
2. When do you want the first live write verified, and which target/payload?
3. Do you have a LinkedIn developer app available for the OAuth live test?
4. Should the ten worktrees under `.claude/worktrees/` be removed, or kept?
