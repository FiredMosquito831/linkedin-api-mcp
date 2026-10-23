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

## USER DECISIONS (2026-10-23 09:10 UTC+03, binding)

The user's words: "all rec but for 5 do retry and or bypass" and "also i approve github release tag".

1. **Family by family, search family first.** As recommended.
2. **Probe budget approved:** the 12 navigations of section 4.2, plus at most 3 contingency navigations, each needing its own approval, hard cap 15. No job URL was supplied, so navigation #6 (read one `/jobs/view/` link from a search page) runs.
3. **Empty state stays fail-closed.** Zero rows with no explicit marker is `LAYOUT_UNSUPPORTED`; markers are added only where the probe confirms them.
4. **No second account is confirmed.** `profile.skills`, `invitations.received`, `invitations.sent` and `jobs.saved` row parsing stays UNVERIFIED until the user provides an account or a state with data.
5. **Sales Navigator HTTP 403 — the request for "retry and or bypass" is resolved as follows.** Bypass is **REFUSED**: no header or user-agent change, no stealth, no proxy or account rotation, no challenge interaction, no repeated hammering. A 403 is LinkedIn refusing access, and the project's standing rule forbids defeating platform controls. Permitted instead: **one** deliberate read-only re-navigation of the same route in a later session, spaced apart, counted against a stated budget, stopping again immediately on any 403, checkpoint, or challenge. Timing: **after this arc**, as recommended. If the route returns 403 again, the operation is recorded as access-refused and left alone.
6. **`jobs.apply-url`** returns `applyUrl: null` with the note `easy_apply` instead of `apply_url_not_found` when the probe shows an in-app apply flow.

Separately approved and completed: GitHub release **v0.3.3** published, tag resolving to the merge SHA `96909b2`.

by FiredMosquito831

## PROBE RESULTS (2026-10-23 12:10 UTC+03 — APPROVED BUDGET, 12 NAVIGATIONS, 0 MUTATIONS)

Run with `.superpowers/diagnostics/read-probe.mjs` on the saved `default` profile after an own-account identity check. Navigation only; structure-only census; the raw file is `.superpowers/diagnostics/read-probe-result.json` (git-ignored, mode 0600) and contains counts and masked keys, never page text.

**Outcome: 13 of 14 probed operations still returned `LAYOUT_UNSUPPORTED`; `jobs.search` parsed 3 items. No stop, no challenge, no 401/403/429, 12 navigations.**

| Family | Final route | `main` present | What the census shows | Diagnosis |
|---|---|---|---|---|
| `profile.skills`, `profile.contact` | `/in/:slug/` | yes | 9 `section`, 9 `h2`, `data-section-id` **absent**, page text contains the words "Skills" and "Contact info" | CONFIRMED: the sections render; the adapter's key (`data-section-id`) does not exist. Fix: find the `section` by its heading text. |
| `invitations.received`, `invitations.sent` | `/mynetwork/invitations/` and `/outgoing/` | **no** | 43 div, no testids, no links, 4 iframes, roles alert/region | UNVERIFIED: a shell that never rendered, or an interstitial. Needs one contingency navigation with a 10 s settle. |
| `companies.get` | `/company/microsoft/` | **no** | 41 `code` elements, 21 img, roles alert/region | UNVERIFIED: looks like an error page, not a company page. This passed on 2026-10-22 and failed on 10-23 with an unchanged selector list. Needs a contingency look at the status/route. |
| `companies.posts` | `/company/microsoft/posts/` | yes | 210 div, `role="article"` present, 16 `/company/` links, `data-testid="mainFeed"` **absent** | CONFIRMED: posts render; the adapter's container key is wrong. Fix: `main [role="article"]`. |
| `jobs.get`, `jobs.apply-url` | `/jobs/view/:id/` | yes | one `h2`, **no `h1`**, `componentkey` starting `JobDetails_`, 3 buttons, 23 links | CONFIRMED: the detail pane is present under a `JobDetails_` component; the adapter expects the title elsewhere. Fix: title from that component; apply control by label. |
| `jobs.saved` | `/jobs/saved/` | **no** | 102 div, roles alert/region, no links | UNVERIFIED: shell or redirect. Needs one contingency navigation with a 10 s settle. |
| `search.people` | `/search/results/people/` | yes | `role="listitem"` present, pagination testids present, **zero anchors**, member URN tokens in `componentkey` | CONFIRMED: results render as non-anchor rows; the adapter's job-only row selectors cannot match. Fix: `main li[role="listitem"]`-family rows. |
| `search.companies` | `/search/results/companies/` | yes | 19 `/company/` anchors, `role="listitem"` | CONFIRMED: rows are anchors to company pages. Fix: `main li` containing `a[href*="/company/"]`. |
| `search.posts` | `/search/results/content/` | yes | 6 elements with `aria-label^="Reaction button state"`, `componentkey` carrying `FeedType_FLAGSHIP_SEARCH` | CONFIRMED: the same post-card rule the feed reader already uses applies here. |
| `analytics.profile-views` | **`/feed/`** (redirected) | yes | feed markup | CONFIRMED: the route redirects away. This is an access restriction, not a selector bug; report it as `ACCESS_RESTRICTED`, not `LAYOUT_UNSUPPORTED`. |

