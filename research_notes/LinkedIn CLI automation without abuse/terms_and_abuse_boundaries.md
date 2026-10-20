# LinkedIn terms and automation boundaries for a personal CLI

Status as of 2026-10-20. Covers a planned Node.js CLI, published on npm, that automates the user's own LinkedIn account across profile, posts, likes and reactions, comments, messages and replies, connections, notifications, feed and search, and company pages the user admins. This is research into published terms, not legal advice. Techniques for getting around LinkedIn's controls were out of scope and none are recorded here.

**Verification notes.** Quotes come from WebFetch, which returns a model-extracted rendering of each page, so spot-check exact wording on the live page before external use. Cross-checks: UA §8.2 items 2, 3, 4, 13, 15 and 16 also appear on LinkedIn help page a1341387 and match there, except item 16's last phrase ("manipulating algorithms" in the UA extraction, "gaming algorithms" on the help page). API Terms §3.1 item 26 and §§4.1 and 4.3 came back identically from two separate fetches. Item numbers inside API Terms §3.1 are as reported by the extraction. Help pages showed only relative "last updated" stamps. All searches used standard mode. Vendor blogs and search-result summaries are not cited as policy sources; where one is mentioned it is flagged as unverified.

**Source register** (accessed 2026-10-20; dates as shown on each source)
1. [LinkedIn User Agreement (UA)](https://www.linkedin.com/legal/user-agreement): "Effective on November 3, 2025." No last-updated date shown.
2. [Professional Community Policies (PCP)](https://www.linkedin.com/legal/professional-community-policies): no effective or updated date shown.
3. [LinkedIn API Terms of Use (API Terms)](https://www.linkedin.com/legal/l/api-terms-of-use): "Last revised on December 13th, 2022"; for existing developers, effective January 13, 2023.
4. [Help: Prohibited software and extensions (a1341387)](https://www.linkedin.com/help/linkedin/answer/a1341387): relative stamp only, "Last updated: 2 years ago."
5. [Help, Sales Navigator center: Automated activity on LinkedIn (a1340567)](https://www.linkedin.com/help/sales-navigator/answer/a1340567): relative stamp only, "Last updated: 2 weeks ago."
6. [Help: Account restrictions (a1340522)](https://www.linkedin.com/help/linkedin/answer/a1340522): relative stamp only, "Last updated: 1 year ago."
7. [Microsoft Learn: Getting Access to LinkedIn APIs](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access): ms.date 2025-06-24; updated 2026-06-03.
8. [Microsoft Learn: Community Management API overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview): ms.date 2026-03-31; updated 2026-05-15.
9. [GDPR Article 2 (gdpr-info.eu text of Regulation (EU) 2016/679)](https://gdpr-info.eu/art-2-gdpr/): no date shown.
10. [Proskauer, hiQ and LinkedIn settlement post](https://newmedialaw.proskauer.com/2022/12/08/hiq-and-linkedin-reach-proposed-settlement-in-landmark-scraping-case/): dated 2022-12-08; updated after the court order.
11. [The Record, LinkedIn and ProAPIs/Netswift](https://therecord.media/linkedin-wins-court-order-blocking-mass-scraping): published 2026-09-21.
12. [Social Media Today, LinkedIn and Proxycurl](https://www.socialmediatoday.com/news/linkedin-wins-legal-case-data-scrapers-proxycurl/756101/): dated 2025-07-28.
13. [CPPA, CCPA monetary thresholds](https://cppa.ca.gov/regulations/cpi_adjustment.html): seen only as a search-result summary; page not fetched; date not verified.

**Labels used in the matrix.** *Allowed*: an official permission covers the act and no quoted clause reads it as automation or as prohibited. *Gray*: the act is permitted only in some forms (for example a single user-triggered action but not a scheduled one), or a quoted clause could plausibly reach it and LinkedIn has not clarified. *Prohibited*: a quoted clause names the act, or the only available route is website or unofficial automation.

## Key Question 1: Which clauses address bots, scrapers, automation, browser extensions, third-party tools, or unofficial APIs?

### Takeaway
The explicit ban sits in UA §8.2 ("Dos and Don'ts") and in LinkedIn's help page "Prohibited software and extensions." Both name crawlers, bots, browser plug-ins and extensions, and scripts or robots that scrape, copy, alter the appearance of, or automate activity on LinkedIn's website. The PCP text retrieved does not mention bots or third-party tools; it covers spam, bulk messages, invitations, artificial engagement, and fake accounts. No retrieved text uses the phrase "unofficial API."

### Cited Findings
- [UA §8.2 item 2](https://www.linkedin.com/legal/user-agreement) (eff. 2025-11-03): "Develop, support or use software, devices, scripts, robots or any other means or processes (such as crawlers, browser plugins and add-ons or any other technology) to scrape or copy the Services, including profiles and other data from the Services;"
- [UA §8.2 item 13](https://www.linkedin.com/legal/user-agreement): "Use bots or other unauthorized automated methods to access the Services, add or download contacts, send or redirect messages, create, comment on, like, share, or re-share posts, or otherwise drive inauthentic engagement;"
- [UA §8.2 item 15](https://www.linkedin.com/legal/user-agreement): "Overlay or otherwise modify the Services or their appearance (such as by inserting elements into the Services or removing, covering, or obscuring an advertisement included on the Services);"
- [UA §8.2 item 3](https://www.linkedin.com/legal/user-agreement): "Override any security feature or bypass or circumvent any access controls or use limits of the Services (such as search results, profiles, or videos);"
- [UA §8.2 item 16](https://www.linkedin.com/legal/user-agreement): "Interfere with the operation of, or place an unreasonable load on, the Services (e.g., spam, denial of service attack, viruses, manipulating algorithms);"
- [UA §8 introduction](https://www.linkedin.com/legal/user-agreement): "This list of 'Dos and Don'ts' along with our Professional Community Policies limits what you can and cannot do," unless "otherwise explicitly permitted by LinkedIn in a separate writing (e.g., through a research agreement)."
- [Help a1341387](https://www.linkedin.com/help/linkedin/answer/a1341387) (relative stamp only): "In order to protect our members' data and our website, we don't permit the use of any third party software, including 'crawlers', bots, browser plug-ins, or browser extensions that scrape, modify the appearance of, or automate activity on LinkedIn's website."
- [Help a1341387](https://www.linkedin.com/help/linkedin/answer/a1341387): "All of these tools violate the User Agreement, including, but not limited to, the following prohibitions listed in Section 8.2," and "Any member who uses tools for such purposes is in violation of the User Agreement."
- [Help a1340567](https://www.linkedin.com/help/sales-navigator/answer/a1340567) (Sales Navigator center; relative stamp only): "we don't allow the use of third-party software or browser extensions that scrape, modify the appearance of, or automate activity on LinkedIn's website." The page speaks of LinkedIn's website generally and does not mention official APIs.
- [PCP, "Be professional"](https://www.linkedin.com/legal/professional-community-policies) (no date shown): "Do not spam members or the platform." and "Don't do things to artificially increase engagement with your content."
- [UA §3.6](https://www.linkedin.com/legal/user-agreement) (fragment): "The Services may include content automatically generated and shared using tools offered by LinkedIn or others off LinkedIn." This acknowledges third-party content tools; it does not authorize automation.
- [API Terms §3.1 item 24](https://www.linkedin.com/legal/l/api-terms-of-use) (rev. 2022-12-13): "scraping, crawling, spidering or using any other technology or software to access LinkedIn content outside the APIs."

### Inferences
- A CLI that drives the website (browser automation, scripts that reuse a logged-in session, or a browser extension) falls within the quoted text. Help a1341387 names these exact tool types. Treat as prohibited.
- Unofficial endpoints are not named. Under UA §8.2 item 2 ("software ... or any other means or processes ... to scrape or copy the Services"), they are very likely covered when used to read profiles, messages, feed or search results. This is inference from the wording.
- Item 13 bans "unauthorized" automated methods. The qualifier implies that LinkedIn-authorized automation, such as an approved API route, sits outside item 13. This is inference from wording, not a LinkedIn statement.

### Gaps
- UA §8.2 items 10 and 17–19 were not retrieved; the extraction omitted them as outside its categories. They may hold further relevant limits.
- PCP sub-policies linked from the PCP page (spam, invitations, engagement) were not fetched.
- The API Terms definitions of "Content," "Member Data," and "Users" were not retrieved.

## Key Question 2: Can a developer build a personal CLI on official APIs, and what use-case restrictions apply?

### Takeaway
Yes, but only for a narrow set. The Open Permissions that need no approval are Sign In with LinkedIn (profile, email) and Share on LinkedIn (`w_member_social`: "Post, comment and like posts on behalf of an authenticated member"). The Getting Access page lists no open permission for messaging, connections, notifications, feed, or search. Company pages require the vetted Community Management API. The API Terms restrict storage (no caching unless permitted; profile data refreshed only during active use "and not on an automated schedule"; deletion on request) and bar using the APIs "to automate posting" and "to generate mass messages." The per-surface matrix below applies these clauses to each surface.

### Cited Findings
- [Getting Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access) (updated 2026-06-03): "Most permissions and partner programs require explicit approval from LinkedIn. Open Permissions are the only permissions that are available to all developers without special approval."
- Getting Access, Open Permissions: profile, "Retrieve authenticated member's name, headline, and photo."; email, "Retrieve authenticated member's primary email address."; `w_member_social`, "Post, comment and like posts on behalf of an authenticated member."
- Getting Access, other programs: Marketing (Advertising API) requires approval; Sales permissions require approval as a Sales Navigator Application Platform (SNAP) partner; Talent programs are partner applications; Compliance permissions are closed.
- [Community Management overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview) (ms.date 2026-03-31): "The Community Management API enables developers to manage LinkedIn company pages for clients and access account details (admins, roles, followers) and analytics, including comments, reactions, and page activity." Approved uses include "Create and manage company posts, comments, and reactions while monitoring member engagement," and "Create and manage posts, comments, and reactions while monitoring engagement on behalf of individual profiles."
- Community Management overview: "Vetted Product with development and standard tiers." Standard Tier access requires "a screencast video demonstrating each use case" in the access request.
- Community Management overview, FAQ 6: "r_member_social is a closed permission. We're not accepting access requests at this time due to resource constraints."
- [API Terms §3.1 item 26](https://www.linkedin.com/legal/l/api-terms-of-use) (rev. 2022-12-13): "Use the Content or the APIs to automate posting on the LinkedIn Services."
- API Terms §3.1 item 10: "to generate mass messages, promotions or offers."
- API Terms §3.1 (item number not reported): "Access a Member's network of connections through your Application without their express permission."
- API Terms §3.1 item 3: "Request or publish information impersonating a Member."
- API Terms §4.1 ("No Storing Any Content"): "You must not capture, copy, cache, or store any Content or any information expressed by the Content." Storage is allowed only where the Terms or program supplements explicitly permit it, and "you will store Content only for the duration necessary for you to provide your Application's services to your Users."
- API Terms §4.2: "You may store the Application-specific Member tokens and authentication tokens acquired on a Member's behalf."
- API Terms §4.3 ("Member Profile Data"): "you may only do so when the Member is actually using your Application and not on an automated schedule." Per the extraction's paraphrase, the term covers profile details reachable through the API and excludes connections, feed updates, job postings and group data.
- API Terms §4.4: "You must immediately delete all Content collected through the APIs on behalf of a User," except where law requires otherwise.
- API Terms §4.5: "if you no longer operate your Application or otherwise no longer use the Content, you must delete all stored LinkedIn data."
- API Terms §11.3: "We may suspend or terminate these Terms or your access to the APIs or Content at any time for any reason."
- [UA §2.2](https://www.linkedin.com/legal/user-agreement): "You will not share your account with anyone else and will follow our policies and the law."
- [UA §8.2 item 1](https://www.linkedin.com/legal/user-agreement): "or use or attempt to use another's account (such as sharing log-in credentials or copying cookies);"

### Per-surface matrix
Citations: UA = [UA](https://www.linkedin.com/legal/user-agreement); API = [API Terms](https://www.linkedin.com/legal/l/api-terms-of-use); GA = [Getting Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access); CM = [Community Management overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview); Help a1341387 = [Prohibited software and extensions](https://www.linkedin.com/help/linkedin/answer/a1341387); PCP = [Professional Community Policies](https://www.linkedin.com/legal/professional-community-policies). Dates are in the source register above.

| # | Surface and action | Label | Governing text | Notes and ambiguity |
|---|---|---|---|---|
| 1 | Profile: read own name, headline, photo, email on demand via Sign In with LinkedIn | Allowed | GA, Open Permissions: "Retrieve authenticated member's name, headline, and photo." | On-demand reads only. Storing or refreshing the data is governed by rows 2 and 26. |
| 2 | Profile: scheduled or background refresh of profile data via API | Prohibited | API §4.3: "you may only do so when the Member is actually using your Application and not on an automated schedule." | Literal text. Scope of "Member Profile Data" per the extraction's paraphrase of §4.3. |
| 3 | Profile: automated edits to own profile, by any route | Prohibited | UA §8.2 items 13 and 2. GA lists no profile-write permission. | Manual edits are outside these clauses. |
| 4 | Profile: automated reads of other members' profiles | Prohibited | UA §8.2 item 2 ("to scrape or copy the Services, including profiles and other data"); API §3.1 item 24. | No gray zone in the text. |
| 5 | Posts: one post per command, triggered by the user, via w_member_social | Allowed (plain reading) | GA: w_member_social, "Post, comment and like posts on behalf of an authenticated member." UA §8.2 item 13 reaches only "unauthorized automated methods." | Reads API §3.1 item 26 ("automate posting") as excluding a single human-triggered post. No LinkedIn text confirms this for CLIs. |
| 6 | Posts: scheduled or queued publishing through the API | Gray | API §3.1 item 26: "Use the Content or the APIs to automate posting on the LinkedIn Services." | Literal reading may cover scheduling. "Content" may mean LinkedIn-sourced material; its definition was not retrieved. No LinkedIn page on scheduling was found. |
| 7 | Posts: unattended publishing, where content goes out without a per-post user action, via API | Prohibited | API §3.1 item 26 (same text). | Plain automation of posting. |
| 8 | Posts: any posting through browser automation, scripts, or extensions | Prohibited | Help a1341387: "we don't permit the use of any third party software ... that scrape, modify the appearance of, or automate activity on LinkedIn's website." UA §8.2 items 2 and 13. | — |
| 9 | Likes/reactions: one like per command via w_member_social | Allowed (plain reading) | GA: "...and like posts on behalf of an authenticated member." | Same caveat as row 5. |
| 10 | Likes/reactions: automated, bulk, or scheduled likes via API | Gray | UA §8.2 item 13: "...unauthorized automated methods ... like, share, or re-share posts ... or otherwise drive inauthentic engagement;" PCP: "Don't do things to artificially increase engagement with your content." | "Unauthorized" leaves room for LinkedIn-sanctioned API use. LinkedIn has not said whether automated API likes are authorized. |
| 11 | Likes/reactions: via browser automation, extensions, or coordinated like or share arrangements | Prohibited | UA §8.2 item 13; Help a1341387 ("fake engagement"); PCP: "Respond authentically to others' content and don't agree with others ahead of time to like or re-share each other's content." | The retrieved PCP text does not use the phrase "engagement pod." |
| 12 | Comments: one comment per command via w_member_social (company-page version: row 22) | Allowed (plain reading) | GA: w_member_social, "Post, comment and like posts on behalf of an authenticated member." | Same caveat as row 5. |
| 13 | Comments and replies: automated or templated replies via API | Gray | UA §8.2 item 13 ("comment on" by "unauthorized automated methods"); PCP: "Do not spam members or the platform." | No thresholds are published. |
| 14 | Comments and replies: via browser automation or extensions | Prohibited | UA §8.2 item 13; Help a1341387. | — |
| 15 | Messages: any automated read, send, or reply, by any route | Prohibited | UA §8.2 item 13 ("send or redirect messages") and item 2. GA lists no messaging permission. | No official route for a general developer. Manual use is outside these clauses. |
| 16 | Messages: mass, promotional, or templated messages, by any route | Prohibited | PCP: "We don't allow untargeted, irrelevant, obviously unwanted, unauthorized, inappropriate commercial or promotional, or gratuitously repetitive messages or similar content." API §3.1 item 10: "to generate mass messages, promotions or offers." | — |
| 17 | Connections: automated connection requests or invitations | Prohibited | UA §8.2 item 13 ("add or download contacts"); PCP: "Do not use our invitation feature to send promotional messages to people you don't know or to otherwise spam people." | UA §3.4 lets LinkedIn limit the number of connections and contacts. No numeric limit was retrieved. |
| 18 | Connections: exporting or downloading the contact list by automation | Prohibited | UA §8.2 item 13 ("download contacts") and item 2. UA §2.2 (fragment): "(e.g., sell or transfer the personal data of others by transferring your connections)". | No API route for connections was found. |
| 19 | Notifications: automated reads (polling or scraping) | Prohibited | UA §8.2 items 2, 3 and 16. GA lists no notifications permission. | No official route found. |
| 20 | Feed and search: automated reads, searches, or feed harvesting | Prohibited | UA §8.2 item 2 (scrape or copy); item 3 ("such as search results, profiles, or videos"); item 16 (unreasonable load). | Search-type endpoints appear only in partner programs (row 21). |
| 21 | Feed and search via partner programs (for example CM "People Typeahead," or SNAP sales permissions) | Gray | CM: People Typeahead "enable[s] page admins to search followers by keyword or vanity URL." GA: SNAP partner approval required. | Approval-only; not available to a general personal developer. |
| 22 | Company pages: one user-triggered action per command through an approved CM app | Allowed (approval required) | CM: "Vetted Product with development and standard tiers."; approved use "Create and manage company posts, comments, and reactions while monitoring member engagement." | Approval and screencast required. The product is described as "for clients"; eligibility for a personal use case is not stated. API Terms apply. |
| 23 | Company pages: scheduled or automated page posts through the approved app | Gray | API §3.1 item 26 (same text as row 6). | Same ambiguity as row 6. |
| 24 | Company pages: browser automation or extensions acting as the page | Prohibited | UA §8.2 items 2 and 13; Help a1341387. | — |
| 25 | Acting for other members: operating their account, sharing credentials or cookies, or using a member's network without permission | Prohibited | UA §2.2 ("You will not share your account with anyone else..."); UA §8.2 item 1; API §3.1 (network access "without their express permission"). | Company-page admin actions go through the approved app (row 22). |
| 26 | Storing data obtained through the API: caching content, profile data, or messages | Prohibited as written | API §4.1: "You must not capture, copy, cache, or store any Content or any information expressed by the Content"; §4.4 and §4.5 deletion duties. | Storage is allowed only where the Terms or program supplements explicitly permit it. Storing OAuth tokens is expressly permitted (§4.2). Whether the user's own posts count as "Content" is unresolved; the definition was not retrieved. |
| 27 | Storing data obtained by browser automation or scraping: messages, others' profiles, feed | Prohibited | UA §8.2 item 4: "Copy, use, display or distribute any information (including content) obtained from the Services ... without the consent of the content owner (such as LinkedIn for content it owns);" item 2. | — |

### Inferences
- Read literally, the terms allow a CLI only through official permissions (profile and email reads, and w_member_social or approved Community Management actions), and only for actions a user triggers one at a time. Everything else in the matrix is gray or prohibited.
- No retrieved text settles whether a CLI-triggered single post is "automating posting" under §3.1 item 26. The plain reading (a single user-triggered action is not automation) supports "Allowed," but LinkedIn has not confirmed it, so the label is marked as a plain reading.
- The API route does not shield the account from restriction: UA §3.4 and §9 and API §11.3 each permit restriction or suspension regardless of route.

### Gaps
- Whether a new developer app actually receives w_member_social (the page says Open Permissions are available to all developers, but no application was tested).
- Developer Program or Marketing Developer Platform supplemental terms were not retrieved; they could modify §3.1 item 26 or §4.
- The Community Management eligibility for a personal (non-agency) use case is not stated in the fetched text.
- Whether the API lets an app edit or delete its own posts was not verified.

## Key Question 3: What do LinkedIn's terms or help pages say about scheduled posting, automated replies, and automated likes or reactions?

### Takeaway
No LinkedIn help page on post scheduling, automated replies, or automated reactions was retrieved. The governing text is API §3.1 item 26 (using the APIs "to automate posting"), UA §8.2 item 13 (unauthorized automated methods to comment on, like, share or send messages), and PCP rules on spam and artificial engagement. Result: scheduled posting is gray; automated replies are prohibited for messages and gray for API comments; automated likes are gray through the official permission and prohibited through website automation or coordinated engagement.

### Cited Findings
- API §3.1 item 26 and UA §8.2 item 13: quoted in Key Questions 1 and 2 and matrix rows 6, 7, 10 and 13.
- PCP, "Be professional": "Don't do things to artificially increase engagement with your content." and "Do not spam members or the platform."
- GA, w_member_social: "Post, comment and like posts on behalf of an authenticated member." This is the only official permission covering posts, comments and likes for an individual.
- Help a1340567 (Sales Navigator center; relative stamp only): the rule against third-party software that "automate[s] activity on LinkedIn's website," quoted in Key Question 1. The page says nothing about scheduling or auto-replies.
- Help a1340567 contact route (paraphrase): members who use third-party productivity software can contact LinkedIn to ask it to consider partnering with those applications. The page says this feature is "gradually rolled out and is currently available only to some LinkedIn members." It does not say such software is permitted.

### Inferences
- The official API is the only route on which scheduling or automated comments or likes could be authorized at all. Its status is gray because of §3.1 item 26 and the "unauthorized" wording of item 13. Website-based scheduling or engagement tools are prohibited under Help a1341387.
- Automated replies to messages have no official route and are prohibited on any route.
- Automated likes through the API are gray for the reason given in matrix row 10. The PCP artificial-engagement rule still applies even if the API route is authorized.

### Gaps
- No LinkedIn page on native post scheduling was retrieved, so whether LinkedIn's own scheduler is available to members is unverified.
- Searches for automation rules returned mainly vendor blogs. They were excluded as non-authoritative.

## Key Question 4: What enforcement exists, and what triggers it?

### Takeaway
LinkedIn's published enforcement is account restriction, temporary or permanent, plus content-level actions. For automation, the help page asks the member to disable the tool, and says the account is re-enabled at the time in the suspension notice. Tools may stop working without notice. Restored access uses identity verification or an appeal. The retrieved pages describe no warning tier, no feature-limit thresholds, and no waiting periods. Triggers LinkedIn names: third-party software or extensions that scrape, alter appearance, or automate; automated inauthentic activity; fake accounts or fake engagement; repeated violating content; signs of account takeover; and some single violations, which can lead to permanent restriction.

### Cited Findings
- [Account restrictions, a1340522](https://www.linkedin.com/help/linkedin/answer/a1340522) (relative stamp only): "Access to your account may be restricted if you violate our Professional Community Policies." Some violations can lead to "permanent account restriction after a single violation." "Automated inauthentic activity violates the LinkedIn User Agreement." Automation can "result in temporary or permanent restriction of your account." Resolution: "If you believe your account was restricted in error, please login and follow the onscreen steps to verify your identity." For automation the page gives no steps; it says "please click here to learn more."
- [Help a1340567](https://www.linkedin.com/help/sales-navigator/answer/a1340567) (relative stamp only): "If your account is restricted for automated activity, we ask that you take the following actions:" followed by "Review and disable the software or extension that automates activities." "Your account will then automatically be re-enabled at the time specified on the suspension notification." "This is a violation of LinkedIn's User Agreement, and may be a violation of privacy legislation in specific jurisdictions."
- [Help a1341387](https://www.linkedin.com/help/linkedin/answer/a1341387) (relative stamp only): "This means that they risk having their accounts restricted or shut down." "They also risk the possibility that any prohibited tools they're using may become non-operational without notice." LinkedIn says it is "constantly working to improve our technical measures and defenses against the operation of scraping, automation, and other tools that abuse LinkedIn's platform."
- [PCP, enforcement section](https://www.linkedin.com/legal/professional-community-policies) (no date shown): "Depending on the severity of violation, we may limit the visibility of certain content, label it, or remove it entirely." "Repeated or egregious offenses can result in account restriction." "If you believe action taken on your content or your account was in error, you can submit an appeal."
- PCP (no date shown): "Combined with our automated defenses, these reports help us identify and prevent abuse." and "we use automated systems to identify potentially violative content."
- [UA §3.4](https://www.linkedin.com/legal/user-agreement) (fragment): "LinkedIn reserves the right to limit your use of the Services, including the number of your connections" and "your ability to contact other Members." It also says LinkedIn "reserves the right to restrict, suspend, or terminate your account if you breach this Contract or the law or are misusing the Services." UA §3.2 says LinkedIn "may also limit the availability of features."
- [UA §9](https://www.linkedin.com/legal/user-agreement): "We reserve the right to take action against serious violations of this Contract" ... "including by implementing account restrictions for significant violations."
- [API Terms §11.3–11.4](https://www.linkedin.com/legal/l/api-terms-of-use) (rev. 2022-12-13): API access may be suspended "at any time for any reason" (§11.3). For breach, termination follows if "such breach is not cured within 10 days after written notice" (§11.4).

### Inferences
- Enforcement is account-level. The official API route does not insulate the account, since UA §3.4, UA §9 and API §11.3 each allow restriction or suspension.
- No warnings, numeric thresholds, or waiting periods appear in the retrieved text, so the position of any given usage pattern on the gray scale cannot be quantified from LinkedIn's own sources.
- LinkedIn's steps for automation ask the member to disable the tool first, and then say the account is re-enabled at the time in the suspension notice. The steps point at the tool, not at request volume; this reading is inference from the page's instructions.

### Gaps
- The invitation-limit page ([a551012](https://www.linkedin.com/help/linkedin/answer/a551012/types-of-restrictions-for-sending-invitations)) and the "Restricted Action Message" page (a1339210) appeared in search results but were not fetched.
- A search summary reported a viewing restriction for unusually high page-view volume tied to third-party apps, with a 24-hour wait suggested. This is unverified; the source page was not fetched.
- No independent, non-vendor reporting on triggers was retrieved. Vendor claims about detection and restriction rates are unsourced and excluded.

## Key Question 5: Legal matters from 2024 to 2026 bearing on this, including hiQ and suits LinkedIn has brought against scraping or automation providers

### Takeaway
Two LinkedIn-brought matters from 2025–2026 (Proxycurl; ProAPIs and Netswift) ended in court-entered orders against operations that collected LinkedIn data without authorization. The hiQ case closed in December 2022 with a stipulated permanent injunction and a $500,000 judgment against hiQ. All three concerned unauthorized collection of LinkedIn data (hiQ and ProAPIs also involved fake accounts). None addressed a member's personal tool used on their own account. No LinkedIn-specific 2024 ruling was verified.

### Cited Findings
- hiQ ([Proskauer, dated 2022-12-08](https://newmedialaw.proskauer.com/2022/12/08/hiq-and-linkedin-reach-proposed-settlement-in-landmark-scraping-case/)): the parties filed a "Stipulation and Proposed Consent Judgment" on Dec. 6, 2022. "On December 8, 2022, the court issued an order granting the Consent Judgment and Permanent Injunction." "Judgment in the amount of $500,000 is entered against hiQ, with all other monetary relief waived."
- hiQ injunction (per the post): bars scraping LinkedIn "in violation of its User Agreement without the express written permission of LinkedIn," bars phony accounts, and bars building commercial offerings on LinkedIn data without LinkedIn's sign-off. The post says the prohibitions make "no express distinction between public and non-public/password-protected portions of LinkedIn."
- hiQ liability wording (per the post): under the Stipulation, hiQ agreed that LinkedIn "has established judgment as to liability under California law" on trespass to chattels and misappropriation, and that LinkedIn "may establish liability" under the CFAA. The post says these "were not findings by the court" and are "not of precedential value," and that the settlement terms "do not establish any binding legal precedent."
- hiQ history (per the same post): a 2017 injunction; a 2019 Ninth Circuit affirmance; a 2021 Supreme Court vacatur and remand; an April 2022 Ninth Circuit ruling that hiQ "raised at least serious questions" about CFAA coverage of public profiles; an August 2022 district court order dissolving the preliminary injunction; and a Nov. 4, 2022 "mixed ruling," in which hiQ prevailed on CFAA "unauthorized access" for public data but faced a ruling that it breached the User Agreement, "subject to its equitable defenses." The post gives no exact date for several of these rulings.
- Proxycurl ([Social Media Today, dated 2025-07-28](https://www.socialmediatoday.com/news/linkedin-wins-legal-case-data-scrapers-proxycurl/756101/)): the article says LinkedIn brought a federal lawsuit in January (year not stated; presumably 2025) alleging breaches of its user agreement. LinkedIn's legal executive said: "The Court has entered these requirements as a permanent injunction, which Proxycurl is obligated to send to its customers." The requirements, as LinkedIn describes them, are to "permanently delete all LinkedIn data obtained through unauthorized means" and to "stop accessing LinkedIn unlawfully." Proxycurl ceased operations earlier in July 2025. Not stated: court, case number, whether the order is consent or settlement, payment, and compliance deadlines.
- ProAPIs and Netswift ([The Record, published 2026-09-21](https://therecord.media/linkedin-wins-court-order-blocking-mass-scraping)): the defendants are ProAPIs and Netswift, plus an unnamed CEO. The article says LinkedIn sued "last October" (October 2025). "A California federal judge on Thursday finalized a deal between LinkedIn and two software companies." The deal "requires the firms to stop scraping user data on a mass scale," to "no longer access LinkedIn through fake accounts and delete the data that was scraped," and to stop selling or transferring the scraped data. "ProAPIs has agreed to a consent judgment in United States federal court." ProAPIs says it "does not offer tools to scrape LinkedIn." No payment is reported. The article names no court, judge, or case number, and gives no exact order date; the Thursday before publication is the implied date.
- Mantheos (Singapore): a search summary of a Law Street Media item reports an injunction covering scraping and data sales, with liability denied. Date unknown; not fetched. Lead only.
- A search summary claimed LinkedIn formally barred Apollo.io and Seamless.ai in 2025. No other retrieved source corroborates this. Excluded.

### Status as of 2026-10-20

| Matter | Key dates | Outcome | Status |
|---|---|---|---|
| hiQ Labs v. LinkedIn (N.D. Cal.; case no. 17-cv-03301-EMC per a search summary, not verified) | Suit from 2017; Ninth Circuit 2019 and 2022; Supreme Court 2021 vacatur and remand; Stipulation Dec. 6, 2022; order Dec. 8, 2022 | Consent judgment and permanent injunction; $500,000 against hiQ; other monetary relief waived; terms confidential | Closed. No later proceedings found in this pass; docket not checked. |
| LinkedIn v. Proxycurl | Suit filed January (2025 presumed); article July 28, 2025 | Permanent injunction per LinkedIn: delete LinkedIn data, stop access, notify customers | Resolved per LinkedIn's statement; court, case number, and entry date not verified. |
| LinkedIn v. ProAPIs and Netswift (federal court, California) | Suit filed October 2025; deal finalized the Thursday before 2026-09-21 (exact date not stated) | Consent judgment: stop mass scraping, stop selling scraped data, stop fake-account access, delete scraped data; no payment reported | Finalized per The Record; nothing reported as pending; docket not checked. |
| LinkedIn v. Mantheos (Singapore) | Unknown | Reported injunction; liability denied | Lead only; not fetched. |

### Inferences
- LinkedIn's litigation targets mass scraping and fake-account operations, resolved by court orders (consent judgments or permanent injunctions). None of the retrieved matters reached a ruling on a logged-in member's personal automation.
- The hiQ post states that the settlement creates no binding precedent. The Proxycurl article only suggests the outcome "may help shape the law"; the injunction binds the defendants and is not a general rule.
- The injunction language shows which harms LinkedIn treats as core: scraping, fake accounts, and reselling scraped data. This is inference from the orders' reported terms.

### Gaps
- No 2024 LinkedIn-specific case was verified. Other 2024 scraping decisions were not researched.
- Dockets for the Proxycurl and ProAPIs matters were not checked, and the hiQ case number comes from a search summary only.
- Order texts were not retrieved for any of these matters; summaries rely on press coverage and LinkedIn's statements.

## Key Question 6: What data-handling obligations apply to a personal tool that caches messages or profile data, under LinkedIn's terms and under GDPR or CCPA?

### Takeaway
Under LinkedIn's terms the route decides the rule. Through the API, caching is restricted (API §4.1, with deletion duties in §§4.4–4.5), profile data may be refreshed only during active use (§4.3), and OAuth tokens may be stored (§4.2). Through website automation or scraping, copying and using information obtained from the Services without the content owner's consent is prohibited (UA §8.2 item 4). Messages have no official route. GDPR Art. 2(2)(c) excludes purely personal or household processing, but the text does not settle how far that reaches third parties' messages and profile data. CCPA's "business" tests, per a search summary of CPPA's page, probably do not reach an individual's personal tool, but the statute text was not retrieved.

### Cited Findings
- API Terms §§4.1–4.5 (quoted in Key Question 2; matrix row 26).
- UA §8.2 item 4 (quoted in matrix row 27).
- UA §2.2 (fragment): "(e.g., sell or transfer the personal data of others by transferring your connections)".
- [GDPR Article 2](https://gdpr-info.eu/art-2-gdpr/) (no date shown; verbatim): "This Regulation does not apply to the processing of personal data:" and point (c): "by a natural person in the course of a purely personal or household activity;"
- [CPPA thresholds page](https://cppa.ca.gov/regulations/cpi_adjustment.html) (search summary only; not fetched; paraphrase): a for-profit business that operates in California and controls how consumer data is handled is covered if it meets one of three tests: gross annual revenue above an inflation-adjusted threshold (the summary gives $26,625,000, effective January 1, 2025); buying, selling, or sharing the personal information of 100,000 or more consumers or households a year; or earning half or more of its revenue from selling or sharing consumers' data.

### Inferences
- A tool that keeps data only on the user's own machine, for the user's own purposes, sits closest to the GDPR household exemption. Sharing data, syncing it to a hosted service, or distributing it to others would move the tool outside that exemption. Whether publishing an npm package makes the publisher a controller is not determined by the retrieved text and needs legal review.
- Caching other people's messages and profile data conflicts with LinkedIn's own terms on the website route regardless of privacy law. That is a contract issue independent of GDPR or CCPA.
- CCPA: an individual running a personal tool is unlikely to meet the business tests. That conclusion rests on a search summary of the thresholds, not on statute text.

### Gaps
- Case law on the scope of the GDPR household exemption was not checked.
- GDPR Articles 5, 6 and 32 were not retrieved. They would apply if the exemption does not.
- The CCPA statute and the California Attorney General page could not be retrieved: oag.ca.gov returned a DNS error, and leginfo.legislature.ca.gov returned HTTP 403.
- LinkedIn's Privacy Policy and member data export options were not checked.

## Open uncertainties
- Whether API §3.1 item 26 ("automate posting") covers scheduled or CLI-triggered posts, comments and likes (matrix rows 5–6, 9–10, 12–13, 22–23).
- Whether a personal, non-agency app can obtain w_member_social or Community Management approval, and on what terms.
- The definition of "Content" in the API Terms, which decides whether caching a user's own posts is prohibited (row 26).
- Whether LinkedIn publishes any numeric limit for invitations, messages, or page views.
