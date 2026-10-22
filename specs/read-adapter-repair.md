# SPEC — Read-adapter repair: the 13 LAYOUT_UNSUPPORTED reads (2026-10-23, read-only, claude-haiku-5-5)

Written by a read-only investigator. No commits, no edits outside this file, no live calls (budget 0), no secrets, page text, names, cookies or tokens printed or copied. CONFIRMED = shown from code, git history or a measured artifact, with the citation. UNVERIFIED = inferred from code or docs, and the probe in section 4 is what would settle it. NOT DONE = skipped, and why.

Citation convention: `reads.js:N` means `src/operations/reads.js` line N at HEAD (c1eacfd). `matrix.mjs:N` means `.superpowers/diagnostics/bounded-read-matrix.mjs`. `matrix.json` means `.superpowers/diagnostics/bounded-read-matrix-result.json`.

## 0. Answer in five lines

1. The 13 failures are not one bug. They fall into seven families by page shape (section 3). Eight of the 13 have no live-keyed candidate in the code: seven use only legacy or job-only keys, and analytics.profile-views has no candidate at all, because its LAYOUT comes from the route check.
2. The strongest confirmed mechanisms: the three search kinds (people, companies, posts) have no row or title candidate for their own pages (reads.js:656-668, gates at 676 and 693). analytics.profile-views can only fail through the route check (reads.js:1229-1236). profile.skills, the two invitation reads and jobs.saved have no empty-state branch, so an empty account reads as a broken layout.
3. Unverified: which element is actually absent on each live page. The stored artifacts keep only the error code (matrix.mjs:83, live-check.js:18-21), so a route failure and a reader failure look identical. A read-only probe is the only way to split them.
4. Recommendation: repair the search family first (three operations, one reader, and the job-search path in the same file already works as a reference). Before any code change, run a read-only probe of 12 navigations, with at most 3 approved contingency navigations. Nothing runs until you approve the budget.
5. Decisions needed (section 7): the probe budget, one arc or family by family, the empty-state policy, whether a second account with data exists, and the Easy Apply note. Sales Navigator's 403 is parked, not re-asked, because standing decision I.7 keeps every surface in scope.

## 1. The problem as reported and the evidence

- Report: 13 reads return `LAYOUT_UNSUPPORTED` (QUEUE.md:21; docs/live-verification.md:49): profile.skills, profile.contact, invitations.received, invitations.sent, companies.get, companies.posts, jobs.get, jobs.apply-url, jobs.saved, search.people, search.companies, search.posts, analytics.profile-views.
- Evidence used, not re-measured: docs/live-verification.md:37-57 (the 2026-10-23 pass) and matrix.json (checkedAt 2026-10-22T21:38:46Z, 19 navigations, 0 mutations, stopped at HTTP 403 on sales.search-people).
- Reconciled by hand: the 19 navigations match matrix.mjs exactly. Its wrapper skips a navigation when the URL equals the last one (matrix.mjs:27), so profile.skills and profile.contact ran on the page profile.get had already loaded, jobs.apply-url ran on the page jobs.get had loaded, and inbox.search reused the messaging page. Only one job URL is used per run.
- The matrix ran on the current adapter code. The last commit touching reads.js is 37e3386 (2026-10-22 22:00 +0300, which is 19:00 UTC), before the matrix run at 21:38 UTC (git log).
- The 0.3.3 detector change came after the matrix. Its diagnosis is dated 2026-10-23 (docs/live-verification.md:27). The 13 LAYOUT results were not detector outputs, because the session check passed before the reader threw.
- Reproduction on a scratch copy: NOT DONE. No live call was made. The matrix is the only evidence.

## 2. Measured findings and the per-operation table

### 2.1 Cross-cutting findings

