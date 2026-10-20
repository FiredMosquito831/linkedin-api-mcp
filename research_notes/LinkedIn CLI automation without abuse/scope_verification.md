# LinkedIn scope, rate-limit and PKCE verification (as of 2026-10-20)

Method: six Microsoft Learn LinkedIn pages and the Marketing API permissions table were fetched with WebFetch on 2026-10-20. The results returned the page markdown itself, so quotes are verbatim apart from removed backslash escapes (w\_member\_social is shown as w_member_social). Dates are page metadata: pub = published (ms.date), upd = last updated (updated_at). Context7 resolve-library-id returned /websites/learn_microsoft_en-us_linkedin (LinkedIn API, High reputation). query-docs was not run because the 12-call budget went to page fetches. WebSearch was not run because the primary pages were fetched directly. Not fetched: the developer portal (Auth tab and product pages), the Posts API page, and Community Management App Review.

Sources used:
- [Reactions API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/reactions-api) (pub 2026-04-28, upd 2026-06-24)
- [Comments API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/comments-api) (pub 2026-04-28, upd 2026-04-30)
- [Getting Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access) (pub 2025-06-24, upd 2026-06-03)
- [Share on LinkedIn](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin) (pub 2021-02-05, upd 2023-12-14)
- [Rate Limiting](https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits) (pub 2025-06-18, upd 2025-08-20)
- [Authorization Code Flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow) (pub 2025-11-10, upd 2026-05-15)
- [Increasing Access](https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access) (pub 2026-10-14, upd 2026-10-19)

Check of the prior notes: confirmed were the Share on LinkedIn 150-per-member-per-day table, the Rate Limiting "not published" line, w_member_social_feed on the Reactions and Comments pages, and w_member_social covering "like" on Getting Access. Not verified in this run: the Posts API "comment and like" line, the "legal organizations" wording attributed to CM App Review, and any PKCE loopback text (none was found on the Authorization Code Flow page).

## Key Question 1: Which scope does the Reactions API require to create a like on a post as a member?

### Takeaway
Unresolved. The Reactions API page names w_member_social_feed as the member write scope for reactions and never names w_member_social. Getting Access and Increasing Access describe "like" under w_member_social.

### Cited Findings
- Reactions API permissions table, w_member_social_feed: "Post, comment, and react to posts on behalf of an authenticated member." — [Reactions API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/reactions-api) (pub 2026-04-28, upd 2026-06-24)
- Same table, r_member_social_feed: "**Restricted** Retrieve posts, reactions, and likes on behalf of an authenticated member. This permission is granted to select developers only." — same source
- The Create a Reaction sections (on a share and on a comment) name no scope. The sample response for a share reaction shows "reactionType": "LIKE". — same source
- Conflict: Getting Access, Share on LinkedIn row, w_member_social: "Post, comment and like posts on behalf of an authenticated member." — [Getting Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access) (pub 2025-06-24, upd 2026-06-03)
- Conflict: Increasing Access, w_member_social: "Post, comment, and like posts on your behalf." — [Increasing Access](https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access) (pub 2026-10-14, upd 2026-10-19). The same page's w_member_social_feed row reads: "Create, modify, and delete comments and reactions on posts on your behalf." — same source

### Inferences
- The pages do not map each Reactions method to a scope. Which scope the Reactions endpoint checks for a LIKE is left open.
- Increasing Access splits the work between the two scopes: "like" under w_member_social and "reactions" under w_member_social_feed. The Reactions API page places all reactions under w_member_social_feed.
- A live test would settle it (suggested, not run): call POST https://api.linkedin.com/rest/reactions with a LIKE using a token that holds only w_member_social.

### Gaps
- No page names a scope for each Reactions method.
- The Posts API page, which the prior notes say also lists "comment and like" under w_member_social, was not fetched in this run.
- The developer portal Auth tab, which the Authorization Code Flow page says shows an app's current scopes, was not checked.

## Key Question 2: Which scope does the Comments API require to comment on a post as a member?

### Takeaway
Unresolved, with the same conflict as Key Question 1. The Comments API page names w_member_social_feed. Getting Access and Increasing Access describe "comment" under w_member_social.

