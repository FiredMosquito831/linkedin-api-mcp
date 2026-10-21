# linkedin-api-mcp

JavaScript CLI, operations library, MCP server, and Claude Code plugin for LinkedIn. Official identity tools plus **experimental, opt-in browser adapters** for named LinkedIn surfaces.

**Status:** v0.2.0 source is available in this repository. The npm package is not published. Browser adapters are tested against local fixtures, **not live LinkedIn**. A named command is not a promise that every current LinkedIn layout, language, subscription, or account is supported. Unsupported layouts and access restrictions fail explicitly.

## Install and package

Requires Node.js >=22.12.0; development is verified on Windows with Node 24.

```sh
npm ci
npx playwright install chromium
node bin/linkedin.js --help
npm test
npm run pack:check
```

See [installation instructions](docs/installation.md) for npm/npx, standalone MCP, and the Claude Code plugin/marketplace, following the packaging patterns in `FiredMosquito831/ase-moodle-mcp` and `FiredMosquito831/google-services-mcps`.

Releases follow the [npm-only release guide](docs/release.md): synchronized package/lock/plugin versions, GitHub release-driven OIDC publication, and direct npm verification. PR CI covers Windows/Linux/macOS and Node 22.12/24; hosted results are unverified until the workflow runs. `npm run pack:smoke` installs and tests the actual tarball locally. The source is Apache-2.0 (`LICENSE` and `NOTICE`). No Python/PyPI release path exists, and merging does not publish.

The GitHub repository is public. npm publication still requires separate approval; the release workflow can generate provenance from this public source repository.

The GitHub plugin installation route (available once these files are on the default branch) is:

```text
/plugin marketplace add FiredMosquito831/linkedin-api-mcp
/plugin install linkedin@linkedin-api-mcp
```

The future npm package is **`@firedmosquito831/linkedin-api-mcp`**, with two binaries:

- `linkedin`: the CLI.
- `linkedin-api-mcp`: automatically starts MCP; do **not** append another `mcp` argument.

Installation and server startup never open a browser or contact LinkedIn. Browser tool calls do so only after experimental access is enabled. Playwright's Chromium is installed separately. Native OAuth token storage uses `@napi-rs/keyring`; unsupported platforms may fail on import.

## Shared named operations

The CLI and MCP tools call one operations service with the same validation, account isolation, and approval rules.

```sh
node bin/linkedin.js operations list
node bin/linkedin.js profile get --experimental
node bin/linkedin.js posts list --limit 5 --experimental
node bin/linkedin.js inbox list --limit 5 --experimental
node bin/linkedin.js search people --query "example" --limit 5 --experimental
node bin/linkedin.js companies get --url https://www.linkedin.com/company/example/ --experimental
```

| Category | Named operations |
|---|---|
| Profiles | `profile get`, `skills`, `contact`, `update` (headline/about) |
| Posts | `posts list`, `get`, `create` (text + optional PNG/JPEG), `edit`, `delete`, `share` |
| Engagement | `comments list/create/reply`; `reactions list/add/remove` |
| Inbox | `inbox list/thread/search`; `messages send/reply/mark-read` |
| Network | `connections list/status/remove`; `invitations received/sent/send/accept/reject/withdraw` |
| Feed/search | `feed list`; `search people/companies/posts/jobs` |
| Companies | `companies get/posts/follow/unfollow` |
| Jobs | `jobs search/saved/get/apply-url` (read application link, never apply) |
| Analytics | `analytics profile-views/post/ssi` when the account exposes the data |
| Sales Navigator | `sales profile/search-people/search-companies/inbox/thread`; `sales messages send/reply` when entitled |

Read outputs are structured records with source URLs, bounded lists, and cursors. Missing metrics are null/unavailable, never invented. Reads stay on one page, with a maximum limit of 50; there is no unlimited crawl or automatic scrolling. Inbox/thread reads may mark conversations seen. Inbox/Sales search can be limited to visible records; results state that limitation.

