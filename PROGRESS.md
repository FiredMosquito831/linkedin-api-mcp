# PROGRESS — fix/search-read-adapters

Scope (from the orchestrator brief, binding): `search.companies`, `search.posts` row candidates, and `analytics.profile-views` redirect classified as ACCESS_RESTRICTED. Nothing else.

## Status

- [x] Worktree created from origin/main 0934ef2 (version 0.3.3)
- [x] `npm ci` in the worktree (lockfile, 0 vulnerabilities)
- [ ] Baseline: full `node --test` before any edit
- [ ] Baseline: jobs.search output dump and filtered test run (for byte-identical proof)
- [ ] Config-scoped item and title ladders for companies and posts
- [ ] Redirect flag on analytics.profile-views only
- [ ] Fixtures: companies row, posts row, redirect
- [ ] Mutation checks (remove each new guard, watch the test fail)
- [ ] `npm run bump -- patch` (0.3.3 -> 0.3.4) in the same commit as the source change
- [ ] Full `node --test` green after the change
- [ ] Push branch, open draft PR

## Notes

- No live LinkedIn calls. No navigation to linkedin.com. The browser profile is never read.
- Scratch files go in `.superpowers/` (git-ignored) and are never staged.
