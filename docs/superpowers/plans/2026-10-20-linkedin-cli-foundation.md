# LinkedIn CLI Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the npm package foundation for the LinkedIn CLI and library: keychain token storage, the official identity read, a registry of all 28 researched surfaces with their status, and no write commands.

**Architecture:** One ESM package. `src/surfaces.js` is the coverage source of truth. `src/linkedin/client.js` is the only network layer, and it calls official LinkedIn endpoints only. `src/auth/token-store.js` keeps the token in the OS credential store. `src/cli.js` wires these into commands, and `src/index.js` exposes the same pieces as a library.

**Tech Stack:** Node.js 22.12+ (ESM), commander 15.0.0, @napi-rs/keyring 2.1.2, node:test. The local machine runs Node v24.6.0.

**Spec:** `reports/LinkedIn CLI automation without abuse.md`. Its Table 3 and build-order section drive this plan. Its Tables 1a and 1b, and the coverage gaps in its Table 4 (Q12), define the surfaces.

## Global Constraints

- Node.js `>=22.12.0` (`engines`; commander 15.0.0 requires it).
- `"type": "module"`. No CommonJS build. No top-level await in `src/`.
- Base URL `https://api.linkedin.com`.
- Headers `Linkedin-Version: 202610` and `X-Restli-Protocol-Version: 2.0.0` on `/rest/` paths only.
- Official endpoints only. No Voyager, scraping, cookie, or browser-automation routes.
- No scheduler, daemon, watch, or batch command.
- No write command until Q1 (posting) and Q2 (likes, comments) are answered. This plan adds none.
- Token only in the OS credential store: service `linkedin-cli`, account `default`. Never written to a file.
- No posts or profile data stored beyond the process.
- `"private": true` until a publish decision (Q10).
- Tests never call LinkedIn. They inject `fetch` or a fake keyring `Entry`.

## Not In This Plan

- The OAuth redirect flow (PKCE or classic). It waits on Q4, Q6 and Q7. This plan uses a token generated in the developer portal.
- Write commands: posting, editing or deleting posts, likes, and comments. They wait on Q1 and Q2.
- Rate-limit handling beyond surfacing a 429. Q3 is open.
- Publishing to npm (Q10) and Linux keychain behavior (Q11).

## Review Focus

1. No token saved yet: `me` and `auth status` print `Not logged in. Run linkedin auth login.` and exit 1, with no stack trace. (Task 5)
2. LinkedIn rejects the token with 401, for example after its 60-day life ends: the CLI says to log in again and exits 1. (Tasks 3, 5)
3. OS credential store unavailable: `auth login` fails with the backend's message and writes nothing to disk. (Tasks 4, 5)
4. Rate limit (429): the error keeps `Retry-After` when LinkedIn sends it, and the client never retries. (Task 3)
5. Token pasted with surrounding whitespace or a trailing newline: it is trimmed before saving, and an empty token is rejected. (Tasks 4, 5)

## File Structure

- Create `package.json`: manifest, `bin`, `exports`, `engines`, test script. (Task 1)
- Create `src/surfaces.js`: the 28-entry registry and `findSurfaces`. (Task 2)
- Create `src/linkedin/client.js`: `createClient` and `LinkedInApiError`. (Task 3)
- Create `src/auth/token-store.js`: `createTokenStore`. (Task 4)
- Create `src/cli.js`: `run`. (Task 5)
- Create `bin/linkedin.js`: entry point that calls `run`. (Task 5)
- Create `src/index.js`: library exports. (Task 5)
- Create `test/surfaces.test.js`, `test/client.test.js`, `test/token-store.test.js`, `test/cli.test.js`.
- Modify `CLAUDE.md`: commands and layout. (Task 5)

The project is not a git repository, so the plan has no commit steps. Run `git init` first if you want them.

---

## Task 1: Scaffold the package

**Files:**
- Create: `package.json`