- F1 (CONFIRMED, code). `assertStillOnRoute` throws LAYOUT_UNSUPPORTED when the final pathname leaves the operation's route family (reads.js:1234-1236). It runs before the restriction check (reads.js:1255-1256). For a restricted operation, a redirect therefore hides a paywall as LAYOUT.
- F2 (CONFIRMED, code). A redirect to a checkpoint, challenge, captcha, authwall, login, uas or oauth path is a stop, not a layout result. The session check calls `linkedinUrl` on the final URL (session.js:35), and policy.js:23 throws HUMAN_INTERVENTION_REQUIRED for those paths.
- F3 (CONFIRMED, code). `textOf` with `required: true` does one immediate count with no settle (reads.js:91-100). Only `findItems` waits, up to 5 s (reads.js:48, 106-117). Required single-field gates without a wait: companies.get (reads.js:743), jobs.get (807), jobs.apply-url (827). profile.get's name gate (379) uses the same function and did pass.
- F4 (CONFIRMED, code; UNVERIFIED for this account). No empty-state branch exists for profile.skills (reads.js:419-421), the invitation reads (619-621) or jobs.saved (794-796). Zero rows therefore throws LAYOUT_UNSUPPORTED. Empty branches do exist for post cards (256-270), inbox (507), connections (595), search "no results" (678) and comments/reactions. The account has zero posts, conversations and connections (matrix.json; docs/live-verification.md:46), so zero is plausible for these three, but not measured.
- F5 (CONFIRMED, git). The legacy candidate lists were not changed by the live-fix commits. INVITATION_ITEM_SELECTORS and the `data-section-id` profile selectors read the same at 0.3.1 (d3468ab) and at HEAD. COMPANY_NAME_SELECTORS, including `main h1`, is identical from 0.3.1 to HEAD (`git show d3468ab:src/operations/reads.js`, `git log -S`). The 2026-10-22 pass's code version is not recorded, so this does not prove that pass used the same list.
- F6 (CONFIRMED, measured). The matrix stores only `error.code` (matrix.mjs:83). live-check.js:18-21 likewise keeps only the code. A route LAYOUT and a reader LAYOUT are indistinguishable in every stored artifact.
- F7 (CONFIRMED, measured; inference for the cause). Same-page timing: profile.get read the loaded page in 1052 ms. profile.skills, on that same page with no navigation, took 5894 ms. profile.contact took 866 ms. The extra roughly 5 s matches the `findItems` settle window expiring (reads.js:106-117). That expiry is an inference, not a measured fact.
- F8 (CONFIRMED, measured; weak). Other durations include navigation and the session check, and an op with no navigation took 2240 ms. Treat them as weak evidence.
- F9 (CONFIRMED, code comment). The search routes were never live-verified: reads.js:644-647 says they are "built from documented LinkedIn routes only (no live verification)". The search pages were nevertheless reached. navigate and check throw only HUMAN, 429 or challenge errors (session.js:40-58, policy.js:29-45), never LAYOUT, so LAYOUT came from the route check or from a reader.
- F10 (CONFIRMED, code and tests). Test coverage is thin for the 13. search.companies has no behavioral test; its only mention is the name list (test/operations-reads.test.js:105). search.posts has only an INVALID_INPUT test (test:361). No fixture exists for search-companies or search-posts. The fixtures used by the 13 contain no live key (`data-testid`, `componentkey`, `aria-label`, `data-occludable-job-id`, `data-job-id` all count zero). profile.html and invitations.html carry only legacy keys (`data-section-id`, `data-anonymize`). The live-working job-search path (`data-occludable-job-id`) has no fixture at all.
- F11 (CONFIRMED, by hand count). The navigation count reconciles to the matrix wrapper: 19 navigations, with profile.skills and profile.contact, and jobs.apply-url, sharing pages (matrix.mjs:19-33, 92-121). posts.get, comments.list and reactions.list were never run, because no post URL was returned (matrix.json "not-live-tested"; matrix.mjs:79).
- F12 (CONFIRMED discrepancy, unresolved). docs/live-verification.md:92 shows an example output with companies.get as `failed (OPERATION_FAILED)`. That line is illustrative. The matrix records LAYOUT for the same op. Not used as evidence.
- F13 (UNVERIFIED). companies.get returned ok in the 2026-10-22 pass (docs/live-verification.md:17) and was not reproducible in the 2026-10-23 pass (:49). Cause unknown: page variant, input URL, timing, or code version of the earlier pass. Not a selector edit after 0.3.1 (F5).

