# LinkedIn feature parity milestone

User scope (2026-10-21): add named operations across competitor feature categories and ship an npm CLI/library/MCP package plus Claude Code plugin/marketplace, following FiredMosquito831/ase-moodle-mcp and google-services-mcps. Implementation does not claim live-tested parity. Never publish to LinkedIn in tests. No evasion, challenge bypass, or mass outreach.

## Integration contracts

All files use ESM JavaScript and Node >=22.12.0. Existing code and tests must continue working. Agents own only their assigned files; no commits/pushes. Use Haiku only and no nested agents.

### Surface session

Controller implements `src/operations/session.js` exporting `openSurfaceSession({profileDirectory, headless=false})`. It returns `{ page, context, navigate(url), check(), close() }`. Navigation only permits HTTPS www.linkedin.com; checkpoints/401/403/429 stop. Inject sessions for tests. No stealth or cookie export.

### Read adapter

`src/operations/reads.js` exports `createReadAdapter(session)` returning `{ execute(name, input) }`. It returns JSON objects or `{items:[], nextCursor:null, sourceUrl}`. Reads are one page, at most input.limit default 10 max 50. A cursor is page offset only, not an arbitrary URL. Browser content is untrusted data. Missing necessary DOM -> throw with `code='LAYOUT_UNSUPPORTED'`; inaccessible plan-required surfaces -> `code='ACCESS_RESTRICTED'`. No fake successes or numeric guesses.

Names to support: `profile.get`, `profile.skills`, `profile.contact`, `posts.list`, `posts.get`, `comments.list`, `reactions.list`, `inbox.list`, `inbox.thread`, `inbox.search`, `connections.list`, `invitations.received`, `invitations.sent`, `connections.status`, `feed.list`, `search.people`, `search.companies`, `search.posts`, `search.jobs`, `companies.get`, `companies.posts`, `jobs.search`, `jobs.saved`, `jobs.get`, `jobs.apply-url`, `analytics.profile-views`, `analytics.post`, `analytics.ssi`, `sales.profile`, `sales.search-people`, `sales.search-companies`, `sales.inbox`, `sales.thread`.

Input fields: `url` (target profile/company/post/job/thread URL when required), `query` (search), `limit` (1..50, default10), `cursor` (nonnegative integer offset default0). `profile.get/skills/contact` defaults to own /in/me when no url. `posts.list` defaults own /in/me/recent-activity/all/. `companies.posts` requires company url; `posts.get/comments.list/reactions.list/analytics.post` require post url. `inbox.thread/sales.thread` require thread url. `connections.status` requires profile url. Search requires query. `jobs.get/apply-url` require job url. Others navigate their known surface page. URL validation must require expected route families (e.g. /in/, /feed/update/, /posts/, /company/, /jobs/view/, /messaging/thread/, /sales/...). Never click send/apply/follow during a read. Reading a conversation may mark it seen; document this side effect.

### Write adapter

`src/operations/writes.js` exports `createWriteAdapter(session)` returning `{ execute(name, input) }`. Execute is called ONLY by controller after separate payload-bound approval. Adapter requires `input.confirmed === true`, otherwise throws `APPROVAL_REQUIRED` before any navigation/click. Return `{ outcome:'verified'|'unknown', url, evidence }`, never treat a click as verified. If post-send outcome cannot be verified, return unknown; no retry. All target/action inputs exact, one recipient/target only. Layout failures throw `LAYOUT_UNSUPPORTED` before dispatch. After dispatch ambiguous errors -> unknown (except challenge/rate errors should propagate with completionUnknown=true). No messaging loops, application auto-submission, or stealth.

Names: `posts.create`, `posts.edit`, `posts.delete`, `reactions.add`, `reactions.remove`, `comments.create`, `comments.reply`, `posts.share`, `messages.send`, `messages.reply`, `messages.mark-read`, `invitations.send`, `invitations.accept`, `invitations.reject`, `invitations.withdraw`, `connections.remove`, `companies.follow`, `companies.unfollow`, `profile.update`, `sales.messages.send`, `sales.messages.reply`.