**Interfaces:**
- Consumes: none.
- Produces: `package.json` with `name` `linkedin-cli`, `version` `0.1.0`, `private` `true`, `type` `module`, `bin` `{ "linkedin": "bin/linkedin.js" }`, `exports` `{ ".": "./src/index.js" }`, `engines` `{ "node": ">=22.12.0" }`, `scripts.test` `node --test`, and exact dependencies `"commander": "15.0.0"` and `"@napi-rs/keyring": "2.1.2"`.

- [ ] **Step 1: Create `package.json` with the fields above.**

- [ ] **Step 2: Install dependencies.** Run `npm install`. Expected: both dependencies install with no errors.

- [ ] **Step 3: Check the keyring import.** Run `node -e "import('@napi-rs/keyring').then(m => console.log(typeof m.Entry))"`. Expected output: `function`.

No tests run yet. The first test file arrives in Task 2.

## Task 2: Surface registry

**Files:**
- Create: `src/surfaces.js`
- Test: `test/surfaces.test.js`

**Interfaces:**
- Consumes: none.
- Produces:
  - `export const SURFACES`: 28 frozen objects, each `{ id, group, name, access, terms, status, reason }`. `name` is the spec table's Surface cell, copied verbatim. Gap rows take their names from the spec's Q12.
  - `export function findSurfaces({ status, group } = {})`: returns the matching entries in registry order. Throws `RangeError` when `status` is outside the five statuses or `group` is outside the three groups, and the message names the bad value.

The table decides every field except `name`. `terms` follows the spec's Terms cell. Where a row has an official route, the label is for that route. Where it has none, the label is for the unofficial route.

| id | group | access | terms | status | reason |
|---|---|---|---|---|---|
| sign-in-identity | member | self-serve | allowed | available | explicitly allowed identity read |
| store-profile-data | member | self-serve | prohibited | blocked | API Terms §4.1 and §4.3 storage limits |
| create-post | member | self-serve | gray | pending | Q1 |
| schedule-posts | member | self-serve | gray | excluded | scheduling is outside the design |
| unattended-post | member | self-serve | prohibited | excluded | prohibited on the literal reading of API Terms §3.1 item 26 |
| edit-delete-own-post | member | self-serve | gray | pending | Q1 |
| read-own-post | member | none | not-assessed | pending | single-post scope unverified |
| like-post | member | self-serve | gray | pending | Q2 |
| comment-reply | member | self-serve | gray | pending | Q2 |
| read-feed | member | none | prohibited | blocked | no official route for individuals |
| read-dms | member | none | prohibited | blocked | no official route for individuals |
| send-dm-reply | member | restricted | prohibited | blocked | approved partners under an API agreement |
| read-connections | member | restricted | not-assessed | blocked | approved developers only |
| invitations | member | restricted | prohibited | blocked | approved partners |
| notifications | member | none | prohibited | blocked | no official route found |
| people-search | member | none | prohibited | blocked | no official route for individuals |
| edit-profile-fields | member | none | prohibited | blocked | no official write route |
| own-analytics | member | restricted | allowed | blocked | Q5 |
| page-posts | company | restricted | allowed | blocked | Q5 |
| page-reactions-comments | company | restricted | allowed | blocked | Q5 |
| page-admin-analytics | company | restricted | not-assessed | blocked | Q5 |
| advertising | company | restricted | not-assessed | blocked | approval; outside the CLI scope |
| groups | gap | not-researched | not-assessed | not-researched | coverage gap (Q12) |
| events | gap | not-researched | not-assessed | not-researched | coverage gap (Q12) |
| newsletters | gap | not-researched | not-assessed | not-researched | coverage gap (Q12) |
| learning | gap | not-researched | not-assessed | not-researched | coverage gap (Q12) |
| job-posting | gap | not-researched | not-assessed | not-researched | coverage gap (Q12) |
| sales-navigator | gap | not-researched | not-assessed | not-researched | coverage gap (Q12) |