### Cited Findings
- Comments API permissions table, w_member_social_feed: "Post, comment, and react on posts on behalf of an authenticated member." — [Comments API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/comments-api) (pub 2026-04-28, upd 2026-04-30)
- Same table, r_member_social_feed: "**Restricted** Retrieve posts, reactions, and likes on behalf of an authenticated member. This permission is granted to select developers only." — same source
- The Create a Comment section names no scope. Its endpoint is POST https://api.linkedin.com/rest/socialActions/{shareUrn|ugcPostUrn|commentUrn}/comments. — same source
- Comment throttle: "Comment create throttled: creation rate limit exceeded for member" with "Indicates member has hit the short term 1 minute rate limit for common creation." No number is given. — same source
- Conflict: Getting Access: "Post, comment and like posts on behalf of an authenticated member." (w_member_social) — [Getting Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access) (pub 2025-06-24, upd 2026-06-03). Increasing Access: "Post, comment, and like posts on your behalf." (w_member_social) — [Increasing Access](https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access) (pub 2026-10-14, upd 2026-10-19)

### Inferences
- The docs do not settle which scope the comment endpoint checks. The conflict is the same as in Key Question 1.

### Gaps
- The Comments page does not name w_member_social anywhere.
- No live scope test was run for comments.

## Key Question 3: Is w_member_social_feed a real scope on the developer portal, and who can request it?

### Takeaway
It is a real permission in LinkedIn's docs. It appears in three official permission tables, and Increasing Access ties it to Community Management API access, which requires approval. The developer portal was not checked, so whether the scope appears there is unverified.

### Cited Findings
- Increasing Access, permissions table: "`w_member_social_feed` | Create, modify, and delete comments and reactions on posts on your behalf. | Member Permission (3-legged). | Community Management API." — [Increasing Access](https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access) (pub 2026-10-14, upd 2026-10-19)
- Same page, product table, Community Management API row: "Available to all developers approved for Community Management API access." — same source
- Same page: "Once your API access is approved, the corresponding permissions are automatically granted to your application." — same source
- Same page, tip: "The **Advertising API**, **Community Management API**, **Events Management API**, **Lead Sync API**, **Conversions API**, and **Matched Audiences API** are open to all approved developers — apply through the standard process." — same source
- The Increasing Access permissions table does not list r_member_social or r_member_social_feed. — same source
- Reactions and Comments pages: the w_member_social_feed rows carry no restriction label. The r_member_social_feed row does: "**Restricted** ... This permission is granted to select developers only." — [Reactions API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/reactions-api), [Comments API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/comments-api)
- Getting Access: "Most permissions and partner programs require explicit approval from LinkedIn. Open Permissions are the only permissions that are available to all developers without special approval." w_member_social_feed does not appear on this page. — [Getting Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access) (pub 2025-06-24, upd 2026-06-03)
- Developer portal rule: "The scopes available to your app depend on which Products or Partner Programs your app has access to. This information is available in the LinkedIn Developer Portal. Your app's Auth tab will show current scopes available." — [Authorization Code Flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow) (pub 2025-11-10, upd 2026-05-15)

### Inferences
- Per Increasing Access, a developer gets w_member_social_feed by having Community Management API access approved. It is not self-serve from the open list. The Auth tab is where the scope would appear after approval; this was not tested.
- Unverified conflict: the prior notes quote CM App Review as limiting Community Management to "registered legal organizations for commercial use cases only." That page was not fetched in this run. Increasing Access says only "approved developers," so the two wordings are not reconciled here.

### Gaps
- The developer portal (Auth tab and product pages) was not fetched.
- No page gives a separate access tier for w_member_social_feed. Increasing Access lists it under Community Management API, whose tiers are Development (the default) and Standard.

## Key Question 4: Can a developer obtain the Key Question 1 and 2 scopes for their own app without a LinkedIn review?

### Takeaway
Depends on Key Questions 1 and 2, which are unresolved. w_member_social can be added to an app through the Share on LinkedIn product with no review. w_member_social_feed is not on the open list, and Increasing Access ties it to Community Management API approval.

### Cited Findings
- Getting Access: "The following permissions are available to all developers, and may be added via self-service through the LinkedIn Developer Portal, under the Products tab on your application page." The table in that section lists w_member_social under Share on LinkedIn. — [Getting Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access) (pub 2025-06-24, upd 2026-06-03)
- Share on LinkedIn: "If your application does not have this permission, you can add it through the Developer Portal." and "add the Share on LinkedIn product which will grant you `w_member_social`." — [Share on LinkedIn](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin) (pub 2021-02-05, upd 2023-12-14)
- Increasing Access, Community Management API row: "Available to all developers approved for Community Management API access." — [Increasing Access](https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access) (pub 2026-10-14, upd 2026-10-19). The same page says: "LinkedIn reserves the right to review applications and select partners at its discretion and a partner might not be upgraded even if they meet these minimum requirements." — same source
- The Reactions and Comments pages state no access requirement for w_member_social_feed. — [Reactions API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/reactions-api), [Comments API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/comments-api)

