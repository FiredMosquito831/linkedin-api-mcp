# PROGRESS — fix/search-read-adapters

Scope (from the orchestrator brief, binding): `search.companies`, `search.posts` row candidates, and `analytics.profile-views` redirect classified as ACCESS_RESTRICTED. Nothing else.

## Status

- [x] Worktree created from origin/main 0934ef2 (version 0.3.3)
- [x] `npm ci` in the worktree (lockfile, 0 vulnerabilities)
- [x] Baseline: full `node --test` before any edit: 344 pass, 0 fail
- [x] Baseline: jobs.search output dump (sha256 36a08c96...) and filtered jobs test
- [x] Red: new tests run against unmodified source; 3 behaviour tests fail, 2 guard tests pass
- [x] Config-scoped item and title ladders for companies and posts (reads.js)
- [x] Redirect flag `redirectRestricted` on analytics.profile-views only (reads.js)
- [x] Fixtures: search-companies.html, search-posts.html, redirect-feed.html
- [x] Green: 5 new tests pass
- [x] jobs.search after change: sha256 identical, `cmp` identical, jobs test passes
- [x] Mutations (remove guard, watch test fail, restore, cmp): M1 companies item, M2 posts item, M3 company logo-skip title, M4 redirect flag, M6 gate widened to all restricted ops. All five failed their test; all restored byte-identical
- [x] `npm run bump -- patch` (0.3.3 -> 0.3.4): package.json, package-lock.json, plugin.json agree
- [ ] Full `node --test` green after the change
- [ ] Commit (source + tests + fixtures + bump + notes), push, draft PR

## Incident (recorded, not repeated)

- A scratch syntax probe (`.superpowers/probe-syntax.mjs`) with a routed 302 reached linkedin.com. The final URL was LinkedIn's `uas/login?session_redirect=` response, so an anonymous request left the machine. The context was ephemeral (no cookies, no saved profile). This broke the no-live-calls rule. The file is marked DO NOT RUN. The shipped redirect test uses URL shadowing (no network).

## Notes

- Scratch files go in `.superpowers/` (git-ignored) and are never staged.
- Known residual items are listed in HANDOFF.md.
