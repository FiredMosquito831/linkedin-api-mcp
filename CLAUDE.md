# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

- No source code, `package.json`, or git repository exists yet, so there are no build, lint, or test commands to run. Add them here once the npm package is scaffolded.
- `.remember/` is session-memory plugin state, not project source.

## Project goal

- A JavaScript package, managed through npm, that gives the user a CLI and an importable JS API to automate their own LinkedIn account across its surfaces, for example profile management, posts, likes, comments, messages and replies.
- "Without abuse" is a hard requirement. Automation must stay within LinkedIn's terms and rate limits: no scraping at scale, and no bulk or spam messaging or connection requests. The research in `research_notes/` sets the boundaries.
- Architecture is undecided. Record decisions here once made (official API vs. unofficial tooling, CLI framework, OAuth flow, token storage).

## Working rules

- Use only haiku-tier models (`model: "haiku"`) for Agent and subagent calls in this project.
- Research requests run through the deep-research skill. Notes go to `research_notes/<title>/` and the final report to `reports/<title>.md`. Each request gets its own title and folder; never write into or rename an earlier request's folder.
