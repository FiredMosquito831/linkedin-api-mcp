# Working Notes — the operating manual for linkedin-api-mcp

The orchestrator's manual: how the user works, what they verify and reject, repo and release mechanics, CI and code rules, product principles, domain facts, how agents are run, the machine, every release, every learning, and what is still open. **Current truth only.**

- **Where it lives:** `D:\Projects2\LinkedInApi\WORKING-NOTES.md` (repo root, committed with the repo — the same place the handoffs already live).
- **Before editing:** copy it to `WORKING-NOTES.bak-<yyyy-mm-dd-hhmm>.md` beside it. Never modify or delete a `.bak*`.
- **Format:** UTF-8, LF in git (the working copy may be CRLF under `core.autocrlf`). Append with a script that reads `newline=""`, asserts its anchor exactly once, and writes the same newline. Never `sed -i`/`awk` on it.
- **Who edits:** only the orchestrator. Agents never edit it — they report lessons in their final message and the orchestrator ports them.
- **No secrets** here, ever. Paths as `~` / `%USERPROFILE%` where possible.
- **History and the dated diary** live in `WORKING-NOTES-ARCHIVE.md` (same folder). The dated running log is `HANDOFF-2026-10-22.md` (append there); the current entry point is the newest `HANDOFF-<date>.md`; the PR queue is `QUEUE.md`; specs and their USER DECISIONS blocks are in `specs/`.

## Map of this file

| Part | What lives here |
| --- | --- |
| I — How the user wants to work | ownership, discuss-first, delegation, how they verify, what they reject, communication, standing decisions |
| II — Repo mechanics | checkout + worktrees, versioning, the release process and its traps, PR/commit shape, the verify recipe, hard rules for every brief |
| III — CI, testing, code rules | the gate, flakes, test isolation, banned patterns, boundaries, contract tests, new-setting checklist |
| IV — Product principles | the rules every change is judged against |
| V — Domain facts and gotchas | what LinkedIn's own pages and surfaces actually do |
| VI — Subagent orchestration | the loop, briefs, resume, failure modes |
| VII — Environment | this machine, disks, tools, the account |
| VIII — Release history | one row per version |
| IX — Learnings | one deduplicated list, grouped by theme, each with its origin |
| X — Still open | deferred work, queue pointers, the user's own to-dos |

**Fastest cold start:** the newest HANDOFF → PART I → II.5 → II.6 → IV → the last ten rows of PART VIII → X.

---

# PART I — HOW THE USER WANTS TO WORK

## I.1 Ownership and what "done" means
- Their repo, their merge: `FiredMosquito831/linkedin-api-mcp` (remote `origin`, default branch `main`), public on GitHub. There is no upstream to push to.
- **Merged is not shipped.** Shipped = committed + pushed + merged + version published (`npm.yml` on main) + the release/tag present + the published tarball's integrity checked.
- Finish end to end. "Fixed" means the user can see it working: state the exit criterion in their terms up front, test to it, lead with the negative when it is negative.
- Good behaviour by default: never a "run this once" step the user must remember.
- **The live system is the user's own LinkedIn account.** It is reached through `~/.linkedin-api-mcp/browser-profile` (session cookies) and the OS credential store (official OAuth tokens). The orchestrator never mutates that account without an explicit, specific go (target + payload), never signs in as the user, and never completes a verification on their behalf.

## I.2 Discuss before building
- Read-only investigation → a spec in `specs/` with NUMBERED plain-language questions, each with a recommendation → the user answers in one line ("all rec", "1 yes / 2 whatever is most correct") → a binding `USER DECISIONS (<time>)` block appended to the spec → ONE implementer. Never dispatch before they agree.
- A small ask must not fan out; scope beyond the literal request is a question BEFORE dispatch.
- Safest, 100 % working, break nothing: change only what is broken, where it is broken; equality contracts prove behaviour-preserving work; what cannot meet the bar is left out and named.
- Investigations finish before fixes start on the same question.
- Questions the user can answer: plain language, only about things they can see or decide; never relay an agent's question unchecked.
- Queue discipline: finish the QUEUED PRs first in their order; new ideas wait; after the last queued PR, report and let the user choose.
- Granular PRs: one concern per PR and per release; scope additions go to the NEXT PR unless one line.
- External publication (npm publish, GitHub release, registry changes) waits for an explicit go. So does **every** LinkedIn write, including reads that need a specific target the user alone can pick.

