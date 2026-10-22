# Live verification of the browser adapters

The browser adapters in `src/operations/reads.js` and `src/operations/writes.js` are tested against local HTML fixtures. That proves the parsing logic works. It does **not** prove that LinkedIn's current pages still have the shape the adapter expects.

This guide is for checking the real thing, on your own account, in your own browser session.

## Measured status (2026-10-22)

One account, one session, real pages. This is what the check actually found, not what the fixtures suggested.

**Reads — 7 of 7 report ok**, but the evidence differs by surface:

| Adapter | Result | Evidence |
|---|---|---|
| `profile.get` | ok | parsed the live profile name |
| `feed.list` | ok | parsed real post cards |
| `companies.get` | ok | parsed the live company page |
| `jobs.search` | ok | parsed live job cards |
| `posts.list` | ok | empty-account path (the account had 0 posts) |
| `inbox.list` | ok | empty-account path (0 conversations) |
| `connections.list` | ok | empty-account path (0 connections) |

The empty-account rows prove the empty-state path, not row parsing. They stay unverified until an account has data.

**Writes — 0 verified live.** Follow/unfollow attempts returned `AUTH_REQUIRED`, but that did not prove a displayed verification challenge or that nothing changed. A later read-only check on the same account showed a visible **Following** control on the company page. The exact earlier attempt that changed that state is unverified. Do not retry an uncertain write automatically.

**Same-account detector diagnosis (2026-10-23):** the error was reproduced on a normal HTTP-200 company page with one hidden, zero-size reCAPTCHA Enterprise iframe inside a hidden container. No visible verification prompt was observed. Counting every matching iframe caused a false positive. The shared detector now checks visibility and explicit visible verification prompts; the same read-only page check passes with that iframe still present and unchanged. No iframe is removed, disabled, entered, or solved. A visible challenge, checkpoint route, or HTTP 401/403/429 still stops access. This correction does not establish that no earlier challenge occurred, and it does not verify a write adapter.

**What the live run corrected, which the fixtures never could:**
- LinkedIn obfuscates class names, so every class-based selector was dead. The adapters now key on `data-testid`, `componentkey`, `data-job-id`, roles and aria labels.
- The feed list mixes posts with suggested people and ads; only list items carrying a reaction control are posts.
- Some live controls are excluded from the accessibility tree, so role queries miss them while aria-label and attribute selectors find them.
- A control can be absent for a moment after navigation; resolution waits before declaring it missing.
- The connections route is `/mynetwork/invite-connect/connections/`.
- The app shell returns 404 intermittently for routes it still renders.

## Expanded same-account test pass (2026-10-23)

A bounded read-only pass completed at 2026-10-22 21:38 UTC (2026-10-23 00:38 UTC+03). It used the original `default` browser profile and confirmed the same own-account identity before navigating. The budget was 20 top-level navigations; 19 were used, with no mutations. Repeated operations on the same loaded page reused that page. The run stopped immediately at an actual HTTP 403 on Sales Navigator. No bypass or retry followed it.

The earlier "7/7 report ok" result above measured only whether functions returned, not completeness or correctness of every field. This broader pass supersedes that as the current quality assessment:

| Result | Operations | Evidence or limitation |
|---|---|---|
| Returned populated records | `jobs.search`, `search.jobs` | Three records each; all three had titles and URLs. Other fields and result relevance were not independently verified. These share one reader implementation. |
| Explicit empty state | `posts.list`, `inbox.list`, `inbox.search`, `connections.list` | Zero rows with an explicit empty-state marker; non-empty row parsing remains unverified. |
| Partial fields | `profile.get` | Name present; headline, about, and location not returned. Missing values are not proof those fields are absent from the real profile. |
| Partial fields | `feed.list` | Two records with text; one author; no post permalinks. This is not full post parsing. |
| `LAYOUT_UNSUPPORTED` | `profile.skills`, `profile.contact`, `invitations.received`, `invitations.sent`, `companies.get`, `companies.posts`, `jobs.get`, `jobs.apply-url`, `jobs.saved`, `search.people`, `search.companies`, `search.posts`, `analytics.profile-views` | The current readers could not parse those rendered layouts. This does not establish a subscription restriction or that the surface has no data. Company parsing that worked in an earlier pass was not reproducible in this pass. |
| Unavailable result | `analytics.ssi` | Returned `available:false`; no usable SSI metrics were established. |
| Blocked and stopped | `sales.search-people` | HTTP 403 mapped to `HUMAN_INTERVENTION_REQUIRED`; this proves access was refused, not that a visible CAPTCHA appeared or why access was refused. |