The catalog reports verification status. All live compatibility is unverified. An unavailable page, ambiguous target, or changed layout raises `LAYOUT_UNSUPPORTED` or `ACCESS_RESTRICTED`; it must not silently run a different action.

### Outputs and exit codes

Named operations return `{schemaVersion:1, success, operation, account, data}`. Errors have `{schemaVersion:1, success:false, error:{code,message,...}}`. Use `--fields name,url`, `--jsonl` for list items, or `--quiet` for no successful output. Legacy commands keep their earlier formats.

| Exit | Meaning |
|---|---|
| 0 | Success |
| 1 | Other failure |
| 2 | Invalid input |
| 3 | Authentication/manual verification required |
| 4 | Access restricted or experimental disabled |
| 5 | Approval required, expired, or consumed |
| 6 | Rate limited before an uncertain write |
| 7 | Unsupported layout |
| 8 | Write outcome unknown; **do not retry automatically** |

## Single-target writes: prepare, approve, execute

A named write command **only prepares** an expiring preview. It does not send/publish/delete. Supply private text via a JSON file or stdin, not command arguments.

```sh
node bin/linkedin.js posts create --input draft.local.json --experimental
node bin/linkedin.js approvals inspect APPROVAL_ID
node bin/linkedin.js approvals approve APPROVAL_ID --digest REVIEWED_SHA256
node bin/linkedin.js approvals execute APPROVAL_ID --experimental
```

A text-post payload is `{ "text": "Your draft" }`; optional `"imagePath"` is an absolute PNG/JPEG path up to 10 MiB. Approval binds the account alias, operation, exact input, and image bytes. It expires after ten minutes and is consumed **before dispatch**. The approval command requires a separate interactive operator terminal and an exact confirmation phrase. MCP has no approval-granting tool.

Adapters try to verify the resulting state. An uncertain send returns an unknown outcome and the approval cannot be reused. No automatic retry, bulk outreach, multi-recipient operation, or unattended write queue is included. UI controls are primarily English/semantic candidates; a different language/layout may be unsupported.

## MCP server

```sh
node bin/linkedin.js mcp --transport stdio
node bin/linkedin-api-mcp.js --transport stdio
```

The default server exposes passive capabilities/approval tools with no experimental LinkedIn operations. Explicitly opt in with `--experimental` or `LINKEDIN_EXPERIMENTAL=1` (plugin boolean `true` is also accepted). No interactive prompt runs on protocol stdin/stdout; diagnostics go to stderr.

With experimental access enabled, tools include:

- `linkedin_profile_get`, `linkedin_posts_list`, `linkedin_inbox_thread`, etc.
- Write tools such as `linkedin_posts_create_prepare` return a preview/approval ID, never grant approval.
- `linkedin_approval_status` checks the local approval state.
- `linkedin_execute_approved` dispatches only after separate operator approval, consuming it before the attempt.

Streamable HTTP is available **only on 127.0.0.1**, with Host/Origin validation, a 1 MB request cap, and bearer authentication. Set a strong token in `LINKEDIN_MCP_TOKEN` using a secret manager/environment mechanism, not a literal shell-history command, then run:

```sh
node bin/linkedin.js mcp --transport streamable-http --port 8765
```

Tool annotations are hints, not authorization. The operations service enforces approval. LinkedIn content is untrusted data and must never be treated as agent instructions.

## Accounts and browser authentication

```sh
node bin/linkedin.js accounts list
node bin/linkedin.js accounts add work --label Office
node bin/linkedin.js accounts use work
node bin/linkedin.js experimental browser login --experimental
node bin/linkedin.js doctor
```

`accounts rename` changes only a display label, not the stable account key. Named operations also accept `--account work`; `LINKEDIN_ACCOUNT` selects the account for MCP and legacy commands. The default account keeps the original state paths. Other accounts have separate browser profiles, queues, approval stores, and OAuth-token keychain slots. Confirm the logged-in identity for each profile before approving writes; an alias is not an identity proof.