## I.3 Delegation, model choice, context
- Delegate the investigation AND the spec-writing; take conclusions only. Protect the orchestrator's context.
- **Every agent and subagent = `model: "haiku"`** — this is a standing rule in `CLAUDE.md` and overrides the skill's default of inheriting the session model. Announce the model in the dispatch.
- At most **2** agents at once; one implementer at a time; read-only investigators may run beside it.
- One written spec per implementer: enumerated contract, every `file:line` grepped, tests named, docs, verification.
- Announce every dispatch in the same message. No extra process artefacts beyond the ones named above.
- No diagnostics of their machine unless asked. Agents keep `PROGRESS.md` + `HANDOFF.md` so a pause or kill costs nothing. No infinite or background polling anywhere.

## I.4 How they verify
- They test independently and come back with counter-evidence. Assume every claim will be checked on their machine.
- Their bug reports are precise and usually right: reproduce first, argue never.
- "Did you fix it" is often honestly "no, and here is what I actually verified".
- When they are frustrated: lead with evidence, not reassurance.
- They read code. Claiming an adapter "works" because a fixture passed is the fastest way to lose their trust — see IX.1.

## I.5 What they reject
- Invented limits; claiming it works without running it; low-effort deliverables and filler docs; docs in the wrong place; a UI never driven in a browser; per-name fixes; speculative features; changes to retry/fallback/**challenge-detection**/approval behaviour that were not the PR's stated purpose; a long page as a fix; being told to change their settings.
- **Bypassing LinkedIn's controls**: no CAPTCHA solving, no stealth, no rate-limit evasion, no bulk outreach. Refused outright, even when requested — this project's whole premise is "without abuse" (see `reports/LinkedIn CLI automation without abuse.md`).

## I.6 Communication style
- Lead with the answer, then the evidence; show real command output rather than describing it.
- Say plainly when wrong, correct it, move on.
- Separate **CONFIRMED** (ran it; output shown), **UNVERIFIED** (read it), **NOT DONE** (skipped, and why).
- The machine is **UTC+03**. Timestamps in diagnostics are often UTC; convert before saying "recent".

## I.7 The user's standing decisions (do not re-ask)
- 2026-10-21 — scope expanded from official-API-only to opt-in **own-account browser automation, bounded extraction, internal API reads, and local scheduling/batches/worker**. "Experimental does not mean compliant or safe."
- 2026-10-22 — the package ships as **both** an npm package (`linkedin-api-mcp`, unscoped, public) **and** a Claude Code plugin/marketplace from the same repo root, following `FiredMosquito831/ase-moodle-mcp` and `FiredMosquito831/google-services-mcps`.
- 2026-10-22 — release automation: main-push CI → automatic OIDC publish; a release/manual tag dispatch also publishes. Same-version pushes skip publication.
- 2026-10-22 — **writes are verified one at a time, deliberately and spaced**, with an exact reviewed target and payload. Never in bulk.
- 2026-10-22 — `reactions.add`/`reactions.remove` was chosen as the first write adapter to verify.
- 2026-10-23 — detector correction requested ("fix the detector"); **iframe bypass was requested and refused** — hidden background frames may be ignored for detection, but every genuine visible challenge still stops the operation.
- 2026-10-23 — target **absolutely all surfaces**, including Sales Navigator (blocked in practice by an HTTP 403 on `sales.search-people`).

---

# PART II — REPO MECHANICS