- [ ] **Step 1: Write the failing test.** Create `test/surfaces.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SURFACES, findSurfaces } from '../src/surfaces.js';

test('one entry per researched surface', () => {
  assert.equal(SURFACES.length, 28);
  assert.equal(new Set(SURFACES.map((s) => s.id)).size, 28);
});

test('only sign-in identity is available now', () => {
  assert.deepEqual(findSurfaces({ status: 'available' }).map((s) => s.id), ['sign-in-identity']);
});

test('status counts match the table', () => {
  assert.equal(findSurfaces({ status: 'pending' }).length, 5);
  assert.equal(findSurfaces({ status: 'excluded' }).length, 2);
  assert.equal(findSurfaces({ status: 'blocked' }).length, 14);
  assert.equal(findSurfaces({ status: 'not-researched' }).length, 6);
});

test('an unknown status or group is an error, not an empty list', () => {
  assert.throws(() => findSurfaces({ status: 'maybe' }), RangeError);
  assert.throws(() => findSurfaces({ group: 'bots' }), RangeError);
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run `node --test test/surfaces.test.js`. Expected: FAIL with `Cannot find module '../src/surfaces.js'`.

- [ ] **Step 3: Implement `src/surfaces.js`.** Type the 28 entries from the table, with `name` from the spec. Freeze each entry and the array. In `findSurfaces`, check `status` and `group` against fixed sets before filtering.

- [ ] **Step 4: Run the test to verify it passes.** Run `node --test test/surfaces.test.js`. Expected: 4 passing tests.

## Task 3: LinkedIn client

**Files:**
- Create: `src/linkedin/client.js`
- Test: `test/client.test.js`

**Interfaces:**
- Consumes: none. Accepts an injected `fetch` that defaults to `globalThis.fetch`.
- Produces:
  - `export class LinkedInApiError extends Error` with `status: number`, `retryAfter: string | null` (the `Retry-After` header as LinkedIn sent it), and `body: unknown` (parsed JSON when possible, otherwise the raw text).
  - `export function createClient({ accessToken, fetch = globalThis.fetch, baseUrl = 'https://api.linkedin.com' })`, returning `{ request(path, { method = 'GET', body } = {}), getIdentity() }`.
    - `request` resolves to the parsed JSON, or to `null` for HTTP 204. It throws `LinkedInApiError` for any non-2xx status and never retries.
    - `getIdentity()` calls `GET /v2/userinfo` and resolves to the body, with fields `sub`, `name`, `email`, and `picture`.

Implementation: `init.headers` is a plain object. It always carries `Authorization: Bearer <token>` and `Accept: application/json`. It carries `Linkedin-Version` and `X-Restli-Protocol-Version` only when `path` starts with `/rest/`. It carries `Content-Type: application/json` only when a body is given, and the body is JSON-encoded.

- [ ] **Step 1: Write the failing tests.** Create `test/client.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, LinkedInApiError } from '../src/linkedin/client.js';

test('sends the bearer token to the base URL', async () => {
  let seen;
  const fetch = async (url, init) => { seen = { url, init }; return new Response('{}', { status: 200 }); };
  await createClient({ accessToken: 'tok', fetch }).request('/v2/userinfo');
  assert.equal(seen.url, 'https://api.linkedin.com/v2/userinfo');
  assert.equal(seen.init.headers.Authorization, 'Bearer tok');
});

test('version headers only on /rest paths', async () => {
  const headers = [];
  const fetch = async (url, init) => { headers.push(init.headers); return new Response('{}', { status: 200 }); };
  const client = createClient({ accessToken: 'tok', fetch });
  await client.request('/rest/posts');
  await client.request('/v2/userinfo');
  assert.equal(headers[0]['Linkedin-Version'], '202610');
  assert.equal(headers[0]['X-Restli-Protocol-Version'], '2.0.0');
  assert.equal(headers[1]['Linkedin-Version'], undefined);
});

test('a 401 raises LinkedInApiError with status 401', async () => {
  const fetch = async () => new Response('{"message":"expired"}', { status: 401 });
  await assert.rejects(
    createClient({ accessToken: 'old', fetch }).getIdentity(),
    (err) => err instanceof LinkedInApiError && err.status === 401,
  );
});