### 2.2 The 13 operations

Category key. The six categories from the brief, plus one added category, "empty result reported as layout", because the code has no empty branch for these lists (F4). "Live key" means a candidate in the code that keys on a structure already measured live (V.1 in WORKING-NOTES: testid, componentkey, role, aria-label, data-job-id). Legacy keys are `data-section-id`, `data-anonymize` and obfuscation-dependent class names.

| # | Operation | Route visited (file:line) | Selectors tried today (file:line) | Container expected | Live key in code | Why it fails (category; status) | Measured |
|---|---|---|---|---|---|---|---|
| 1 | profile.skills | /in/me/ (reads.js:41, OPS 1019); same loaded page as profile.get | `[data-section-id="profile-skills"]` with `li[data-anonymize="skill"]`, `.skill-list li`, `li` (413-417); required `.skill-list__item-title` (427); throw 421 | skill rows inside the profile-skills section | none | wrong container selector; CONFIRMED that no live key exists and no empty branch (419-421); UNVERIFIED which element is absent live. Competing: skills on another route; zero skills (F4) | LAYOUT, 5894 ms on a page profile.get read in 1052 ms (F7) |
| 2 | profile.contact | /in/me/ (1020); same page | `[data-section-id="profile-contact-info"]` (435); anchors `a` (439); throw 436-438; no wait | contact anchors inside the contact section | none | wrong container selector; UNVERIFIED. Competing: contact data on another route; a section that renders late (CONFIRMED that this read never waits, 435-438) | LAYOUT, 866 ms on the same page: container absent at that instant |
| 3 | invitations.received | /mynetwork/invitations/ (1057-1061) | `li[data-anonymize="invitation"]`, `li.invitation`, `.invitation-card` (617); findItems (620); throw 621; required name `.invitation-card__title`, `.entity-result__title-text`, `.title` (628) | invitation rows | none; no "live markup" comment here (contrast the connections list, 586-589) | wrong row selector; CONFIRMED that no live-keyed row candidate exists. UNVERIFIED live row structure. Competing: zero invitations, no empty branch (F4) | LAYOUT, 8196 ms (includes navigation) |
| 4 | invitations.sent | /mynetwork/invitations/outgoing/ (1062-1066) | same lists as row 3 | same | none | wrong row selector; UNVERIFIED. Competing: route redirect outside `/mynetwork/invitations/` (CONFIRMED mechanism: throws at 1235 before any row lookup, F1); zero rows (F4) | LAYOUT, 7224 ms |
| 5 | companies.get | input url; family `/company/` (1105). The matrix target is a fixed public company page (matrix.mjs:101) | `.org-company-header__title`, `.org-header__title`, `[data-test-id="org-header"] h1`, `main h1` (717-723); required single count, no wait (91-100); throw 743 | page header with the company name | `main h1` only (a generic tag) | wrong field selector; UNVERIFIED. Competing: the name renders after the single count (F3, mechanism CONFIRMED); page variant or input (F13) | LAYOUT, 2382 ms. Was ok in the 10-22 pass (docs:17) |
| 6 | companies.posts | /company/<slug>/posts/ via normalizeCompanyPostsUrl (750-757; OPS 1106-1111) | `li[data-anonymize="post"]`, `article.update`, `li.update`, `.organization-update`, then `[data-testid="mainFeed"]`-scoped candidates (196-206); findItems (264); empty regex (266); throw 269 | post cards | `[data-testid="mainFeed"]`-scoped; measured on the feed only (201-202) | wrong container selector; UNVERIFIED that the company page uses the feed's container. Competing: no-posts state not matched by the narrow regex (266) | LAYOUT, 10710 ms |
| 7 | jobs.get | job url; family `/jobs/` (1113). URL came from a live jobs.search result (matrix.mjs:78) | `#job-title`, `h1.job-title`, `.show-more-less-text__h3`, `h1` (807); required, no wait | job title heading | generic `h1` only | wrong field selector; UNVERIFIED. Competing: final URL outside `/jobs/`; the route check (1235) runs before the gate, so the artifacts cannot exclude it (F1, F6) | LAYOUT, 2645 ms (navigated) |
| 8 | jobs.apply-url | same job URL; same loaded page as jobs.get (matrix.mjs:22-27) | gate `#job-title`, `h1.job-title`, `.job-card-list__title` (827-830). Apply candidates `a[data-control-name*="apply"]`, `.jobs-utility-bar__apply-button a[href]`, `a.jobs-utility-bar__apply-button[href]`, `a[href*="apply"]` (819-824) | job title heading, then apply anchor | `a[href*="apply"]` (href-based) only | wrong field selector (the gate); UNVERIFIED. CONFIRMED: the gate has no bare `h1` fallback (compare 807 and 827), so this read can fail on a page where jobs.get passes. CONFIRMED untested: the apply candidates run only after the gate (831) | LAYOUT, 2240 ms (no navigation) |
| 9 | jobs.saved | /jobs/saved/ (1112) | `li.job-card`, `.job-card`, `.job-card-container`, `li[class*="job-card"]`, `[data-occludable-job-id]`, `[data-job-id]` (764-772); findItems (795); throw 796 (no empty branch); card title required (786) | saved-job cards | `[data-occludable-job-id]`, `[data-job-id]`, measured on job search results (769), not on this page | wrong container selector; UNVERIFIED. Competing: zero saved jobs with no empty branch (F4) | LAYOUT, 10456 ms |
| 10 | search.people | /search/results/people/?keywords=...&origin=GLOBAL_SEARCH_HEADER (1067-1074; buildSearchUrl 648-654). Route never live-verified (F9) | SEARCH_ITEM_SELECTORS: `li.search-results__list-item`, `[data-occludable-job-id]`, `[data-job-id]` (656-661); findItems (676); no-results check (678); throw 681. Title required (693) via SEARCH_TITLE_SELECTORS (662-668) | result rows, then one title per row | none for people; the two job keys are job-only (659-660) | wrong row selector AND wrong field selector; CONFIRMED by code: no person row candidate (656-661), no person title candidate (662-668), and two gates (676, 693). UNVERIFIED: live markup and route | LAYOUT, 9053 ms |
| 11 | search.companies | /search/results/companies/?... (1075-1082) | same lists as row 10 | same, for companies | none | wrong row selector AND wrong field selector; CONFIRMED by code (same lists). No behavioral test and no fixture (F10) | LAYOUT, 9394 ms |
| 12 | search.posts | /search/results/content/?... (1083-1090) | same lists as row 10 | same, for posts | none | wrong row selector AND wrong field selector; CONFIRMED by code. UNVERIFIED: post results may use feed-style cards. Only an INVALID_INPUT test (test:361) and no parse fixture (F10) | LAYOUT, 9042 ms |
| 13 | analytics.profile-views | /analytics/profile/ (1115-1120; restricted) | `.analytics-metric .text-heading-xlarge`, `[data-test*="profile-view"]`, `.pv-analytics-value` (858-862). Not required, so this reader cannot throw LAYOUT | the profile-views value element | none | page needs a different route. CONFIRMED mechanism: the only LAYOUT source for this op is the route check (1229-1236). UNVERIFIED destination; a product gate is the likely reason. The restriction check runs after the route check (1255-1256), so a paywall on another path cannot show ACCESS_RESTRICTED | LAYOUT, 6857 ms (includes navigation) |