## II.1 Checkout, worktrees, branches
- Checkout: `D:\Projects2\LinkedInApi`.
- Worktree root: `D:\Projects2\LinkedInApi\.claude\worktrees\` (the existing convention; seven `agent-*` worktrees from earlier runs sit there and must not be deleted). Scratch/diagnostics: `D:\Projects2\LinkedInApi\.superpowers\` (git-ignored; already holds `diagnostics/`).
- One fresh worktree per unit of work: `git -C D:/Projects2/LinkedInApi fetch origin` then `git worktree add -b <branch> D:/Projects2/LinkedInApi/.claude/worktrees/<id> origin/main`.
- Never delete anything under the worktree root or `.superpowers\` — list leftovers; the user deletes on request.
- Never `git stash`, `git checkout <file>`, or `git reset` in a worktree. Inspect with `git diff`; compare against a base in a SECOND detached worktree.
- Branch names mirror the commit type (`fix/`, `feat/`, `docs/`, `perf/`, `chore/`, `test/`); squash-merge, delete the branch.
- Re-anchor before analysing: `git log --oneline -1 origin/main` and `git log --oneline HEAD..origin/main | wc -l`.
- Line endings: repo stores LF; `core.autocrlf` gives CRLF in the working copy. Never rewrite a whole file's endings while editing one line.
- One implementer at a time (every PR bumps the version files, so two in flight always conflict).

## II.2 Versioning
- `npm run bump -- patch|minor|major|X.Y.Z` (`scripts/bump.mjs`) changes `package.json`, `package-lock.json` **and** `.claude-plugin/plugin.json` together. Never hand-edit one of the three.
- PATCH: adapter/selector fixes, detector fixes, docs. MINOR: new operations, new commands, new surfaces. MAJOR: breaking CLI/API shape.
- `src/version.js` reads the installed `package.json` — there is no hardcoded version constant to update.
- The plugin pins `"version"` in its manifest; users stay on a cached plugin copy until that string changes, so a plugin-visible change needs the bump.

## II.3 Release process
1. Bump in the same commit as the source change.
2. Commit (II.4) → push → open a PR → wait for EVERY check with ONE bounded loop reading each conclusion (never trust a `--watch` return) → merge only on green on the FINAL commit.
3. Squash-merge with `--delete-branch`.
4. `npm.yml` publishes on a successful same-repository main push **or** from a release/manual tag dispatch, using OIDC trusted publishing. Same-version pushes skip publication.
5. Create the GitHub release targeting the merge SHA; the tag must resolve to it.
6. **Assert the tarball on the registry**: download it from `https://registry.npmjs.org/linkedin-api-mcp` and check its SHA-512 against `dist.integrity`. `npm view` caches — never trust it alone.
7. Report every workflow's state by reading each job's conclusion.
- Release notes are the only changelog: headline → what was wrong, with measured evidence → what to expect → action required, with the exact command → known and deliberate.
- Traps that bit: `npm view` caches (read the registry document); the registry lags a fresh publish by seconds (the workflow waits for replication); the plugin manifest version must move or plugin users see the old copy.

## II.4 PR and commit shape
- Commit message: conventional prefix, then prose: what was broken → the mechanism (cause, not symptom) → what the fix does and any non-obvious choice → verification with real output → what was deliberately not done. Attribution line: `by FiredMosquito831`.
- PR body: the same structure with headings, real output in fenced blocks, a **Residual risks** section always ("none" if none). Ends with `by FiredMosquito831`.
- Never claim verification beyond what ran. Fixture tests are named as fixture tests.

## II.5 The verify recipe (after every "shipped" report, before relaying)
```
1. git fetch origin; git log --oneline -1 origin/main; count commits behind.
2. The merge SHA == the GitHub release's tag target == origin/main head.
3. Registry document: dist-tags.latest == the new version; dist.integrity matches a tarball downloaded from the registry.
4. Workflow runs: read each job's conclusion one by one (ci.yml matrix, npm.yml publish). No --watch return is trusted.
5. Frozen-boundary diff empty unless the file is the PR's stated purpose.
6. Security grep over the diff for credential shapes returns 0.
7. Open PRs and worktrees as expected; ListAgents shows no stray agents.
8. Any live claim: the printed result line from the command that ran, not a description of it.
```
Also: read the agent's deviations, residual risks and not-done list; then append the dated "SHIPPED AND VERIFIED BY ME" line (archive diary) + a PART VIII row, update the queue, tell the user (what shipped, what you verified, deviations, not done) and announce the next dispatch.