### Inferences
- If like and comment fall under w_member_social, a personal app can get them without a review. If they fall under w_member_social_feed, the pages point to Community Management API approval, and this run found no official route without it.
- Increasing Access is the Marketing API table and does not list Share on LinkedIn, so it does not contradict the self-serve route for w_member_social.

### Gaps
- No page says a personal app can add w_member_social_feed from the portal's Products tab.
- The portal Products tab was not checked.

## Key Question 5: What is the current posting rate limit for a member's app, and where is it stated?

### Takeaway
Unresolved. The Share on LinkedIn page gives 150 requests per member per day. The Rate Limiting page says standard limits are not published and points to the portal's Analytics tab. The current posting endpoint (POST /rest/posts) was not fetched.

### Cited Findings
- Share on LinkedIn, Rate Limits table, under "Daily Request Limit (UTC)": "Member | 150 Requests" and "Application | 100,000 Requests". The table names no endpoint. The page's main request is "POST https://api.linkedin.com/v2/ugcPosts". — [Share on LinkedIn](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin) (pub 2021-02-05, upd 2023-12-14)
- Conflicting line, Rate Limiting: "Standard rate limits are not published in documentation." — [Rate Limiting](https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits) (pub 2025-06-18, upd 2025-08-20)
- Same page: "Your application's daily rate limit varies based on which API endpoint you are using." Also: "Rate limits specify the maximum number of API calls that can be made in a 24 hour period. These limits reset at midnight UTC every day." Member is defined as "The total number of calls that a single member per application can make in a day." — same source
- Same page: "You can look up the rate limit of any endpoint your app has access to through the Developer Portal. Select your app from the list and navigate to its Analytics tab." — same source
- Different route, Community Management Development tier only: "All APIs: - **500** API calls for an app for **24** hrs - **100** API calls per member of an App for **24** hrs" — [Increasing Access](https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access) (pub 2026-10-14, upd 2026-10-19)

### Inferences
- The Share table and the Rate Limiting page do not refer to each other. The Share table was last updated 2023-12-14 and the Rate Limiting page 2025-08-20. The dates do not settle which applies.
- The portal Analytics tab is the check that would settle it for a given app. Per the Rate Limiting page, it shows the limit for an endpoint once the app has made a request to that endpoint that day (UTC).

### Gaps
- The Posts API page (POST /rest/posts) was not fetched. The prior notes say it publishes no quota. That is not verified here.
- The portal Analytics tab was not checked.

## Key Question 6: Does LinkedIn's documentation say how PKCE is enabled for a personal app?

### Takeaway
Not documented on the pages checked. The Authorization Code Flow page has no PKCE parameter, lists client_secret as required at token exchange, and says the redirect URL is added "via HTTPS". No fetched page supports the loopback-redirect claim.

### Cited Findings
- Step 1: "3. Add the redirect (callback) URL via `HTTPS` to your server." — [Authorization Code Flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow) (pub 2025-11-10, upd 2026-05-15)
- The Step 2 parameter table lists response_type, client_id, redirect_uri, state, and scope. No code_challenge or code_challenge_method parameter appears. — same source
- The Step 3 parameter table lists grant_type, code, client_id, client_secret, and redirect_uri. client_secret is described as "The Secret Key value generated in Step 1." with Required "Yes". No code_verifier parameter appears. — same source
- The only "code verifier" text is in an error row: "Unable to retrieve access token: appid/redirect uri/code verifier does not match authorization code. Or authorization code expired. Or external member binding exists" — same source. It refers to a code verifier without saying how to send or enable one.
- The only RFC reference: "To ensure the login options work seamlessly, please follow the standard OAuth specification (RFC 8252) when invoking OAuth." — same source. It appears in the social-login note and does not mention PKCE or loopback.

### Inferences
- The page has no PKCE parameters or enablement steps, and it does not discuss personal or individual-developer apps. This supports "not documented on the pages checked." It does not prove absence across all LinkedIn documentation, because no site-wide search was run.
- The documented token exchange requires client_secret, so no secretless, PKCE-only flow is described on this page.

### Gaps
- No site-wide PKCE search was run. The Context7 library /websites/learn_microsoft_en-us_linkedin is the natural place for one.
- The developer portal Auth tab was not checked for any PKCE option.
- The Programmatic Refresh Tokens and Best Practices pages were not fetched.