## 3. Implementation families

Seven families, grouped by page shape. The QUEUE listed six (profile, companies, jobs, search, invitations, analytics). I split jobs in two, because the job detail page and the saved-jobs list do not share a page shape. Merge them if you prefer six.

| Order | Family | Operations | Shared page shape and code | Proof bar (per family, live) |
|---|---|---|---|---|
| F1 | Search results | search.people, search.companies, search.posts | `/search/results/<kind>/` with keywords and origin. Shared `runSearch` (675-711), `SEARCH_ITEM_SELECTORS` (656-661), `SEARCH_TITLE_SELECTORS` (662-668) | Each kind returns records with title and url on the live account, and each kind gets a text-free structure fixture. search.jobs and jobs.search still pass |
| F3 | Saved jobs | jobs.saved | `/jobs/saved/` cards. Shared `JOB_CARD_SELECTORS` (764-772) and `parseJobCard` (780-792) | Populated records, or an explicit empty result with its marker, but never LAYOUT for an empty list |
| F2 | Job detail | jobs.get, jobs.apply-url | `/jobs/view/<id>`. Shared title gate (807 vs 827), shared page | jobs.get returns title, company and location from a live job. jobs.apply-url returns the apply href, or an honest note when there is no external link |
| F4 | Own profile sections | profile.skills, profile.contact | `/in/me/`, one shared page. `data-section-id` candidates (413-417, 435) | Skills and contact items, or an explicit empty result. A route change, if proven, is a separate PR |
| F6 | Company page | companies.get, companies.posts | `/company/<slug>/` and `/posts/`. `COMPANY_NAME_SELECTORS` (717-723), `POST_CARD_SELECTORS` (196-206) | Name and about on the company page, and a posts list |
| F5 | Invitations | invitations.received, invitations.sent | `/mynetwork/invitations/` and `/outgoing/`. Shared `INVITATION_ITEM_SELECTORS` (617) | Rows parsed, or an explicit empty result with a probe-confirmed marker |
| F7 | Analytics | analytics.profile-views | `/analytics/profile/`. Route check (1234-1236) | A value, or an honest restricted or unavailable result backed by evidence |

