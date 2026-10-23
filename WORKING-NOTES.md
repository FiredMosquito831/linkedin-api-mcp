# Working Notes — the operating manual for linkedin-api-mcp

The orchestrator's manual: how the user works, what they verify and reject, repo and release mechanics, CI and code rules, product principles, domain facts, how agents are run, the machine, every release, every learning, and what is still open. **Current truth only.**

- **Where it lives:** `D:\Projects2\LinkedInApi\WORKING-NOTES.md` — repo root, committed with the repo (the handoffs already lived there).
- **Before editing:** copy it to `WORKING-NOTES.bak-<yyyy-mm-dd-hhmm>.md` beside it. Backups are git-ignored via `WORKING-NOTES.bak-*`. Never modify or delete a `.bak*`.
- **Format:** UTF-8, LF in git (the working copy may be CRLF under `core.autocrlf`). Append with a script that reads `newline=""`, asserts its anchor exactly once, and writes the same newline. Never `sed -i`/`awk` on it.
- **Who edits:** only the orchestrator. Agents never edit it — they report lessons in their final message and the orchestrator ports them.
- **No secrets** here, ever. Paths as `~` / `%USERPROFILE%` where possible.
- **Companions:** `WORKING-NOTES-ARCHIVE.md` (diary and superseded blocks), `QUEUE.md` (binding PR queue), `HANDOFF-2026-10-22.md` (the dated running log), the newest `HANDOFF-<date>.md` (entry point), `specs/` (specs with binding `USER DECISIONS` blocks).

## Map of this file

| Part | What lives here |
| --- | --- |
| I — How the user wants to work | ownership, discuss-first, delegation, verification, rejections, communication, standing decisions |
| II — Repo mechanics | layout, worktrees, versioning, the release process and its traps, PR shape, the verify recipe, hard rules for briefs |
| III — CI, testing, code rules | the gate, flakes, isolation, code rules, boundaries, contract tests, stored data |
| IV — Product principles | the rules every change is judged against |
| V — Domain facts | what LinkedIn's pages actually do, measured |
| VI — Subagent orchestration | the loop, briefs, resume, failure modes |
| VII — Environment | machine, tools, account, state directory |
| VIII — Release history | one row per version |
| IX — Learnings | one deduplicated list, grouped, each with its origin |
| X — Still open | priority, queue pointer, held work, the user's own to-dos |

**Fastest cold start:** the newest HANDOFF → PART I → II.5 → II.6 → IV → the last rows of PART VIII → X.

---

# PART I — HOW THE USER WANTS TO WORK

## I.1 Ownership and what "done" means
- Their repo, their merge: `FiredMosquito831/linkedin-api-mcp`, remote `origin`, default branch `main`, public on GitHub. No upstream; nothing to push anywhere else.
- **Merged is not shipped.** Shipped = committed + pushed + CI green + squash-merged + the version published to npm + the registry artefact verified + (since 0.3.3) a GitHub release at the merge SHA.
- **Standing instruction (2026-10-23): "merge always merge on green PR."** When a PR of ours is green and its content was reviewed, merge it without a second ask. Publication follows automatically; report it, do not re-ask.
- Finish end to end. "Fixed" means the user can see it working: state the exit criterion in their terms, test to it, lead with the negative when it is negative.
- Good behaviour by default: never a "run this once" step the user must remember.
- **The live system is the user's own LinkedIn account**, reached through `~/.linkedin-api-mcp/browser-profile` (session cookies) and the OS credential store (OAuth tokens). Never mutate it without a specific go (target + payload). Never solve or bypass a challenge for them.

## I.2 Discuss before building
- Read-only investigation → a spec in `specs/` with NUMBERED plain-language questions, each with a recommendation → the user answers in one line ("all rec") → a binding `USER DECISIONS (<time>)` block appended → ONE implementer. Never dispatch an implementer before the user agrees.
- A small ask must not fan out; scope beyond the literal request is a question BEFORE dispatch.
- Safest, 100 % working, break nothing: change only what is broken, where it is broken; equality contracts prove behaviour-preserving work; what cannot meet the bar is left out and named.
- Investigations finish before fixes start on the same question.
- Questions the user can answer: plain language, only about things they can see or decide; never relay an agent's question unchecked.
- Queue discipline: finish QUEUED items in order; new ideas wait; after the last queued item, report and let the user choose.
- Granular PRs: one concern per PR and release; scope additions go to the NEXT PR unless one line.
- External publication (npm publish, GitHub release, registry mutation) needs an explicit go — except that a green PR merge may publish automatically, which the standing instruction above covers.

## I.3 Delegation, model choice, context
- Delegate investigation and building; take conclusions. Protect the orchestrator's context.
- **Every agent = `model: "haiku"`.** Standing rule in `CLAUDE.md`; it overrides any default of inheriting the session model. State it in every dispatch.
- At most **2** agents at once; one implementer at a time; read-only investigators may run beside it.
- One written spec per implementer: enumerated contract, every `file:line` grepped, tests named, docs, verification.
- Announce every dispatch in the same message. No extra process artefacts beyond the named files.
- No diagnostics of the user's machine unless asked. Agents keep `PROGRESS.md` + `HANDOFF.md` in their worktree from the first edit; **those files never travel into the repository** (see IX.2).
- No infinite or background polling anywhere; bounded loops with a timeout.

