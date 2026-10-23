# QUEUE.md — the PR queue (binding order since 2026-10-23)

**Rule:** this file is updated at every PR start and every PR end, in full detail. Statuses: **RUNNING** · **QUEUED** · **FINISHED** (plus SPEC FIRST / NEEDS GO / HELD as sub-notes). One production PR at a time; read-only investigators may run beside it, never more than **2** agents total (all `model: "haiku"`). Every PR: draft at code freeze → CI green on the final commit → squash-merge → registry assertion → release → verified by the orchestrator (WORKING-NOTES II.5) → row flipped to FINISHED here.

Spec paths are under `specs/`. "User decisions" names the binding block inside that spec (the user's answers, with time). When rows are merged (the user may group same-file, same-proof items into one PR), the merged row carries each absorbed item's original cells verbatim under its label and keeps the old item numbers in brackets so the specs still line up; frozen-file, data-rewriting, spec-first and feature items stay alone.

---

## RUNNING

**2026-10-23 — RUNNING: item 4 (live-check coverage).** One haiku implementer, worktree `.claude/worktrees/impl-live-check`, branch `feat/live-check-all-reads`, targeting 0.3.5 (PATCH). Spec `specs/live-check-coverage.md`, decisions recorded. It stops at a green PR; the orchestrator merges on green and verifies the publication. Item 3 (doc drift) is done and pushed. Item 1 continues afterwards with the two row shapes probe 4 confirmed (`companies.posts` = `main [role="article"]`, `search.people` = `main [role="listitem"]`).

---

## QUEUED (in order)

| # | Item | Version / note | Spec + user decisions | What it does and why |
|---|---|---|---|---|
| 1 | **REMAINING READ FAMILIES** | 0.3.5+ (PATCH per family), tier T1/T2, **NEEDS A LIVE `experimental live-check` FIRST** | `specs/read-adapter-repair.md` + USER DECISIONS 2026-10-23 | Still failing after 0.3.4 (all measured, none guessed): `profile.skills`, `profile.contact` (sections and headings render; rows never reached by the probes), `companies.get` (error-shaped page — no `<main>`, 41 `<code>` nodes), `companies.posts` (no reaction-controlled post card renders on this account), `jobs.get`, `jobs.apply-url` (`JobDetails_` is an empty placeholder at 2.5 s; the detail title is not an `h1`), `jobs.saved` (293 elements and 6 rows after 5 s but no `<main>`), `invitations.received`, `invitations.sent` (render without `<main>`; row selectors unknown), `search.people` (rows have no anchors; `main li` hits pagination first). **First step for each family: measure it live, never guess.** `search.companies`, `search.posts` and `analytics.profile-views` are now live-confirmed (2026-10-23 13:35). `search.people` rows have no anchors and remain unresolved. | 13 of 33 reads could not parse the rendered layout: `profile.skills`, `profile.contact`, `invitations.received`, `invitations.sent`, `companies.get`, `companies.posts`, `jobs.get`, `jobs.apply-url`, `jobs.saved`, `search.people`, `search.companies`, `search.posts`, `analytics.profile-views`. **Recommendation:** one investigator spec that proposes a selector ladder per surface *from the observed DOM*, then one implementer per family (profile / companies / jobs / search / invitations / analytics), each with a fixture and a live read of that one surface. **Proof bar:** each repaired adapter returns populated records on the live account, or reports a genuine restriction with evidence. **Not in scope:** changing the catalog shape or adding new operations. |
| 2 | **ROW PARSING ON A NON-EMPTY ACCOUNT** | PATCH if a fix is needed, tier T1, **HELD until the account has data** | none yet | `posts.list`, `inbox.list`, `inbox.search`, `connections.list` only ever proved the **empty-state** path. Their row parsers are unproven. Cannot be done on demand — needs the user's account to have posts, conversations, or connections. |
| 3 | **DOC DRIFT IN `docs/packaging-recommendations.md`** | PATCH (docs), tier T0 | none needed | The doc still says the npm package is **not published** and shows the 0.2.0 target JSON; 0.3.2 is live. A reader is misled. Also fold in the plugin listing icon note. |
| 4 | **LIVE-CHECK CANNOT CHECK MOST READS** | 0.4.0 (MINOR), tier T1/T2, **SPEC FIRST** | none yet | `linkedin experimental live-check` accepts only the seven names in `LIVE_READ_OPERATIONS` (`src/experimental/live-check.js`) and rejects everything else with "Unknown operation(s) … Live checks are read-only". It therefore cannot verify `search.*`, `analytics.*`, `jobs.get`, `invitations.*`, `connections.status`, `inbox.thread` — exactly the adapters that keep failing. Proposal: derive the default list from the catalog's read operations (or add an explicit `--all-reads` opt-in) while keeping the read-only guard, the never-retry rule, and the no-page-body rule. Recommendation: MINOR, because the default command's output would then cover more operations. |

---

## FINISHED (this arc, newest first; each verified by the orchestrator per II.5)

| Version | PR | Item | Spec + user decisions | What shipped |
|---|---|---|---|---|
| 0.3.4 | #10 (`98e34c0`) | **REPAIR THE 13 `LAYOUT_UNSUPPORTED` READS — search family + analytics** | `specs/read-adapter-repair.md` + USER DECISIONS 2026-10-23 (family by family, search first) + PROBE RESULTS/2/3 | SHIPPED: `search.companies` rows = `li`/`listitem` with a `/company/` link; `search.posts` rows = list items carrying a reaction control; both ladders sit on their own config entries and are appended after the shared job ladder, which is unchanged. `analytics.profile-views` reports `ACCESS_RESTRICTED` on a route leave via an opt-in `redirectRestricted` flag (no other operation sets it). Gate: 349 tests pass, 0 fail (my own run); six CI jobs green; mutation proven by me — removing the posts candidate fails its test, restored byte-identical. Publish run `39937631339` succeeded; registry `latest` = 0.3.4 with `gitHead` = merge SHA and matching tarball integrity. Residual: new candidates are proven only on fixtures, not live; post `url`/`id` still come from the first link in a row and may be the author; company title ladder assumes an image-only logo link. Not done: no live `experimental live-check` after the change. Incident: the implementer's scratch probe made one anonymous request to LinkedIn's login URL; no cookies or saved profile; recorded in WORKING-NOTES IX.2. |
| 0.3.3 | #9 (`96909b2`) | **LAND THE VISIBILITY-AWARE CHALLENGE DETECTOR** | `specs/challenge-detector.md` + USER DECISIONS 2026-10-23 (iframe bypass refused) | SHIPPED: `src/experimental/challenge.js` stops only on a *visible* candidate or an explicit visible verification prompt; both browser paths import it; the two inlined selector lists are gone; no frame is entered or altered. Gate: 344 tests pass, 0 fail (measured twice: before and after the bump); `pack:check` clean; six CI jobs green on the final commit. Merge SHA = `96909b2` = `origin/main`. Publish run `39865260123` success; registry `latest` = 0.3.3, `gitHead` = merge SHA, downloaded tarball SHA-512 matched `dist.integrity` and sha1 matched `dist.shasum`; SLSA provenance present. Deviation: the first `workflow_run` publish skipped because the merge cancelled the preceding main CI; the successful CI run triggered a second publish that shipped. Residual: a challenge inside a 0×0 iframe host is caught only by the prompt-text check; the prompt regex is a heuristic. Not done: no GitHub release/tag (awaiting go); no live write verified. |
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

1. The read-adapter arc is decided (family by family, search first) and the search family has shipped. **Open:** whether to do item 4 (let the live check cover all reads) before the remaining families, so each repair can be verified the moment it lands. Recommendation: yes, item 4 first.
2. When do you want the first live write verified, and which target/payload? (`reactions.add`/`reactions.remove` was chosen.)
3. Do you have a LinkedIn developer app available for the OAuth live test?
4. Should the seven old `agent-*` worktrees and `impl-search-adapters` be removed, or kept?