## II.6 Hard rules for every implementer brief
1. **Where:** a worktree per II.1; never the primary checkout; never stash/checkout-a-file/reset; never delete scratch; list every dir left behind.
2. **Never touch the user's world:** never sign in to or act on the real LinkedIn account; never run a browser write against it; never modify `~/.linkedin-api-mcp/` contents beyond what the specific approved test needs; never touch the OS credential store; never change autostart, registry, or PATH.
3. **Stopping processes:** only PIDs you started, by exact PID, children by parent id; never by image name or substring. Close every Playwright browser you opened.
4. **Scratch services:** none needed (no server product). Local fixtures are `file://` or `page.setContent`; a live navigation is an explicit, budgeted, user-approved call.
5. **Secrets:** never read or print the browser profile's `Cookies`/`Local State` files, token files, or OAuth client secrets; mask by value shape; screenshots of the tool's own window only, and scanned for token prefixes.
6. **Browser launches in a proof:** always a scratch profile directory under the scratch root, never `~/.linkedin-api-mcp/browser-profile`; headless unless the proof needs a screenshot.
7. **Test isolation:** tests use temp dirs and fixtures; no test may navigate to linkedin.com (CI has no session and must stay hermetic). Live checks are manual, never in the suite.
8. **Tooling:** `node --test` (or `node --test <file>`) — **npm drops unknown CLI flags**, so never rely on `npm test -- --test-concurrency=1`. Scripts as files via the Write tool, run by path; never `-c` one-liners or heredocs into an interpreter; never `sed -i` on tracked files.
9. **Frozen safety boundary** (the orchestrator diffs it after every ship; must be EMPTY unless the file is the PR's stated purpose): `src/experimental/policy.js`, `src/operations/approvals.js`, `src/operations/service.js`, `src/operations/catalog.js`, `src/experimental/challenge.js`, `src/operations/accounts.js`, `src/auth/token-store.js`. Goldens that must pass unmodified: every file under `test/fixtures/` that the PR does not exist to change. `test/live-check.test.js:105` (detail strings never leak a thrown error's body, token, or cookie) and `test/mcp-http.test.js:206` (errors must not leak credentials) must pass — never weaken them.
10. **Versioning and gate:** II.2 and III.1.
11. **Every new setting:** the III.6 checklist.
12. **Ship:** II.3 in full, including the registry assertion and workflow states.
13. **Live external calls** only with the user's consent and a stated budget; a rate-limit answer is inconclusive. A challenge stop is a success of the safety behaviour, not a bug to work around.
14. **Reporting:** the final message IS the deliverable ("partial is acceptable, silence is not"); keep `PROGRESS.md` + `HANDOFF.md` in the worktree from the first edit and commit WIP early; bounded loops only; do not edit WORKING-NOTES — report lessons; name every screenshot and LOOK at it; list every leftover dir.
15. **Extend, never narrow:** list every module the change touches (grepped, `file:line`) and read each before changing anything; when the change meets an existing mechanism, add to it and keep every existing output byte-identical (equality proof); if the scope seems to require removing or bypassing existing behaviour, STOP and report.

**Brief skeleton that works:** `templates/BRIEF-IMPLEMENTER.template.md` in the skill folder.

---

# PART III — CI, TESTING, CODE RULES

## III.1 The gate
- No lint or type-check step exists (plain ESM JavaScript, no ESLint/tsc). The gate is the test suite and the packaging guards.
- `node --test` — the whole suite. Last measured: **344 tests, 0 failures** (2026-10-23, uncommitted detector branch; the committed 0.3.2 tree was 328).
- `node --test test/operations-core.test.js test/mcp-server.test.js` — shared logic/MCP, no browser.
- `node --test test/operations-reads.test.js test/experimental-browser.test.js` — needs Chromium (`npx playwright install chromium`).
- `npm run pack:check` (dry run) and `npm run pack:smoke` (installs the built tarball in a temporary consumer; no publication).
- CI jobs (`.github/workflows/ci.yml`): one matrix job — ubuntu/windows/macos × Node 22.12.0/24 (6 jobs), each running `npm ci`, `npx playwright install --with-deps chromium`, `npm test`, `npm run pack:check`, `npm run pack:smoke`. `npm.yml` is the publish path.
- Baseline: 0 known local failures. Local is not the gate; CI is.
- Risk tiers (from the paths in the diff; when unsure, tier up): T0 docs/tests only → the suite; T1 one adapter's selector → its fixture test + the suite; T2 operations/service/detector → full suite + mutation checks on each new guard; T3 approval/token/account isolation → full suite + an explicit attempt to break the boundary; T4 release/packaging manifests → full suite + `pack:smoke` + `release:check`.
- Proportionate testing: tests follow the SYSTEMS the diff changes; a one-line flip gets no new tests; new tests only for new or changed behaviour.
- Never two full gates at once on the machine.

## III.2 Known flakes
- None recorded. Watch for: Playwright Chromium fixture timing on a cold machine; `pack:smoke` network access to the npm registry (it installs the local tarball, but `npm ci` inside the temp consumer may reach the registry).