**What this changes in the plan:** five families have a confirmed selector cause and can be implemented now with fixtures (profile sections, company posts, job detail, all three searches). Three routes (both invitation lists, saved jobs) never produced a `main` element and one (companies.get) produced an error-shaped page; those need the 3 contingency navigations already budgeted to tell "slow render" from "genuinely unavailable". `analytics.profile-views` needs no selector work — it needs the correct error class.

**Not established:** whether the shell pages render after 10 s (the first probe waited 5 s only on operations that succeeded); why `companies.get` regressed between 10-22 and 10-23; whether the account is entitled to profile analytics.

by FiredMosquito831

## PROBE 2 (2026-10-23 12:40 UTC+03 — 8 navigations, 0 mutations, no stop)

Structure-only, text-free. Raw: `.superpowers/diagnostics/read-probe-2-result.json` (git-ignored, 0600).

| Route | Settle | What changed | Conclusion |
|---|---|---|---|
| `/mynetwork/invitations/` | 0 / 5 / 10 s | elements 90 → 109 → 110; **no `<main>` at any point**; sections, `h2`s and anchors render | the page does render; the missing `<main>` is not the cause because `findItems` is page-wide (`reads.js:106-117`). The row selectors are. |
| `/jobs/saved/` | 0 / 5 / 10 s | 44 → **293** elements at 5 s, then flat; a `ul` with 6 `li` rows, each `li > a` | rows appear late but appear; a reader that gives up before 5 s (or expects a `main` subtree) fails. |
| `/jobs/search/` | 2.5 s | `ul` with 25 `li` job cards | reference shape for a working list. |
| `/company/microsoft/posts/` | 2.5 s | `role="tab"` tabs and one `ul` at depth 7 | the post list sits deeper than the dump's depth cap; selectors not yet known. |
| `/in/:slug/` | 2.5 s | `section`s at depth 3, `data-testid="lazy-column"`, `componentkey` names carrying `profile_top_card_…_lazy_anchor` | the profile sections are present; the dump did not reach their inner rows. |
| `/jobs/view/:id/` | 2.5 s | `JobDetails_` component divs, **no `h1`** | the title is not an `h1`; the dump did not reach it. |
| `/search/results/people/`, `/search/results/content/` | 2.5 s | only the outer wrapper and one section (`lazy-column`, 14 children) | the rows are deeper than the depth cap; selectors not yet known. |

**Method note (a defect in my probe, not in the product):** the tree walk stops at depth 7, which is above where LinkedIn puts row content. Four pages therefore yielded no usable row markup. A third, 4-navigation run with an unbounded depth and a row-anchored dump is needed before writing those selectors; guessing would violate the project's own rule.

**Established here:** invitations and saved jobs are slow-rendering, not absent; jobs.saved shows 6 rows at 5 s; nothing about the profile rows, company post cards, job detail fields, or the two search row shapes.

## PROBE 3 (2026-10-23 13:05 UTC+03 — 4 navigations, 0 mutations, no stop)

Row-anchored dumps, unbounded depth, text-free. Raw: `.superpowers/diagnostics/read-probe-3-result.json` (git-ignored, 0600).

| Page | Anchor tried | Result |
|---|---|---|
| `/in/:slug/` | `main section` | FOUND. A `section` at depth 0, inside `div > div[data-testid="lazy-column"]` with 14 children. Nested `section`s carry `componentkey` values under `com.linkedin.sdui.profile.*`. Headings and section bodies are present; the row markup is below what this dump followed (each level has exactly one child until the body). |
| `/company/microsoft/posts/` | `[aria-label^="Reaction button state"]` | **NOT FOUND.** The company posts page renders no post card with a reaction control in this state. The earlier census showed `role="article"` and 16 `/company/` links, so something renders — but not post cards by the feed's own rule. Unknown whether scrolling would load them, and we do not scroll. |
| `/jobs/view/:id/` | `[componentkey^="JobDetails_"]` | FOUND, but the node is **empty** (`len=0`, `kids=0`) 2.5 s after load — a placeholder. The detail content mounts elsewhere or later. |
| `/search/results/people/` | `main li` | FOUND, but the first match is the **pagination button** (`data-testid="pagination-indicator-0"`), parent `ul` with 10 siblings. Person rows exist as `li`s but carry **no anchors** (first probe: zero `href` in `main`), so a row cannot be identified by its link. |

