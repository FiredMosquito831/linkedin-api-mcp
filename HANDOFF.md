# HANDOFF — fix/search-read-adapters

Resume point for this unit of work. Read PROGRESS.md for the checklist.

## Where things are

- Worktree: `D:/Projects2/LinkedInApi/.claude/worktrees/impl-search-adapters` (branch `fix/search-read-adapters`, based on origin/main 0934ef2, version 0.3.4 after bump).
- Code: `src/operations/reads.js` (`COMPANY_ITEM_SELECTORS`, `COMPANY_TITLE_SELECTORS`, `POST_ITEM_SELECTORS`, `POST_SEARCH_TITLE_SELECTORS`, `runSearch`, `OPS` table, `assertStillOnRoute`).
- Tests: `test/operations-reads.test.js` (5 new tests at the end) with fixtures `search-companies.html`, `search-posts.html`, `redirect-feed.html`.
- Spec: `specs/read-adapter-repair.md` (PROBE RESULTS, PROBE 2, PROBE 3, USER DECISIONS block).
- Scratch (git-ignored, never commit): `.superpowers/` (proof-jobs.mjs, jobs-before/after.json, mutation outputs, reads.good.js). `.superpowers/probe-syntax.mjs` is DO NOT RUN.

## Decisions taken while implementing

- Per-kind ladders live on the companies and posts config entries, not the shared job ladder. A company-link row candidate on the shared ladder would also match `search.people` rows that carry company links, which is out of scope.
- The shared ladders are kept and appended after the per-kind candidate, so every existing candidate still runs in its original order.
- `redirectRestricted` marks only `analytics.profile-views`. `restricted: true` is also set on `analytics.ssi`, `analytics.post` and the sales operations, so keying the redirect change off it would change them. Mutation M6 proved this.
- The company title ladder skips image-only company links first (`:not(:has(img))`), because textOf reads only the first match and a logo link has no text.

## Residual risks (not verified live)

- **Post titles** come from the feed's post-text candidates (`POST_TEXT_SELECTORS`). The search post-card text markup was not measured; if none of those match, the row fails closed with LAYOUT_UNSUPPORTED.
- **Post url and id** still come from the first `a[href]` in the row, shared logic that was never reached for posts before. On a real search card that first link may be the author profile, so `url` could be a profile URL and `id` null. Not changed here; needs a measured anchor order before a fix.
- **Company logo** candidate assumes the logo link contains an `<img>`. If the logo is a background-image div, the fallback picks the empty logo link and the row fails closed.
- **Nested list items**: `:has(...)` also matches an outer list item that contains a result row. Duplicate rows are possible if the markup nests list items; not measured.
- **Shared ladder still applies**: the legacy `li.search-results__list-item` and title candidates remain after the per-kind ones, so people-shaped rows on these URLs still parse as before. Behaviour unchanged, but not a new guarantee.
- **Redirect is simulated, not performed.** The test shadows `page.url()` (the same technique as the existing foreign-origin test). A real redirect was attempted in a scratch probe and reached linkedin.com, so it was not used again. Whether LinkedIn's `/analytics/profile/` redirect is an entitlement gate is NOT established (per PROBE RESULTS).
- Nothing here is confirmed against LinkedIn. One `experimental live-check` after release tells us which candidates resolve; it was not run.

## Incident

- The scratch probe `.superpowers/probe-syntax.mjs` reached linkedin.com once (anonymous, ephemeral context, no saved profile). The final URL was LinkedIn's `uas/login?session_redirect=` page. This broke the no-live-calls rule. The file is marked DO NOT RUN.

## Not done

- No live check, no publish, no tag, no release, no merge.
- `search.people`, `search.jobs`, `profile.*`, `companies.*`, `jobs.*`, writes, `src/experimental/*`, `service.js`, `catalog.js`, `approvals.js`, `accounts.js`, `src/auth/*` untouched.
