# Agent install, OAuth login, and live verification — interface contract

Three parallel workstreams. Each owns only its files. Node ESM, Node >=22.12.0, `node:test`. No live LinkedIn calls in tests. No subagents. Do not commit or push; the controller does that.

Shared rules:

- No secrets in the repository, in argv, in logs, or in error messages. Client secrets and tokens live in the OS credential store (`@napi-rs/keyring`) or are read from the environment.
- Nothing here may weaken the existing gates: experimental commands still need `--experimental` plus acknowledgement; writes still need a separate operator approval.
- Errors use the existing `OperationError` from `src/operations/errors.js` with `code` and `message`. Public output goes through `publicError`/`exitCode`.
- No network calls except to `www.linkedin.com` OAuth endpoints and to the user's own LinkedIn pages.
- Do not add dependencies beyond `playwright` and the ones already present. No new npm packages.

## Workstream 1 — OAuth login (`src/auth/oauth.js`)

Owner files: `src/auth/oauth.js`, `test/oauth.test.js`.

Exports:

- `export const OAUTH_AUTHORIZE_URL = 'https://www.linkedin.com/oauth/v2/authorization'`
- `export const OAUTH_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'`
- `export function buildAuthorizationUrl({ clientId, redirectUri, scope, state, codeChallenge, enableExtendedLogin })` -> string. `scope` is a space-delimited string. Adds `code_challenge` and `code_challenge_method=S256` only when `codeChallenge` is given. Adds `enable_extended_login=true` only when `enableExtendedLogin` is true. Always includes `response_type=code`, `client_id`, `redirect_uri`, `state`.
- `export async function exchangeCodeForToken({ code, clientId, clientSecret, redirectUri, codeVerifier, fetchImpl })` -> `{ accessToken, expiresIn, refreshToken?, refreshTokenExpiresIn?, scope }`. Posts `application/x-www-formencoded` to `OAUTH_TOKEN_URL` with `grant_type=authorization_code`, `code`, `client_id`, `redirect_uri`, plus `client_secret` when provided and `code_verifier` when provided. On a non-2xx response, throw `OperationError('AUTH_REQUIRED', ...)` with the status in the message but no response body.
- `export async function refreshAccessToken({ refreshToken, clientId, clientSecret, fetchImpl })` -> same shape. Posts `grant_type=refresh_token`, `refresh_token`, `client_id`, and `client_secret` when provided.
- `export async function startCallbackServer({ redirectPath = '/callback', port = 0, host = '127.0.0.1', timeoutMs = 300000, fetchImpl })` -> `{ url, waitForCode, close }`. `url` is the full redirect URI, e.g. `http://127.0.0.1:PORT/callback`. `waitForCode()` resolves `{ code, state }` from the query string of the first request, rejects on `error`/`error_description`, and rejects on timeout. It must respond to the browser with a short HTML page and never echo the code into the page body. `close()` stops the server. Use `node:http`.
- `export function parseRedirect(url)` -> `{ code, state, error, errorDescription }`, tolerant of a full URL or a bare query string.
- `export function generatePkce()` -> `{ codeVerifier, codeChallenge, state }` using `node:crypto` (base64url, 32 random bytes for the verifier, SHA-256 for the challenge).

Tests must cover: URL construction with and without PKCE, state being passed through, the token exchange request body, a refresh request body, a non-2xx token response not leaking the body, `parseRedirect` for a success and an error redirect, `startCallbackServer` serving a code over a real loopback request, the callback server rejecting a mismatched `state`, and timeout behavior with a short timeout.

## Workstream 2 — live verification (`src/experimental/live-check.js`)

Owner files: `src/experimental/live-check.js`, `test/live-check.test.js`.

- `export const LIVE_READ_OPERATIONS` -> the read operation names that can be checked live: `profile.get`, `posts.list`, `feed.list`, `inbox.list`, `connections.list`, `companies.get`, `jobs.search`.
- `export async function runLiveCheck({ operations, execute, now = () => new Date() })` -> `{ schemaVersion: 1, startedAt, finishedAt, results: [{ operation, status, detail, durationMs }] }`. `execute(operation)` is injected and returns a value or throws. `status` is one of `ok`, `failed`, `unsupported`. An error with `code` `LAYOUT_UNSUPPORTED` or `ACCESS_RESTRICTED` maps to `unsupported`; anything else maps to `failed`; a resolved value maps to `ok`. `detail` is a short human-readable string that must never contain a page body, a token, or a cookie. Run the operations in the given order and never retry a failed one.
- `export function summarizeReport(report)` -> `{ checked, ok, unsupported, failed, lines }`. `lines` is one short line per operation, safe to print to a terminal.
- The report is written by the CLI, not here. Never persist a page body.

