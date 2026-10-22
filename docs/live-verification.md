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

**Writes — 0 verified live.** The first attempt (`companies.follow`) failed closed and changed nothing: LinkedIn presented a manual-verification challenge after the click. That is the account-risk signal this guide warns about, and it is the reason the write adapters are not verified in bulk. Every write adapter remains fixture-tested only.

**What the live run corrected, which the fixtures never could:**
- LinkedIn obfuscates class names, so every class-based selector was dead. The adapters now key on `data-testid`, `componentkey`, `data-job-id`, roles and aria labels.
- The feed list mixes posts with suggested people and ads; only list items carrying a reaction control are posts.
- Some live controls are excluded from the accessibility tree, so role queries miss them while aria-label and attribute selectors find them.
- A control can be absent for a moment after navigation; resolution waits before declaring it missing.
- The connections route is `/mynetwork/invite-connect/connections/`.
- The app shell returns 404 intermittently for routes it still renders.

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