test('a 429 keeps Retry-After and is never retried', async () => {
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    return new Response('{}', { status: 429, headers: { 'Retry-After': '120' } });
  };
  await assert.rejects(
    createClient({ accessToken: 'tok', fetch }).request('/rest/posts', { method: 'POST', body: {} }),
    (err) => err.status === 429 && err.retryAfter === '120',
  );
  assert.equal(calls, 1);
});

test('204 resolves to null', async () => {
  const fetch = async () => new Response(null, { status: 204 });
  assert.equal(await createClient({ accessToken: 'tok', fetch }).request('/rest/posts/x', { method: 'DELETE' }), null);
});
```

- [ ] **Step 2: Run the tests to verify they fail.** Run `node --test test/client.test.js`. Expected: FAIL with `Cannot find module '../src/linkedin/client.js'`.

- [ ] **Step 3: Implement `src/linkedin/client.js`** to the Interfaces block above.

- [ ] **Step 4: Run the tests to verify they pass.** Run `node --test test/client.test.js`. Expected: 5 passing tests.

## Task 4: Token store

**Files:**
- Create: `src/auth/token-store.js`
- Test: `test/token-store.test.js`

**Interfaces:**
- Consumes: `Entry` from `@napi-rs/keyring` as the default backend.
- Produces: `export function createTokenStore({ Entry = KeyringEntry, service = 'linkedin-cli', account = 'default' } = {})`, returning `{ save(token), load(), clear() }`.
  - `save(token)` trims the input. An empty result throws `Error('Token is empty')`. Otherwise it calls `setPassword` on a new `Entry(service, account)`. Backend errors propagate unchanged, and there is no fallback file.
  - `load()` returns the stored string, or `null` when nothing is stored.
  - `clear()` returns `true` if an entry was deleted and `false` if none existed.

Before implementing, read `node_modules/@napi-rs/keyring/index.d.ts`. Map the "no entry" outcome to `null` for `load` and `false` for `clear`, and rethrow every other error. If the typings say `getPassword` returns `null` for a missing entry, no catch is needed.

- [ ] **Step 1: Write the failing tests.** Create `test/token-store.test.js`:

```js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTokenStore } from '../src/auth/token-store.js';

class FakeEntry {
  static items = new Map();
  constructor(service, account) { this.key = `${service}/${account}`; }
  setPassword(value) { FakeEntry.items.set(this.key, value); }
  getPassword() { return FakeEntry.items.get(this.key) ?? null; }
  deletePassword() { return FakeEntry.items.delete(this.key); }
}

beforeEach(() => FakeEntry.items.clear());

test('save trims whitespace and newlines', () => {
  const store = createTokenStore({ Entry: FakeEntry });
  store.save('  abc\n');
  assert.equal(store.load(), 'abc');
});

test('an empty token is rejected and nothing is stored', () => {
  const store = createTokenStore({ Entry: FakeEntry });
  assert.throws(() => store.save(' \n '), /Token is empty/);
  assert.equal(FakeEntry.items.size, 0);
});

test('load returns null when nothing is stored', () => {
  assert.equal(createTokenStore({ Entry: FakeEntry }).load(), null);
});

test('clear reports whether something was deleted', () => {
  const store = createTokenStore({ Entry: FakeEntry });
  store.save('abc');
  assert.equal(store.clear(), true);
  assert.equal(store.clear(), false);
});

