# LinkedIn official API capabilities: member and company-page surfaces (as of 2026-10-20)

Method: every claim cites an official LinkedIn or Microsoft Learn page that was fetched on 2026-10-20. Dates are each page's published date (ms.date) and last-updated date (updated_at) from its metadata. The developer product catalog is undated (footer reads "2026"). Three items come from Context7 index snippets that were not fetched, and they are labeled as such. WebSearch ran in standard mode only. Blogs, aggregators and unofficial tools were excluded. The run used about 29 tool calls, above the roughly-15 guideline, because the surface list needed page-level checks. Where official pages disagree, both versions are listed under Source conflicts in Key Question 1.

Access labels used below:
- OPEN: self-serve from the Developer Portal Products tab. No review step appears on the pages read.
- PARTNER: LinkedIn-approved partner or API agreement required.
- VETTED: Community Management API. Registered legal organizations only. Development tier first, then Standard tier.
- CLOSED: LinkedIn is not accepting access requests.
- NO OFFICIAL API: no official endpoint found on the pages checked.

## Key Question 1: Which products does the developer portal offer today, and which are open versus restricted?

### Takeaway
Two products are OPEN to any developer: Sign in with LinkedIn using OpenID Connect (openid, profile, email) and Share on LinkedIn (w_member_social). Advertising, Community Management, the Talent and Sales programs, and the Messages, Invitations, Connections and Profile APIs need LinkedIn approval. Compliance is closed. An individual developer therefore has official access to sign-in and posting only. Every other surface is partner-gated, vetted for legal organizations, closed, or has no official API.