## I.4 How they verify
- They test independently and come back with counter-evidence. Assume every claim will be checked on their machine.
- Their bug reports are precise and usually right: reproduce first, argue never.
- "Did you fix it" is often honestly "no, and here is what I actually verified".
- When they are frustrated: lead with evidence, not reassurance.
- They read code and diffs. "It works because the fixture passed" is the fastest way to lose their trust — see IX.1.

## I.5 What they reject
- Invented limits; claiming it works without running it; filler docs; docs in the wrong place; a UI never driven in a browser; per-name fixes; speculative features; changes to retry/fallback/challenge-detection/approval behaviour that were not the PR's stated purpose; a long page as a fix; being told to change their settings.
- **CAPTCHA/access bypass**: refused outright, even when requested. No solving, no stealth, no rate-limit evasion, no header or proxy games, no bulk outreach. The project's premise is "without abuse" (`reports/LinkedIn CLI automation without abuse.md`).

## I.6 Communication style
- Lead with the answer, then the evidence; show real command output rather than describing it.
- Say plainly when wrong, correct it, move on.
- Separate **CONFIRMED** (ran it; output shown), **UNVERIFIED** (read it), **NOT DONE** (skipped, and why).
- Machine timezone is **UTC+03**; workflow timestamps are UTC. Convert before saying "recent".

## I.7 The user's standing decisions (do not re-ask)
- 2026-10-21 — scope expanded to opt-in own-account browser automation, bounded extraction, internal API reads, local scheduling/batches/worker. "Experimental does not mean compliant or safe."
- 2026-10-22 — ship as both an npm package (`linkedin-api-mcp`, unscoped, public) and a Claude Code plugin/marketplace from the same repo root, following `FiredMosquito831/ase-moodle-mcp` and `FiredMosquito831/google-services-mcps`.
- 2026-10-22 — release automation: main-push CI → automatic OIDC publish; release/manual tag dispatch also publishes; same-version pushes skip.
- 2026-10-22 — writes verified one at a time, deliberately and spaced, with an exact reviewed target and payload; `reactions.add`/`reactions.remove` first.
- 2026-10-23 — "fix the detector"; **iframe bypass requested and refused**. Hidden background frames are ignored for detection; every visible challenge still stops.
- 2026-10-23 — cover **absolutely all surfaces**, including Sales Navigator (blocked in practice by an HTTP 403).
- 2026-10-23 — read-adapter repair: family by family, search family first; probe budget 12 + 3 contingency, then 8, then 4.
- 2026-10-23 — **"merge always merge on green PR."**
- 2026-10-23 — GitHub releases approved for v0.3.3 and v0.3.4.
- 2026-10-23 — on the Sales 403: "retry and or bypass" — **bypass refused**; one spaced read-only re-check permitted after the current arc.

---

# PART II — REPO MECHANICS

## II.1 Layout, worktrees, branches
- Checkout: `D:\Projects2\LinkedInApi`.
- Worktree root: `D:\Projects2\LinkedInApi\.claude\worktrees\` (git-ignored). Existing: seven `agent-*` worktrees from earlier runs plus `impl-search-adapters` (holds the local branch `fix/search-read-adapters`). **Never delete them** — list leftovers and let the user decide.
- Scratch: `D:\Projects2\LinkedInApi\.superpowers\` (git-ignored): `diagnostics/` (probe scripts and their JSON), `backups/`, release-note drafts, PR bodies, CI waiter scripts.
- New work: `git -C D:/Projects2/LinkedInApi fetch origin` then `git worktree add -b <branch> D:/Projects2/LinkedInApi/.claude/worktrees/<id> origin/main`.
- Never `git stash`, `git checkout <file>`, or `git reset` in a worktree. Inspect with `git diff`; compare against a base in a second detached worktree.
- Branches mirror the commit type (`fix/`, `feat/`, `docs/`, `perf/`, `chore/`, `test/`); squash-merge and delete.
- A merged branch whose worktree still holds it cannot be deleted locally; delete the remote ref instead and leave the local one.
- Line endings: LF in git, CRLF in the working copy under `core.autocrlf`. Never rewrite a file's endings while editing one line.

## II.2 Versioning
- `npm run bump -- patch|minor|major|X.Y.Z` (`scripts/bump.mjs`) moves `package.json`, `package-lock.json` and `.claude-plugin/plugin.json` together. Never hand-edit one of the three.
- PATCH: adapter/selector/detector fixes, docs. MINOR: new operations, commands, surfaces, or a default that changes what the tool checks. MAJOR: breaking CLI/API shape.
- `src/version.js` reads the installed `package.json`; there is no hardcoded version constant.
- The plugin pins `"version"`; plugin users stay on the cached copy until it changes.

## II.3 Release process
1. Bump in the same commit as the source change (or the last commit of the branch).
2. Push the branch, open the PR (draft only while work continues), wait for **every** check with one bounded loop reading each conclusion.
3. `gh pr ready` if it is still a draft, then squash-merge with `--delete-branch`.
4. `npm.yml` publishes automatically after a successful main-push CI (`workflow_run`), or from a published release / manual tag dispatch. Same-version pushes skip publication.
5. Create the GitHub release **targeting the merge SHA**: `gh release create vX.Y.Z --target <full merge sha> --title ... --notes-file ...`. A short SHA is rejected; a branch name silently targets its tip and lands the tag on the wrong commit (happened once, fixed by deleting and recreating).
6. Verify the registry, not `npm view` (it caches): read `https://registry.npmjs.org/linkedin-api-mcp`, check `dist-tags.latest`, `gitHead`, then download the tarball and compare its SHA-512 with `dist.integrity`.
7. Check the provenance attestation: `https://registry.npmjs.org/-/npm/v1/attestations/linkedin-api-mcp@X.Y.Z`.
8. Report each workflow's state by reading its jobs, one by one.
- Release notes are the only changelog: headline → what was wrong with measured evidence → what to expect → action required (exact command) → known and deliberate.
- **Traps that bit:** (`a`) a merge cancels the in-flight main CI, so the first `npm publish` `workflow_run` fires for a cancelled run and shows `skipped`; the successful run then triggers a second publish that ships — wait for the second before investigating. (`b`) `gh release create --target <branch>` tags the branch tip, not the release commit. (`c`) `gh pr merge` refuses a draft. (`d`) `gh pr merge --delete-branch` aborts the remote deletion when the local branch is held by a worktree; delete the remote ref explicitly.