## III.3 Test isolation
- Every test that touches the file system uses a temp directory (`mkdtemp`) or a fake home; no test writes to `~/.linkedin-api-mcp`.
- No test opens a real browser session against linkedin.com. `test/operations-reads.test.js` drives Chromium over local fixtures only.
- Fake executors/fakes stand in for the token store and the OS keyring; `test/token-store.test.js` is the only place the keyring module is exercised, and it must not write a real credential.
- Order dependence: avoid; a new process-wide singleton needs a reset in the same commit.

## III.4 Code rules that fail CI
- Nothing is linted, so the rules are structural: no `process.env` read outside `src/config`-style helpers (grep before adding one); no hardcoded version string (`src/version.js`); no `console.log` in library code paths that the CLI owns; errors carry stable codes, never a page body or a token.
- Node >= 22.12.0: `node:test`, `node:sqlite`-free, ESM only.
- Playwright 1.64.1 ships **no install script**; Chromium is installed separately (`linkedin browser install`). The npm package never downloads a browser.

## III.5 Architecture and import boundaries
- `src/operations/catalog.js` is the single source of both CLI commands and MCP tool schemas. A new operation is added there, then to `reads.js` or `writes.js`, then to the service's dispatch.
- `src/operations/service.js` validates every operation and chooses the adapter; adapters never talk to each other.
- `src/experimental/policy.js` owns `assertExperimental`, `assertResponse`, `linkedinUrl`, `HumanInterventionError`. `src/experimental/challenge.js` owns challenge detection and is imported by **both** browser paths (`src/experimental/browser.js` and `src/operations/session.js`) — it must stay dependency-free of either session's internals.
- The official client (`src/linkedin/client.js`) stays identity-only; no internal-API passthrough exists and none may be added.
- `src/mcp/server.js` generates tools from the catalog; it must not import the browser adapters at module load (stdio startup must not launch anything).

## III.6 Every new setting / environment variable
- Constant default → config/env read with a documented name → CLI surface with real help text → bounds → example in `docs/installation.md` → a contract test pinning the default. Everything new is opt-in and byte-stable when unset. Relevant existing names: `LINKEDIN_STATE_DIR`, `LINKEDIN_EXPERIMENTAL`, `LINKEDIN_ACCOUNT`.

## III.7 Contract tests you will meet
- `test/version-contract.test.js` — the plugin manifest version, `package.json`, and the reported MCP version agree.
- `test/packaging.test.js` — the `files` whitelist, both bins, the plugin/marketplace manifests, and a credential-shape scan of packaging material.
- `test/live-check.test.js:105` — a failure detail never carries a thrown error's page body, token, or cookie.
- `test/mcp-http.test.js:206` — transport errors never echo an `authorization` header.
- `test/oauth.test.js` — non-2xx responses report the status without leaking the response body; the authorization URL never carries the client secret.
- `test/operations-core.test.js` — every catalog operation validates its input and rejects unknown ones; approval binding is account + payload + image digest.

## III.8 Stored-data schema rules
- Browser profile, queues, approvals, and account registry live under `~/.linkedin-api-mcp` (or `LINKEDIN_STATE_DIR`). The queue stores action metadata only — never credentials or results. Approvals are single-use, expire in 10 minutes, and are consumed before dispatch.
- Any change to a stored shape is additive; an old file must still be readable (test with a pre-change fixture).

---

# PART IV — PRODUCT PRINCIPLES

1. **No invented limits.** Never a hard-coded ceiling for something LinkedIn reports; derive or state the absence.
2. **Clamp to capability, never under-use it.** Unknown → fall back and say so.
3. **Scope boundaries are explicit** (what the tool does vs what the human must do — especially authentication and verification).
4. **Guardrails must not become outages.** A failed adapter fails closed and reports `LAYOUT_UNSUPPORTED`; it never guesses at a parse.
5. **Secrets never leave the machine in identifiable form.** No token, cookie, message text, or page body in a report, a log line, a queue row, or a recorded diagnostic.
6. **General over per-name.** One adapter family, one selector ladder, one challenge detector. No branch on an account name.
7. **Everything new is opt-in, and stable outputs must not change.** The default surface is capability-only; experimental behaviour needs `--experimental` (or `LINKEDIN_EXPERIMENTAL=1`) plus interactive acknowledgement or `--yes`.
8. **Never alter retry, fallback, challenge-detection or approval behaviour** except as a PR's stated, user-approved purpose. Unknown outcomes are never retried.
9. **No hand-entered facts where a source exists.**
10. **No speculative features.** Build what was asked.
11. **Every setting is visible** where it belongs, with real help text.
12. **The user's values stay the user's.** Never change the account, the profile, or their browser session to "fix" a test.
13. **Data is never lost by a feature.**
14. **Good behaviour by default, one update path.**
15. **Documentation is a deliverable.** User-facing docs live in `docs/`; the root `README.md` is the front door.
16. **Unknown is not unsupported.** `LAYOUT_UNSUPPORTED`, `ACCESS_RESTRICTED`, `AUTH_REQUIRED`, `completionUnknown` are different answers.
17. **Honest product wording.** "Verified live" names which operations, on what account shape, and what the evidence was.
18. **Never reduce a wide, deep system to fit one scope.** Adding a surface adds a rung to the catalog; it never narrows the existing one.

