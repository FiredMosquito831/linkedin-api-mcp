# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

Modules:

- `bin/linkedin.js`: the `linkedin` command. It runs `run` from `src/cli.js` and sets the exit code.
- `src/cli.js`: the commands `auth login`, `auth status`, `auth logout`, `me`, and `surfaces`, plus `run(argv, deps)`.
- `src/index.js`: the library entry point. It exports `createClient`, `LinkedInApiError`, `createTokenStore`, `SURFACES`, and `findSurfaces`.
- `src/surfaces.js`: the surface registry, with `SURFACES` and `findSurfaces`.
- `src/linkedin/client.js`: the LinkedIn API client, with `createClient` and `LinkedInApiError`.
- `src/auth/token-store.js`: the token in the OS credential store, with `createTokenStore`.

Token storage uses @napi-rs/keyring. Verified on Windows only. Linux is unverified (Q11), and an unsupported platform fails at load.

Commands:

- `npm install`
- `npm test`
- `node --test test/cli.test.js` (one file)
- `node bin/linkedin.js --help`

## Project goal

- A JavaScript package, managed through npm, that gives the user a CLI and an importable JS API to automate their own LinkedIn account across its surfaces, for example profile management, posts, likes, comments, messages and replies.
- "Without abuse" is a hard requirement. Automation must stay within LinkedIn's terms and rate limits: no scraping at scale, and no bulk or spam messaging or connection requests. The research in `research_notes/` sets the boundaries.
- Official endpoints only. Write commands wait on Q1 and Q2 of the research report in `reports/LinkedIn CLI automation without abuse.md`.
- Architecture is undecided. Record decisions here once made (official API vs. unofficial tooling, CLI framework, OAuth flow, token storage).

## Working rules

- Use only haiku-tier models (`model: "haiku"`) for Agent and subagent calls in this project.
- Research requests run through the deep-research skill. Notes go to `research_notes/<title>/` and the final report to `reports/<title>.md`. Each request gets its own title and folder; never write into or rename an earlier request's folder.
