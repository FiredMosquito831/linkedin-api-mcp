# Node.js CLI and importable API for a personal LinkedIn automation tool (state as of 2026-10-20)

Method: versions, publish dates and engines come from npm registry pages fetched with WebFetch. LinkedIn, Node.js, RFC and GitHub facts come from WebFetch of the primary pages. Context7 supplied the LinkedIn docs index (native PKCE and versioning excerpts) and the keyring-rs docs. WebSearch ran once, in standard mode, for typed clients. Quotes are extracts from fetched pages, so re-read the source before relying on exact wording. Claims marked "unverified" were not checked against a primary source in this pass.

## 1. CLI framework (commander, yargs, oclif, cac, citty)

### Takeaway
Use commander 15.0.0 (last npm publish 2026-05-29; engines `>=22.12.0`; typings bundled). Citty 0.2.2 is the closest alternative, but it is pre-1.0 and its release date was not retrieved.

### Cited Findings
- commander 15.0.0: last publish 2026-05-29; maintainers shadowspawn and abetomo; repository tj/commander.js; no deprecated field; engines `>=22.12.0`; `types` points to the bundled `typings/index.d.ts`; exports map has `types` and `default` conditions — [npm search](https://registry.npmjs.org/-/v1/search?text=commander&size=1), [npm latest](https://registry.npmjs.org/commander/latest)
- yargs 18.2.0: engines `^20.19.0 || ^22.12.0 || >=23`; the root export `"."` has no `types` condition, and no @types package is listed under dependencies — [npm latest](https://registry.npmjs.org/yargs/latest)
- @oclif/core 5.1.9 (description "base library for oclif CLIs"): engines `>=22.0.0`; types `lib/index.d.ts`; exports map with 19 subpaths; no deprecated field — [npm latest](https://registry.npmjs.org/@oclif/core/latest)
- citty 0.2.2 (description "Elegant CLI Builder"): no engines field; bundled types `dist/index.d.mts`; single ESM export `./dist/index.mjs`; no deprecated field — [npm latest](https://registry.npmjs.org/citty/latest)
- cac 7.1.0 (description "Simple yet powerful framework for building command-line apps."): engines `>=20.19.0`; no types or typings field in the manifest; export `"."` maps to `./dist/index.js` — [npm latest](https://registry.npmjs.org/cac/latest)

### Inferences
- commander's engines floor (22.12.0) matches the Node lines supported today (section 5), so the package can use the same floor.
- Fit for a deep subcommand tree is inferred from descriptions and manifests, not from each framework's command-tree docs. Commander's nested-command model is the expected fit; citty is lighter and ESM-only; oclif targets large plugin-style CLIs and brings its own conventions.
- yargs and cac look weaker for TypeScript consumers, judged from their manifests only.

### Gaps
- Release dates and maintenance signals for yargs, @oclif/core, citty and cac were not retrieved, because the /latest endpoint has no date field. Their maintenance status is therefore unverified.
- Command-tree documentation for the five frameworks was not fetched.
- Whether commander 15 ships ESM or CJS was not stated in the fields retrieved.

## 2. LinkedIn OAuth 2.0: PKCE, redirect URIs and device flow

### Takeaway
PKCE is documented, but only for native apps that LinkedIn enables manually; the classic flow requires `client_secret`. For a local CLI the documented redirect is a loopback IP literal (`http://127.0.0.1:{port}` or `http://[::1]:{port}`), and no device authorization flow appears in the docs reviewed.

### Cited Findings
- Native PKCE flow: the authorization endpoint `https://www.linkedin.com/oauth/native-pkce/authorization` requires `code_challenge` and `code_challenge_method=S256`. The token request to `https://www.linkedin.com/oauth/v2/accessToken` sends `grant_type`, `code`, `redirect_uri`, `client_id` and `code_verifier`, with no `client_secret` — [LinkedIn native-app flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow-native) (page metadata: last updated 2023-04-03)
- Loopback rule: "we will only communicate with loopback IPs"; IPv4 `http://127.0.0.1:{port}`, IPv6 `http://[::1]:{port}`; "We will be supporting both HTTP and HTTPS loopback IPs." — same page
- Gating: "Once you have the app created, please reach out to your point of contact at LinkedIn, and we will enable PKCE OAuth 2 flow for your app." — same page. The page does not say how an individual developer requests this.
- Native apps must use the system default browser, not an embedded webview — same page.
- Classic 3-legged flow: the token request requires `client_secret`; the redirect URL is added "via HTTPS"; query parameters on the registered URL are ignored; a mismatch returns 401 "Redirect_uri doesn't match"; the page does not mention PKCE — [LinkedIn authorization code flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow) (page metadata: last updated 2026-05-15). Its HTTPS-only redirect rule is contradicted for native apps by the HTTP loopback rule on the native page above.
- Lifetimes: "all access tokens are issued with a 60-day lifespan" (both pages); authorization codes last 30 minutes (classic page); access tokens are about 500 characters, and LinkedIn advises planning for at least 1000 — both pages.
- Refresh: the classic page lists `refresh_token` fields but says "Programmatic refresh tokens are available for a limited set of partners." Otherwise, refresh means running the authorization flow again, which skips consent only while the member is logged in and the token has not expired — classic page. The native page describes re-running the flow and mentions no refresh token.
- Manual tokens: "The LinkedIn Developer Portal has a token generator for manually creating tokens." — classic page.
- Scopes: "The scopes available to your app depend on which Products or Partner Programs your app has access to." — classic page.
- The overview lists two flow types, Member Authorization (3-legged) and Application Authorization (2-legged client credentials), and says Marketing APIs require member authorization — [LinkedIn OAuth overview](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication) (page metadata: last updated 2022-12-21).
- RFC 8252 (native apps): native public clients "MUST implement" PKCE (section 6); use the loopback IP literal, because "the use of localhost is NOT RECOMMENDED" (section 8.3); authorization servers "MUST allow any port" for loopback requests (section 7.3) — [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252) (quotes as extracted).

### Inferences
- The 2026 classic page does not mention PKCE, while the 2023 native page documents it, and the pages as fetched do not reconcile the two. Confirm which flow LinkedIn treats as current before building on either.
- The docs do not say whether a loopback URL, including its port, must be registered in advance for the native flow. RFC 8252 expects any port; LinkedIn's classic rule is exact match. Unresolved until tested.
- Use `127.0.0.1` rather than `localhost`: LinkedIn's native examples list IP literals only, and RFC 8252 advises against `localhost`.
- No device flow is documented, so the CLI login should be browser-based with a loopback listener, or use the portal token generator for personal use.
- A 60-day token life means an interactive re-login about every 60 days unless programmatic refresh is granted.

### Gaps
- Whether LinkedIn enables PKCE for individual developers, how to request it, and how long it takes: not documented.
- Whether `localhost` is accepted: not documented either way.
- Device authorization (RFC 8628) support: not searched on the web; absent from the pages reviewed.
- Programmatic refresh-token eligibility and client-credentials product gating: linked pages not fetched.
- Which member surfaces each scope unlocks: the Getting Access page was not fetched.

## 3. Client secret handling: personal self-hosted app versus published tool

### Takeaway
Do not ship a client secret in the npm package. Use the native PKCE flow (no secret) once LinkedIn enables it; until then a personal owner keeps the secret in the OS keychain, and a published tool makes each user supply their own app credentials.

### Cited Findings
- Native page: "At the risk of your own application's security, DO NOT share your Client Secret value with anyone!" Its token exchange has no client_secret field — [native-app flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow-native)
- Classic page: "Do not share your Client Secret value with anyone," and do not pass it in the URL — [authorization code flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow)
- RFC 8252 section 8.4: "native apps are classified as public clients"; section 8.5: secrets in such apps "should not be treated as confidential secrets"; per-instance secrets are the exception — [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252)
- API Terms section 2.2: "Keep your Access Credentials secret," and do not "sell, share, transfer, or sublicense them to any other party" — [LinkedIn API Terms](https://www.linkedin.com/legal/l/api-terms-of-use) (the page states it was last revised 2022-12-13)
- API Terms clauses that bound the "without abuse" requirement (WebFetch extraction; re-read before relying on them):
  - Section 3.1 item 26: no "Use the Content or the APIs to automate posting on the LinkedIn Services."
  - Section 4.3: data may be refreshed "only when the Member is actually using your Application and not on an automated schedule."
  - Section 3.1 item 24: no "scraping, crawling, spidering or using any other technology or software to access LinkedIn content outside the APIs."
  - Section 3.1 item 10: no "mass messages, promotions or offers."
  - Section 3.1 item 23: no access to a member's connections "without their express permission."
  - Sections 1.4 and 3.1 item 20: do not exceed or circumvent API call limits.
  - Section 5.2: obtain the user's "legally valid consent before accessing any of their Content."

### Inferences
- A secret inside a published package goes to every installer, which conflicts with API Terms section 2.2 and RFC 8252.
- Personal self-hosted: the simplest secret-free route is native PKCE on your own app once enabled. Otherwise use the classic flow with the secret stored in the keychain at setup (never in the repo or a committed env file), or use the portal token generator and skip the redirect server.
- Published tool: the author's PKCE app is the only secret-free route LinkedIn documents, and it depends on LinkedIn's enablement. BYO-app (each user's own client_id and secret, held in their keychain) is the fallback.
- Scope conflict: as extracted, the terms rule out automated posting, scheduled data refresh and scraping. A literal reading of "automate posting" covers scheduled or bulk posting; whether one member-triggered post is allowed is not stated. The coordinator needs to decide whether those surfaces stay in scope, possibly after legal review.
- Design consequence: member-invoked commands, one action per invocation, rate limiting with backoff, and no scheduler or background sync.

### Gaps
- Whether a single member-triggered post counts as "automate posting": the terms do not define it.
- Whether the API Terms page is the current version: not checked.
- Developer-program approval requirements for a multi-user published app: not researched.
- A hosted token broker holding the secret (an alternative to the options above): not researched.

## 4. Token storage on Windows, macOS and Linux

### Takeaway
Use @napi-rs/keyring 2.1.2 (last npm publish 2026-10-19; MIT; per-platform binary packages for Windows, macOS, FreeBSD and Linux) for the OS credential store, with an encrypted-file fallback for headless Linux. Do not use keytar, which GitHub shows as archived and read-only since 2022-12-15.

### Cited Findings
- @napi-rs/keyring 2.1.2: last publish 2026-10-19T08:30:36Z; described as a Node.js binding of keyring-rs; MIT; repository Brooooooklyn/keyring-node; no deprecated field; types `./index.d.ts`; optionalDependencies cover darwin x64 and arm64, freebsd x64, linux x64 and arm64 (gnu and musl), linux riscv64 gnu, linux arm gnueabihf, and win32 x64, ia32 and arm64 (msvc) — [npm latest](https://registry.npmjs.org/@napi-rs/keyring/latest), [npm search](https://registry.npmjs.org/-/v1/search?text=%40napi-rs%2Fkeyring&size=1)
- keytar: "This repository was archived by the owner on Dec 15, 2022. It is now read-only." — [atom/node-keytar](https://github.com/atom/node-keytar)
- keyring-rs backends (Rust crate docs, via Context7): macOS to Keychain Services; Windows to Windows Credential Manager; Linux to kernel keyutils by default, or to Secret Service when `prefer_secret_service` is true; FreeBSD and OpenBSD to Secret Service; "if the platform has none, the sample store is used" — [keyring-rs CLI API reference](https://github.com/open-source-cooperative/keyring-rs/blob/main/_autodocs/api-reference/cli.md)

### Inferences
- Linux is the main risk: if the Node binding inherits the keyring-rs default, tokens could land in keyutils rather than a desktop keyring, so check persistence across logins and reboots before shipping.
- The sample-store fallback named in the docs would hold tokens without persistence, so the tool should fail loudly when the native store is unavailable.

### Gaps
- Whether the Node binding selects keyutils or Secret Service on Linux, and whether it falls back silently: not checked.
- Persistence semantics of kernel keyutils: not checked (unverified).
- Encrypted-file fallback design (AES-256-GCM with a scrypt-derived key via node:crypto): a design option, not sourced in this pass (unverified).
- Config stores (plain JSON in the OS config directory): suitable for non-secret settings only; no config-store library was checked (unverified).
- Windows Credential Manager blob size limit: not checked; confirm the token plus metadata fits.
- macOS keychain access prompts for unsigned binaries: not checked.
- Other keychain wrappers, and whether keytar is deprecated on npm: not checked.

## 5. Packaging: bin field and exports map on current Node.js

### Takeaway
Ship one ESM-only package (`"type": "module"`) with a `bin` entry for the CLI and an `exports` map that lists `types` first and `default` last; avoid dual CJS/ESM builds. Node 22.12+ lets CJS code `require()` ESM by default, so set engines to `>=22.12.0`.

### Cited Findings
- Node release table (as extracted): 22.x Maintenance LTS, maintenance from 2025-10-21, EOL 2027-04-30; 24.x Active LTS from 2025-10-28, Maintenance from 2026-10-20, EOL 2028-04-30; 26.x Current (first released 2026-05-05), Active LTS from 2026-10-28, Maintenance from 2027-10-20, EOL 2029-04-30; "Dates are subject to change." — [nodejs/release](https://github.com/nodejs/release). Conflict within this source: the status column still reads "Active LTS" for 24.x, while its dates place 24.x in Maintenance on 2026-10-20. The dates decide.
- nodejs.org: v26 Current; v24 and v22 LTS; other lines end-of-life (v20 among them); "Production applications should only use Active LTS or Maintenance LTS releases." — [Node.js releases](https://nodejs.org/en/about/releases/)
- require(esm): added in v22.0.0 and v20.17.0; no longer behind `--experimental-require-module` in v23.0.0, v22.12.0 and v20.19.0; "no longer experimental" in v25.4.0; can be disabled with `--no-require-module` — [Node modules](https://nodejs.org/api/modules.html)
- Resolution includes the `module-sync` condition unless `--no-require-module` is set — same page. The packages page says a `module-sync` target "should be an ES module with no top-level await in its graph; otherwise `ERR_REQUIRE_ASYNC_MODULE` is thrown on `require()`" — [Node packages](https://nodejs.org/api/packages.html)
- Exports: "key order is significant"; `default` "should always come last"; `types` "should always be included first" — [Node packages](https://nodejs.org/api/packages.html)
- `.mjs` is always ESM and `.cjs` always CJS; `.js` follows the nearest `type` field, and the docs recommend always setting `type` — same page.
- Once `exports` is defined, unlisted subpaths are unavailable to importers — same page.
- The docs warn that using both `import` and `require` conditions "can lead to some hazards" (dual-package hazard); the linked section was not in the extract — same page.

### Inferences
- An ESM-only package avoids dual-package duplicate state, at the cost of CJS consumers needing Node 22.12+ (or 20.19+, but Node 20 is listed end-of-life).
- Pitfall: a top-level await anywhere in the module graph breaks `require()` consumers, so keep the library entry free of it if CJS use matters.
- The commander floor (22.12.0) lines up with this, so one engines value covers both.

### Gaps
- npm `bin`, `files` and `publishConfig` rules: not fetched. Unverified general practice: the `bin` target needs a shebang line, and npm creates Windows `.cmd` and `.ps1` shims on install.
- Dual-package hazard details: linked section not fetched.
- Whether commander 15 is ESM or CJS: not verified.

## 6. Typed Node.js clients for LinkedIn's REST API

### Takeaway
No maintained, typed Node client for the LinkedIn REST API surfaced. The official `linkedin-api-client` 0.3.0 has types but was last published 2023-02-07, so write a thin typed client and use the official package only as a reference.

### Cited Findings
- linkedin-api-client 0.3.0: "Official JavaScript client library for LinkedIn APIs"; last publish 2023-02-07; maintainers shimizust and swathivshenoy; repository linkedin-developers/linkedin-api-js-client; engines `>=14.0.0`; types `dist/lib/index.d.ts`; license "SEE LICENSE IN LICENSE.md" (not an SPDX identifier) — [npm search](https://registry.npmjs.org/-/v1/search?text=linkedin-api-client&size=1), [npm latest](https://registry.npmjs.org/linkedin-api-client/latest). The search response also carries an "updated" timestamp of 2026-10-19, distinct from the publish date; its meaning was not determined.
- Search snippet (unverified): Rest.li request handling, TypeScript types, versioned endpoints, 2- and 3-legged OAuth, and a self-described "beta" notice — [npm package page](https://npmjs.com/package/linkedin-api-client), via WebSearch. The README was not fetched.
- Unofficial packages in the same search (linkedin-private-api, linkedin-api-ts) are described as unofficial and as relying on scraping or session cookies (snippet only); they are excluded under API Terms section 3.1 item 24 — [linkedin-private-api](https://npmjs.com/package/linkedin-private-api), [linkedin-api-ts](https://socket.dev/npm/package/linkedin-api-ts)
- Versioning (Context7 excerpts of LinkedIn product pages): "All requests must include the `LinkedIn-Version` header," in `YYYYMM` format — [LinkedIn Talent versioning](https://learn.microsoft.com/en-us/linkedin/talent/versioning). Samples send `LinkedIn-Version: 202511` and `X-Restli-Protocol-Version: 2.0.0` — [LinkedIn DMA versioning](https://learn.microsoft.com/en-us/linkedin/dma/versioning). Sunset versions return HTTP 426 Upgrade Required, and versioned calls use `https://api.linkedin.com/rest/` — [LinkedIn Talent versioning](https://learn.microsoft.com/en-us/linkedin/talent/versioning)
- A LinkedIn deprecation notice (Context7 excerpt) names `202604` as the migration target at its snapshot — [LinkedIn DMA versioning](https://learn.microsoft.com/en-us/linkedin/dma/versioning). The current version as of 2026-10-20 is unverified.

### Inferences
- Any client must pin a version and plan upgrades: a sunset version fails with 426, so a stale pin breaks the tool.
- A thin client on Node's built-in fetch keeps dependencies small and avoids a 2023 package.

### Gaps
- Whether linkedin-api-client still works against current API versions: not tested.
- GitHub activity for linkedin-developers/linkedin-api-js-client: not checked.
- The "beta" label: unverified (snippet only).
- Node's built-in fetch support: not verified on nodejs.org in this pass.
- Context7 lists an official Python client (linkedin-developers/linkedin-api-python-client); out of scope for a Node package, and not fetched.
- LinkedIn's general versioning concepts page returned 404 for the URL tried; versioning facts come from product pages seen through Context7.

## 7. Testing a CLI that calls a third-party HTTP API

### Takeaway
Use Node's built-in `node:test` runner (stable since v20.0.0), inject the HTTP client, and replay sanitized recorded responses as JSON fixtures; keep live LinkedIn calls out of CI.

### Cited Findings
- node:test: "Stability: 2 - Stable"; "The test runner is now stable" as of v20.0.0 — [Node test runner](https://nodejs.org/api/test.html) (docs label v26.12.0 at fetch time)
- Mocks: `mock.fn`, and `t.mock.method(...)`, which the runner restores after each test; timer and Date mocking are supported — same page
- Snapshot testing is no longer experimental (v23.4.0); built-in reporters are `spec` (default), `tap`, `dot`, `junit` and `lcov`; reporter output "is subject to change" — same page
- Watch mode and code coverage are experimental — same page

### Inferences
- Injecting a request function is simpler than patching `globalThis.fetch`, and it keeps tests free of global state.
- Record fixtures once from your own account, scrub tokens and member identifiers, and commit only the scrubbed JSON; member data in fixtures is a privacy risk.

### Gaps
- Mocking global fetch with node:test: not confirmed on the visible docs.
- Alternatives (MSW, undici MockAgent, nock) and their current versions: not checked.
