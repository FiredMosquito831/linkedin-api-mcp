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
