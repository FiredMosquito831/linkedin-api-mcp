# HANDOFF — fix/search-read-adapters

Resume point for this unit of work. Read PROGRESS.md for the checklist.

## Where things are

- Worktree: `D:/Projects2/LinkedInApi/.claude/worktrees/impl-search-adapters` (branch `fix/search-read-adapters`, based on origin/main 0934ef2).
- Code: `src/operations/reads.js` (`SEARCH_ITEM_SELECTORS`, `SEARCH_TITLE_SELECTORS`, `runSearch`, `OPS` table, `assertStillOnRoute`).
- Tests: `test/operations-reads.test.js` with fixtures in `test/fixtures/reads/`.
- Spec: `specs/read-adapter-repair.md` (PROBE RESULTS, PROBE 2, PROBE 3, USER DECISIONS block).

## Decisions taken while implementing

- Selector ladders for companies and posts are scoped to their own config entries, not the shared job ladder. A company-link row candidate on the shared ladder would also match `search.people` rows that carry company links, which is out of scope.
- A new explicit flag `redirectRestricted` marks only `analytics.profile-views`. The existing `restricted: true` flag is set on `analytics.ssi`, `analytics.post` and the sales operations too, so keying the redirect change off it would change those.

## Not done

- No live check. The measured signatures are from PROBE 3; the candidates are verified only against local fixtures.
