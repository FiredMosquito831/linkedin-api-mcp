# WORKING-NOTES-ARCHIVE.md — history and the dated diary

Superseded blocks of `WORKING-NOTES.md`, the dated "SHIPPED AND VERIFIED BY ME" lines, and long version-table cells that no longer belong in the current-truth manual live here, verbatim, each with an index entry. Section numbers cited by old specs are never renumbered in the manual; when a block is superseded it is copied here before it is replaced.

## Index

| Date | Entry |
|---|---|
| 2026-10-23 | SHIPPED AND VERIFIED BY ME — 0.3.4. Merge `98e34c0` = `origin/main`; PR #10 six CI jobs read individually, all pass; my own `node --test` run 349 pass / 0 fail; diff reviewed (additive ladders only); fixtures synthetic; one guard mutated by me (posts candidate removed → test fails, restored byte-identical); publish run `39937631339` success; registry `latest` = 0.3.4, `gitHead` = `98e34c0`, downloaded tarball SHA-512 matched `dist.integrity`, SLSA provenance v1 present. Two deviations: the implementer's scratch probe made one anonymous request to LinkedIn's login URL (reported by the agent, file marked DO NOT RUN, git-ignored), and its WIP `PROGRESS.md`/`HANDOFF.md` had been committed onto the branch and were removed before merge. Leftover: `.claude/worktrees/impl-search-adapters` (holds local branch `fix/search-read-adapters`; the remote branch was deleted). |
| 2026-10-23 | SHIPPED AND VERIFIED BY ME — 0.3.3. Merge `96909b2` = `origin/main`; PR #9's six CI jobs read individually (4 pass early, 2 Windows jobs pass later); publish run `39865260123` success; registry document `dist-tags.latest` = `0.3.3`, `gitHead` = `96909b2`, tarball downloaded and its SHA-512 matched `dist.integrity` (`sha512-XPrQgv3sEHD5O…u1g==`), sha1 matched `dist.shasum`; SLSA provenance v1 present. First `workflow_run` publish attempt was skipped because the merge cancelled the preceding main CI — the successful run then triggered a second publish attempt, which shipped. |
| 2026-10-23 | Manual initialised by /working-notes; no superseded blocks yet. |