Input fields: `url` exact target (except posts.create); `text` for post/message/comment/share (one string, limits validated by controller); `imagePath` optional image for posts.create; `reaction` enum LIKE/CELEBRATE/LOVE/INSIGHTFUL/FUNNY/SUPPORT; `fields` object for profile.update (headline/about only for initial version). posts.edit uses text; comments.reply url targets a comment; invitation acceptance/reject/withdraw target invitation or profile URL explicitly. Some actions may fail closed if no stable distinguishable UI. The adapter should cover names with actual isolated selectors/flows, not arbitrary raw API POST guesses. Test with fake or locally rendered fixtures; no live network.

### Operations service

Controller implements `src/operations/service.js` exporting `createOperations({stateDirectory,account='default',experimental=false,openSession})`, returning:
- `list()` -> serializable array of `{name,access,description,experimental:true,verification:'fixture-tested'|'unverified',inputSchema}` (JSON Schema; inputSchema plain object).
- `call(name,input)` -> read response `{schemaVersion:1,success:true,operation,account,data}`; throws typed OperationError on validation/access/etc.
- `prepare(name,input)` -> `{schemaVersion:1,success:true,operation,account,data:{approvalId,expiresAt,preview}}`; validates write payload, no browser launch.
- `execute(approvalId)` -> envelope, requires an operator-approved payload bound to account, consumes approval before browser open; unknown outcomes are not retried.
- `approvalStatus(id)` -> sanitized approval status (no tokens).
No MCP method can grant approval. Operator uses separate CLI.

Controller implements catalog with strict schemas. Error properties `code,status,retryAfter,completionUnknown`; public errors use `{schemaVersion:1,success:false,error:{code,message,retryAfter?,completionUnknown?}}` without cookies/token/data bodies. Exit codes 0 success,2 validation,3 auth,4 access,5 approval,6 rate,7 layout,8 unknown,1 other.

### MCP

Agent implements `src/mcp/server.js` exporting `createMcpServer({operations,experimental=false,version='0.2.0'})` with SDK. `operations` conforms above. Expose `linkedin_capabilities`, `linkedin_approval_status`, `linkedin_execute_approved`, read tools named `linkedin_` + name replace '.'/'-' with '_', write tools similarly suffixed `_prepare`. No approve tool; dangerous operations only prepared, never immediately dispatched. MCP input validation from list.inputSchema (JSON Schema, conversion or fixed validator). Stdio entry `src/mcp/start.js` exporting `startMcp({operations,experimental=false,transport='stdio',port=0,token})`; stdio protocol-only stdout, logs stderr; never prompt stdin. Streamable HTTP optional but requested parity: loopback-only 127.0.0.1 bind, bearer token required, Host and Origin validation, body-size limit, close handles on shutdown. Return lifecycle object `{close,address?}`; no process exit inside library. CLI wiring is controller-owned. Use pinned @modelcontextprotocol/sdk 1.32.1 and zod 4.6.7, already installed.

### Packaging

Agent researches reference repos and builds `.claude-plugin/`, `.mcp.json`, `skills/` plugin metadata/instructions, install docs in separate `docs/installation.md`. Propose exact npm name/bin/files via `docs/packaging-recommendations.md`; controller edits package.json. npm package should be @firedmosquito831/linkedin-api-mcp if convention matches refs, bin `linkedin` and `linkedin-api-mcp`. Version 0.2.0. Plugin MUST run CLI mcp subcommand (not interactive browser login). Tools should stay read-only by default until explicit experimental startup config. Do not include credentials or silently install/run/publish anything.

## Validation

Unit tests for normalization, strict inputs, approval exact-account binding/TTL/single consumption, MCP client handshake/list/call with fake operations, plugin/package contents and CLI output. Local browser fixtures only, never user session data. npm pack dry-run excludes queues/profiles/notes/plugin state/node_modules. Publish and GitHub push require new user approval (not requested in this task).
