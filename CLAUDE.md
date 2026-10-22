# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

Modules:

- `bin/linkedin.js`: the `linkedin` command. It runs `run` from `src/cli.js` and sets the exit code.
- `src/cli.js`: legacy commands and `run(argv, deps)`; `src/operations/cli.js` generates named commands from the shared catalog and adds accounts, approvals, doctor, and MCP startup.
- `src/index.js`: the library entry point, including the official client, experimental primitives, and shared operations service.
- `src/surfaces.js`: the surface registry, with `SURFACES` and `findSurfaces`.
- `src/linkedin/client.js`: the LinkedIn API client, with `createClient` and `LinkedInApiError`.
- `src/auth/token-store.js`: the official OAuth token in the OS credential store, with `createTokenStore`.
- `src/experimental/browser.js` and `policy.js`: opt-in Playwright session, bounded text extraction, single confirmed UI actions, and a fixed read-only Voyager `me` adapter.
- `src/experimental/jobs.js`: persistent finite read-job queue, exclusive execution, and an abortable worker. Jobs store action metadata, not credentials or results.
- `src/experimental/cli.js`: legacy browser/Voyager/read queue commands; these retain `--experimental` plus interactive acknowledgement or `--yes`, and raw UI changes also need `--confirm-action`.
- `src/operations/catalog.js` drives both CLI and MCP schemas; `service.js` validates every operation and chooses the read/write adapter on a dedicated locked session (`session.js`). `reads.js` and `writes.js` contain DOM adapters. Fixture tests do not establish live compatibility.
- `src/operations/accounts.js` isolates browser profiles, queues, and OAuth token account names; `approvals.js` persists payload/account/image-digest-bound, expiring, single-use approvals. Only the separate interactive operator CLI grants approval; the service/MCP cannot approve themselves.
- `src/mcp/server.js` generates tools from the catalog. `start.js` implements protocol-only stdio and bearer-protected loopback Streamable HTTP. No browser or login prompt during startup.
- `.claude-plugin/`, `.mcp.json`, and `skills/linkedin/` package one plugin/marketplace; `docs/installation.md` describes local checkout, plugin, and future npm install routes.
- `src/auth/oauth.js` is the official Authorization Code flow with a loopback callback server and PKCE; `oauth-store.js` keeps the access, refresh, and metadata tokens in separate credential-store entries; `oauth-cli.js` adds `auth login-oauth` and `auth refresh`. The client secret comes from the environment only.
- `src/install/harnesses.js` registers the MCP server with Claude Code, Codex, opencode, and Antigravity; `doctor.js` checks Node, Chromium, the credential store, the server, and the state directory; `cli.js` adds `install`, `uninstall`, `doctor`, and `browser install`. Playwright has no install script, so Chromium is an explicit download.
- `src/experimental/live-check.js` runs the read adapters against the member's own session and reports ok/unsupported/failed per operation; `live-check-cli.js` adds `experimental live-check`. Read-only by construction; never run automatically.

Token storage uses @napi-rs/keyring. Verified on Windows only. Linux is unverified (Q11), and an unsupported platform fails at load.

Commands:

- `npm install`
- `npm test`
- `node --test test/cli.test.js` (one file)
- `node bin/linkedin.js --help`
- `node bin/linkedin.js operations list`
- `node --test test/operations-core.test.js test/mcp-server.test.js` (shared logic/MCP, no live LinkedIn)
- `node --test test/operations-reads.test.js` (local Chromium fixtures; install browser with `npx playwright install chromium`)
- `npm run pack:check` (dry-run only; do not publish without user approval)
- `npm run pack:smoke` (installs the actual tarball in a temporary consumer; no publication/LinkedIn calls)
- `npm run bump -- patch|minor|major|X.Y.Z` (changes package, lockfile, plugin together)
- `npm run release:check -- vX.Y.Z` (tag/version/metadata guard; no publication)
- `node bin/linkedin.js doctor` (local environment checks; never contacts LinkedIn)
- `node bin/linkedin.js install --help` (agent-harness registration; global or project scope)

Release: npm-only, Apache-2.0, following `docs/release.md`. `.github/workflows/ci.yml` tests PRs/main; `npm.yml` automatically publishes an unpublished version after successful same-repository main-push CI, or from an approved release/manual tag dispatch, using OIDC. Same-version pushes skip publication. Merging a version bump to main can publish automatically after the owner configures npm. Never create releases/tags, publish manually, change visibility, or merge a publish-triggering bump without approval. The repository is public; the release workflow enables provenance for public-source publication. The initial npm publication and trusted-publisher setup are owner steps. MCP version comes from `src/version.js` reading installed `package.json`, not a hardcoded constant.

## Project goal