test('backend errors propagate and nothing is stored', () => {
  class BrokenEntry extends FakeEntry {
    setPassword() { throw new Error('no credential store available'); }
  }
  const store = createTokenStore({ Entry: BrokenEntry });
  assert.throws(() => store.save('abc'), /no credential store available/);
  assert.equal(FakeEntry.items.size, 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail.** Run `node --test test/token-store.test.js`. Expected: FAIL with `Cannot find module '../src/auth/token-store.js'`.

- [ ] **Step 3: Implement `src/auth/token-store.js`** to the Interfaces block above.

- [ ] **Step 4: Run the tests to verify they pass.** Run `node --test test/token-store.test.js`. Expected: 5 passing tests.

- [ ] **Step 5: Check the real Windows credential store once.** Run `node -e "import('./src/auth/token-store.js').then(({ createTokenStore }) => { const s = createTokenStore(); s.save('probe'); console.log(s.load()); console.log(s.clear(), s.clear()); })"`. Expected output: `probe`, then `true false`. The check writes and then removes a probe entry. Linux is not covered (Q11).

## Task 5: CLI, library entry, and CLAUDE.md

**Files:**
- Create: `src/cli.js`, `bin/linkedin.js`, `src/index.js`
- Test: `test/cli.test.js`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `findSurfaces` (Task 2); `createClient` and `LinkedInApiError` (Task 3); `createTokenStore` (Task 4).
- Produces:
  - `export async function run(argv, deps = defaultDeps())`, resolving to `0` on success and `1` on any failure. `deps` is `{ store, createClient, env, stdin, stdout, stderr }`, where `createClient({ accessToken })` returns a Task 3 client. Commander's `exitOverride` and `configureOutput` route its errors and help output through `deps`, and a commander error also resolves to `1`.
  - `defaultDeps()` returns the real store, a `createClient` wrapper around Task 3, and `process.env`, `process.stdin`, `process.stdout`, `process.stderr`.
  - `bin/linkedin.js` begins with `#!/usr/bin/env node` and then runs `process.exitCode = await run(process.argv);`.
  - `src/index.js` exports `createClient`, `LinkedInApiError`, `createTokenStore`, `SURFACES`, and `findSurfaces`.

Commands:
- `linkedin auth login`: takes the token from `env.LINKEDIN_ACCESS_TOKEN` when set. Otherwise it reads all of `stdin` when `stdin` is not a TTY. It saves through `store.save` and prints `Token saved.`, exiting 0. An empty token prints `No token given. Set LINKEDIN_ACCESS_TOKEN or pipe the token on stdin.` and exits 1. A backend error prints `Could not save token: <message>` and exits 1, with nothing written.
- `linkedin auth status`: with no token, prints `Not logged in. Run linkedin auth login.` and exits 1. Otherwise it calls `getIdentity` and prints `Logged in as <name> (<sub>).`, exiting 0. A 401 prints `LinkedIn rejected the saved token. Run linkedin auth login again.` and exits 1. Any other error prints its message and exits 1.
- `linkedin auth logout`: prints `Logged out.` or `Nothing to clear.` and exits 0.
- `linkedin me`: with no token, the same message as `auth status`, exit 1. Otherwise it prints the identity as JSON with a 2-space indent and exits 0. Errors behave as in `auth status`.
- `linkedin surfaces [--status <status>] [--group <group>] [--json]`: prints one tab-separated line per matching entry with `id`, `status`, `terms`, and `reason`. With `--json` it prints the entries as a JSON array. An invalid filter prints the `RangeError` message and exits 1.

- [ ] **Step 1: Write the failing tests.** Create `test/cli.test.js`. Add a `fakeDeps(options)` helper that builds:
  - a `store` with `save`, `load`, and `clear` over one variable, whose `save` throws `options.saveError` when set;
  - a `createClient` returning `{ getIdentity }`, where `getIdentity` resolves `{ sub: 'abc', name: 'Ada' }`, or rejects with a `LinkedInApiError` whose `status` is `options.identityStatus` when set;
  - `stdout` and `stderr` objects that accumulate text in `buf`;
  - `env` from `options.env`, defaulting to `{}`;
  - `stdin` as `Readable.from([])`, with no `isTTY`.

  The test cases:

```js
test('me without a saved token exits 1 with a plain message', async () => {
  const deps = fakeDeps({});
  assert.equal(await run(['node', 'linkedin', 'me'], deps), 1);
  assert.match(deps.stderr.buf, /Not logged in\. Run linkedin auth login\./);
});

test('me with a saved token prints the identity as JSON', async () => {
  const deps = fakeDeps({ token: 'tok' });
  assert.equal(await run(['node', 'linkedin', 'me'], deps), 0);
  assert.equal(JSON.parse(deps.stdout.buf).name, 'Ada');
});

test('auth login reads LINKEDIN_ACCESS_TOKEN and trims it', async () => {
  const deps = fakeDeps({ env: { LINKEDIN_ACCESS_TOKEN: ' tok \n' } });
  assert.equal(await run(['node', 'linkedin', 'auth', 'login'], deps), 0);
  assert.equal(deps.store.load(), 'tok');
});

test('auth login with no token exits 1 and stores nothing', async () => {
  const deps = fakeDeps({});
  assert.equal(await run(['node', 'linkedin', 'auth', 'login'], deps), 1);
  assert.match(deps.stderr.buf, /No token given/);
  assert.equal(deps.store.load(), null);
});

test('auth login with a failing credential store writes nothing', async () => {
  const deps = fakeDeps({ env: { LINKEDIN_ACCESS_TOKEN: 'tok' }, saveError: 'no credential store available' });
  assert.equal(await run(['node', 'linkedin', 'auth', 'login'], deps), 1);
  assert.match(deps.stderr.buf, /Could not save token: no credential store available/);
  assert.equal(deps.store.load(), null);
});

test('a 401 from LinkedIn tells the user to log in again', async () => {
  const deps = fakeDeps({ token: 'old', identityStatus: 401 });
  assert.equal(await run(['node', 'linkedin', 'auth', 'status'], deps), 1);
  assert.match(deps.stderr.buf, /Run linkedin auth login again\./);
});

test('surfaces filters by status and rejects unknown values', async () => {
  const deps = fakeDeps({});
  assert.equal(await run(['node', 'linkedin', 'surfaces', '--status', 'available'], deps), 0);
  assert.match(deps.stdout.buf, /^sign-in-identity\t/);
  assert.equal(await run(['node', 'linkedin', 'surfaces', '--status', 'maybe'], deps), 1);
});
```

- [ ] **Step 2: Run the tests to verify they fail.** Run `node --test test/cli.test.js`. Expected: FAIL with `Cannot find module '../src/cli.js'`.

- [ ] **Step 3: Implement `src/cli.js`, `bin/linkedin.js`, and `src/index.js`** to the Interfaces block above. Keep each command's messages exactly as written.

- [ ] **Step 4: Run the full suite.** Run `npm test`. Expected: all tests in the four test files pass, with 0 failures.

- [ ] **Step 5: Check the entry point.** Run `node bin/linkedin.js surfaces --status available`. Expected: one line beginning `sign-in-identity`.

- [ ] **Step 6: Update `CLAUDE.md`.** Replace its "Current state" section with the module layout, one line per module, and the commands: `npm install`, `npm test`, `node --test test/cli.test.js` (one file), and `node bin/linkedin.js --help`. Add one line under "Project goal": official endpoints only, and write commands wait on Q1 and Q2 of the research report. Keep the Working rules section as it is. Do not add facts the code does not have.

## Live Check (needs your token; not part of the automated run)

This cannot run here, because it needs your LinkedIn app and token. Exact portal labels may differ.

1. In the LinkedIn developer portal, create an app. Add the Sign In with OpenID Connect and Share on LinkedIn products, and add the redirect URL the portal asks for.
2. In the app's Auth tab, use the OAuth 2.0 token generator with scopes `openid`, `profile`, and `email`. Generate a token. It lasts 60 days.
3. In PowerShell, run `$env:LINKEDIN_ACCESS_TOKEN = "<token>"; node bin/linkedin.js auth login`, then `node bin/linkedin.js auth status`, then `node bin/linkedin.js me`. Expected: `Token saved.`, then `Logged in as <name> (<sub>).`, then the identity JSON.
4. Clear the variable afterwards with `Remove-Item Env:LINKEDIN_ACCESS_TOKEN`.