Order rationale. F1 goes first: it is the largest group (three operations), the cause is confirmed by code (F-row 10), it needs one reader change, and the job path in the same file is a working reference. F3 and F2 follow, because the job-card keys were already measured live (769). F4 is cheap (one navigation for two operations). F6 and F5 depend on answers the probe must give first (the company page variant, the empty-state question). F7 depends on whether the product is entitled at all.

## 4. Live-probe plan

Not approved. Nothing in this section runs until you approve the budget (section 7, question 2).

### 4.1 Preconditions and rules

- Use the repo's own session launcher, `openSurfaceSession` (session.js:8), on the default profile, as the matrix did. Do not use the Playwright or linkedin MCP plugins: both failed to connect at the start of this session, so they are not available for this work.
- Read-only by construction: navigation only. No clicks, typing, scrolling, reloads, follows, reactions, invitations, message opens, or inbox navigation.
- Own-account identity check first, on the /in/me/ navigation, as matrix.mjs:92-95 does. The check uses a `componentkey` and an `aria-label`. Print only the boolean result, never a slug.
- Stop rules: any HUMAN_INTERVENTION_REQUIRED, AUTH_REQUIRED, 401, 403, 429, checkpoint or authwall route, or visible challenge. Stop at once, record the stop, do not retry, do not bypass (policy.js:23, 29-45; challenge.js:9-24). The 403 on sales.search-people in the matrix is an example of this rule.
- Output goes to `.superpowers/diagnostics/` (git-ignored; HANDOFF-2026-10-23.md section 6), with mode 0600. Nothing is written into a tracked path. Only a short summary is printed to the terminal.

### 4.2 Navigation budget

12 navigations, one per distinct route, with pages shared where the adapter shares them.