Manual browser login is required for experimental operations. You enter credentials and solve any verification yourself in dedicated headed Chromium. No cookie import from your normal browser, CAPTCHA solving, stealth plugins, proxy rotation, or challenge bypass is included. Account restrictions remain possible. Stop on challenges or throttling rather than defeating them.

## Original official tools

- `auth login`: import developer-portal OAuth token via stdin or `LINKEDIN_ACCESS_TOKEN`.
- `auth status`: check the token with LinkedIn userinfo.
- `auth logout`: delete the selected local OAuth token, not the browser session.
- `me`: return official basic identity.
- `surfaces`: original official-API research matrix, **not** the implementation catalog. Use `operations list` for current named operations.

Official OAuth browser redirect/refresh support remains unfinished. Do not type tokens on command lines or into chat. When importing through stdin, ensure `LINKEDIN_ACCESS_TOKEN` is unset because it takes precedence.

## Low-level experimental primitives and read scheduling

Existing `experimental browser snapshot/extract/click/fill` and `experimental voyager me` remain. They require `--experimental` plus interactive acknowledgement or explicit `--yes`; low-level UI changes additionally require `--confirm-action`. Text fields use stdin and password fields are denied. Click/fill reports dispatch only, not verified server completion.

Snapshot text is capped at 20,000 characters. Extraction reads at most 50 elements, 4,000 characters each. Voyager is restricted to a fixed read-only own-account endpoint.

```sh
node bin/linkedin.js experimental jobs add --type browser.snapshot --url https://www.linkedin.com/in/me/ --at 2026-11-01T12:00:00Z --experimental
node bin/linkedin.js experimental jobs list --experimental
node bin/linkedin.js experimental jobs run --max 5 --experimental
node bin/linkedin.js experimental jobs cancel JOB_ID --experimental
node bin/linkedin.js experimental batch jobs.local.json --experimental
node bin/linkedin.js experimental worker --interval 5000 --experimental
```

The queue accepts `browser.snapshot`, `browser.extract`, `voyager.me`, and validated `operation.read` jobs. For a named read use `--type operation.read --operation profile.get` (optional `--payload` JSON parameters), or a batch action `{ "type":"operation.read", "operation":"profile.get", "input":{} }`. Write operations are rejected both at enqueue and execution. Batches hold 1..20 explicit jobs. The sequential foreground worker exits on challenges/throttling, never retries failed or uncertain jobs, and is stopped by Ctrl+C. It does not install a system service. Results go to stdout, not queue files.

## Local state and recovery

Default `~/.linkedin-api-mcp/`, overridden by an absolute `LINKEDIN_STATE_DIR`. Browser profiles contain session credentials and are not encrypted by this package. Approvals contain draft content; queues contain action metadata. Keep the directory private, out of Git and shared/synced folders. Windows mode bits do not enforce private ACLs.

Locks are never automatically stolen. If a process crashes, confirm it is no longer running before manually removing its specific `.lock` file. Never delete browser locks while a live process uses the profile. No job/approval/profile data is included in the npm package.

## Library

```js
import { createOperations } from '@firedmosquito831/linkedin-api-mcp';

const operations = createOperations({
  stateDirectory: '/absolute/private/state',
  account: 'default',
  experimental: true
});
const result = await operations.call('profile.get', { limit: 5 });
```

See `operations.list()` for schemas. The library also exports official identity/token helpers, original surface registry, experimental browser/queue primitives, account helpers, and typed operation errors. Publishing a package is not performed by setup or tests.

## Verification limits

Tests use local DOM fixtures, fake operations, and loopback/in-memory MCP clients. No live LinkedIn writes or user credentials are used. Selectors, subscription entitlements, verification evidence, localization, and account compatibility need an explicit live test session before production use. No project can promise reliable control over every LinkedIn surface merely by listing command names.
