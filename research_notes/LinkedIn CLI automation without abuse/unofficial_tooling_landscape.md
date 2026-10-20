# Unofficial LinkedIn tooling landscape

As of 2026-10-20. Scope: tools that read or act on a LinkedIn account outside LinkedIn's official APIs, plus official-API MCP servers found while searching (marked as official).

## Method and limits

- Fetched on 2026-10-20: npm registry JSON, PyPI JSON, GitHub API JSON, GitHub README pages, and linkedin.com pages. Items marked "search summary" come only from WebSearch results and were not fetched.
- Stats: "n/r" = not retrieved. "pushed" = last push to the default branch, per the GitHub API.
- Samples are top results, not a census. npm "linkedin" returned 60 of 6,122 matches. npm "linkedin mcp" returned 40 of 122,634. GitHub topic:linkedin+topic:mcp returned 299 repos (top 18 read). GitHub "linkedin mcp" returned 1,427 (top 17 read). GitHub "linkedin cli" returned 935 (top 15 read). GitHub topic:linkedin returned 4,123 (top 17 read).
- Not checked: source code, issue trackers, commit history, download counts, and the GitHub DMCA dataset.
- No evasion detail is recorded. Where a README advertises stealth, browser-fingerprint or human-like behavior features, that is noted only as a risk signal.

## Landscape table