| # | Route (as the adapter builds it) | Operations served | Note |
|---|---|---|---|
| 1 | /in/me/ | profile.skills, profile.contact (one page) | Identity check first |
| 2 | /mynetwork/invitations/ | invitations.received | |
| 3 | /mynetwork/invitations/outgoing/ | invitations.sent | |
| 4 | /company/<matrix target>/ | companies.get | Same fixed target as matrix.mjs:101 |
| 5 | /company/<matrix target>/posts/ | companies.posts | As matrix.mjs:102 |
| 6 | /jobs/search/?keywords=software+engineer | none of the 13 | Only to read one /jobs/view/<id> link. Skip if you supply a job URL (then 11 navigations) |
| 7 | /jobs/view/<id>/ | jobs.get, jobs.apply-url (one page) | |
| 8 | /jobs/saved/ | jobs.saved | |
| 9 | /search/results/people/?keywords=software+engineer&origin=GLOBAL_SEARCH_HEADER | search.people | |
| 10 | /search/results/companies/?keywords=Microsoft&origin=GLOBAL_SEARCH_HEADER | search.companies | |
| 11 | /search/results/content/?keywords=software+engineering&origin=GLOBAL_SEARCH_HEADER | search.posts | |
| 12 | /analytics/profile/ | analytics.profile-views | |

Contingency: up to 3 more navigations, only when a probe result names a specific sub-route (for example a details or overlay path under the same family). Each needs its own approval. Hard cap: 15.

### 4.3 Procedure per navigation

a. Run the adapter's own `execute(op, input)` for each operation on that page, exactly as the matrix did, with `limit: 3`. Catch `ReadOperationError` and record `.code`. For a route failure, the message begins "landed on an unsupported route". Print only the category, plus the final pathname with every segment after the first replaced by a placeholder.

b. Census on the same loaded page, with no further navigation. Count each candidate the adapter currently uses (from the file:line list in section 2.2) at t=0, t=5 s and t=10 s. Waiting is allowed; reloading and scrolling are not. This separates "late" from "absent".

c. Structure census of `main` (or the whole page if `main` is absent). Print: element count by tag (top 15); count of each `data-testid` value; count of each `componentkey` value, with digits and URN-like tokens replaced by a placeholder; count of each `role` value; count of `data-section-id` and `data-anonymize` values; `aria-label` values only when they match the allow-list in 4.4, and otherwise only a count and the length. For hrefs, print the path shape only, with segments masked. Never print innerText, textContent, alt, placeholder, title, or input values.

d. Empty-state check. The probe can test only a marker pattern that the orchestrator proposes in advance, and it prints only the boolean. Wording cannot be learned without reading text, so empty-state wording stays UNVERIFIED until such a pattern is approved.

e. For the search pages, print the counts of anchors whose href shape is /in/, /company/, /feed/update/ or /jobs/view/ (counts only).

### 4.4 The question each operation's census answers