---

# PART V — DOMAIN FACTS AND GOTCHAS

## V.1 LinkedIn's rendered pages (measured live, 2026-10-22/23, one account)
- **Class names are obfuscated** (`kxh4j`-style). Class selectors are dead. Key on `data-testid`, `componentkey`, `data-job-id`, `role`, `aria-label`.
- The **feed list mixes posts with suggested-people and ad cards**. Only list items containing `[aria-label^="Reaction button state"]` are posts.
- Some live controls are **excluded from the accessibility tree**: `getByRole('button', {name:'Follow'})` returns 0 while `getByLabel('Follow')` returns 1. Resolution order is role → label → attribute selector, after a wait.
- Controls can be **absent briefly after navigation**; `uniqueControl` waits for a candidate before declaring it missing.
- Connections route: `/mynetwork/invite-connect/connections/`.
- The app shell returns **intermittent 404 for routes it still renders**; accept only when `main`/`role=main` attaches.
- Profile edit entry is `<a aria-label="Edit profile">`, not a button named "Edit professional profile".
- Inbox rows are the thread **links** themselves; the "new message" stub must be excluded.
- A normal page can carry a **hidden reCAPTCHA Enterprise iframe** (`role="presentation"`, 0×0, `visibility:hidden`, inside a `display:none` ancestor). Counting it as a challenge is a false positive — hence the visibility-aware detector.
- A challenge **before** dispatch is `AUTH_REQUIRED` (exit 3), not `completionUnknown` (exit 8). The adapter's own verdict wins over the service fallback.
- `sales.search-people` returned **HTTP 403** on a normal session → `HUMAN_INTERVENTION_REQUIRED`. Access refusal is not proof a CAPTCHA was shown.

## V.2 Reads (measured, 2026-10-23 bounded pass, 23 of 33 attempted)
- Populated: `jobs.search`, `search.jobs` (3 records, titles + URLs; same reader family).
- Explicit empty state: `posts.list`, `inbox.list`, `inbox.search`, `connections.list` (the account has 0 of each).
- Partial: `profile.get` (name only), `feed.list` (2 records, 1 author, 0 permalinks).
- `LAYOUT_UNSUPPORTED` (13): `profile.skills`, `profile.contact`, `invitations.received`, `invitations.sent`, `companies.get`, `companies.posts`, `jobs.get`, `jobs.apply-url`, `jobs.saved`, `search.people`, `search.companies`, `search.posts`, `analytics.profile-views`.
- `analytics.ssi` → `available:false`.
- Not live-tested: `posts.get`, `comments.list`, `reactions.list`, `inbox.thread`, `connections.status`, `analytics.post`, `sales.profile`, `sales.search-companies`, `sales.inbox`, `sales.thread`.

## V.3 Writes
- **0 verified live.** Follow/unfollow attempts returned `AUTH_REQUIRED`; a later read-only check showed the account already follows Microsoft. No attempt can be assigned to that state.
- The first write attempt coincided with a verification challenge. Treat that as the expected risk signal, not an anomaly.

## V.4 Official API and OAuth
- OAuth Authorization Code flow: `GET /oauth/v2/authorization`, `POST /oauth/v2/accessToken`; `client_secret` required; **HTTPS redirect URIs only** (LinkedIn rejects HTTP). Default flow pastes the redirected URL back; `--loopback` is opt-in.
- The official client stays identity-only (OpenID userinfo). Named writes go through the browser adapters only.
- OAuth login has **not** been exercised against a live developer app.