## II.4 PR and commit shape
- Commit message: conventional prefix, then prose — what was broken → the mechanism (cause, not symptom) → what the fix does and any non-obvious choice → verification with real output → what was deliberately not done. End with `by FiredMosquito831`.
- PR body: the same structure with headings, real output in fenced blocks, and a **Residual risks** section always ("none" if none). End with `by FiredMosquito831`.
- Never claim verification beyond what ran; name fixture evidence as fixture evidence.

## II.5 The verify recipe (after every "shipped" report, before relaying)
```
1. git fetch; origin/main head; nothing unpushed (git log origin/main..main empty).
2. Merge SHA == GitHub release tag target; release is published, not draft.
3. Registry document: dist-tags.latest == version; versions[v].gitHead == merge SHA.
4. Download the registry tarball; SHA-512 == dist.integrity; sha1 == dist.shasum.
5. Attestation endpoint lists slsa.dev/provenance/v1.
6. Workflow runs: read each job's conclusion (ci matrix, npm publish). Never trust --watch.
7. Frozen-boundary diff empty unless the file is the PR's stated purpose.
8. Run the suite myself; run at least one mutation on a new guard.
9. Any live claim: the command's own output line, not a description of it.
```
Then: append a dated "SHIPPED AND VERIFIED BY ME" line to `WORKING-NOTES-ARCHIVE.md`, a PART VIII row, flip the queue row, port the lessons, tell the user (what shipped, what I verified, deviations, not done), announce the next dispatch.