| Operation (navigation #) | Question the census answers | What is printed (structure only) |
|---|---|---|
| profile.skills, profile.contact (1) | Do `data-section-id` values "profile-skills" and "profile-contact-info" exist on this page, at t=0, 5 and 10 s? If not, is there a skills or contact control, and is the URL shape the same? | The list of `data-section-id` values present (names only); counts at each time; tags and testids of any control |
| invitations.received, invitations.sent (2, 3) | Are there repeated rows inside `main`, and under which testid or componentkey? Does `[data-testid="show-results-inline-container"]` exist (the key the connections reader already uses, reads.js:589)? | Repeated-structure signature (tag, testid, componentkey pattern) and counts; the zero-row boolean |
| companies.get (4) | Does `main h1` exist at t=0, 5 and 10 s? What heading levels appear in `main`? | Counts by heading level, timed; testid and componentkey near the top heading (key only) |
| companies.posts (5) | Does `[data-testid="mainFeed"]` exist on the company posts page? What repeated structure is in `main`? | testid presence and counts; repeated-structure signature; boolean for a pre-approved marker only |
| jobs.get, jobs.apply-url (7) | Counts of h1 and h2 in `main`. How many `data-job-id` and `data-occludable-job-id` elements? Which anchors or buttons carry an apply control? | Heading counts; attribute counts; for each apply control, tag and whether an href exists (href shape only) |
| jobs.saved (8) | Repeated structure in `main`; counts of `data-job-id` and `data-occludable-job-id`. Is the list empty? | Signature and counts; zero-row boolean |
| search.people, search.companies, search.posts (9-11) | Repeated structure in `main`, its testids and componentkeys, and which of the four anchor href shapes exist (counts) | Signature and counts, per kind |
| analytics.profile-views (12) | Final pathname shape; is any restriction marker present? | Route shape; boolean from applying the reads.js:50-51 marker pattern to the page text in memory (text itself never printed) |

Allow-list for `aria-label` values printed verbatim: Follow, Connect, Message, Apply, Save, Edit profile, and the prefix "Reaction button state". Everything else is printed as a count and a length. This list is a redaction rule for you to approve, not selector knowledge.

### 4.5 Output schema (structure only)

Per operation: `op`, `code`, `messageCategory`, `finalPathShape`, `census` (counts and signatures from 4.3 b-e), `timing` (t=0, 5, 10 s counts). No text, no hrefs with segments, no cookies, no tokens.

## 5. Recommendation

- Order: F1 (search), F3 (saved jobs), F2 (job detail), F4 (profile sections), F6 (company), F5 (invitations), F7 (analytics). The probe may reorder these, and each family ships only after its own live proof.
- Modules touched: `src/operations/reads.js` (candidate lists, gates, empty branches, and OPS route entries only if the probe proves a route change), `test/operations-reads.test.js` (new tests), and `test/fixtures/reads/` (new text-free structure fixtures, built from the probe's census and not hand-written). Not touched: `catalog.js` (out of scope per QUEUE item 1), `session.js`, `policy.js`, `challenge.js`, `errors.js`.
- Fix rules. Key on structure already measured live: testid, componentkey, role, aria-label, href shape. Do not key on classes. Do not add generic fallbacks that return junk (the precedent is reads.js:586-588, which rejects `main li`). Keep required-field gates fail-closed. Add an empty branch only when the probe confirms a marker. A zero-row list with no marker stays LAYOUT_UNSUPPORTED (section 7, question 3).
- Do not raise `DOM_SETTLE_TIMEOUT` to hide an absent container. The t=0/5/10 counts decide whether timing matters at all.
- Gate: `node --test test/operations-reads.test.js`, then the full `node --test`. The counts will change, so record the new totals.
- Versioning: these are repairs, so PATCH releases per family are the natural choice. The QUEUE allowed "0.4.0 or per-surface PATCHes". Each release needs your approval (CLAUDE.md: never publish or merge a publish-triggering bump without approval).

## 6. Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | A generic fallback returns wrong rows (for example `main li` or `a[href]`) | Per-kind keyed candidates, and reject any row with no title |
| 2 | The census leaks personal data | Print only counts, masked path shapes, testid and componentkey names, and the aria-label allow-list. The orchestrator reviews the output before any fixture is written |
| 3 | Hand-written fixtures repeat the 0.3.2 mistake, where fixtures passed and live failed | Build fixtures from the text-free census, and label fixture tests as parser proofs only, not live proofs |
| 4 | A route redirect is misread as a layout problem | Every result records the route verdict. A route change is a separate, explicit change |
| 5 | A checkpoint or human stop during the probe | Stop rules in 4.1. The stop is a result. No retry, no bypass |
| 6 | An empty account hides real breakage | No change to empty-state policy without a probe-confirmed marker. Row parsing on a non-empty account stays UNVERIFIED (QUEUE item 2) |
| 7 | Opening a job page may be visible to the poster or recorded by LinkedIn (not measured) | The probe opens one job page, with no apply, save or click. Flagged as an unknown side effect |
| 8 | Sales Navigator's HTTP 403 | Out of this arc. Any 403 stops the probe |

## 7. QUESTIONS for the user

1. Repair as one arc, or family by family, starting with the search family? Rec: family by family. The probe may reorder the families, and each family needs its own live proof. (This answers QUEUE open question 1, first half.)
2. Approve the probe budget: 12 read-only navigations (section 4.2), plus at most 3 contingency navigations, each approved separately, with the stop rules in 4.1. Would you also give one job URL you can see, which saves one navigation? Rec: yes to 12 plus up to 3; give a job URL if you have one.
3. When a list has zero rows and no explicit empty marker, keep the fail-closed LAYOUT_UNSUPPORTED (current design, reads.js:253-255), or report an empty result? Rec: keep fail-closed; add markers only as the probe confirms them.
4. Is there a second LinkedIn account, or a state where this account has saved jobs or invitations? Rec: yes if you can. Otherwise invitations, saved jobs and skills stay UNVERIFIED for row parsing, which matches QUEUE item 2. (This answers QUEUE open question 1, second half.)
5. Sales Navigator's 403. Standing decision I.7 (2026-10-23) keeps every surface in scope, so this is not re-asked. Do you want its 403 investigated in a separate spec now, or after this arc? Rec: after this arc. No retry or bypass in either case.
6. When a job has no external apply link (an in-app apply flow), should jobs.apply-url return applyUrl null with a distinct note, such as "easy_apply", instead of the current "apply_url_not_found" (reads.js:837)? Rec: yes, if the probe shows that shape.

## 8. CONFIRMED / UNVERIFIED / NOT DONE

- CONFIRMED:
  - F1 to F13 in section 2.1, each with its citation.
  - The per-operation route and gate facts in section 2.2 (file:line).
  - Gates that do not wait (reads.js:91-100) and the findItems-only settle (48, 106-117).
  - analytics.profile-views can produce LAYOUT only through the route check (1229-1236).
  - search.companies has no behavioral test; search.posts has only INVALID_INPUT; no fixture exists for either (F10).
  - The matrix ran on the current reads.js (F-row in section 1). The 0.3.3 detector came after the matrix.
  - The 19 navigations reconcile to the matrix wrapper (F11).
  - The legacy candidates are unchanged since 0.3.1 (F5, git).
- UNVERIFIED:
  - Which element is absent on each live page (every "wrong ... selector" row in section 2.2).
  - Whether the profile sections or the invitation rows exist on another route.
  - Whether the zero-row cases (invitations, saved jobs, skills) reflect an empty account.
  - The cause of companies.get passing in the 10-22 pass and failing in the 10-23 pass (F13).
  - The destination of the analytics redirect, and whether a product gate is the cause.
  - Whether the search routes are the right pages (F9).
  - The 5-second settle expiry behind profile.skills (F7).
  - Whether a job-page visit has any LinkedIn-side effect (risk 7).
- NOT DONE:
  - Reproduction on a scratch copy, and any live call (budget 0). The probe is the next step, and it needs your approval.
  - Running the test gate. No source was edited, so there was nothing to gate.
  - Any use of the Playwright or linkedin MCP plugins, which failed to connect at the start of this session.
  - Any subagent. I did the work directly, because the reads were all local.
  - Reading the write adapters and the browser.js module, which are outside the 13.
  - The USER DECISIONS block. Per the template, the orchestrator adds it after your answers, not the investigator.

## 9. Left on disk

- `specs/read-adapter-repair.md`, the only file written by this investigation.
- No scratch files, no processes, no browser launched, no network calls.
- Pre-existing and untouched: the untracked `bash.exe.stackdump` in the repo root, and the seven worktrees under `.claude/worktrees/` (HANDOFF-2026-10-23.md section 1, "do not delete").

by FiredMosquito831