Tests must cover: all-ok, one layout-unsupported mapping to `unsupported`, one generic error mapping to `failed`, ordering, no retry of a failed operation, and that a detail string never leaks a thrown error's body.

## Workstream 3 — agent install/uninstall/doctor (`src/install/*`)

Owner files: `src/install/harnesses.js`, `src/install/cli.js`, `src/install/doctor.js`, `test/install.test.js`.

`src/install/harnesses.js` exports:

- `export const HARNESSES` -> `{ claude, codex, opencode, antigravity }`, each `{ name, cli, scopes: ['global','project'], notes }`.
- `export function harnessDefinitions({ home, projectDir, source, marketplace, plugin, serverCommand, serverArgs })` -> an object with one adapter per harness, each exposing `install(scope)`, `uninstall(scope)`, `doctor(scope)`. Every adapter returns an array of `{ harness, step, status: 'ok'|'skipped'|'failed', detail }` steps. An adapter whose CLI is not on PATH returns a single `skipped` step explaining that. Never throw for a missing CLI; never print a token.

Adapter behavior, mirroring `FiredMosquito831/ase-moodle-mcp`:

- **claude**: `claude plugin marketplace add <source> --scope user|project` then `claude plugin install <plugin>@<marketplace> --scope user|project -y`. Project scope also writes `<projectDir>/.claude/settings.json` with `extraKnownMarketplaces` and `enabledPlugins` merged, not overwritten. Project-scope uninstall removes the `enabledPlugins` entry and the `extraKnownMarketplaces` entry it added to that project file. The **global** marketplace registration is never removed: `claude plugin marketplace remove` would uninstall the plugin from every other folder as well, so only the plugin is uninstalled from the requested scope. Also run `claude mcp remove <plugin> --scope user` and `--scope project` to drop a manually added duplicate server, ignoring failure when the server is absent.
- **codex**: global runs `codex plugin marketplace add <source>` and `codex plugin add <plugin>@<marketplace>`. Project scope writes `<projectDir>/.codex/config.toml` with a `[mcp_servers.<plugin>]` table holding `command` and `args`; global writes the same table into `<home>/.codex/config.toml`. Remove only that table and its sub-tables, leaving all other content intact, and never duplicate it.
- **opencode**: no CLI. Global writes `<home>/.config/opencode/opencode.json` with `mcp.<plugin> = { type: 'local', command, enabled: true }`, preserving other keys. Project scope writes `<projectDir>/opencode.json` the same way. Global also copies `skills/linkedin/SKILL.md` to `<home>/.config/opencode/<plugin>/SKILL.md`.
- **antigravity**: global only; project scope must be refused explicitly with a `failed` step, not silently skipped. Runs `agy mcp add <plugin> -- <command> <args>`.

All file writes must be atomic (write a temp file in the same directory, then rename) and must not clobber unrelated content in an existing JSON or TOML file.

`src/install/doctor.js` exports:

- `export async function checkEnvironment({ env, home, projectDir, chromiumExecutable, fetchImpl })` -> `{ checks: [{ name, status: 'ok'|'warn'|'fail', detail }] }`. Checks: Node version at least 22.12.0; the Chromium executable exists (use `chromium.executablePath()` from Playwright and check the file exists — Playwright 1.64.1 has **no** install script, so the browser is a separate download and is commonly missing); the native keyring module imports without throwing; the MCP server module imports and the catalog is non-empty; the state directory exists or can be created.
- `export async function installChromium({ spawnImpl })` -> runs `playwright install chromium` in a child process and reports the outcome. It must be a separate, explicit command — never automatic during `npm install`.

`src/install/cli.js` exports `registerInstallCommands(program, deps)` adding:

- `linkedin install [targets...] [--scope global|project] [--source owner/repo] [--marketplace name] [--yes]`: targets default to all; unknown targets are an error; `--source` defaults to `FiredMosquito831/linkedin-api-mcp`; it runs each adapter in order and prints the steps.
- `linkedin uninstall [targets...] [--scope global|project]`: reverses the install.
- `linkedin doctor`: prints the environment checks.
- `linkedin browser install`: runs the explicit Chromium download.

Tests must cover: every adapter's install/uninstall against a temporary home and project directory, that a missing CLI yields `skipped`, that the Codex TOML table is added, removed, and leaves other tables intact, that the opencode JSON keeps unrelated keys, that the Claude settings JSON keeps unrelated keys, that a project-scope request to antigravity fails explicitly, that the doctor reports a missing Chromium, and that no step output contains a token.

## Controller-owned integration (not for the workstreams)

The controller wires the commands into `src/cli.js`, adds `linkedin auth login --oauth`, `linkedin auth refresh`, and `linkedin experimental live-check`, and writes `scripts/bootstrap.sh` and `scripts/bootstrap.ps1`.