## II.6 Hard rules for every implementer brief
1. **Where:** a worktree per II.1; never the primary checkout; never stash/checkout-a-file/reset; never delete scratch; list every dir left behind.
2. **Never touch the user's world:** do not sign in as the user, do not act on their account, do not modify `~/.linkedin-api-mcp` beyond what an approved test needs, never touch the OS credential store, autostart, registry, or PATH.
3. **Stopping processes:** only PIDs you started, by exact PID; close every browser you opened.
4. **No live LinkedIn calls** — and say "network", not just "destination". No browser against a real origin; any redirect must be intercepted; a scratch script that can reach the network is not run at all.
5. **Secrets:** never read or print `Cookies`/`Local State`, token files, or OAuth client secrets; mask by shape; screenshots of the tool's own window only.
6. **Browser launches in a proof:** a scratch profile directory, never `~/.linkedin-api-mcp/browser-profile`; headless unless a screenshot is the point.
7. **Test isolation:** temp dirs and fixtures; no test may navigate to linkedin.com (CI has no session).
8. **Tooling:** `node --test` (npm drops unknown flags — never `npm test -- --flag`); scripts as files run by path; no `-c` one-liners or heredocs into an interpreter; no `sed -i` on tracked files.
9. **Frozen safety boundary** (diff it after every ship; must be EMPTY unless the file is the PR's stated purpose): `src/experimental/policy.js`, `src/experimental/challenge.js`, `src/operations/approvals.js`, `src/operations/service.js`, `src/operations/catalog.js`, `src/operations/accounts.js`, `src/auth/token-store.js`. Goldens: every fixture under `test/fixtures/` the PR does not exist to change. Never weaken `test/live-check.test.js:105` (no page body/token/cookie in a detail) or `test/mcp-http.test.js:206` (no credential in an error).
10. **Versioning and gate:** II.2, III.1.
11. **New settings:** the III.6 checklist.
12. **Ship:** II.3 in full.
13. **Live calls** only with consent and a stated budget; a rate-limit answer is inconclusive; **a challenge stop is a correct outcome**, never a bug to work around.
14. **Reporting:** the final message IS the deliverable; keep `PROGRESS.md` + `HANDOFF.md` in the worktree and **do not commit them**; bounded loops; do not edit this manual — report lessons; list leftovers.
15. **Extend, never narrow:** name every module touched (`file:line`), read each first, add to existing mechanisms in their own order, prove existing outputs byte-identical; stop and report if the scope needs removing or bypassing behaviour.

**Brief skeleton:** `C:\Users\fgghk\.claude\skills\working-notes\templates\BRIEF-IMPLEMENTER.template.md` / `BRIEF-INVESTIGATOR.template.md`.

---

# PART III — CI, TESTING, CODE RULES

## III.1 The gate
- No lint or type-check (plain ESM JavaScript).
- `node --test` — the whole suite. **Last measured: 349 tests, 0 fail** (2026-10-23, 0.3.4).
- No-browser subset: `node --test test/operations-core.test.js test/mcp-server.test.js`.
- Chromium subset: `node --test test/operations-reads.test.js test/experimental-browser.test.js test/operations-session.test.js test/challenge-detector.test.js` (needs `npx playwright install chromium`).
- `npm run pack:check` (dry run), `npm run pack:smoke` (installs the built tarball in a temp consumer), `npm run release:check -- vX.Y.Z` (tag/version guard).
- CI (`.github/workflows/ci.yml`): one matrix job — ubuntu/windows/macos × Node 22.12.0/24 — running `npm ci`, `npx playwright install --with-deps chromium`, `npm test`, `pack:check`, `pack:smoke`. Concurrency `cancel-in-progress: true` (this is what cancels the main run on merge).
- 23 test files. Baseline: 0 known failures.
- Risk tiers (from the diff paths; tier up when unsure): T0 docs/tests → the suite; T1 one adapter's selector → its fixture test + the suite; T2 operations/detector/service → suite + a mutation per new guard; T3 approvals/tokens/accounts → suite + an attempt to break the boundary; T4 release/packaging → suite + `pack:smoke` + `release:check`.
- Never two full gates at once on one machine.

## III.2 Known flakes
- None recorded. Watch: Playwright Chromium fixtures on a cold machine; `pack:smoke` touching the npm registry from the temp consumer.

## III.3 Test isolation
- Temp directories (`mkdtemp`) or a fake home; nothing writes to `~/.linkedin-api-mcp`.
- No test opens a real LinkedIn session. `test/operations-reads.test.js` drives Chromium over local fixtures only; a redirect is simulated with a `Proxy` over `page.url()`, never performed.
- The keyring is exercised only in `test/token-store.test.js`, behind fakes; it must not write a real credential.
- Avoid order dependence; a new process-wide singleton needs a reset in the same commit.

## III.4 Code rules that fail review
- Errors carry stable codes (`src/operations/errors.js`); never a page body, a token, or a raw upstream message.
- No hardcoded version (`src/version.js`); no `process.env` reads outside the documented names (`LINKEDIN_STATE_DIR`, `LINKEDIN_EXPERIMENTAL`, `LINKEDIN_ACCOUNT`).
- Node >= 22.12.0, ESM only.
- Playwright 1.64.1 has **no install script**; Chromium is an explicit download (`linkedin browser install`). The npm package never downloads a browser.

## III.5 Architecture and import boundaries
- `src/operations/catalog.js` is the single source of both CLI commands and MCP tool schemas; an operation is added there, then to `reads.js`/`writes.js`, then to the service dispatch.
- `src/operations/service.js` validates every operation and chooses the adapter; adapters never call each other.
- `src/experimental/policy.js` owns `assertExperimental`, `assertResponse`, `linkedinUrl`, `HumanInterventionError`. `src/experimental/challenge.js` owns challenge detection and is imported by **both** browser paths (`src/experimental/browser.js`, `src/operations/session.js`); it must not import either session.
- `src/linkedin/client.js` stays identity-only. No generic internal-API passthrough exists and none may be added.
- `src/mcp/server.js` generates tools from the catalog and must not import the browser adapters at module load (stdio startup launches nothing).

## III.6 Every new setting / environment variable
- Constant default → documented env/config name → CLI surface with real help text → bounds → example in `docs/installation.md` → a contract test pinning the default. Everything new is opt-in and byte-stable when unset.

## III.7 Contract tests you will meet
- `test/version-contract.test.js` — package, lockfile, plugin manifest and the MCP-reported version agree.
- `test/packaging.test.js` — `files` whitelist, both bins, plugin/marketplace manifests, credential-shape scan.
- `test/live-check.test.js:105` — a detail never carries a page body, token, or cookie.
- `test/mcp-http.test.js:206` — transport errors never echo an `authorization` header.
- `test/oauth.test.js` — non-2xx reports the status without the body; the authorization URL never carries the client secret.
- `test/operations-core.test.js` — every catalog operation validates input; approval binding is account + payload + image digest.
- `test/operations-reads.test.js` — per-adapter parsing plus the "other operations still return LAYOUT_UNSUPPORTED" guard introduced with `redirectRestricted`.

## III.8 Stored-data schema rules
- Browser profile, queues, approvals, account registry live under `~/.linkedin-api-mcp` (or `LINKEDIN_STATE_DIR`). The queue stores action metadata only. Approvals are single-use, expire in 10 minutes, consumed before dispatch.
- Any stored-shape change is additive; an old file must still load (test with a pre-change fixture).

---

# PART IV — PRODUCT PRINCIPLES

1. **No invented limits.** Never a hard-coded ceiling for something LinkedIn reports.
2. **Clamp to capability, never under-use it.** Unknown → fall back and say so.
3. **Scope boundaries are explicit** — what the tool does vs what the human must do (authentication, verification, approval).
4. **Guardrails must not become outages.** A failed adapter fails closed and reports `LAYOUT_UNSUPPORTED`; it never guesses at a parse.
5. **Secrets never leave the machine in identifiable form.** No token, cookie, message text, or page body in a report, log row, queue entry, or diagnostic.
6. **General over per-name.** One adapter family, one selector ladder per kind, one detector. No branch on an account name.
7. **Everything new is opt-in and byte-stable when unset.** Default surface is capability-only; experimental needs `--experimental` (or `LINKEDIN_EXPERIMENTAL=1`) plus acknowledgement or `--yes`.
8. **Never alter retry, fallback, challenge-detection or approval behaviour** except as a PR's stated, user-approved purpose. Unknown outcomes are never retried.
9. **No hand-entered facts where a source exists.**
10. **No speculative features.** Build what was asked.
11. **Every setting is visible** where it belongs, with real help text.
12. **The user's values stay the user's.** Never change the account, profile, or browser session to "fix" a test.
13. **Data is never lost by a feature.**
14. **Good behaviour by default, one update path.**
15. **Documentation is a deliverable**, in `docs/`; the root `README.md` is the front door.
16. **Unknown is not unsupported.** `LAYOUT_UNSUPPORTED`, `ACCESS_RESTRICTED`, `AUTH_REQUIRED`, `completionUnknown` are different answers, and a redirect is not a layout change.
17. **Honest product wording.** "Verified live" names which operations, on which account shape, with what evidence.
18. **Never reduce a wide, deep system to fit one scope.** Adding a surface adds a rung to the catalog.

---

# PART V — DOMAIN FACTS AND GOTCHAS

## V.1 LinkedIn's rendered pages (measured 2026-10-22/23, one account)
- **Class names are obfuscated** (`kxh4j`-style). Class selectors are dead. Key on `data-testid`, `componentkey`, `role`, `aria-label`.
- The **feed list mixes posts, suggested people and ads**; only list items carrying `[aria-label^="Reaction button state"]` are posts.
- Some live controls are **absent from the accessibility tree** (`getByRole('button',{name:'Follow'})` = 0, `getByLabel('Follow')` = 1). Resolution order: role → label → attribute selector, after a wait.
- Controls can be **absent briefly after navigation**; `uniqueControl` waits before declaring one missing.
- Connections route: `/mynetwork/invite-connect/connections/`.
- The app shell returns **intermittent 404 for routes it still renders**; accept only when `main`/`role=main` attaches.
- Profile edit entry is `<a aria-label="Edit profile">`.
- Inbox rows are the thread **links** themselves; exclude the "new message" stub.
- A normal page mounts a **hidden 0×0 reCAPTCHA Enterprise iframe** (`role="presentation"`, inside `display:none`). Counting it is a false positive; the detector requires visibility.
- A challenge **before** dispatch is `AUTH_REQUIRED` (exit 3), not `completionUnknown` (exit 8); the adapter's verdict wins over the service fallback.
- `sales.search-people` returned **HTTP 403** → `HUMAN_INTERVENTION_REQUIRED`. An access refusal is not proof a CAPTCHA was shown.
- **`<main>` is not guaranteed.** Invitations, saved jobs, and the company page rendered without it; `findItems` is page-wide, so a missing `main` is not itself the cause of a parse failure.
- **Saved jobs render late:** 44 elements at load → 293 after ~5 s, with a `ul` of 6 `li > a` rows.
- **Job search** renders a `ul` of ~25 `li` job cards; it parsed successfully in probes but was `unsupported` in one later live-check — unexplained (see IX.1).
- **Company posts** on this account render no reaction-controlled post card; `role="article"` and `/company/` links exist.
- **Job detail** mounts a `JobDetails_` component that is an empty placeholder at 2.5 s; the title is **not** an `h1`.
- **Search companies** rows are `li`/`listitem` containing `a[href*="/company/"]` (logo link first, then the name link).
- **Search posts** rows carry a reaction control; the same rule as the feed.
- **Search people** rows exist as `listitem`s but carry **no anchors**; `main li` matches the pagination button first.
- **`analytics.profile-views` redirects to `/feed/`** — an access gate, now reported as `ACCESS_RESTRICTED`.

## V.2 Read status (measured 2026-10-23)
- **Live-confirmed populated:** `search.companies` (3 rows), `search.posts` (3 rows), `jobs.search` (3 rows in probes), `profile.get` (name only), `feed.list` (2 rows, 1 author, 0 permalinks).
- **Explicit empty state:** `posts.list`, `inbox.list`, `inbox.search`, `connections.list` (the account has none of each).
- **Live-check ok:** `profile.get`, `posts.list`, `feed.list`, `inbox.list`, `connections.list`.
- **Still unsupported:** `profile.skills`, `profile.contact`, `companies.get`, `companies.posts`, `jobs.get`, `jobs.apply-url`, `jobs.saved`, `invitations.received`, `invitations.sent`, `search.people`.
- **Restricted:** `analytics.profile-views` (redirect). `analytics.ssi` returns `available:false`. `sales.*` blocked (403).

## V.3 Writes
- **0 verified live.** Follow/unfollow attempts returned `AUTH_REQUIRED`; a later read-only check showed the account already followed Microsoft. The first write attempt coincided with a verification challenge. No automatic retry, ever.

## V.4 Official API and OAuth
- Authorization Code: `GET /oauth/v2/authorization`, `POST /oauth/v2/accessToken`; client secret required; **HTTPS redirect only**. Default flow pastes the redirected URL back; `--loopback` is opt-in.
- The official client stays identity-only. OAuth login is **untested against a live developer app**.

## V.5 Packaging
- Repo root is both the npm package and the plugin. `.mcp.json` runs `node ${CLAUDE_PLUGIN_ROOT}/bin/linkedin.js mcp --transport stdio` — no global install, no `npx` fetch.
- `package-lock.json` v3 at the plugin root lets Claude Code auto-install deps on plugin install (`--ignore-scripts`, 60 s cap). Keep deps exact-pinned and in sync.
- A top-level `bin/` puts the plugin's bin on the Bash tool's PATH and makes claude.ai/Cowork refuse the plugin.
- `claude plugin validate` warns about the root `CLAUDE.md` and the missing listing icon.

## V.6 The product's own live check
- `linkedin experimental live-check` accepts only the seven names in `LIVE_READ_OPERATIONS` (`src/experimental/live-check.js`) and rejects anything else with "Unknown operation(s) … Live checks are read-only". It therefore cannot verify `search.*`, `analytics.*`, `jobs.get`, `invitations.*`. Queued as QUEUE item 4.

---

# PART VI — SUBAGENT ORCHESTRATION

## VI.1 The loop that holds up
1. Re-anchor (default branch head, latest release, open PRs, worktrees, `ListAgents`).
2. Read-only investigator → a spec in `specs/` with numbered questions + a recommendation each.
3. The user answers; append a binding `USER DECISIONS (<time>)` block.
4. ONE implementer (`model: "haiku"`) from the spec + decisions + II.6, in a fresh worktree; it ships branch → PR → CI, and stops before merge.
5. Verify every claim (II.5), merge on green (I.1), verify the publication, port lessons, report, announce the next dispatch.

Investigators disagree; the implementer measures both sides. Scope additions may be folded into a RUNNING agent by message; larger ones go to the next PR.

## VI.2 What goes wrong with agents, and the counter-measure
- Silence → the brief says the final message IS the deliverable.
- Kills → `PROGRESS.md` + `HANDOFF.md` from the first edit, WIP committed; resume the SAME agent by message.
- Waiting forever → bounded loops with timeouts only.
- Stray agents → `ListAgents` before every dispatch.
- Wrong claims → budget half to be wrong; check every `file:line`; "it works" needs the command's own output.
- **An agent that "fixes" a challenge stop** → forbidden by I.5; say so in the brief.
- **An agent that adds adjacent scope** (per-kind title ladders alongside per-kind row ladders) → usually necessary; check it stays inside the stated scope and name it in the review.
- **An agent that commits its own `PROGRESS.md`/`HANDOFF.md`** → remove them from the branch before merge.
- **An agent that reaches the network despite "no live calls"** → briefs must say *network*, not *destination* (IX.2).
- A cut-off launch brief → `ListAgents`, then re-send the full brief.
- Running a script from a skill directory dropped a stray `.superpowers/` into the plugin cache → always run from the repo root.

## VI.3 What a read-only investigator brief says
READ-ONLY: no git writes, no edits outside its scratch and the spec; **no live calls at all** unless a budget is stated and approved; never open the real browser profile; never print secrets; CONFIRMED vs UNVERIFIED separated; where to write the spec; the numbered questions.

---

# PART VII — ENVIRONMENT

- Windows 11 Pro, `D:\Projects2\LinkedInApi`; primary shell PowerShell, Bash (Git Bash) available. Timezone UTC+03.
- Node >= 22.12.0 (local runs seen on Node 24); npm. Playwright 1.64.1; Chromium installed separately.
- `@napi-rs/keyring` verified on Windows only; Linux unverified; unsupported platforms fail at load.
- State dir `~/.linkedin-api-mcp` (or `LINKEDIN_STATE_DIR`): `browser-profile/` (session cookies — sensitive), account registry, queue, approvals. Never share or commit.
- Scratch `.superpowers/` (git-ignored): `diagnostics/` holds sanitized probe JSON and scripts; `read-probe*.mjs`, `check-034-adapters.mjs`, `bounded-read-matrix.mjs`, plus CI waiter scripts (`ci-wait.sh`, `wait-registry.sh`, `wait-publish*.sh`).
- Untracked noise: `bash.exe.stackdump` in the root (Git Bash crash dump); `*.stackdump` is git-ignored.
- Never: sign in as the user, solve or bypass a challenge, publish by hand, run two full gates at once, delete a worktree.

---

# PART VIII — RELEASE HISTORY

| Version | Date | PR | What |
| --- | --- | --- | --- |
| 0.0.0-stage | 2026-10 | — | Temporary public placeholder; superseded. Optional `npm deprecate` still open. |
| 0.2.0 | 2026-10-22 | — | First real package: CLI + library + MCP server, plugin/marketplace, official OAuth login, agent installs. |
| 0.2.1 | 2026-10-22 | #4 | Seeded from `git log` (pre-orchestration). |
| 0.2.2 | 2026-10-22 | #5 | Wait for npm registry replication before failing a publish. |
| 0.3.1 | 2026-10-22 | #7 | Tune adapters against live LinkedIn (testids/labels/roles). |
| 0.3.2 | 2026-10-22 | #8 (`37e3386`) | Live-verification fixes; OIDC publish; tag, main and registry `gitHead` agree; tarball verified. |
| 0.3.3 | 2026-10-23 | #9 (`96909b2`) | Visibility-aware challenge detector. 344 tests; six CI jobs; publish `39865260123`; registry verified; release v0.3.3 at `96909b2`. |
| 0.3.4 | 2026-10-23 | #10 (`98e34c0`) | `search.companies` + `search.posts` row parsers; `analytics.profile-views` → `ACCESS_RESTRICTED`. 349 tests; six CI jobs; publish `39937631339`; registry and provenance verified; release v0.3.4 at `98e34c0`. Live-confirmed: 3 + 3 populated rows, analytics restricted. |
| 0.3.5 | 2026-10-23 | #11 (`ce8ec52`) + #12 (`3b4a078`) | `live-check` accepts any catalog read and gains `--all-reads`; an input that does not match is reported skipped, never failed. 364 tests. **Publication was blocked twice by Windows-only test failures on the merge commit**: first `pack:smoke` `ETIMEDOUT`, then `EBUSY` unlinking `chrome_debug.log`. PR #12 (test-only, no bump) added bounded `rm` retries; merged as `3b4a078`, which is the published `gitHead`. Publish run success; registry `latest` = 0.3.5, integrity and provenance verified; release v0.3.5 at `3b4a078`. |
| 0.3.6 | 2026-10-23 | #13 (`5400528`) | `companies.posts` parses `main [role="article"]` cards; `search.people` parses `main [role="listitem"]` cards with title + url. 366 tests; eight mutations; six CI jobs; publish success; registry `latest` = 0.3.6, integrity and provenance verified; release v0.3.6 at `5400528`. **Live: `search.people` 3 rows with title+url on all 3; `companies.posts` 3 rows with text only — no title, no permalink (partial).** |
| 0.3.7 | 2026-10-23 | #14 (`d331410`) | `companies.get` gains `[role="main"] h1`, `section h1`, page `h1` fallbacks; `jobs.get`/`jobs.apply-url` accept `main h2`. 373 tests; seven mutations. Publish from `13b0035`; release v0.3.7 there. **Live: `jobs.get` title works; `companies.get` still failed — the page had no `h1` yet when the reader looked.** |
| 0.3.8 | 2026-10-23 | #15 (`16d0d51`) | Bounded settle (5 s, 200 ms step) for required single fields: company name, job title, job-page presence check. 377 tests (my run); mutations on all three call sites; fail-closed now takes ~5 s (was ~95 ms). Publish from `16d0d51`; integrity and provenance verified; release v0.3.8. **Live: `companies.get` parses and returns the name; `jobs.get` keeps title + url.** |

---

# PART IX — LEARNINGS (consolidated, deduplicated)

## IX.1 Verification and evidence
- Re-anchor before analysing. The evidence ladder: the real artefact doing real work > a live read whose full output is shown > a fixture test > reading the code.
- **"7/7 report ok" measured only that functions returned**; three of those reads passed solely on the empty-account path. A green count is not a completeness claim. (2026-10-22.)
- A fixture proves the parser, not the page. (2026-10-22.)
- A test that cannot fail is not a test; prove every guard by removing it and watching the test fail.
- **Counting elements is not observing a state.** A hidden 0×0 reCAPTCHA iframe made a normal page look like a challenge. (2026-10-23.)
- A 403 is not proof a CAPTCHA appeared; an error class is not a diagnosis. (2026-10-22/23.)
- **A probe can be wrong in a way that looks like product failure.** A tree dump capped at depth 7 returned "no rows" for four pages that do have rows. Say "my probe could not see it", not "it is not there". (2026-10-23.)
- **The same adapter can disagree with itself across runs.** `jobs.search` parsed 3 rows in one probe and reported `LAYOUT_UNSUPPORTED` in a live-check an hour later; unchanged code, unchanged fixture. Environmental causes (page variation, throttling after ~30 navigations in an hour) are the likely explanation, and the honest record says "unexplained" rather than picking one. (2026-10-23.)
- **`ok` and "populated" are different claims.** `companies.posts` returned `ok` from the live check with three rows, but every row's title and url were empty; only the text field was present. A status line is not a field check — count the fields before calling a family fixed. (2026-10-23, 0.3.6.)
- **A page that renders late looks exactly like a page that changed.** `companies.get` threw `LAYOUT_UNSUPPORTED` on a company page that renders fine. Two probes taken early in the page's life saw no `<main>` and no `h1` and sent a whole release after selector fallbacks; a probe with a four-second settle found `main` and exactly one `h1`. The fix was a wait, not a selector. **Timing is part of the evidence: state when the census was taken, and wait before concluding the markup is gone.** (2026-10-23, 0.3.7 → 0.3.8.)

## IX.2 Agents and briefs
- A cut-off or overly broad brief produces an agent that fixes what it should not; the NOT-in-scope list must be explicit.
- **"No live calls" must name the network.** An agent honored "do not navigate to linkedin.com" but a scratch probe's un-intercepted 302 followed to LinkedIn's login URL. The brief must forbid launching a browser against any real origin and forbid running a scratch script that can reach the network. (2026-10-23.)
- **Agent scratch files must not reach the repository.** The same agent committed `PROGRESS.md` and `HANDOFF.md` onto its branch; they were removed before merge. Say "keep them in the worktree, do not commit them". (2026-10-23.)
- An agent will add the *necessary* adjacent change (title ladders beside row ladders) when the brief's literal scope would still fail; check it stays inside scope. (2026-10-23.)
- Run scripts from the repo root; a skill directory run created a stray `.superpowers/` in the plugin cache.

## IX.3 Shell, git and tooling traps
- **`npm test -- --flag` silently drops the flag.** Use `node --test` directly.
- A piped `| tail` swallows the exit code; read the tool's own summary line.
- **`gh release create --target <branch>` tags the branch tip**, not the release commit; use the full merge SHA. A short SHA is rejected outright.
- **A merge cancels the in-flight main CI** (`cancel-in-progress`), so the first `npm publish` run reports `skipped`; the successful run triggers a second publish that ships.
- **`gh pr merge --delete-branch` aborts the remote deletion** when the local branch is held by a worktree; delete the remote ref explicitly.
- **`gh pr merge` refuses a draft**; `gh pr ready` first.
- `npm view` caches; read the registry document instead.
- Git Bash on Windows emits `bash.exe.stackdump`; it is noise, not an artifact.
- **A green PR does not mean a green main.** The merge commit gets its own CI run, and a flaky job there blocks publication. Both 0.3.5 failures were on windows/Node 24 only, in jobs that had passed on the PR: first `pack:smoke` `spawnSync ... ETIMEDOUT` (SIGTERM after ~3 min), then `EBUSY: resource busy or locked, unlink ... chrome_debug.log` during test cleanup. Recovery for a flake is `gh run rerun <id> --failed`; a repeat means a real test defect. (2026-10-23.)
- **Never merge a version bump while the previous version is still unpublished.** `npm.yml` skips a version it finds already published and publishes whatever `package.json` says on the successful main push. Merging 0.3.6 before 0.3.5 published would have skipped 0.3.5 permanently. Check the registry, not the merged PR, before the next merge. (2026-10-23.)
- **Windows holds a Chromium profile for a moment after close.** Deleting the temp profile immediately fails with `EBUSY`; `fs.rm` with `maxRetries` and `retryDelay` covers exactly that class. (2026-10-23.)

## IX.4 Product and scope
- Experimental is not compliant or safe: browser automation raises account risk, and the first write attempt drew a verification challenge.
- The safety behaviour firing (challenge stop, `AUTH_REQUIRED`, refused Sales route) is a **correct outcome**, reported as such, never worked around.
- **A redirect is a different answer from a layout change.** `analytics.profile-views` was reported as `LAYOUT_UNSUPPORTED` for a day; it was an access gate. Classify by what happened, not by which code was easiest to throw.

---

# PART X — STILL OPEN

- **Priority now:** the read families still failing, each needing a measured selector: `companies.get` (error-shaped page), `companies.posts` title/permalink (rows parse, fields do not), `jobs.get`, `jobs.apply-url`, `jobs.saved`, `invitations.received`, `invitations.sent`, `profile.skills`, `profile.contact`. `search.people`, `search.companies`, `search.posts` and `analytics.profile-views` are live-confirmed.
- **Queued:** `QUEUE.md` (binding order). Item 4 — the live check cannot test most reads — is the one that unblocks verifying the rest.
- **Held (own explicit go each):** live write verification (21 operations, one at a time, exact target and payload; `reactions.add`/`reactions.remove` first); OAuth login against a real developer app; row parsing on a non-empty account; `npm deprecate linkedin-api-mcp@0.0.0-stage`; plugin listing icon; the single spaced Sales 403 re-check.
- **Awaiting the user's decision:** none right now.
- **Deferred until the user says go:** none.
- **Dropped — do not rebuild:** CAPTCHA bypass, stealth, rate-limit evasion, bulk outreach, generic internal-API passthrough. Refused 2026-10-23.
- **Known unqueued findings (re-verify before citing):** `docs/packaging-recommendations.md` still says "not published" and shows the 0.2.0 JSON (queued as item 3); seven old `agent-*` worktrees and `impl-search-adapters` remain.
- **The user's own to-dos:** decide on the marketplace listing icon; keep the npm trusted publisher configured.