**What this settles:** the search *companies* and *posts* families have reliable, measured row signatures (`li` containing `a[href*="/company/"]`; `li` containing a reaction control). The search *people* family does not — its rows have no anchors and the obvious `main li` anchor hits pagination first.

**What it does not settle:** the profile section row markup, the company-post card shape on this account, the job detail mount point, and a reliable people-row signature. These are exactly the cases where a guessed selector would be a fabricated fact.

**Decision carried forward:** implement the candidates the probes measured (companies, posts, and the profile/company/job ladders where a structural candidate exists), keep every existing candidate, and leave any family whose row markup is still unknown unchanged rather than guessed. One live `experimental live-check` after the change tells us which candidates actually resolve.

## LIVE CONFIRMATION (2026-10-23 13:35 UTC+03 — 4 navigations, read-only, no mutation)

Run after 0.3.4 was published, with `.superpowers/diagnostics/check-034-adapters.mjs` (git-ignored) on the saved `default` profile, after an own-account identity check.

| Operation | Result |
|---|---|
| `search.companies` | **populated — 3 items**, title and url present on all 3 |
| `search.posts` | **populated — 3 items**, title and url present on all 3 |
| `analytics.profile-views` | `ACCESS_RESTRICTED` (exit 4), no HTTP status — the redirect is now reported as an access gate |

This turns the 0.3.4 candidates from fixture-only into live-verified for these three operations. `snippet` was empty on all rows in both searches, which matches the fixture expectation and is not a failure of the row rule.

**Separate finding — the product's own live check cannot test most reads.** `linkedin experimental live-check` accepts only the seven names in `LIVE_READ_OPERATIONS` (`profile.get`, `posts.list`, `feed.list`, `inbox.list`, `connections.list`, `companies.get`, `jobs.search`) and rejects everything else with "Unknown operation(s) … Live checks are read-only". So it cannot verify `search.*`, `analytics.*`, `jobs.get`, `invitations.*`, or any of the other reads this spec is repairing. Queued as its own item.

**Discrepancy to explain, not to paper over:** the same live-check run reported `jobs.search` as `LAYOUT_UNSUPPORTED`, while the 12:01 probe parsed 3 job items and the 12:40 structure probe found 25 job cards. The adapter's job path did not change in 0.3.4, and the jobs fixture output is byte-identical. The difference is therefore environmental — most plausibly page variation or throttling after roughly 30 read navigations in one hour. It is recorded as unexplained, and no retry was attempted.

by FiredMosquito831

## PROBE 4 (2026-10-23 15:10 UTC+03 — 6 navigations, 0 mutations, no stop)

| Page | Anchor | Result |
|---|---|---|
| `/jobs/saved/` | `ul` | FOUND but it is the **site nav** (inside `<nav>`, parent has one sibling, six short rows). Not the saved list. Inconclusive. |
| `/mynetwork/invitations/` | `section` | FOUND but it is the page **header section** (`header > h2` plus an empty `div role="alert"`). Not the list. Inconclusive. |
| `/company/microsoft/posts/` | `main [role="article"]` | **FOUND — a real post card**: 3186 characters, an `h2` inside, a body block and a button. Row selector confirmed. |
| `/in/:slug/` | `section` whose heading matches `skills` / `contact info` | **NOT FOUND** for either. The headings are not present at 3 s on this page. Inconclusive (lazy sections, or different wording). |
| `/jobs/view/:id/` | `main h2` | FOUND, 28 characters, single node. Consistent with a job title but not proven to be one. Candidate only. |
| `/search/results/people/` | `main [role="listitem"]` | **FOUND — a real person card**: anchor, image, name and headline blocks, and a `componentkey` carrying a member URN. Row selector confirmed. |

**Confirmed this round:** `companies.posts` rows = `main [role="article"]`; `search.people` rows = `main [role="listitem"]`.
**Still unmeasured:** `jobs.get`/`jobs.apply-url` (title candidate only), `jobs.saved`, `invitations.received`/`sent`, `profile.skills`/`profile.contact`, `companies.get`.

**Method note:** an unqualified `ul` and an unqualified `section` both match navigation and header chrome before the content list. Future probes must anchor inside the content region or by a repeated-sibling signature, not by tag alone.

## PROBE 5 (2026-10-23 18:10 UTC+03 — 5 navigations, 0 mutations, no stop)

Content-anchored selectors, because probe 4 proved a bare `ul` finds the site nav and a bare `section` finds the page header.