**Not live-tested in this pass:** `posts.get`, `comments.list`, `reactions.list`, `inbox.thread`, `connections.status`, `analytics.post`, `sales.profile`, `sales.search-companies`, `sales.inbox`, `sales.thread`. Valid post/thread/relationship targets or own-post analytics were unavailable, or the run stopped before those operations. No target was fabricated.

**All 21 writes:** no new live attempt. Existing fixture tests exercise their flows, but fixtures do not prove live behavior. Outbound content, recipients, invitations, profile changes, and destructive actions require an exact reviewed payload and separate approval. The current Follow state was left unchanged.

**Offline gate:** all 344 local tests passed, covering detector, adapters, approvals, account isolation, queue, install/OAuth flows, MCP stdio/HTTP, and packaging contracts. Installed-tarball smoke test and version guard passed. Plugin validation passed with the existing root-context and missing-listing-icon warnings. No new hosted CI run, push, release, or npm publication was performed for this detector change. Official OAuth remains unverified against a real developer app.

## Why this has to be manual

An adapter that no longer matches the page must fail closed rather than guess. `LAYOUT_UNSUPPORTED` and `ACCESS_RESTRICTED` are the expected outcomes when LinkedIn changes a page or the account lacks a product.

The check therefore runs against a session you sign into yourself. It is read-only, it is never run automatically, and it never records a page body, a token, or a cookie.

## Prerequisites

1. A LinkedIn account you own. The read adapters use your signed-in browser session, not the OAuth token, so no developer application is needed for a read check. A developer application with the **Share on LinkedIn** product is only relevant to the official API write path.
2. Chromium for the browser adapters:
   ```sh
   linkedin browser install
   ```
3. A signed-in browser profile for the account:
   ```sh
   linkedin experimental browser login --experimental
   ```
   The browser opens, you sign in yourself, and you complete any verification yourself. The profile lives in `~/.linkedin-api-mcp/browser-profile` (or `LINKEDIN_STATE_DIR`). It holds session cookies: keep that directory private.

## Running the check

```sh
linkedin experimental live-check
```

Every readable operation is checked in turn:

```
profile.get: ok (Succeeded.)
posts.list: unsupported (Unsupported: LAYOUT_UNSUPPORTED)
feed.list: ok (Succeeded.)
inbox.list: ok (Succeeded.)
connections.list: ok (Succeeded.)
companies.get: failed (Failed: OPERATION_FAILED)
jobs.search: ok (Succeeded.)

7 checked: 4 ok, 1 unsupported, 1 failed.
```

To check a subset:

```sh
linkedin experimental live-check --operations profile.get,posts.list
```

To use a named account:

```sh
linkedin accounts add work
linkedin experimental live-check --account work
```

## Reading the result

| Status | Meaning | What to do |
|---|---|---|
| `ok` | The adapter parsed the live page. | Nothing. |
| `unsupported` | LinkedIn changed the page, or the account lacks access to that product. | The adapter needs a new selector candidate, or the account needs that product. |
| `failed` | An unexpected error. | Read the detail. It carries a stable error code, never a page body. |

A failure is never retried automatically, and a failed operation does not stop the others.

## What the check does not do

- It never sends, comments, reacts, messages, invites, or follows. Only read operations are reachable.
- It never writes a report into this repository. The report is printed to your terminal.
- It does not change your browser profile, your LinkedIn settings, or your account.

## Verifying a write adapter

Write adapters need a different kind of evidence, and it has to be yours to give: the confirmation step and the approval flow are already covered by tests, but "LinkedIn actually published the post" can only be confirmed by looking at LinkedIn.

The safe way to check one is by hand, once:

1. Run `linkedin posts create --stdin` with a draft you are willing to publish, and complete the approval flow.
2. Confirm the outcome on LinkedIn itself.
3. If the adapter reported `unknown`, that is the expected safe behavior: the approval is consumed and the action is not retried, so you publish it yourself or prepare a new one.

Do not test write adapters in bulk. A single deliberate post is enough to confirm the flow, and each published post is a real public action on your account.

## Reporting what changed

When an adapter reports `unsupported`, the fix is a new selector candidate in `src/operations/reads.js` or `src/operations/writes.js`, with a matching fixture in `test/fixtures/`. Keep the adapter failing closed for the old shape: a wrong parse is worse than an honest failure.