| Tool | Type | Language | License | Last activity | Stars | Surfaces | Auth | Access | Breakage / restriction notes |
|---|---|---|---|---|---|---|---|---|---|
| [tomquirk/linkedin-api](https://pypi.org/pypi/linkedin-api/json) (PyPI `linkedin-api`) | PyPI; upstream GitHub URL returned 404 on fetch | Python | MIT | PyPI latest 2.3.1, uploaded 2024-11-07 | n/r (repo 404) | profiles, companies, connections, messages (search summary) | username/password | internal Voyager API | PyPI README: "not officially supported", "might violate" ToS, use "at your own risk"; LinkedIn may issue a CHALLENGE the library does not handle |
| [linkedin-api-js](https://registry.npmjs.org/linkedin-api-js) | npm | n/r | MIT | 1.0.0-23, published 2024-08-19 | n/r | not verified | credentials (search summary) | not verified | README: "not in any way affiliated with LinkedIn"; "your account may be banned for using this" |
| [linkedin-private-api](https://registry.npmjs.org/-/v1/search?text=linkedin&size=60) | npm | TypeScript (search summary) | MIT (search summary) | 1.1.2, published 2022-04-28 | n/r | search, profile views, invitations, messaging (search summary) | regular LinkedIn login (search summary) | not verified | stale; listing says the account could be banned (search summary) |
| @florydev/linkedin-api-voyager | npm | n/r | n/r | 1.5.1, published 2026-08-07 | n/r | n/r | n/r | internal Voyager API (registry description) | only the description was read |
| [bcharleson/linkedincli](https://github.com/bcharleson/linkedincli) | GitHub; npm CLI and MCP | TypeScript (inferred) | MIT | pushed 2026-08-22 | 71 | 43 commands: profile, posts, feed, engagement, connections, messaging, search, companies, jobs, analytics | li_at and JSESSIONID cookies (Chrome import on macOS/Linux, or manual) | internal Voyager API | README: "in compliance with LinkedIn's terms of service"; not responsible for restrictions; says LinkedIn invalidates li_at after a non-browser call |
| [Linked-API/linkedin-cli](https://github.com/Linked-API/linkedin-cli) | GitHub; npm CLI | TypeScript (inferred) | MIT | pushed 2026-10-16 | 68 | account, person, company, message, inbox, connection, feed, post, stats, Sales Navigator, workflow | vendor API and identification tokens; vendor-hosted remote browser per connected account | vendor-hosted browser automation | vendor README: not affiliated with LinkedIn; claims per-account limits; "For AI Agents" section tells agents to send feedback without asking the user |
| [stickerdaniel/linkedin-mcp-server](https://github.com/stickerdaniel/linkedin-mcp-server) | GitHub; MCP server (Python) | Python | Apache-2.0 | pushed 2026-10-19; no releases | 3,938 | profile, company, jobs, feed and posts, search, inbox and messages; connect and send_message act on the account | saved browser session (imported from a signed-in browser or entered in a login window), stored locally | browser automation | README: ToS prohibits automated access and can lead to restrictions; moving a session to a new IP triggers a LinkedIn checkpoint; sponsors include Cadenza, Unipile (supporter), proxy vendors |
| [joeyism/linkedin_scraper](https://github.com/joeyism/linkedin_scraper) | GitHub; Python library | Python | GPL-3.0 (GitHub API) vs Apache-2.0 (README): conflict | pushed 2026-04-10 | 4,611 | person and company profiles, company posts, job listings; job search only; no messages | credentials via env vars, or session.json saved after manual login | browser automation (Playwright; v3.0.0 replaced Selenium) | README: comply with LinkedIn ToS; "educational purposes only"; "Rate limited by LinkedIn" error example |
| [GodsScion/Auto_job_applier_linkedIn](https://api.github.com/search/repositories?q=topic:linkedin&sort=stars&order=desc&per_page=50) | GitHub | Python | MIT | pushed 2026-09-11 | 2,958 | job-application automation | n/r | n/r | automates applications; method and account risk not checked |
| [kiryano/Scout](https://api.github.com/search/repositories?q=topic:linkedin&sort=stars&order=desc&per_page=50) | GitHub | Python | MIT | pushed 2026-09-05 | 762 | LinkedIn, TikTok, Twitch, Instagram data; harvests emails from bios; checks them over SMTP | n/r | n/r | high risk by description (email harvesting, SMTP checks); not a model to copy |
| [socai-io/jev-social](https://api.github.com/search/repositories?q=topic:linkedin&sort=stars&order=desc&per_page=50) | GitHub | JavaScript | MIT | pushed 2026-10-12 | 173 | LinkedIn, Instagram, TikTok research | n/r | browser evidence gathering (description) | described as read-only |
| [speedyapply/JobSpy](https://api.github.com/search/repositories?q=topic:linkedin&sort=stars&order=desc&per_page=50) | GitHub | Python | MIT | pushed 2026-10-19 | 4,512 | public job listings from eight boards, including LinkedIn | none (public pages) | scraping, not account automation | adjacent; not account automation |
| linkedin-jobs-scraper (npm 19.0.2, 2026-09-12); linkedin-jobs-api (npm 1.0.7, 2025-07-20) | npm | n/r | n/r | as listed | n/r | public job listings | none | headless browser (description) / n/r | adjacent; public data only |

## Commercial services

| Product | Marketed for LinkedIn | Own-page statement on LinkedIn rules | Verification |
|---|---|---|---|
| Linked API (CLI and MCP rows above) | yes: CLI, MCP, n8n node | README: not affiliated with LinkedIn; per-account limits "prevent LinkedIn policy violations"; remote browser "simulating human-like mouse movements" | verified (GitHub README) |
| Gem ([help article](https://help.gem.com/databases/gem-help-center/extension-warnings-from-linkedin)) | LinkedIn extension for recruiters | article says some customers get LinkedIn warnings even when they only used Gem; says LinkedIn never formally said the extension breaks its rules (search summary) | article returned 404 on fetch; unverified |
| Waalaxy ([blog](https://blog.waalaxy.com/en/account-has-been-restricted-linkedin/)) | yes | presents its tool as staying within safe activity levels; cites weekly caps (search summary) | blog redirected; not fetched; unverified |
| Gojiberry ([compliance blog](https://blog.gojiberry.ai/blog/linkedin-automation-compliance)) | yes | cites a 97% detection rate (search summary) | no traceable source for the figure |
| Salesflow ([2025 guide](https://salesflow.io/blog/the-ultimate-guide-to-safe-linkedin-automation-in-2025)) | yes | says LinkedIn largely looks the other way (search summary); 2026 pieces conflict | unverified |
| Access Automate ([help article](https://help-accessautomate.theaccessgroup.com/en/articles/15382272-what-to-do-if-your-linkedin-account-gets-restricted)) | yes | recovery advice: stop automation, log in without the tool, wait 24-48 hours, restart at lower volume (search summary) | unverified |
| PhantomBuster ([homepage](https://phantombuster.com/)) | not verified | fetch returned only the brand name; no LinkedIn statements | not verified |
| Unipile | API provider; sponsor and supporter of stickerdaniel/linkedin-mcp-server (README) | own pages not fetched | not verified |
| GTM API, LinkFetch, Crispy, Anysite | hosted LinkedIn data or action services behind MCP or API | repo claim: "under 1% of accounts get restricted" (gtm-api; vendor claim) | unverified |

## Existing MCP servers and CLIs

Searches: GitHub topic and keyword searches (API JSON), npm registry search (API JSON), PyPI and MCP-directory searches (search results only). Access column: official = LinkedIn API or OAuth; internal = LinkedIn web (Voyager) endpoints; browser = drives a logged-in browser; vendor = third-party hosted service or relay. "Official" for registry-only packages comes from the description.

### A. GitHub repos with verified stats

| Repo | Kind | Language | License | Last push | Stars | Surfaces | Auth | Access | Breakage / restriction notes |
|---|---|---|---|---|---|---|---|---|---|
| [stickerdaniel/linkedin-mcp-server](https://github.com/stickerdaniel/linkedin-mcp-server) | MCP | Python | Apache-2.0 | 2026-10-19 | 3,938 | profile, company, jobs, posts, search, messages | saved browser session | browser | see landscape table |
| [bcharleson/linkedincli](https://github.com/bcharleson/linkedincli) | CLI + MCP | TypeScript (inferred) | MIT | 2026-08-22 | 71 | 43 commands across profile, posts, feed, engagement, connections, messaging, search, companies, jobs, analytics | li_at and JSESSIONID cookies | internal (Voyager) | see landscape table |
| [Linked-API/linkedin-cli](https://github.com/Linked-API/linkedin-cli) | CLI | TypeScript (inferred) | MIT | 2026-10-16 | 68 | account, person, company, message, inbox, connection, feed, post, stats, Sales Navigator, workflow | vendor tokens | vendor (hosted browser) | see landscape table |
| [Linked-API/linkedapi-mcp](https://api.github.com/search/repositories?q=linkedin+mcp&sort=stars&order=desc&per_page=30) | MCP | TypeScript | MIT | 2026-10-16 | 70 | "operate LinkedIn accounts and pull real-time data" (description) | vendor | vendor | same vendor as the CLI above |
| [gtm-api/linkedin-mcp](https://api.github.com/search/repositories?q=linkedin+mcp&sort=stars&order=desc&per_page=30) | hosted MCP launcher | TypeScript | MIT | 2026-10-19 | 92 | search, connections, messaging, enrichment | vendor-managed | vendor | "vendor claims under 1% of accounts get restricted" (unverified) |
| [eliasbiondo/linkedin-mcp-server](https://api.github.com/search/repositories?q=linkedin+mcp&sort=stars&order=desc&per_page=30) | MCP | Python | MIT | 2026-03-08 | 198 | people, firms, job postings, profile extraction | LinkedIn login (directory summary) | browser (directory summary) | n/r |
| [felipfr/linkedin-mcpserver](https://api.github.com/search/repositories?q=linkedin+mcp&sort=stars&order=desc&per_page=30) | MCP | TypeScript | MIT | 2025-03-28 | 91 | "integrates with the LinkedIn API" (description) | n/r | official (description) | stale since 2025-03 |
| [Dishant27/linkedin-mcp-server](https://api.github.com/search/repositories?q=linkedin+mcp&sort=stars&order=desc&per_page=30) | MCP | TypeScript | MIT | 2026-10-16 | 54 | "integrates LinkedIn's API" (description) | n/r | official (description) | n/r |
| [OpenRecruiterTools/linkedin-toolkit](https://api.github.com/search/repositories?q=topic:linkedin+topic:mcp&sort=stars&order=desc&per_page=30) | MCP + Chrome extension | JavaScript | MIT | 2026-10-09 | 13 | look up and contact people (description) | logged-in browser | browser | "human sign-off" per description |
| [meskhetian/linkedin-applicants-mcp](https://api.github.com/search/repositories?q=linkedin+mcp&sort=stars&order=desc&per_page=30) | MCP | TypeScript | MIT | 2026-10-10 | 28 | applicant lists, CVs, profile data (description) | own Chrome session | browser | personal-data export; "human-style pacing" claim noted as a risk signal |
| [LaGrowthMachine/gtm-system](https://api.github.com/search/repositories?q=linkedin+mcp&sort=stars&order=desc&per_page=30) | Claude skills + MCP | Python | MIT | 2026-10-07 | 45 | Sales Navigator searches; multichannel campaigns (description) | n/r | n/r | vendor link unverified |
| [DigiHold/LinkedGrow](https://api.github.com/search/repositories?q=linkedin+mcp&sort=stars&order=desc&per_page=30) | self-hosted outreach agents (26 MCP tools) | TypeScript | AGPL-3.0 | 2026-10-12 | 36 | outreach (description) | n/r | n/r | n/r |
| [vanshyadav1408/Omentir](https://api.github.com/search/repositories?q=linkedin+mcp&sort=stars&order=desc&per_page=30) | outreach tool ("alternative to HeyReach and Gojiberry") | TypeScript | MIT | 2026-10-18 | 48 | outreach (description) | n/r | n/r | n/r |
| [anysiteio/anysite-mcp-server](https://api.github.com/search/repositories?q=linkedin+mcp&sort=stars&order=desc&per_page=30) | MCP | JavaScript | MIT | 2026-08-06 | 65 | "broad LinkedIn data access and account management" (description) | n/r | third-party API (description) | n/r |
| [frizynn/linkedin-cli](https://api.github.com/search/repositories?q=linkedin+cli&sort=stars&order=desc&per_page=30) | CLI | Python | MIT | 2026-03-09 | 63 | "automating LinkedIn tasks" (description) | n/r | n/r | structure not checked |
| [Rayyan9477/linkedin_mcp](https://api.github.com/search/repositories?q=linkedin+mcp&sort=stars&order=desc&per_page=30) | MCP | Python | none | 2026-03-15 | 28 | job search, applications | n/r | n/r | no license; reuse needs permission |
| [Sharan-Kumar-R/Custom-MCP-Server](https://api.github.com/search/repositories?q=linkedin+mcp&sort=stars&order=desc&per_page=30) | MCP | Python | none | 2025-06-27 | 98 | Instagram, Facebook, LinkedIn profile extraction | n/r | n/r | stale; no license |
| [OneInterface/mcp-linkedin-automtion](https://api.github.com/search/repositories?q=linkedin+mcp&sort=stars&order=desc&per_page=30) | MCP | n/r | n/r | 2025-03-05 | 69 | no description | n/r | n/r | stale; no metadata |
| [zeshuaro/LinkedRW](https://api.github.com/search/repositories?q=topic:linkedin&sort=stars&order=desc&per_page=50) | CLI (resume generator) | Python | MIT | archived; last push 2022-01-02 | 112 | LinkedIn data export to resume | none | file input | archived |
| [lorey/socials](https://api.github.com/search/repositories?q=topic:linkedin&sort=stars&order=desc&per_page=50) | CLI (profile URL to structured data) | Python | NOASSERTION | 2026-04-21 | 55 | profile URLs | none | n/r | n/r |

### B. npm and PyPI listings (registry data; repos mostly not checked)

- **Official API or OAuth:** @humanagencyp/linkedin-mcp 1.0.7 (2026-07-09; posting via the API); @cesteral/linkedin-mcp 1.3.0 (2026-06-10; Marketing API v2, ads); @dev-hitesh-gupta/linkedin-mcp-server 1.0.0 (2026-02-22; official API and OAuth 2.0); @egistr/linkedin-mcp 1.0.0 (2026-07-13; OAuth PKCE); @clickonsearch/linkedin-mcp-server 0.2.0 (2026-10-05; OAuth 2.0); @mj4384963/linkedin-growth-mcp 1.1.0 (2026-10-06; official API per description; no repo link); @cashtokenai/bi-linkedin-mcp 0.1.0 (2026-09-25; official API per description); linkedin-mcp-server 1.0.2 (2025-07-10; OAuth 2.0, single and multi-user; no repo link). Official SDKs for reference: linkedin-api-client 0.3.0 (2023-02-07, "Official JavaScript client library"); node-linkedin 0.5.6 (2017-07-05).
- **Browser:** linkedin-mcp-bridge 1.1.0 (2026-08-26; logged-in browser per description; repo Sabari2005/linkedin-mcp-server); linkedin-posts-hunter-mcp 1.0.3 (2025-10-03; Playwright sign-in and post search; repo kevin-weitgenant/LinkedIn-Posts-Hunter-MCP-Server); @alfe.ai/openclaw-linkedin 0.2.5 (2026-10-19; browser-session tools per description).
- **Vendor relay or hosted:** linkfetch-mcp 0.1.3 (2026-10-09; relays to a hosted service); crispy-mcp 1.1.0 (2026-09-22; relays to a hosted endpoint); @gtm-api/linkedin-mcp 1.3.1 (2026-09-28; launcher for a managed service with 160+ actions); @pipeworx/mcp-linkedin-humblebrag 0.1.3 (2026-09-26; keyless wrapper of a third-party service; provenance unverified).
- **Access unclear from the listing:** linkedin-mcp-tools 4.1.0 (2026-10-17; "unofficial local reader"; repo devag7/linkedin-mcp); linkedin-mcp-runner 1.5.2 (2026-03-28; LiGo; also @iflow-mcp/linkedin-mcp-runner 1.4.8, 2025-10-29); agentic-linkedin 0.1.0 (2026-09-01; claims agents can carry out "any action available to a human user"; a high-risk claim); @maheidem/linkedin-mcp 2.2.0 (2025-11-28); @pullapi/linkedin-scraper-mcp 1.0.0 (2026-03-20); shrinkedin-mcp 0.1.2 (2026-02-26; scraper with session storage); linkedin-buddy 0.0.1 (2026-03-10; MCP, CLI and automation kit; no repo link); @micro-x-ai/mcp-linkedin 0.1.0 (2026-05-06); linkedin-mcp-search 1.0.3 (2026-01-16; job search); linkedin-toolkit-mcp 2.1.1 (2026-09-30; MCP and CLI; no repo link); @kembec/linkedin-mcp-* 0.1.8 (2026-05-21; prebuilt binaries); @luminarylane/linkedin-mcp-server 1.0.50 (2026-08-25; described as using LinkedIn's API; not verified).
- **PyPI (search results only; not fetched):** linkedin-mcp-server; linkedin-scraper-mcp 4.5.2; mcp-server-linkedin 4.25.0 (browser session per search summary); linkedin-mcp-full (OAuth, posting, ads per search summary); linkedin-mcp-local; linkedin-mcp-automation; linkedin-automation-mcp; flin-linkedin-ads-mcp; flin-linkedin-posts-mcp 0.2.8.
- **Directories (search results only):** mcp.so tag "linkedin" (claims 47 entries); glama.ai LinkedIn server pages (letter grades for maintenance and license); lobehub.com LinkedIn pages. A July 2026 comparison (contentin.io, search summary) says no official LinkedIn MCP server or Claude connector exists.

### C. CLI command structure (design comparison only)

- **bcharleson/linkedincli:** top-level `linkedin`; groups profile, posts, feed, engage, connections, messaging, search, companies, jobs, analytics; top-level `login`, `status --verify`, `mcp`. Examples from the README: `linkedin search people --keywords "..."`, `linkedin engage react <post-urn> --type LIKE`, `linkedin connections send <profile-urn>`.
- **Linked-API/linkedin-cli:** top-level `linkedin`; groups account, person, company, message, inbox, connection, feed, post, stats, navigator, workflow, admin; top-level `setup`, `reset`, `feedback`; exit code 3 flags plan-level problems. Example: `linkedin person fetch`.
- **stickerdaniel/linkedin-mcp-server:** MCP server with login flags `--login` and `--import-from-browser`; 20 MCP tools; send_message runs only after user confirmation.
- **Patterns:** noun-verb groups; positional URN arguments; a login-and-verify pair. Write actions (connect, send, post, react) sit beside reads in bcharleson without a stated confirmation step. stickerdaniel gates send_message on confirmation. Linked-API adds a feedback channel that agents are told to use without asking the user.

## 1. Which JavaScript or TypeScript packages on npm implement LinkedIn clients, and which are maintained as of 2026-10?

### Takeaway
Few npm packages implement unofficial LinkedIn account clients, and the two most-cited ones were last published in 2022 and 2024. The only 2026 unofficial client candidate is @florydev/linkedin-api-voyager (published 2026-08-07), and only its description was read.

### Cited Findings
- linkedin-api-js: MIT; latest 1.0.0-23 published 2024-08-19; README says "not in any way affiliated with LinkedIn" and "your account may be banned for using this" — [npm registry](https://registry.npmjs.org/linkedin-api-js)
- linkedin-private-api: 1.1.2 published 2022-04-28; repo eilonmore/linkedin-private-api — [npm registry search](https://registry.npmjs.org/-/v1/search?text=linkedin&size=60). Search summary (not fetched) says MIT, regular-login auth, and a ban warning — [npm listing](https://npmjs.com/package/linkedin-private-api)
- @florydev/linkedin-api-voyager: 1.5.1 published 2026-08-07; description says it is a TypeScript library for LinkedIn's internal Voyager API — [npm registry search](https://registry.npmjs.org/-/v1/search?text=linkedin&size=60)
- Official-API JS clients are stale: linkedin-api-client 0.3.0 (published 2023-02-07, "Official JavaScript client library for LinkedIn APIs") — [npm registry search](https://registry.npmjs.org/-/v1/search?text=linkedin&size=60); linkedin-developers/linkedin-api-js-client last pushed 2024-07-26 — [GitHub API](https://api.github.com/search/repositories?q=topic:linkedin&sort=stars&order=desc&per_page=50)
- Most 2026 npm LinkedIn packages are OAuth or official-API tools, hosted MCP launchers, or public-job scrapers — [npm registry search, "linkedin mcp"](https://registry.npmjs.org/-/v1/search?text=linkedin%20mcp&size=40)

### Inferences
- As of 2026-10-20, the only JS/TS packages in the surveyed set that combine an unofficial method with a 2025-2026 publish are @florydev/linkedin-api-voyager (description only) and the vendor-hosted @linkedapi/linkedin-cli.

### Gaps
- npm search is capped (60 of 6,122 for "linkedin"). Download counts were not verified. linkedin-api-js did not appear in the first 60 results. The @florydev repo was not read. License and language for linkedin-private-api come from a search snippet.

## 2. Which projects call LinkedIn's internal web API, and which drive a browser? What does each cover, and how often does it break?

### Takeaway
Internal-API clients (Voyager) and browser-driven tools are both present. Breakage frequency cannot be measured from these sources. Only last-activity dates and README-stated failure modes were checked.

### Cited Findings
- Internal Voyager API: bcharleson/linkedincli uses "LinkedIn's internal Voyager API, not an official public one" — [repo](https://github.com/bcharleson/linkedincli). tomquirk/linkedin-api is Voyager-based (search summary); PyPI latest 2024-11-07 — [PyPI JSON](https://pypi.org/pypi/linkedin-api/json). @florydev/linkedin-api-voyager (2026-08-07, description) — [npm registry search](https://registry.npmjs.org/-/v1/search?text=linkedin&size=60)
- Browser-driven: stickerdaniel/linkedin-mcp-server drives a browser session with 20 tools, last pushed 2026-10-19 — [repo](https://github.com/stickerdaniel/linkedin-mcp-server). joeyism/linkedin_scraper uses Playwright and replaced Selenium in v3.0.0, last pushed 2026-04-10 — [repo](https://github.com/joeyism/linkedin_scraper). linkedin-posts-hunter-mcp uses Playwright (2025-10-03) — [npm registry search, "linkedin mcp"](https://registry.npmjs.org/-/v1/search?text=linkedin%20mcp&size=40)
- README-stated failure modes: tomquirk says a CHALLENGE is not handled — [PyPI JSON](https://pypi.org/pypi/linkedin-api/json). bcharleson says LinkedIn invalidates li_at on the first Voyager call from a client that does not match Chrome's TLS signature — [repo](https://github.com/bcharleson/linkedincli). stickerdaniel says a session moved to a new IP triggers a checkpoint — [repo](https://github.com/stickerdaniel/linkedin-mcp-server). joeyism shows a "Rate limited by LinkedIn" error example — [repo](https://github.com/joeyism/linkedin_scraper)
- The upstream tomquirk/linkedin-api GitHub repo returned HTTP 404 on both the HTML page and the API endpoint on 2026-10-20 — [GitHub API](https://api.github.com/repos/tomquirk/linkedin-api), while PyPI still lists it as the repository — [PyPI JSON](https://pypi.org/pypi/linkedin-api/json)
- bcharleson also describes an opt-in transport that imitates a browser's TLS fingerprint. This is a detection-avoidance feature and is recorded only as a risk signal.

### Inferences
- Any Voyager client depends on undocumented endpoints, so breakage is driven by LinkedIn changes. Browser clients depend on page structure and login flow. Last-push dates are not proof that a tool works today.

### Gaps
- No GitHub issue or commit-history review. Breakage frequency is unknown. The cause of the tomquirk 404 is unknown (deleted, renamed, or made private).

## 3. What authentication approaches appear, and what failure modes do users report (checkpoints, verification challenges, locked accounts)?

### Takeaway
Four auth patterns appear: username and password, reused session cookies (li_at, JSESSIONID), a saved browser session, and OAuth 2.0 with the user's own developer app (official). The failure modes cited are README-level (checkpoints, challenges, session invalidation). No independent, dated report of a locked account tied to a specific tool was verified.

### Cited Findings
- Credentials: joeyism reads LINKEDIN_EMAIL and LINKEDIN_PASSWORD from env vars — [repo](https://github.com/joeyism/linkedin_scraper). linkedin-api-js uses credentials (search summary) — [npm registry](https://registry.npmjs.org/linkedin-api-js)
- Cookies: bcharleson takes li_at and JSESSIONID from Chrome on macOS/Linux or manual entry — [repo](https://github.com/bcharleson/linkedincli)
- Saved browser session: stickerdaniel imports the session from a signed-in browser or opens a login window; the session is stored under the user's home directory — [repo](https://github.com/stickerdaniel/linkedin-mcp-server). joeyism saves session.json after manual login — [repo](https://github.com/joeyism/linkedin_scraper)
- OAuth 2.0 with own app: @dev-hitesh-gupta/linkedin-mcp-server, @egistr/linkedin-mcp (PKCE), linkedin-mcp-server 1.0.2 — [npm registry search, "linkedin mcp"](https://registry.npmjs.org/-/v1/search?text=linkedin%20mcp&size=40)
- Vendor-held tokens: Linked API issues an API token and an identification token; the vendor runs a remote browser per account — [repo](https://github.com/Linked-API/linkedin-cli)
- README-level failure modes: tomquirk notes CHALLENGE, 2FA, and rate limits, and advises against using a personal account — [PyPI JSON](https://pypi.org/pypi/linkedin-api/json). stickerdaniel notes checkpoints after IP change — [repo](https://github.com/stickerdaniel/linkedin-mcp-server)
- LinkedIn's own help: restrictions "may be restricted either temporarily or indefinitely"; automated inauthentic activity "can result in temporary or permanent restriction of your account" — [LinkedIn help a1340522](https://www.linkedin.com/help/linkedin/answer/a1340522). Tools "may become non-operational without notice" — [LinkedIn help a1341387](https://www.linkedin.com/help/linkedin/answer/a1341387/prohibited-software-and-extensions?lang=en)
- Directory summary (not fetched): browser-login setups need periodic re-login — [glama.ai search results](https://glama.ai/mcp/servers/aarnav-hariramani/linkedin-mcp)

### Inferences
- Credential and cookie designs put LinkedIn's login and challenge flows in the path of every call. Only the OAuth path is documented by LinkedIn.

### Gaps
- No dated user report of a locked account tied to a specific tool was verified. Restriction tiers appear mainly in vendor blogs (Access Automate, Waalaxy) that were not fully checked.

## 4. Which of these are shipped as command-line tools, and what does their command structure look like? (design comparison only)

### Takeaway
bcharleson/linkedincli (43 commands in 10 groups, plus login, status and mcp) and Linked-API/linkedin-cli (12 groups, plus setup, reset and feedback) are the two verified CLIs. stickerdaniel/linkedin-mcp-server is an MCP server with login flags. Structures are summarized in the MCP and CLI section above.

### Cited Findings
- bcharleson command groups and examples — [repo](https://github.com/bcharleson/linkedincli)
- Linked-API command groups; setup and reset manage stored tokens; exit code 3 — [repo](https://github.com/Linked-API/linkedin-cli)
- stickerdaniel login flags and 20 tools — [repo](https://github.com/stickerdaniel/linkedin-mcp-server)
- CLI search results: [GitHub API, "linkedin cli"](https://api.github.com/search/repositories?q=linkedin+cli&sort=stars&order=desc&per_page=30)

### Inferences
- Noun-verb groups with URN arguments and a login-and-verify pair are common. A design choice to separate reads from write actions, and to gate writes on confirmation, is visible in stickerdaniel and missing in bcharleson's README. A feedback channel that sends run details to a vendor without asking is a data-sharing risk in Linked-API.

### Gaps
- Command behavior was not run or tested. frizynn/linkedin-cli structure was not checked.

## 5. Are there dated reports of account restrictions linked to these tools, or of takedown or cease-and-desist actions against them, such as GitHub DMCA notices?

### Takeaway
The verified enforcement evidence is LinkedIn's own statements. On 2025-07-28 LinkedIn said it had "successfully resolved" its lawsuit against Proxycurl, naming only Proxycurl and giving no court, case number, injunction terms or damages. Secondary sources report a 2026 permanent order against ProAPIs and its co-founder, and a 2025 Proxycurl shutdown. These are not verified against dockets. No LinkedIn-related GitHub DMCA notice was found. No independent, dated account-restriction report tied to a specific tool was verified.

### Cited Findings
- LinkedIn's post (2025-07-28): "LinkedIn has successfully resolved its lawsuit against Proxycurl." No court, case number, injunction or damages stated — [LinkedIn news](https://news.linkedin.com/2025/LinkedInWinsLegalBattleToProtectMemberData)
- Proxycurl shutdown in 2025 — [StartupHub](https://www.startuphub.ai/ai-news/startup-news/2025/the-1-linkedin-scraping-startup-proxycurl-shuts-down). A search summary attributes a July 2025 wind-down to Bloomberg Law — [Bloomberg Law](https://news.bloomberglaw.com/artificial-intelligence/linkedins-war-against-bot-scrapers-ramps-up-as-ai-gets-smarter). A search summary says a Bright Data page dates the shutdown to July 4, 2026, which conflicts — [Bright Data](https://brightdata.com/blog/web-data/proxycurl-alternatives.md)
- Proxycurl injunction and case caption (LinkedIn Corp. v. Nubela Pte. Ltd., 3:25-cv-00828, N.D. Cal.): from a vendor guide in search results, not from a docket — [linkedapi.io guide](https://linkedapi.io/guides/proxycurl-alternatives)
- ProAPIs and co-founder: a blog reports a permanent order "reportedly finalized September 21, 2026" in case 5:25-cv-08393 (N.D. Cal.), opened October 2025; cites The Record, not checked — [gblock](https://www.gblock.app/articles/linkedin-proapis-scraping-injunction-2026). Headlines: [itnews](https://www.itnews.com.au/news/qr-code-provider-exposes-customers-to-phishing-attacks-620843); [TecnetOne](https://blog.tecnetone.com/en-us/linkedin-sues-proapis-for-scraping-1m-fake-accounts)
- GitHub DMCA: searches returned no LinkedIn-related notice. GitHub's process pages were seen in search results only — [GitHub DMCA policy](https://docs.github.com/en/site-policy/content-removal-policies/dmca-takedown-policy); transparency data — [GitHub transparency center](https://transparencycenter.github.com/dmca)
- Account restriction anecdotes and vendor claims (undated or vendor-authored): a single user reports three bans — [Indie Hackers](https://www.indiehackers.com/post/my-linkedin-account-got-banned-3-times-heres-what-i-learned-about-safe-automation-d2447ed6c0). A third-party article says LinkedIn checked more than 25 extensions and names Hunter and Lusha; penalties unconfirmed; about 2,000 days old by search metadata — [LinkedIn Pulse](https://www.linkedin.com/pulse/complete-list-prohibited-linkedin-plugins-michael-moynahan). Gem's help article reports customer warnings (404 on fetch; search summary only)
- LinkedIn's rules: Section 8.2 "Don'ts" prohibits "software, devices, scripts, robots or any other means or processes (such as crawlers, browser plugins and add-ons...)" to scrape or copy the Services, and "bots or other unauthorized automated methods" — [User Agreement](https://www.linkedin.com/legal/user-agreement), effective November 3, 2025. Help article: members "risk having their accounts restricted or shut down" — [a1341387](https://www.linkedin.com/help/linkedin/answer/a1341387/prohibited-software-and-extensions?lang=en)

### Inferences
- Enforcement so far is aimed at data scraping at scale and fake accounts (Proxycurl, ProAPIs). The User Agreement's Section 8.2 covers any bot or automated access, so individual tools carry the same policy exposure.
- The search summary said a LinkedIn help article describes bot-like activity; the fetched page does not mention bots. Use the page text.

### Gaps
- Docket verification of Proxycurl and ProAPIs is missing. Headlines were not checked for "Mantheos" settlement (lawstreetmedia) or the hiQ appellate coverage; both are undated here. The GitHub DMCA dataset was not scanned. No Reddit or GitHub-issue reports of restrictions were pulled.

## 6. Which commercial automation products are marketed for LinkedIn, and what do their own pages say about LinkedIn's rules?

### Takeaway
The commercial category is large and mostly unverified. The only vendor page with a verified LinkedIn-rules statement is Linked API's README, which says it is not affiliated with LinkedIn and claims per-account limits and human-like input simulation. Gem, Waalaxy, Gojiberry, Salesflow and Access Automate appear only as search results. PhantomBuster's homepage fetch returned no body text.

### Cited Findings
- Linked API README: not affiliated; "Configurable per-account action limits on the platform prevent LinkedIn policy violations"; remote browser "simulating human-like mouse movements" — [repo](https://github.com/Linked-API/linkedin-cli)
- Gem: help article says some customers get LinkedIn warnings though they used only Gem; the article returned 404 on fetch — [Gem help](https://help.gem.com/databases/gem-help-center/extension-warnings-from-linkedin) (search summary)
- Waalaxy: presents its tool as staying within "safe activity levels"; reports conflicting weekly caps (100 per day, or 100 per week) — [Waalaxy blog](https://blog.waalaxy.com/en/account-has-been-restricted-linkedin/) (search summary; redirect not followed)
- Gojiberry: cites a 97% detection rate with no traceable source — [Gojiberry](https://blog.gojiberry.ai/blog/linkedin-automation-compliance) (search summary)
- Access Automate: recovery advice (stop, log in without the tool, wait 24-48 hours, restart at reduced volume) — [Access Automate](https://help-accessautomate.theaccessgroup.com/en/articles/15382272-what-to-do-if-your-linkedin-account-gets-restricted) (search summary)
- PhantomBuster homepage fetch returned only "PhantomBuster" — [homepage](https://phantombuster.com/)
- Hosted vendors in the MCP set: GTM API, LinkFetch, Crispy, Anysite (descriptions only)

### Inferences
- "Safe automation" vendors rely on stated limits that conflict across sources. Treat specific caps as unverified.

### Gaps
- Most vendor pages were not fetched in full (PhantomBuster body missing; Gem 404; Waalaxy redirect not followed). Unipile's own pages were not checked. HeyReach was named only in a repo description.