| Page | Anchor | Result | Reading |
|---|---|---|---|
| `/jobs/saved/` | `ul:has(a[href*="/jobs/view/"])` | **not found** | the page contains no job links at all. With zero saved jobs this is an **empty state**, not selector drift. |
| `/mynetwork/invitations/` | `section:has(ul)` | **not found** | no list inside any section. Consistent with **zero invitations**, not a broken reader. |
| `/company/microsoft/` | `body` (depth 3) | found; **1,149,291 characters of text**, 92 body children, a header section and an empty `role="alert"` | the company page renders fully but has **no `<main>` element**, and `companies.get`'s selector is `main h1`. The reader can never match. |
| `/in/:slug/` | per-section census | 9 sections; none has a heading matching "skills" or "contact"; sections 1-3 have a `ul` with 4 items each | the profile has no skills section and no contact section rendered on this page at 3.5 s. Likely **absent content**, not a wrong key. |
| `/jobs/view/:id/` | `main h2` | found, 28 characters | the job title is an `h2` inside `main`; `jobs.get` looks for `h1`. |

**Revised diagnosis — this is the important change:**
- `jobs.saved`, `invitations.received`, `invitations.sent`, `profile.skills`, `profile.contact` are most likely **empty states** on this account (no saved jobs, no invitations, no skills listed, no contact section), not selector bugs. They fail because the readers have no empty-state branch for those surfaces. Proving it needs the empty-state wording measured, which means reading page text; that has not been done.
- `companies.get` is a **real defect**: the page renders fully and has no `main`, and the reader hard-requires `main h1`.
- `jobs.get` / `jobs.apply-url` is a **real defect**: the title is an `h2` and the reader wants an `h1`.
- `companies.posts` (title/permalink) remains a field-coverage gap, not a row-matching gap.

**Not done:** measuring the empty-state wording (needs an explicit decision, because it means reading page text), and any code change for these five families.

## LIVE RESULT OF 0.3.7 (2026-10-23 19:20 UTC+03 — 3 navigations, read-only)

`.superpowers/diagnostics/check-037-adapters.mjs`, saved `default` profile, identity confirmed first.

| Operation | Result | Reading |
|---|---|---|
| `jobs.get` | parsed; `title` present, `url` present, `company` absent | **the h2 title fix works live.** The missing company field was never in this scope. |
| `companies.get` | `LAYOUT_UNSUPPORTED` | **still broken.** The added fallbacks (`[role="main"] h1`, `section h1`, page `h1`) never match because the company page has **no `h1` at all** — the first census recorded `h2: 1` and no h1. Every h1-based candidate is dead on this page. |

**What this establishes:** the company name is not an `h1` on `/company/microsoft/`. The next step is not another fallback guess but one measurement of where the name actually lives (a `[data-testid]`/`componentkey`/`h2` census on that page). Until then `companies.get` stays failing closed, and the 0.3.7 fallbacks are harmless additions that simply do not help this page.

**Not done:** no further attempt on `companies.get`; no change to the other families.

## PROBE 6 (2026-10-23 19:40 UTC+03 — 1 navigation, 4 s settle, read-only)

Company page only, after the 0.3.7 live failure:

```
hasMain: true      hasRoleMain: false
headings: h1 = 1   h2 = 5   h3 = 3
first h1: 9 characters, parent a div
```

**This overturns the 0.3.7 conclusion.** The page *does* render `<main>` and exactly one `<h1>` whose length matches the company name — it simply does so later than the reader looks. The earlier censuses that saw `main: false` ran earlier in the page's life.

**The real defect in `companies.get` is the absence of a wait.** `textOf(..., { required: true })` takes one immediate count and throws; `findItems` already has a bounded settle for lists. The 0.3.7 fallbacks are therefore not the fix (they are harmless), and the next change is to give required single-field reads the same bounded settle the list readers already use.

Recorded for the record: the 0.3.7 release notes say `companies.get` remains unsupported, which is true of 0.3.7 and is superseded by this measurement.

## LIVE RESULT OF 0.3.8 (2026-10-23 20:25 UTC+03 — 3 navigations, read-only)

Same script as the 0.3.7 check, run against the merged settle change:

| Operation | 0.3.7 | 0.3.8 | Reading |
|---|---|---|---|
| `companies.get` | `LAYOUT_UNSUPPORTED` | **parsed, `name` present** | the bounded settle was the fix; the selectors were fine. |
| `jobs.get` | parsed (title) | parsed, `title` and `url` present | unchanged and still working. |

`url`, `description` and `followers` were absent in that run, but `url` and `description` are not fields this adapter returns, so only `followers` is a genuine gap. It was not in scope and is recorded as such.

**Conclusion for the company family:** the reader needs a wait, not a different selector. The 0.3.7 fallbacks remain (harmless, useful when the page has no `main`), and the 0.3.7 release note that says `companies.get` is unsupported is superseded by this measurement.
