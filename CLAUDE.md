# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

Modules:

- `bin/linkedin.js`: the `linkedin` command. It runs `run` from `src/cli.js` and sets the exit code.
- `src/cli.js`: the commands `auth login`, `auth status`, `auth logout`, `me`, and `surfaces`, plus `run(argv, deps)`.
- `src/index.js`: the library entry point. It exports `createClient`, `LinkedInApiError`, `createTokenStore`, `SURFACES`, and `findSurfaces`.
- `src/surfaces.js`: the surface registry, with `SURFACES` and `findSurfaces`.
- `src/linkedin/client.js`: the LinkedIn API client, with `createClient` and `LinkedInApiError`.
- `src/auth/token-store.js`: the official OAuth token in the OS credential store, with `createTokenStore`.
- `src/experimental/browser.js` and `policy.js`: opt-in Playwright session, bounded text extraction, single confirmed UI actions, and a fixed read-only Voyager `me` adapter.
- `src/experimental/jobs.js`: persistent finite read-job queue, exclusive execution, and an abortable worker. Jobs store action metadata, not credentials or results.
- `src/experimental/cli.js`: `experimental browser`, `voyager`, `jobs`, `batch`, and `worker`. Every active command requires `--experimental` plus an interactive acknowledgement or explicit `--yes`; browser edits also require `--confirm-action`.

Token storage uses @napi-rs/keyring. Verified on Windows only. Linux is unverified (Q11), and an unsupported platform fails at load.

Commands:

- `npm install`
- `npm test`
- `node --test test/cli.test.js` (one file)
- `node bin/linkedin.js --help`

## Project goal

- A JavaScript package, managed through npm, that gives the user a CLI and an importable JS API to automate their own LinkedIn account across its surfaces, for example profile management, posts, likes, comments, messages and replies.
- "Without abuse" remains a hard requirement: no bulk/spam outreach, unauthorized private-data access, CAPTCHA bypass, stealth to defeat platform controls, or rate-limit evasion. Stop on checkpoints and throttling; a human completes verification.
- On 2026-10-21 the user expanded the earlier official-only/no-scheduler scope to experimental own-account browser automation, bounded extraction, internal API reads, and local scheduling/batches/worker. The earlier research records terms/account risks; experimental does not mean compliant or safe.
- The official client stays identity-only. Experimental UI edits are one explicitly confirmed action per command; queued jobs are restricted to `browser.snapshot`, `browser.extract`, and `voyager.me`. No generic internal-API passthrough.
- Decided: commander for the CLI; @napi-rs/keyring for official OAuth tokens; Playwright persistent Chromium for experimental manual login. Browser session credentials live in a dedicated profile under `~/.linkedin-api-mcp` (or `LINKEDIN_STATE_DIR`), never in the queue or Git. The directory is sensitive and must not be shared.
- Official OAuth browser flow remains open (Q4, Q6, Q7 of `reports/LinkedIn CLI automation without abuse.md`).

## Working rules

- Use only haiku-tier models (`model: "haiku"`) for Agent and subagent calls in this project.
- Research requests run through the deep-research skill. Notes go to `research_notes/<title>/` and the final report to `reports/<title>.md`. Each request gets its own title and folder; never write into or rename an earlier request's folder.