### Cited Findings
- Portal product list: Consumer (Verified on LinkedIn, Sign in with LinkedIn, Share on LinkedIn, Live Events, Add to Profile); Marketing Tools (Advertising, Community Management, Data Integrations, Events); Sales (Sales Display); Talent (Apply Connect, Apply with LinkedIn, Job Posting, Recruiter System Connect, Talent Hub); Plugins (Follow Company, LinkedIn AutoFill, Share); Regulatory Developer Products (Pages Data Portability, Member Data Portability). The catalog gives no access tiers or scopes. [Developer product catalog](https://developer.linkedin.com/product-catalog) (undated; WebFetch summary, not checked line by line).
- "Open Permissions are the only permissions that are available to all developers without special approval." The open list is profile and email (Sign in with LinkedIn using OpenID Connect) and w_member_social (Share on LinkedIn), each "may be added via self-service ... under the Products tab." [Getting Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access) (published 2025-06-24; updated 2026-06-03).
- Approval required: Advertising API ("must be approved"; apply through the portal), Sales SNAP (approved SNAP partners only), and Talent programs (Recruiter System Connect, Apply Connect, Apply with LinkedIn, Premium Job Posting). [Getting Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access) (same dates).
- Compliance permissions r_compliance and w_compliance: "Access is closed and may not be requested." [Getting Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access) (same dates).
- Community Management: "Vetted Product with development and standard tiers." [Community Management overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview) (published 2026-03-31; updated 2026-05-15).
- r_member_social: "is a closed permission. We're not accepting access requests at this time due to resource constraints." [Community Management overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview) (same dates).
- r_member_social_feed: "This permission is granted to select developers only." [Reactions API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/reactions-api) (published 2026-04-28; updated 2026-06-24).
- Profile API: "The use of this API is restricted to those developers approved by LinkedIn." [Profile API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/profile-api) (published 2023-02-15; updated 2026-04-30).
- Connections API: "The use of this API is restricted to those developers approved by LinkedIn." [Connections API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/connections-api) (published 2021-05-31; updated 2022-04-06).
- Invitations API and Messages API: "Usage of this API is restricted to approved partners, subject to limitations via API agreement." [Invitations API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/invitations) (published 2021-05-31; updated 2022-04-06); [Messages API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/messages) (published 2019-11-20; updated 2023-12-20).

### Inferences
- An individual's official surface is sign-in plus posting. Reactions and comments may also be OPEN, but that is unresolved (Key Question 2).
- Community Management cannot back an individual's app. It is limited to "registered legal organizations for commercial use cases only" (Key Question 8).

### Gaps
- The catalog page gives no access tiers or scopes. The tier labels here come from the Getting Access page, which does not detail Community Management endpoints or scopes.
- Not verified: Advertising API scope names and endpoints (the permissions table that Getting Access links to was not fetched); Member Data Portability (regulatory product, no documentation fetched); Pages Data Portability (Context7 snippet only, from [DMA Pages Data Portability overview](https://learn.microsoft.com/en-us/linkedin/dma/pages-data-portability/pages-data-portability-overview), not fetched, undated, which says member data is returned only if the member opts in); the recent-changes changelog; LinkedIn's official GitHub sample repositories.

### Capability matrix: member case (own account)

| Surface | Official coverage | Product and scopes | Endpoints | Access and review | Version header and limits | Source |
|---|---|---|---|---|---|---|
| Create posts | Yes | Share on LinkedIn; `w_member_social` | `POST https://api.linkedin.com/rest/posts`, author `urn:li:person:{id}` | OPEN; no review step on pages read | `Linkedin-Version: YYYYMM` (latest 202610) and `X-Restli-Protocol-Version: 2.0.0`; no published quota | [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api); [Share on LinkedIn](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin) |
| Edit posts | Yes (commentary, CTA label, landing page, lifecycle state) | `w_member_social` (scope for updates not named) | `POST /rest/posts/{urn}` with `X-RestLi-Method: PARTIAL_UPDATE` | OPEN if `w_member_social` governs | Same as create | [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api) |
| Delete posts | Yes | `w_member_social` (not named) | `DELETE /rest/posts/{urn}`; returns 204; no batch delete | OPEN if `w_member_social` governs | Same as create | [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api) |
| Read own posts | Partial | One post by URN: no scope named. Listing all own posts: `r_member_social` | `GET /rest/posts/{urn}?viewContext=AUTHOR`; `GET /rest/posts?author=urn:li:person:{id}` | Listing: CLOSED | Same headers | [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api); [Community Management overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview) |
| Own post and follower analytics | No open route | Member Analytics (Post Statistics, Follower Statistics, Video Analytics) sit inside Community Management | Not fetched | VETTED; legal organizations only | CM Development tier: 500 requests per app and 100 per member (window not restated) | [Community Management overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview) |
| Like or react | Yes; tier unresolved | `w_member_social` (Getting Access and Posts API say "comment and like") or `w_member_social_feed` (Reactions API) | `POST /rest/reactions?actor=urn:li:person:{id}` with `{root, reactionType}`; `DELETE /rest/reactions/(actor:...,entity:...)` | OPEN if `w_member_social` governs; not confirmed | Same headers; no published quota | [Reactions API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/reactions-api); [Getting Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access) |
| Comment and reply | Yes; tier unresolved | Same scope question; Comments API names `w_member_social_feed` | `POST /rest/socialActions/{postUrn}/comments` (`parentComment` for replies); edit via `PARTIAL_UPDATE` (text only); `DELETE` | As above | Per-member 1-minute creation throttle (429); number not published | [Comments API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/comments-api) |
| Read feed or other members' posts | NO OFFICIAL API for individuals | `r_member_social` (CLOSED); `r_member_social_feed` (select developers) | None | CLOSED or restricted | n/a | [Community Management overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview); [Reactions API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/reactions-api) |
| Read direct messages | NO OFFICIAL API for individuals | No read endpoint on the Messages page; Compliance Events API uses `r_compliance` (CLOSED) | n/a | n/a | n/a | [Messages API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/messages); [Getting Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access) |
| Send DM or reply in thread | PARTNER only | Messages API; scope not named | `POST https://api.linkedin.com/v2/messages` (`recipients` to start, `thread` to reply) | PARTNER; API agreement; member-initiated sends only | Unversioned v2 path; no published quota | [Messages API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/messages) |
| Read basic profile | Yes | OIDC: `openid`, `profile`, `email` (OPEN). Legacy: `r_basicprofile` or `r_liteprofile` (restricted) | `GET https://api.linkedin.com/v2/userinfo` (OIDC); `GET https://api.linkedin.com/v2/me` (legacy) | OPEN for OIDC; Profile API restricted | Unversioned v2 path; no published quota | [Sign In with OIDC](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2); [Profile API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/profile-api) |
| Edit profile fields (headline, about, experience, education, skills, photo) | NO OFFICIAL API | Profile API is read-only in the docs | n/a | n/a | n/a | [Profile API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/profile-api) |
| Connections (own 1st-degree) | Yes; partner-gated | `r_1st_connections` (or `r_compliance`) | `GET https://api.linkedin.com/v2/connections?q=viewer` | PARTNER (approved developers) | Unversioned v2 path; no published quota | [Connections API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/connections-api) |
| Invitations (send, accept, withdraw, list) | Yes; partner-gated | Scope not named | `POST https://api.linkedin.com/v2/invitations`; `GET ...?q=invitee` or `?q=inviter`; `POST ...?action=inviteeClosingInvitation` or `inviterClosingInvitation` | PARTNER | Unversioned v2 path; no published quota | [Invitations API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/invitations) |
| Notifications | NO OFFICIAL API found | None | n/a | n/a | n/a | No page found (Key Question 5) |
| People search | NO OFFICIAL API found for individuals | People Typeahead and page-follower search exist only inside Community Management | n/a | n/a | n/a | [Community Management overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview) |

### Capability matrix: company-page case (admin)

| Surface | Official coverage | Product and scopes | Endpoints | Access and review | Version header and limits | Source |
|---|---|---|---|---|---|---|
| Create, edit, delete page posts | Yes | Community Management; `w_organization_social` (roles ADMINISTRATOR, DIRECT_SPONSORED_CONTENT_POSTER, CONTENT_ADMIN) | `POST /rest/posts` with author `urn:li:organization:{id}`; `PARTIAL_UPDATE`; `DELETE` | VETTED: legal organization; Development tier, then Standard tier with a screencast | Linkedin-Version plus Restli 2.0.0; CM Development: 500 requests per app, 100 per member | [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api); [CM App Review](https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review) |
| Read page posts | Yes | `r_organization_social` (same roles) | `GET /rest/posts?author=urn:li:organization:{id}` | VETTED | Same as above | [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api) |
| Page analytics (follower, page, share, social metadata, video) | Yes | `r_organization_admin` (reporting data, including follower, visitor and content analytics) | Follower, Page and Share Statistics; Social Metadata; Video Analytics (paths not fetched) | VETTED | Same as above | [Organization Access Control](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-access-control-by-role); [CM overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview) |
| React and comment as the page | Yes | `w_organization_social_feed` (ADMINISTRATOR, DIRECT_SPONSORED_CONTENT_POSTER, RECRUITING_POSTER); read: `r_organization_social_feed` | `POST /rest/reactions?actor=urn:li:organization:{id}`; comments with org `actor` | VETTED (inferred; tier not stated on the page) | Same as above | [Reactions API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/reactions-api); [Comments API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/comments-api) |
| Company page details (read) | Yes | Not verified | Organization Lookup API (not fetched) | VETTED | n/a | [CM overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview) |
| Admins and roles | Yes | `r_organization_admin` (read); `rw_organization_admin` (write; ADMINISTRATOR only) | `GET /rest/organizationAcls?q=organization&organization={urn}&role=ADMINISTRATOR&state=APPROVED`; `GET /rest/organizationAcls?q=roleAssignee`; `PUT` to request DIRECT_SPONSORED_CONTENT_POSTER for oneself only | VETTED (tier of `r_organization_admin` not stated) | Same as above | [Organization Access Control](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-access-control-by-role) |
| Edit page information | Yes (Organizations and Brand APIs) | `rw_organization_admin` (ADMINISTRATOR) | Not fetched | VETTED | Same as above | [CM overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview) |
| Advertising campaigns | Yes | Advertising API; scope names not verified | Versioning example uses `/rest/adCampaigns` | PARTNER: apply through the portal; audiences need approved-partner status | `Linkedin-Version` (example 202601); no published quota | [Getting Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access); [Marketing Versioning](https://learn.microsoft.com/en-us/linkedin/marketing/versioning) |

Token rules apply to every row. See Key Question 7.

### Source conflicts to resolve
1. Reacting and commenting scope. [Getting Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access) (updated 2026-06-03) and [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api) (updated 2026-05-13) say w_member_social covers comment and like. [Reactions API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/reactions-api) (updated 2026-06-24) and [Comments API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/comments-api) (updated 2026-04-30) name w_member_social_feed instead, and neither states its access tier.
2. Member rate limits. [Share on LinkedIn](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin) (updated 2023-12-14) publishes 150 requests per member per day and 100,000 per app per day. [Rate Limiting](https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits) (updated 2025-08-20) says standard limits are not published.
3. Profile scope. [Profile API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/profile-api) says use is restricted to approved developers. [Getting Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access) lists profile as open and describes it as name, headline and photo. [Sign In with OIDC](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2) describes it as lite profile (id, name, picture).
4. Community Management scope. [CM overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview) lists "Profile Management" (posts, comments and reactions on individual profiles), yet the same program is limited to legal organizations.
5. Role names differ. [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api) lists CONTENT_ADMIN. [Organization Access Control](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-access-control-by-role) lists CONTENT_ADMINISTRATOR. [Reactions API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/reactions-api) lists RECRUITING_POSTER for w_organization_social_feed, which Posts API does not list for w_organization_social.
6. Comments and socialActions. [Reactions API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/reactions-api) says it replaces likes on socialActions. [CM overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview) says Social Metadata replaces socialActions. [Comments API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/comments-api) still documents comments on socialActions.
7. Version status. [Migrations](https://learn.microsoft.com/en-us/linkedin/marketing/integrations/migrations) (updated 2026-10-14) gives 202510 a sunset date of 2026-10-15, which had passed by 2026-10-20, but its status still reads "Deprecated."

### Source register
- Developer product catalog: https://developer.linkedin.com/product-catalog (undated; WebFetch summary)
- Getting Access: https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access (published 2025-06-24; updated 2026-06-03)
- Authorization Code Flow: https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow (published 2025-11-10; updated 2026-05-15)
- Rate Limiting: https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits (published 2025-06-18; updated 2025-08-20)
- Share on LinkedIn: https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin (published 2021-02-05; updated 2023-12-14)
- Sign In with OpenID Connect: https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2 (published 2022-12-14; updated 2024-08-08)
- Community Management overview: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview (published 2026-03-31; updated 2026-05-15)
- Community Management App Review: https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review (published 2023-01-10; updated 2026-02-11)
- Posts API: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api (published 2026-05-07; updated 2026-05-13)
- Reactions API: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/reactions-api (published 2026-04-28; updated 2026-06-24)
- Comments API: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/comments-api (published 2026-04-28; updated 2026-04-30)
- Profile API: https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/profile-api (published 2023-02-15; updated 2026-04-30)
- Restricted Uses of Marketing APIs and Data: https://learn.microsoft.com/en-us/linkedin/marketing/restricted-use-cases (published 2022-12-09; updated 2025-08-29)
- Marketing API Versioning: https://learn.microsoft.com/en-us/linkedin/marketing/versioning (published 2026-10-15; updated 2026-10-14)
- Migrations: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/migrations (published 2026-10-15; updated 2026-10-14)
- Organization Access Control by Role: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-access-control-by-role (published 2026-04-29; updated 2026-04-30)
- Messages API: https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/messages (published 2019-11-20; updated 2023-12-20)
- Invitations API: https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/invitations (published 2021-05-31; updated 2022-04-06)
- Connections API: https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/connections-api (published 2021-05-31; updated 2022-04-06)
- Context7 snippets, not fetched, dates not captured: DMA Pages Data Portability overview (https://learn.microsoft.com/en-us/linkedin/dma/pages-data-portability/pages-data-portability-overview); Talent CRM InMail history (https://learn.microsoft.com/en-us/linkedin/talent/crm-connect/crm-inmail-history); Talent versioning (https://learn.microsoft.com/en-us/linkedin/talent/versioning)

## Key Question 2: Which OAuth scopes apply to posting as a member, reacting, commenting, and reading the signed-in member's basic identity?

### Takeaway
Posting as a member uses w_member_social, which is OPEN. Reading the signed-in member's identity uses openid, profile and email, which are OPEN. Reacting and commenting are listed under w_member_social in the Posts API and Getting Access pages, but under w_member_social_feed in the Reactions and Comments pages. That conflict is unresolved. Bulk reads of one's own posts, comments or reactions need r_member_social (CLOSED) or r_member_social_feed (select developers).

### Cited Findings
- w_member_social is "Required to create a LinkedIn post on behalf of the authenticated member." Adding the Share on LinkedIn product "will grant you w_member_social." [Share on LinkedIn](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin) (published 2021-02-05; updated 2023-12-14).
- Getting Access lists w_member_social as open, described as "Post, comment and like posts on behalf of an authenticated member." [Getting Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access) (updated 2026-06-03).
- Posts API: w_member_social is "Post, comment, and like posts on behalf of an authenticated member." r_member_social is "restricted and is available to approved users only." [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api) (updated 2026-05-13).
- Reactions API: w_member_social_feed is "Post, comment, and react to posts on behalf of an authenticated member." r_member_social_feed is "Restricted" and "granted to select developers only." [Reactions API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/reactions-api) (updated 2026-06-24). The Comments API uses the same two names [Comments API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/comments-api) (updated 2026-04-30). Neither page states an access tier for w_member_social_feed, and it is not on the open list.
- Identity: openid gives an ID token (JWT). profile is "the member's lite profile including their id, name, and profile picture." email is the primary email address. [Sign In with OIDC](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2) (published 2022-12-14; updated 2024-08-08).
- Userinfo: `GET https://api.linkedin.com/v2/userinfo` returns sub, name, given_name, family_name, picture, locale, and the optional email and email_verified. Discovery document: https://www.linkedin.com/oauth/.well-known/openid-configuration. [Sign In with OIDC](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2).
- "Sign In with LinkedIn using OpenID Connect does not verify user identities and should not be marketed as such." [Sign In with OIDC](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2).
- The Share page gets the author URN from OIDC: "See Sign In with LinkedIn using OpenID Connect to see how to retrieve the Person URN." [Share on LinkedIn](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin).
- Legacy scopes r_basicprofile (name, photo, headline, vanity name) and r_liteprofile (name and photo) are documented on the Profile API page, which says use is restricted to approved developers. [Profile API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/profile-api) (updated 2026-04-30).

### Inferences
- Posting is the one member write that both the Posts API and Getting Access pages mark as OPEN.
- If w_member_social covers comments and likes, those actions may also be OPEN. If the Reactions and Comments pages are current, they need w_member_social_feed, which is not on the open list and is probably partner-gated. Per the Authorization Code Flow page, "Your app's Auth tab will show current scopes available" ([Authorization Code Flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow), published 2025-11-10; updated 2026-05-15). Checking that tab after adding Share on LinkedIn would settle the question.
- The profile scope is described inconsistently across pages. Treat it as ID, name and photo until resolved.

### Gaps
- The Posts API page names no scope for updating or deleting posts.
- The Posts API examples use organization authors. No member-author create example was found, though the permission table and author field cover members.
- Whether w_member_social_feed is self-serve. No page states this.
- Whether the legacy /v2/me call works for a new app without approval. The Profile API page says use is restricted.

## Key Question 3: Is there an official non-partner way to read or send a member's direct messages?

### Takeaway
No. The official Messages API can start a message with first-degree connections and reply in an existing thread, but the page says "Usage of this API is restricted to approved partners" and documents no read endpoint. The read-side product it names, Compliance Events, is closed.

### Cited Findings
- "Note: Usage of this API is restricted to approved partners, subject to limitations via API agreement." [Messages API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/messages) (published 2019-11-20; updated 2023-12-20).
- The endpoint is `POST https://api.linkedin.com/v2/messages`. A new message takes `recipients`; a reply takes `thread`; `messageType` is `MEMBER_TO_MEMBER`. [Messages API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/messages).
- Requirements on that page: each message must follow "a specific member action"; members must opt in; any pre-prepared draft must be editable and sent only after the member's affirmative action; no automated or scheduled events; no incentives to members or recipients; no HTML. [Messages API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/messages).
- The page says "The Compliance Events API provides options to monitor a given member's messaging activities." Its permissions r_compliance and w_compliance are "Access is closed and may not be requested." [Messages API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/messages); [Getting Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access) (updated 2026-06-03).
- Restricted uses forbid using member data for "sending mass messages." [Restricted Uses](https://learn.microsoft.com/en-us/linkedin/marketing/restricted-use-cases) (published 2022-12-09; updated 2025-08-29).
- Context7 snippet only, not fetched: a Talent CRM Connect endpoint `GET https://api.linkedin.com/v2/conversationEvents` returns InMail history for Recruiter seat holders. Source: [CRM InMail history](https://learn.microsoft.com/en-us/linkedin/talent/crm-connect/crm-inmail-history). This is a partner program.

### Inferences
- An individual's app cannot read or send direct messages through official APIs. The only official send path is partner-only and limited to member-initiated sends.

### Gaps
- The Messages page does not name the partner program that covers it, and Getting Access does not list messaging under any program.
- Member Data Portability is listed as a regulatory product in the catalog. Whether it exposes messages and who qualifies is unverified.
- The Messages page is dated 2019 and last updated 2023. Its current status is unverified.
- WebSearch returned only third-party claims about messaging access. They were not used.

## Key Question 4: Is there an official way to edit a member's own profile fields?

### Takeaway
No official write API was found. The Profile API documents read access only.

### Cited Findings
- The Profile API returns a member's profile via `GET https://api.linkedin.com/v2/me` and `GET https://api.linkedin.com/v2/people/(id:{person ID})`. Fields beyond the lite set require "additional permissions that are only granted to select partners." [Profile API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/profile-api) (published 2023-02-15; updated 2026-04-30).
- The Community Management write surface covers "organization or brand information" (create, update, delete), not member profiles. [CM overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview) (updated 2026-05-15).

### Inferences
- Headline, about, experience, education, skills and photo edits are NO OFFICIAL API. This is an absence finding: no write endpoint is documented, and no page explicitly prohibits profile editing.

### Gaps
- The Profile API page dates from 2023. A write endpoint in a partner program that I did not check cannot be ruled out.

## Key Question 5: Is there an official way to read the feed, notifications, connections, or search for an individual member?

### Takeaway
None of these is open to individuals. Reading others' feeds and posts is closed or restricted. Connections and invitations are partner-gated. No official notifications API or people-search API was found for members.

### Cited Findings
- r_member_social is a "closed permission." [CM overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview) (updated 2026-05-15).
- Retrieving all posts by a person requires r_member_social. [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api) (updated 2026-05-13).
- r_member_social_feed is "granted to select developers only." [Reactions API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/reactions-api) (updated 2026-06-24).
- "None of the data provided via our Community Management APIs can be used in a social feed use case." [Restricted Uses](https://learn.microsoft.com/en-us/linkedin/marketing/restricted-use-cases) (updated 2025-08-29).
- Connections: "You cannot 'browse connections.'" Only the consenting member's first-degree connections are returned, via r_1st_connections. The page says use is "restricted to those developers approved by LinkedIn." [Connections API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/connections-api) (published 2021-05-31; updated 2022-04-06).
- Invitations: "Usage of this API is restricted to approved partners." Endpoints are `POST https://api.linkedin.com/v2/invitations` plus filtered GETs. [Invitations API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/invitations) (published 2021-05-31; updated 2022-04-06).
- Community Management's "Organization Social Actions Notifications" notifies "members about LinkedIn Company Page activity." This covers page activity, not a member's own notifications. [CM overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview).
- Community Management's "People Typeahead" is for "@mentions in organization posts," and lets page admins search followers. It is not general people search. [CM overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview).

### Inferences
- Individuals: feed reading is NO OFFICIAL API (closed or restricted). Notifications is NO OFFICIAL API found. Connections and invitations are PARTNER. People search is NO OFFICIAL API found.

### Gaps
- Notifications and people search were covered by one standard WebSearch restricted to learn.microsoft.com and developer.linkedin.com. No dedicated page was found. The search summary's claims about notifications, social-action webhooks, a legacy v1 mailbox and Standard-tier caps were not verified and not used.
- The Connections and Invitations pages date from 2021 to 2022. Their current status is unverified.

## Key Question 6: What are the current rate limits (application and member, per day and per minute), and what happens when they are exceeded?

### Takeaway
Official limits are counted per application and per member, over a 24-hour period that resets at midnight UTC. Standard numbers are not published in the docs. The Developer Portal's Analytics tab shows the numbers for each endpoint once a call has been made that day. Exceeding a limit returns HTTP 429. The only per-minute limit found is a member-level throttle on comment creation.

### Cited Findings
- "Rate limits specify the maximum number of API calls that can be made in a 24 hour period. These limits reset at midnight UTC every day." [Rate Limiting](https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits) (published 2025-06-18; updated 2025-08-20).
- Application = total calls per app per day. Member = total calls a single member can make through one app per day. [Rate Limiting](https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits).
- "Rate limited requests will receive a 429 response. In rare cases, LinkedIn may also return a 429 response as part of infrastructure protection." [Rate Limiting](https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits).
- "Standard rate limits are not published in documentation." Limits are visible in the portal's Analytics tab, and "only show usage and rate limits for endpoints you have made at least 1 request to today(UTC)." [Rate Limiting](https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits).
- Developer Admins get email alerts when the application-level limit passes 75%. Alerts come "approximately 1–2 hours" after the threshold and are not sent for member-level breaches. [Rate Limiting](https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits).
- Share on LinkedIn lists "Member 150 Requests" and "Application 100,000 Requests" per day (UTC). [Share on LinkedIn](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin) (updated 2023-12-14). This conflicts with the Rate Limiting page, and the page documents the legacy ugcPosts endpoint.
- Community Management Development tier: "Per App: Increased from 100 to 500 requests" and "Per Member: Increased from 10 to 100 requests." The FAQ does not restate the window. [CM overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview) (updated 2026-05-15). Standard tier is described as "Full access," with no numbers. [CM overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview).
- Posts API error: 429 `TOO_MANY_REQUESTS`, "Reduce request frequency and retry after a delay." [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api) (updated 2026-05-13).
- Comments API error: `429 Comment create throttled: creation rate limit exceeded for member`, described as "the short term 1 minute rate limit for common creation." [Comments API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/comments-api) (updated 2026-04-30).

### Inferences
- Per-day app and member limits for OPEN products are visible only in the portal, so the real numbers cannot be read from the docs. Build retry and backoff on 429 instead of relying on a stated figure.
- The only per-minute control found is the comment-creation throttle. Its number is not published.
- The CM figures probably use the 24-hour window that the Rate Limiting page defines. That is an inference, not a stated fact.

### Gaps
- Actual limits for OPEN products (portal only).
- Per-minute limits for posts and reactions.
- Whether 429 responses include Retry-After. The pages read do not say.
- Whether the Share page's 150-per-day member figure still applies.

## Key Question 7: What are the access-token lifetime, refresh-token availability, and re-authorization rules?

### Takeaway
Access tokens last 60 days. Refresh tokens are available only to a limited set of partners, so a non-partner app must repeat the consent flow. Re-consent skips the screen only while the member's LinkedIn session and the access token are still valid. A scope change forces re-consent, and requesting a different scope invalidates earlier tokens.

### Cited Findings
- "Currently, all access tokens are issued with a 60-day lifespan." The example `expires_in` is 5184000 seconds. [Authorization Code Flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow) (published 2025-11-10; updated 2026-05-15).
- Authorization codes have a "30-minute lifespan and must be used immediately." [Authorization Code Flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow).
- "Programmatic refresh tokens are available for a limited set of partners." [Authorization Code Flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow).
- Re-consent skips the screen only if "The member is still logged into https://www.linkedin.com" and "The member's current access token has not expired." Otherwise "they are sent through the normal authorization process." [Authorization Code Flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow).
- "If the scope permissions are changed in your app, your users must re-authenticate." "If you request a different scope than the previously granted scope, all the previous access tokens are invalidated." [Authorization Code Flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow).
- The consent screen also reappears after a timeout or a manual revocation by the member. [Authorization Code Flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow).
- "The LinkedIn Developer Portal has a token generator for manually creating tokens." Token generator: https://www.linkedin.com/developers/tools/oauth/token-generator. [Authorization Code Flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow).

### Inferences
- A personal CLI needs an interactive browser consent at least every 60 days, and again after any scope change. This follows from the 60-day lifespan and the re-authentication rules.
- The portal token generator is a route to a token for one's own account without building a redirect flow. The page says all access tokens are issued with a 60-day lifespan, so the same lifetime is expected (inference).

### Gaps
- The auth page lists `refresh_token` and `refresh_token_expires_in` as response fields but limits refresh to partners. What a non-partner token response contains was not confirmed.
- The Programmatic Refresh Tokens page was not fetched.

## Key Question 8: What does a developer need for production access?

### Takeaway
The two member products are instant: add them in the portal's Products tab, with no review step on the pages read. Community Management requires a registered legal organization, a verified business email, Page-admin verification, and vetting in two tiers. Advertising requires approval. Messages, Invitations, Connections and the Profile API need partner agreements. Restricted-use terms apply to all member data.

### Cited Findings
- Open products "may be added via self-service through the LinkedIn Developer Portal... under the Products tab"; "LinkedIn products can be enabled after creating a new application." [Getting Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access) (updated 2026-06-03).
- Share on LinkedIn: "add the Share on LinkedIn product"; OIDC: "request the Sign in with LinkedIn using OpenID Connect product." [Share on LinkedIn](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin); [Sign In with OIDC](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2).
- Community Management: "only available to registered legal organizations for commercial use cases only." "Personal email addresses won't pass the vetting process." [CM App Review](https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review) (published 2023-01-10; updated 2026-02-11).
- "Ensure a super admin of the LinkedIn Page associated with your organization has verified your application." [CM App Review](https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review).
- Development tier review: approved use case, verified business email, verified organization and domain, and the application verified by the associated Page. [CM App Review](https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review).
- Standard tier review: approved use case, "Valid privacy policy," compliance with data-storage requirements, and a screen recording. Applicants also supply a company and product overview, a use-case description, and test credentials. [CM App Review](https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review).
- A rejected application cannot be re-applied with the same app: "You won't be able to re-apply for Development tier access with your existing app." [CM App Review](https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review).
- The Standard tier screencast must show, for example, "an application user approving access to their LinkedIn page data via the complete OAuth flow." [CM App Review](https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review).
- Advertising: "must be approved"; audiences require approved Advertising API partner status. [Getting Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access).
- Member-data restrictions: no use for advertising, sales or recruiting; "Member data can't be exported, distributed, or otherwise transferred"; social activity data may be stored for "48 hours," most profile data for "24 hours"; display limited to individuals associated with the managed Page or Profile; "Do not create fake profiles." [Restricted Uses](https://learn.microsoft.com/en-us/linkedin/marketing/restricted-use-cases) (updated 2025-08-29).

### Inferences
- An individual can get sign-in and posting immediately. An individual cannot get Community Management, so the company-page surfaces are closed to an individual's app.
- If the CLI caches or exports member data, the no-export clause and the 48-hour and 24-hour storage limits may apply. These are stated for Marketing API member data. Whether they apply to Share on LinkedIn and OIDC data is unverified.

### Gaps
- Whether the portal requires a Page association, a privacy policy or a use-case description for the OPEN products. The pages read do not say.
- Review timelines for Advertising and Community Management.

## Key Question 9: Which endpoints are deprecated or replaced as of 2026-10, and what replaces them?

### Takeaway
The latest Marketing API version is 202610, and versions are supported for at least a year. Version 202511 sunsets on 2026-11-16. The Posts API replaces ugcPosts, and the Reactions API replaces socialActions likes. The comments path has no clear replacement. The Share page still documents ugcPosts, and the Messages, Invitations, Connections and Profile pages are dated 2019 to 2023 with no deprecation notice in the migrations table.

### Cited Findings
- Latest version: "October 2026 | 202610." "These API versions are supported and stable for a minimum of one year before sunset." [Marketing Versioning](https://learn.microsoft.com/en-us/linkedin/marketing/versioning) (published 2026-10-15; updated 2026-10-14).
- "No unversioned calls": every versioned call must name a version. A missing or deprecated header returns an error. [Marketing Versioning](https://learn.microsoft.com/en-us/linkedin/marketing/versioning).
- Migration table: 202511 "Active," sunset "November 16, 2026"; 202510 sunset "October 15, 2026," status "Deprecated"; 202601 through 202610 sunset in 2027. [Migrations](https://learn.microsoft.com/en-us/linkedin/marketing/integrations/migrations) (published 2026-10-15; updated 2026-10-14).
- The same table lists "Content APIs are replacing APIs such as assets, adInMailContentsV2, adCreativesV2, ugcPosts, sponsoredConversations" (June 30, 2023). [Migrations](https://learn.microsoft.com/en-us/linkedin/marketing/integrations/migrations).
- "The Posts API replaces the ugcPosts API." [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api) (updated 2026-05-13).
- "The Reactions API replaces the likes functionality provided by the existing socialActions endpoint." [Reactions API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/reactions-api) (updated 2026-06-24).
- Social Metadata is "replacing the existing socialActions endpoint." [CM overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview) (updated 2026-05-15).
- The Comments API still documents comments under `socialActions` (updated 2026-04-30). [Comments API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/comments-api).
- The Share on LinkedIn page still documents `POST https://api.linkedin.com/v2/ugcPosts` (updated 2023-12-14). [Share on LinkedIn](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin).

### Inferences
- Use the Posts API and the Reactions API with `Linkedin-Version: 202610`. Avoid ugcPosts and socialActions likes.
- For comments, the replacement is unclear. The Comments page still uses socialActions, and the CM overview says Social Metadata replaces socialActions.
- Version 202511 sunsets 27 days after 2026-10-20 (inference from the migrations table).

### Gaps
- Version 202510's sunset date (2026-10-15) has passed, but its status still reads "Deprecated." The status column may not be updated.
- The recent-changes changelog and the migration guides (Community Management migration guide; content migration guide) were not fetched.
- No deprecation notice was found for the v2 member endpoints (messages, invitations, connections, profile).
- Context7 snippet only, not fetched: the Talent versioning page describes `YYYYMM.xx` patch versions and HTTP 426 for sunset versions ([Talent versioning](https://learn.microsoft.com/en-us/linkedin/talent/versioning)). This was not confirmed for the Marketing API.