## V.5 Packaging
- Repo root is the npm package *and* the plugin. `.mcp.json` launches `node ${CLAUDE_PLUGIN_ROOT}/bin/linkedin.js mcp --transport stdio` (no global install, no `npx` fetch).
- `package-lock.json` v3 at the plugin root lets Claude Code auto-install deps during plugin install (`--ignore-scripts`, 60 s cap). Keep deps exact-pinned and in sync with the lockfile.
- A top-level `bin/` puts the plugin's bin on the Bash tool's PATH and makes claude.ai/Cowork refuse the plugin.
- `claude plugin validate` warns about the root `CLAUDE.md` (not plugin context) and the missing listing icon.

---

# PART VI — SUBAGENT ORCHESTRATION

## VI.1 The loop that holds up
1. Re-anchor (default branch head, latest release, open PRs, worktrees, `ListAgents`).
2. Read-only investigator → a spec in `specs/` with numbered questions + a recommendation each (`templates/SPEC.template.md`).
3. The user answers; append the answers verbatim as a binding `USER DECISIONS (<time>)` block.
4. ONE implementer (`model: "haiku"`) from the spec + the decisions + the II.6 hard rules, in a fresh worktree; it ships PR → CI → merge → registry assertion → release.
5. Verify every claim yourself (II.5), relay: what shipped, what you verified, deviations, not done. Port the lessons here. Announce the next dispatch.

Investigators disagree; the implementer measures both sides. Scope additions can be folded into a RUNNING agent by message without loss; larger ones go to the next PR.

## VI.2 What goes wrong with agents, and the counter-measure
- Silence → the brief says the final message IS the deliverable.
- Kills (limits, crashes) → `PROGRESS.md` + `HANDOFF.md` from the first edit, WIP committed; resume the SAME agent by message with the on-disk state.
- Waiting forever / polling forever → bounded loops with timeouts only.
- Stray agents → `ListAgents` before every dispatch.
- Wrong claims → budget half to be wrong; check every `file:line`; "it works" needs the command's own output line.
- **An agent that decides to "fix" a challenge stop** → forbidden by I.5; the brief says a challenge stop is correct behaviour.
- A cut-off launch brief → check `ListAgents`, re-send the full brief by message.
- Running a script from the skill directory (it dropped a stray `.superpowers/` into the plugin cache) → always run from the repo root.

## VI.3 What a read-only investigator brief says
READ-ONLY: no git writes, no edits outside its scratchpad and the spec; **no live LinkedIn calls at all** unless the brief states a budget and the user approved it; never open the real browser profile; never print secrets; CONFIRMED vs UNVERIFIED separated; where to write the spec; the numbered questions to answer.

---

# PART VII — ENVIRONMENT

- Machine: Windows 11 Pro, `D:\Projects2\LinkedInApi`; primary shell PowerShell, Bash available (Git Bash). Timezone UTC+03.
- Node >= 22.12.0; package manager npm. Playwright 1.64.1; Chromium installed separately via `linkedin browser install` or `npx playwright install chromium`.
- `@napi-rs/keyring` is **verified on Windows only**; Linux is unverified; an unsupported platform fails at load.
- State dir `~/.linkedin-api-mcp` (or `LINKEDIN_STATE_DIR`): `browser-profile/` (session cookies — sensitive), account registry, queue, approvals. Never share or commit it.
- Scratch: `.superpowers/diagnostics/` (git-ignored) holds sanitized diagnostic JSON. `bash.exe.stackdump` sits untracked in the root from earlier shell crashes; harmless, do not commit.
- Do not run: any script that signs in to LinkedIn; any `npm publish` (the workflow owns publication); two full test gates at once.

---

# PART VIII — RELEASE HISTORY

| Version | Date | PR | What |
| --- | --- | --- | --- |
| 0.0.0-stage | 2026-10 | — | Temporary public placeholder on npm; superseded. Optional deprecation still open. |
| 0.2.0 | 2026-10-22 | — | First real package: CLI + library + MCP server, plugin/marketplace packaging, official OAuth login, agent installs. |
| 0.2.1 | 2026-10-22 | #4 | Seeded from `git log` (pre-orchestration). |
| 0.2.2 | 2026-10-22 | #5 | Wait for npm registry replication before failing a publish. |
| 0.3.1 | 2026-10-22 | #7 | Tune adapters against live LinkedIn (selectors keyed on testids/labels/roles). |
| 0.3.2 | 2026-10-22 | #8 (`37e3386`) | Live-verification fixes; published by OIDC with provenance; tag, main, and registry `gitHead` agree; tarball integrity verified independently. |
| 0.3.3 | 2026-10-23 | #9 (`96909b2`) | Visibility-aware challenge detector (hidden 0×0 reCAPTCHA no longer counts as a challenge; visible prompts still stop). 344 tests green; six-job CI green; publish run `39865260123` succeeded; registry `latest` = 0.3.3, `gitHead` = merge SHA, downloaded tarball SHA-512 matched `dist.integrity`, SLSA provenance present. No GitHub release/tag created (awaiting the user's go). |

