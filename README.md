# linkedin-api-mcp

Local JavaScript CLI/library for LinkedIn. Official identity tools plus **experimental, opt-in own-account automation**. Despite the repository name, this package does **not yet implement an MCP server**.

## Setup

Requires Node.js >=22.12.0; development is verified on Windows with Node 24.

```sh
npm ci
npx playwright install chromium
node bin/linkedin.js --help
npm test
```

Playwright downloads Chromium separately. No live LinkedIn actions run during tests. Native OAuth token storage uses `@napi-rs/keyring`; unsupported platforms may fail on import.

## Official tools

- `auth login`: import a developer-portal OAuth token from stdin or `LINKEDIN_ACCESS_TOKEN`.
- `auth status`: check the token against LinkedIn's userinfo endpoint.
- `auth logout`: delete the local OAuth token (not the browser session).
- `me`: print the signed-in identity as JSON.
- `surfaces [--status ...] [--group ...] [--json]`: list the original research matrix. Its statuses describe the original official-only scope, **not experimental feature coverage**.

Do not put tokens on command lines, in shell history, or in chat. If importing from stdin, ensure `LINKEDIN_ACCESS_TOKEN` is unset because the environment value takes precedence.

## Experimental access

Unofficial endpoints and browser automation can break or restrict your account. "Experimental" is **not** a safety or LinkedIn-approval claim. Use only your own account and data you are permitted to access.

Every active experimental command requires `--experimental` and confirmation. In an interactive terminal, type `yes` when prompted. `--yes` is an explicit acknowledgement for that invocation, not a permanent setting. Changes additionally require `--confirm-action`.

```sh
node bin/linkedin.js experimental capabilities
node bin/linkedin.js experimental browser login --experimental
node bin/linkedin.js experimental browser snapshot --url https://www.linkedin.com/in/me/ --experimental
node bin/linkedin.js experimental browser extract --url https://www.linkedin.com/feed/ --selector article --limit 5 --experimental
node bin/linkedin.js experimental voyager me --experimental
```

`browser login` opens a dedicated, headed Chromium profile. Enter credentials and complete verification **yourself**. No credential extraction from your normal browser, CAPTCHA solving, stealth plugins, proxy rotation, or challenge bypass is included. A checkpoint, authentication failure, or 429 stops the operation. `voyager me` is one fixed read-only internal endpoint, using the dedicated browser's cookie jar; no generic API request command exists.

`browser snapshot` returns at most 20,000 characters. `browser extract` reads at most 50 elements, each capped at 4,000 characters, from one page; it does not scroll/crawl or collect multiple profiles.

### Single UI actions

For an explicitly selected element on one page:

```sh
node bin/linkedin.js experimental browser click --url https://www.linkedin.com/feed/ --selector '#one-specific-element' --experimental --confirm-action
```

The selector must match exactly one element. `browser fill` uses the same URL/selector/confirmation flags and reads its text from stdin instead of arguments. Password fields are denied; authentication is manual. Filling an input can cause autosave and must be treated as an external change. These are generic UI primitives, **not verified adapters for every LinkedIn surface**. Page layouts and selectors change. No bulk send, mass invitation, or automated engagement loop is provided.

### Scheduling, batches, and worker

The queue accepts only **finite read jobs**:

- `browser.snapshot`: `{ "type": "browser.snapshot", "url": "https://www.linkedin.com/in/me/" }`
- `browser.extract`: the same plus `"selector"` and an integer `"limit"` from 1 to 50.
- `voyager.me`: `{ "type": "voyager.me" }`

```sh
node bin/linkedin.js experimental jobs add --type browser.snapshot --url https://www.linkedin.com/in/me/ --at 2026-11-01T12:00:00Z --experimental
node bin/linkedin.js experimental jobs list --experimental
node bin/linkedin.js experimental jobs run --max 5 --experimental
node bin/linkedin.js experimental jobs cancel JOB_ID --experimental
node bin/linkedin.js experimental batch jobs.local.json --experimental
node bin/linkedin.js experimental worker --interval 5000 --experimental
```

A batch file is a JSON array of 1..20 objects, each `{ "action": { ... }, "runAt": "2026-11-01T12:00:00Z" }`. `batch` enqueues; it does **not** execute. `jobs run` handles up to 20 due jobs sequentially. `worker` is a foreground daemon-style loop until Ctrl+C; it does not install a service or silently detach. The worker is read-only, stops processing a cycle at challenges/throttling, does not retry failed/uncertain jobs, and never rotates identities. Browser output streams to stdout, **not** into the queue. Avoid logging it if it contains private data.

### Local state

Default: `~/.linkedin-api-mcp/` (override with an absolute `LINKEDIN_STATE_DIR`). The `browser-profile/` subdirectory contains session credentials; `jobs/` contains job metadata. Keep the entire directory private. Browser cookies are distinct from official OAuth tokens and are not guaranteed to use the OS credential store. Local profiles are not encrypted by this package.

Queue files must be treated as sensitive metadata even though credentials and result bodies are excluded. On Windows, filesystem mode bits do not establish restrictive ACLs; use a private user-profile directory. Do not store this state in the repository or a synced/shared folder.

## Library

```js
import { createClient, openExperimentalBrowser, createJobStore } from 'linkedin-cli';

const client = createClient({ accessToken });
const identity = await client.getIdentity();
```

The root exports the official client/token store, original surface registry, experimental browser, `HumanInterventionError`, `createJobStore`, `runDueJobs`, and `runWorker`. Browser use requires `{ experimental: true, profileDirectory: '/absolute/private/path' }`; single changes require `{ confirmed: true }`. No write jobs or evasion tools are available.

## Verification limits

Tests use fakes or local temporary files. Live LinkedIn endpoint behavior, selectors, and account compatibility are **not** verified. The internal `me` endpoint can change without notice. The browser interface is groundwork for additional named surface adapters, not full surface coverage. No MCP transport, official OAuth redirect flow, or npm publication is included yet.