- A JavaScript package, managed through npm, that gives the user a CLI and an importable JS API to automate their own LinkedIn account across its surfaces, for example profile management, posts, likes, comments, messages and replies.
- "Without abuse" remains a hard requirement: no bulk/spam outreach, unauthorized private-data access, CAPTCHA bypass, stealth to defeat platform controls, or rate-limit evasion. Stop on checkpoints and throttling; a human completes verification.
- On 2026-10-21 the user expanded the earlier official-only/no-scheduler scope to experimental own-account browser automation, bounded extraction, internal API reads, and local scheduling/batches/worker. The earlier research records terms/account risks; experimental does not mean compliant or safe.
- The official client stays identity-only. Named writes prepare first, then require operator approval of the exact account/payload/digest, then consume before dispatch. Unknown outcomes never retry. Legacy queued jobs remain read-only. No generic internal-API passthrough.
- Package target: `linkedin-api-mcp` v0.2.0 (unscoped public package; no scope ownership required), bin `linkedin` (CLI) and `linkedin-api-mcp` (auto-starts MCP; do not append another `mcp`). No npm publication or GitHub push is implied by local build/testing.
- Decided: commander for the CLI; @napi-rs/keyring for official OAuth tokens; Playwright persistent Chromium for experimental manual login. Browser session credentials live in a dedicated profile under `~/.linkedin-api-mcp` (or `LINKEDIN_STATE_DIR`), never in the queue or Git. The directory is sensitive and must not be shared.
- Official OAuth browser flow is implemented (`auth login-oauth`) but unverified against a live LinkedIn app: the redirect URI must be registered in the app, and PKCE availability for a personal app (Q4) is still unconfirmed. Live verification of the browser adapters needs the owner's own session (`experimental live-check`); no live check has been run.

## Working rules

- Use only haiku-tier models (`model: "haiku"`) for Agent and subagent calls in this project.
- Research requests run through the deep-research skill. Notes go to `research_notes/<title>/` and the final report to `reports/<title>.md`. Each request gets its own title and folder; never write into or rename an earlier request's folder.

<!-- working-notes:begin (managed by the working-notes skill; edit inside only through /working-notes) -->
## How we work in this repo (orchestration)

**Entry points (read in this order at the start of every session):** the newest `HANDOFF-<date>.md` in the repo root → `QUEUE.md` → `WORKING-NOTES.md` (PART I, II.3, II.5, II.6, IV, X, IX). Specs and their binding `USER DECISIONS` blocks live in `specs/`. Verify the live state before relaying anything; report in five lines or fewer; do not dispatch before the user's go.

**Binding rules (the full text is WORKING-NOTES; these are the ones that are never relaxed):**
1. Discuss before building: read-only investigation → spec with numbered questions + a recommendation each → the user's one-line answers → `USER DECISIONS (<time>)` appended to the spec → ONE implementer. Never dispatch before the user agrees.
2. Safest, 100 % working, break nothing: change only what is broken, where it is broken; behaviour-preserving work is proven by equality contracts; extend, never narrow an existing mechanism; stop and report if the scope seems to require removing behaviour.
3. One production PR at a time; one concern per PR and release; at most two agents; **agents run `model: "haiku"`** (see Working rules above); announce every dispatch; every agent keeps `PROGRESS.md` + `HANDOFF.md` in its worktree from the first edit.
4. The orchestrator verifies every "shipped" claim itself (WORKING-NOTES II.5): merge = tag = default branch, registry tarball integrity, frozen diff empty, security grep 0, workflow states read one by one, any live claim backed by the command's own output. CONFIRMED / UNVERIFIED / NOT DONE, always separated.
5. Tracking at every PR boundary: `QUEUE.md` (RUNNING / QUEUED / FINISHED / HELD), a release-history row and dated lesson lines in WORKING-NOTES (backup before every edit; line endings preserved), one line per event in `HANDOFF-2026-10-22.md`, a `HANDOFF-<date>.md` before every pause or compaction.
6. Never touch the user's world: the user's own LinkedIn account (reached through `~/.linkedin-api-mcp/browser-profile` and the OS credential store), `~/.linkedin-api-mcp` itself, autostart/registry, the user PATH, installed tools; never the real installer/uninstaller; never read the profile's `Cookies`/`Local State`, OAuth client secrets, or credential-store entries; scratch runs use temp profiles under `.superpowers/`, fake credentials of the same prefix shape and no linkedin.com navigation; stop only PIDs you started, by exact PID; never delete under `.claude/worktrees/` or `.superpowers/` (list leftovers).
7. Frozen boundary (`src/experimental/policy.js`, `src/operations/approvals.js`, `src/operations/service.js`, `src/operations/catalog.js`, `src/experimental/challenge.js`, `src/operations/accounts.js`, `src/auth/token-store.js`) and goldens (`test/fixtures/*`) change only as a PR's stated, user-approved purpose, with outcomes proven byte-identical. Never alter retry / fallback / challenge-detection / approval behaviour otherwise; never bypass a CAPTCHA, checkpoint, or rate limit.
8. Tooling: `node --test` (npm drops unknown flags, so never `npm test -- --flag`); never bare `node -e`, never `-c` one-liners or heredocs into an interpreter, never `sed -i` on tracked files; scripts as files run by path; never two full test gates at once.
9. Product principles: no invented limits; clamp to capability; unknown ≠ unsupported; everything new opt-in and byte-stable when unset; honest wording; data never lost; general over per-name; no speculative features; docs where the user is.
10. Live external calls only with the user's consent and a stated budget; a rate-limit answer is inconclusive; a challenge stop is a correct outcome, not a bug to work around.

**Attribution:** commits and PR bodies end with `by FiredMosquito831`.
<!-- working-notes:end -->