---

# PART IX — LEARNINGS (consolidated, deduplicated)

One bullet per lesson, with the evidence that makes it memorable and its origin. Rules that follow from these lessons live in PARTS I–VII; this is the "why".

## IX.1 Verification and evidence
- Re-anchor before analysing. The evidence ladder: the real artefact doing real work > a live read whose full output is shown > a fixture test > reading the code.
- **"7/7 report ok" measured only that functions returned.** Three of those reads passed solely on the empty-account path (0 posts, 0 conversations, 0 connections). A green count is not a completeness claim. (2026-10-22, live verification.)
- A fixture proves the parser, not the page. Every selector claim needs a live read before it is called verified. (2026-10-22.)
- A test that cannot fail is not a test; prove every guard against the broken case (revert and watch it fail).
- A hidden zero-size reCAPTCHA iframe made a normal page look like a challenge: **counting elements is not observing a state**; check visibility. (2026-10-23 detector.)
- A 403 is not proof a CAPTCHA was displayed; an error class name is not a diagnosis. (2026-10-22/23.)
- Before claiming "nothing changed" about account state, read the state — the account already followed Microsoft when the earlier report said it did not. (2026-10-22.)

## IX.2 Agents and briefs
- A cut-off or overly broad brief produces an agent that "fixes" what it should not; the brief names the NOT-in-scope list explicitly.
- Run scripts from the repo root: invoking from a skill directory created a stray `.superpowers/` inside the plugin cache.

## IX.3 Shell and tooling traps on this machine
- **`npm test -- --flag` silently drops the flag.** npm ignores unknown CLI arguments; use `node --test` directly when a flag matters. (2026-10-22.)
- A piped `| tail` swallows the exit code — read the tool's own summary line ("# pass N", "# fail N").
- Git Bash on Windows emits `bash.exe.stackdump` on some crashes; it is untracked noise, not a repo artifact.
- `git status` shows CRLF→LF warnings for Windows checkouts; do not "fix" them.
- **A merge cancels the main CI run that was already going** (`ci.yml` uses `cancel-in-progress: true`). The first `npm publish` `workflow_run` therefore fires for a *cancelled* run, its job-level `if` is false, and the run shows `skipped`. The successful CI run for the merge commit then triggers a second publish that ships. A `skipped` publish immediately after a merge is expected, not a broken pipeline — wait for the second one before investigating. (2026-10-23, 0.3.3.)

## IX.4 Product and scope
- Experimental is not compliant or safe: browser automation raises account risk, and the first write attempt drew a verification challenge.
- The safety behaviour firing (a challenge stop, an `AUTH_REQUIRED`, a refused Sales route) is a **correct outcome** and gets reported as such, never worked around.

---

# PART X — STILL OPEN

- **Priority now:** repair the read adapters that returned `LAYOUT_UNSUPPORTED` (13 operations; spec first, then one implementer per family).
- **Queued:** see `QUEUE.md` (binding order).
- **Held (each needs its own explicit go):** live write verification (21 operations, one at a time, exact target + payload); OAuth login against a real developer app; row parsing on a non-empty account; `npm deprecate linkedin-api-mcp@0.0.0-stage`; plugin listing icon.
- **Awaiting the user's decision:** whether the 13 `LAYOUT_UNSUPPORTED` reads should be repaired surface by surface (recommended) or re-measured first.
- **Deferred until the user says go:** none.
- **Dropped — do not rebuild:** CAPTCHA bypass, stealth, rate-limit evasion, bulk outreach, generic internal-API passthrough. Refused 2026-10-23.
- **Known unqueued findings (re-verify before citing):** `docs/packaging-recommendations.md` still carries the 0.2.0 target JSON and a "not published" status line that the 0.3.2 release has overtaken; the doc will mislead the next reader.
- **The user's own to-dos:** add a marketplace listing icon if they want one; configure/retain the npm trusted publisher.
