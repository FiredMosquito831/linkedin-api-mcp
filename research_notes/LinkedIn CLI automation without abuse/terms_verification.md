# LinkedIn terms verification

Checked against the live pages on 2026-10-20. This verifies the earlier notes at `D:\Projects2\LinkedInApi\research_notes\LinkedIn CLI automation without abuse\terms_and_abuse_boundaries.md`. It is research into published terms, not legal advice.

**Bottom line.** The clauses the earlier notes rely on are verbatim: UA §8.2 items 2, 3, 4, 13, 15 and 16, the help-article passage, and API Terms §3.1 item 26. Three things need correcting. The §4.1 quote stops before an exception clause. The §4.3 refresh limit applies only to Profile Data "stored pursuant to this Section". One help-page sentence ends in a colon, not a comma. Nothing in the fetched text settles whether a single post made from a user's own command-line tool is "automate posting" under API §3.1 item 26, and no LinkedIn page found addresses it.

## Method and limits

- All 12 pages were fetched on 2026-10-20 with a browser user agent (HTTP 200 for each), saved as raw HTML, and converted to text by stripping tags. This is the page's own text, not a model's summary. Text that exists only in JavaScript or appears only after a click would not show up.
- Every quoted string of 10 or more characters in the notes (160 in all, duplicates included) was searched in the 12 page texts. Matching ignored curly versus straight quote marks, dashes and non-breaking spaces. An ellipsis split a quote into fragments that had to appear in order.
- Quotes below use straight quote marks; the pages use curly ones in places. Words, capitalization and punctuation are otherwise as on the page, and deviations are noted.
- Item numbers for UA §8.2 and API §3.1 come from the page's HTML ordered lists (no start attribute, positions counted). The positions match the notes for UA items 2, 3, 4, 13, 15 and 16 and API items 3, 10, 24 and 26. API item 23 is the network-access item the notes left unnumbered.
- WebSearch (standard mode) was used only for Q3. Search results are marked as snippet-level where used.

## Sources and dates

| Page | URL | Date shown on the page |
|---|---|---|
| User Agreement (UA) | [UA](https://www.linkedin.com/legal/user-agreement) | Page label "Effective on November 3, 2025". No separate last-updated date. |
| API Terms of Use (API) | [API Terms](https://www.linkedin.com/legal/l/api-terms-of-use) | "Last revised on December 13th, 2022." Also "For existing developers, these updated Terms take effect on January 13th, 2023." |
| Help a1341387 | [a1341387](https://www.linkedin.com/help/linkedin/answer/a1341387) | "Last updated: 2 years ago" (relative only) |
| Help a1340567 | [a1340567](https://www.linkedin.com/help/sales-navigator/answer/a1340567) | "Last updated: 2 weeks ago" (relative only) |
| Help a1340522 | [a1340522](https://www.linkedin.com/help/linkedin/answer/a1340522) | "Last updated: 1 year ago" (relative only) |
| Professional Community Policies (PCP) | [PCP](https://www.linkedin.com/legal/professional-community-policies) | No date found |
| Getting Access (GA, Microsoft Learn) | [GA](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access) | Metadata ms.date 2025-06-24 and updated_at 2026-06-03. The visible footer says "Last updated on 2025-06-26". These conflict. |
| Community Management overview (CM, Microsoft Learn) | [CM](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview) | Metadata ms.date 2026-03-31 and updated_at 2026-05-15. Footer "Last updated on 2026-05-15". |
| hiQ post (Proskauer) | [Proskauer](https://newmedialaw.proskauer.com/2022/12/08/hiq-and-linkedin-reach-proposed-settlement-in-landmark-scraping-case/) | Published 2022-12-08; modified 2022-12-09 (metadata) |
| Social Media Today (Proxycurl) | [SMT](https://www.socialmediatoday.com/news/linkedin-wins-legal-case-data-scrapers-proxycurl/756101/) | Published 2025-07-28 |
| The Record (ProAPIs, Netswift) | [The Record](https://therecord.media/linkedin-wins-court-order-blocking-mass-scraping) | Published 2026-09-21 |
| GDPR Article 2 | [GDPR Art. 2](https://gdpr-info.eu/art-2-gdpr/) | No date in the article text |

## Key Question 1: Exact wording of the clauses

### Takeaway
UA §8.2 items 2, 3, 4, 13, 15 and 16 are verbatim in the notes and on the UA page, and the help article reprints them. API §3.1 item 26 reads "Use the Content or the APIs to automate posting on the LinkedIn Services." The §4.1 and §4.3 quotes are verbatim but incomplete. The §4.1 sentence continues past the point where the notes end it, and the §4.3 refresh limit covers only Profile Data stored under that section.

### Cited Findings

**UA §8.2 "Don'ts"** (lead-in: "You agree that you will not:"). Source: [UA](https://www.linkedin.com/legal/user-agreement), dated "Effective on November 3, 2025".
- Item 2: "Develop, support or use software, devices, scripts, robots or any other means or processes (such as crawlers, browser plugins and add-ons or any other technology) to scrape or copy the Services, including profiles and other data from the Services;" (confirmed)
- Item 13: "Use bots or other unauthorized automated methods to access the Services, add or download contacts, send or redirect messages, create, comment on, like, share, or re-share posts, or otherwise drive inauthentic engagement;" (confirmed)
- Item 15: "Overlay or otherwise modify the Services or their appearance (such as by inserting elements into the Services or removing, covering, or obscuring an advertisement included on the Services);" (confirmed)
- Item 3: "Override any security feature or bypass or circumvent any access controls or use limits of the Services (such as search results, profiles, or videos);" (confirmed)
- Item 4: "Copy, use, display or distribute any information (including content) obtained from the Services, whether directly or through third parties (such as search tools or data aggregators or brokers), without the consent of the content owner (such as LinkedIn for content it owns);" (confirmed)
- Item 16: "Interfere with the operation of, or place an unreasonable load on, the Services (e.g., spam, denial of service attack, viruses, manipulating algorithms);" (confirmed)
- Item 1 (the notes quote its ending): "Create a false identity on LinkedIn, misrepresent your identity, create a Member profile for anyone other than yourself (a real person), or use or attempt to use another's account (such as sharing log-in credentials or copying cookies);" (confirmed)
- §8 lead-in: "LinkedIn is a community of professionals. This list of 'Dos and Don'ts' along with our Professional Community Policies limits what you can and cannot do on our Services, unless otherwise explicitly permitted by LinkedIn in a separate writing (e.g., through a research agreement)."

**Help a1341387** ([a1341387](https://www.linkedin.com/help/linkedin/answer/a1341387); "Last updated: 2 years ago"):
- "In order to protect our members' data and our website, we don't permit the use of any third party software, including "crawlers", bots, browser plug-ins, or browser extensions that scrape, modify the appearance of, or automate activity on LinkedIn's website." (confirmed; the page puts double quote marks around "crawlers")
- "All of these tools violate the User Agreement, including, but not limited to, the following prohibitions listed in Section 8.2:" (the page ends with a colon; see Q4)
- "Any member who uses tools for such purposes is in violation of the User Agreement." (confirmed)
- The page reprints UA items 2, 13, 15, 4, 3, 12 and 16. Its item 16 reads "...viruses, gaming algorithms)." The UA says "manipulating algorithms".

**API Terms §3.1** ([API Terms](https://www.linkedin.com/legal/l/api-terms-of-use); "Last revised on December 13th, 2022."):
- Lead-in: "You must not nor may you allow your Users to use the APIs or Content except as expressly allowed in the Terms." and "In addition to the other terms and conditions in these Terms, except as expressly set forth herein, you agree not to, nor to authorize your Users to, do the following:"
- **Item 26: "Use the Content or the APIs to automate posting on the LinkedIn Services."** (confirmed; 26th item in the ordered list)
- Item 24: "Access, store, display, or facilitate the transfer of any LinkedIn content obtained through the following methods: scraping, crawling, spidering or using any other technology or software to access LinkedIn content outside the APIs (such content, collectively, "Non-Official Content")." (the notes cut this sentence after "outside the APIs")
- Item 23: "Access a Member's network of connections through your Application without their express permission or enable a Member to share their networks or data about their networks to anyone else through your Application;"
- Item 10: "...or to generate mass messages, promotions or offers;"
- Item 3: "Request or publish information impersonating a Member, misrepresent any User or other third party in requesting information or allow any third party, ..."

**API §4.1 "No Storing Any Content"** (same source; rev. 2022-12-13):
- "You may not store any Content, except in the specific circumstances outlined."
- "You must not capture, copy, cache, or store any Content or any information expressed by the Content (such as hashed or transformed data), except to the extent expressly permitted by these Terms or any applicable Additional Terms." (the notes end this at "Content.")
- "Where storage of Content is permitted: (a) you must store all Content in a manner which enables you to identify, segregate, and selectively delete such Content; and (b) you will store Content only for the duration necessary for you to provide your Application's services to your Users."

**API §4.2 "You May Store Tokens"**: "You may store the Application-specific Member tokens and authentication tokens acquired on a Member's behalf."

**API §4.3 "Member Profile Data"**:
- "If required by law, you may store profile data if you have the legally valid consent of the Member to do so."
- "'Profile Data' means any or all of a Member's profile data (including first name, last name, and profile picture) available through an applicable API, subject to a Member's profile visibility and other privacy settings. Profile Data excludes data such as a Member's network, network updates, job listings, groups, ad companies, and any other similar content."
- "If you want to refresh a Member's Profile Data that was stored pursuant to this Section, you may only do so when the Member is actually using your Application and not on an automated schedule." (the notes quote only the last clause)

**API §4.4 and §4.5**:
- §4.4: "You must immediately delete all Content collected through the APIs on behalf of a User, including the Member Token and the OAuth Access Token, upon request by that User,or when the User closes their account with you, except when doing so would cause you to violate any law or obligation imposed by a governmental authority." (the page has no space after "User,")
- §4.5: "If we notify you that you have breached these Terms, or if you no longer operate your Application or otherwise no longer use the Content, you must delete all stored LinkedIn data."

**API §11.3 and §11.4**:
- §11.3: "We may suspend or terminate these Terms or your access to the APIs or Content at any time for any reason."
- §11.4(e): "...upon the occurrence of a material breach of these Terms by the other party, if such breach is not cured within 10 days after written notice identifying the matter constituting the material breach is provided by the non-breaching party."

### Inferences
- The help article limits its prohibition to software that acts on "LinkedIn's website". It does not mention the APIs.
- API §3.1 item 24 bans scraping "outside the APIs". The Terms therefore name API access and scraping as separate routes. This is the text itself, not an inference about item 26.
- The page does not define "unauthorized" in UA §8.2 item 13.

### Gaps
- The UA §8.2 items the notes had not retrieved (10 and 17–19) are now available. None names posting or scheduling. Item 8 covers posting content that contains harmful code.
- The Developer Documentation and Vetted-program Additional Terms were not fetched (see Q2).

## Key Question 2: Does item 26 reach a user-run CLI post?

### Takeaway
Nothing in the fetched text settles it. Item 26 contains no words limiting it to scheduled, unattended or automated posting, and no words excluding one action the account holder starts. "Automate" and "posting" are not defined in the API Terms.

### Cited Findings
- Item 26 is the last item in the list that opens with "except as expressly set forth herein, you agree not to ... do the following" ([API Terms](https://www.linkedin.com/legal/l/api-terms-of-use)). No exception for single or user-run actions appears in §3.1.
- Definitions: "Application" (§1.1) is "a software application, website, product, or service ... registered at the LinkedIn developer site". "APIs" (§1.2) "means programmatic web APIs, software and other functionality and their associated tools and documentation that LinkedIn makes available on the Developer Site." "Content" (§1.3) "means any data or content from the LinkedIn Services or accessed via the APIs ...". None of these defines automation or posting.
- Word checks on the API Terms text: "schedul" appears once, in §4.3 ("not on an automated schedule"). "Automat" appears four times: §2.3 ("You must create the profiles manually and not via automated means, such as scripts."), §3.1 item 16 ("through automated or other means;"), §4.3, and item 26. The word "unattended" does not appear.
- The UA uses "automate" in another sense, for LinkedIn's own features: "features we offer that automate content generation for you" ([UA](https://www.linkedin.com/legal/user-agreement), §3.6). The UA does not define the word either.
- Eligibility example, §1.4: "...for example, by augmenting their profile and professional brand in an Application for publishing, discussing and sharing content with like-minded professionals." This describes publishing as a use of an Application. It does not mention item 26.
- Vetted programs, §1.2: "With respect to a Vetted API Program, in the event of a conflict between the applicable Additional Terms and these Terms, the Additional Terms shall control." The Additional Terms were not fetched.
- Developer Documentation, §1.3: "In addition to compliance with these Terms, your use of our APIs and Content must comply with the Developer Documentation that we provide to you." and "In the event of any conflict between the Developer Documentation and these Terms, these Terms shall control." The Developer Documentation was not fetched.
- Permission model, [GA](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access): under "Open Permissions (Consumer)", "Share on LinkedIn | w_member_social | Member Auth: Post, comment and like posts on behalf of an authenticated member." The section says these "may be added via self-service through the LinkedIn Developer Portal". For this permission the page describes self-service addition, not a separate approval step.
- Vetted use case, [CM](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview), "Approved Use Cases" > "Profile Management": "Create and manage posts, comments, and reactions while monitoring engagement on behalf of individual profiles." The page does not say whether this use sits outside item 26.

### Inferences
- Plain statement: the fetched text does not settle whether a CLI command that the account holder runs, through an app they registered, counts as "automate posting" under item 26.
- The notes label matrix rows 5, 9 and 12 "Allowed (plain reading)". That label assumes item 26 excludes single human-triggered actions. No quoted text contains that exclusion. The label is the notes' inference.

### Gaps
- Developer Documentation (usage guidelines) not retrieved.
- Vetted-program Additional Terms (Community Management, Marketing) not retrieved. Under §1.2 they control over the Terms in a conflict.
- No linkedin.com page found that addresses scheduled, unattended or user-triggered posting (see Q3).

## Key Question 3: Do any help or developer pages say what automated posting members may do?

### Takeaway
No retrieved page says that any form of automated posting by members is allowed or prohibited. The developer pages state what the API permits. The help pages prohibit third-party software that automates activity on LinkedIn's website, and one help sentence calls third-party software that automates tasks a violation of the User Agreement. A standard search for LinkedIn's own scheduling help returned only third-party guides.

### Cited Findings
- GA, "Open Permissions (Consumer)": "Share on LinkedIn | w_member_social | Member Auth: Post, comment and like posts on behalf of an authenticated member." ([GA](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access))
- CM: "Vetted Product with development and standard tiers." and "The Community Management API enables developers to manage LinkedIn company pages for clients and access account details (admins, roles, followers) and analytics, including comments, reactions, and page activity." ([CM](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview))
- CM FAQ 6, a different and closed permission: "r_member_social is a closed permission. We're not accepting access requests at this time due to resource constraints."
- Help a1340567 ([a1340567](https://www.linkedin.com/help/sales-navigator/answer/a1340567); "Last updated: 2 weeks ago"): "we don't allow the use of third-party software or browser extensions that scrape, modify the appearance of, or automate activity on LinkedIn's website."
- Help a1340567, same section: "Third-party software that automates tasks could potentially export or scrape data from LinkedIn and affects authenticity; at times, without your consent. This is a violation of LinkedIn's User Agreement, and may be a violation of privacy legislation in specific jurisdictions." The page does not say whether "This" refers to the automation or only to the export and scraping. The notes omit this sentence.
- Help a1340567, contact route: "If you'd like to provide more details about your account so we can take a second look, or if you're leveraging third party software for productivity reasons and would want LinkedIn to consider partnering with these applications, please log in and contact us. Note: This feature is being gradually rolled out and is currently available only to some LinkedIn members." This is a review request route, not a permission.
- Help a1340522 ([a1340522](https://www.linkedin.com/help/linkedin/answer/a1340522)): "Automated inauthentic activity violates the LinkedIn User Agreement and can result in temporary or permanent restriction of your account."
- WebSearch, "LinkedIn help schedule a post" (snippet level, not fetched): the results were third-party guides, for example [bardeen.ai](https://www.bardeen.ai/answers/how-to-schedule-a-post-on-linkedin) and [Waalaxy](https://blog.waalaxy.com/en/how-to-schedule-a-post-on-linkedin/). They describe a clock icon in the LinkedIn composer. No linkedin.com help page appeared. These are leads only.
- WebSearch, "LinkedIn help third-party apps post on behalf of members" (snippet level, not fetched): the results included the [Share on LinkedIn](https://developer.linkedin.com/documents/share-api) developer page, and the summary attributes w_member_social to it.

### Inferences
- The developer pages state what the API permits. Neither states conditions on frequency, scheduling or human involvement.
- The help pages refer to "LinkedIn's website". The pages do not say whether an API client falls under that wording.

### Gaps
- No linkedin.com page on native scheduling, auto-replies or auto-likes was retrieved. Whether LinkedIn's own scheduler is available to members is unverified.
- Developer post and Share guides, and the Developer Documentation, were not fetched.

## Key Question 4: Status of each quote in the earlier notes

### Takeaway
The notes contain 160 quoted strings of 10 or more characters, duplicates included. 148 are confirmed: 122 exactly, and 26 match the words with the notes' cut or punctuation. 6 are corrected. 6 are not found. Four of those are the notes' own phrases or a title rather than page wording; two are not on the pages ("Member Data" and "may help shape the law"). Line numbers are the notes' lines. Quotes repeated across the notes are listed once.

### Cited Findings

**Corrected** (page wording given):

| Notes line | Notes wording | Correct wording | Source |
|---|---|---|---|
| 37 | "...the following prohibitions listed in Section 8.2," | "...the following prohibitions listed in Section 8.2:" (colon, which introduces the list) | [a1341387](https://www.linkedin.com/help/linkedin/answer/a1341387) |
| 69 | "You must not capture, copy, cache, or store any Content or any information expressed by the Content." | "You must not capture, copy, cache, or store any Content or any information expressed by the Content (such as hashed or transformed data), except to the extent expressly permitted by these Terms or any applicable Additional Terms." | [API Terms](https://www.linkedin.com/legal/l/api-terms-of-use) §4.1 |
| 92 | "Unauthorized" | "unauthorized" (lowercase, as in UA §8.2 item 13) | [UA](https://www.linkedin.com/legal/user-agreement) |
| 103 | "enable[s] page admins to search followers by keyword or vanity URL." | "enable page admins to search followers by keyword or vanity URL." (no bracketed s) | [CM](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview) |
| 113 | "automating posting" | "automate posting" | [API Terms](https://www.linkedin.com/legal/l/api-terms-of-use) item 26 |
| 131 | "automate[s] activity on LinkedIn's website," | "automate activity on LinkedIn's website." (no bracketed s) | [a1340567](https://www.linkedin.com/help/sales-navigator/answer/a1340567) |

**Not found:**
- L5 "last updated": not a quotation. The pages show "Last updated: N years ago" stamps.
- L27 "unofficial API.": not on any of the 12 pages. The notes' negative claim holds for these pages.
- L51 "Member Data,": not in the UA or API Terms text. The API Terms term is "Profile Data" (§4.3).
- L93 "engagement pod.": not on any of the 12 pages. The negative claim holds for these pages.
- L164 "Restricted Action Message": title of a1339210, which was not fetched.
- L194 "may help shape the law": not in the text extracted from [SMT](https://www.socialmediatoday.com/news/linkedin-wins-legal-case-data-scrapers-proxycurl/756101/) (9,186 characters). The word "shape" does not appear in it.

**Confirmed, exact** (verbatim, including punctuation):
- UA: "manipulating algorithms" (L5, L34); item 2 (L30) and its ellipsis version (L45, L86); item 13 (L31) and its ellipsis version (L70, L92); "unauthorized automated methods" (L78, L95); "send or redirect messages" (L80); "add or download contacts" (L83); "download contacts" (L85, L100); "comment on" (L95); item 15 (L32); item 3 (L33); "such as search results, profiles, or videos" (L87, L102); item 16 (L34); "otherwise explicitly permitted by LinkedIn in a separate writing (e.g., through a research agreement)." (L35); "The Services may include content automatically generated and shared using tools offered by LinkedIn or others off LinkedIn." (L40); item 4 (L96) and its ellipsis version (L109); "or use or attempt to use another's account (such as sharing log-in credentials or copying cookies);" (L59, L76); "You will not share your account with anyone else and will follow our policies and the law." (L75, L107); "(e.g., sell or transfer the personal data of others by transferring your connections)" (L100, L210); "LinkedIn reserves the right to limit your use of the Services, including the number of your connections" and "your ability to contact other Members." (L154); "We reserve the right to take action against serious violations of this Contract" and "including by implementing account restrictions for significant violations." (L155).
- Help a1341387: the intro sentence (L36); "Any member who uses tools for such purposes is in violation of the User Agreement." (L37); "we don't permit the use of any third party software ... website." (L90, ellipsis); "fake engagement" (L93); "This means that they risk having their accounts restricted or shut down.", "They also risk the possibility that any prohibited tools they're using may become non-operational without notice.", and "constantly working to improve our technical measures and defenses against the operation of scraping, automation, and other tools that abuse LinkedIn's platform." (L151).
- Help a1340567: "we don't allow the use of third-party software ... website." (L38); "gradually rolled out and is currently available only to some LinkedIn members." (L132); "If your account is restricted for automated activity, we ask that you take the following actions:" (L112); "Review and disable the software or extension that automates activities." (L113); "Your account will then automatically be re-enabled at the time specified on the suspension notification." (L114); "This is a violation of LinkedIn's User Agreement, and may be a violation of privacy legislation in specific jurisdictions." (L115); "unauthorized" (L135).
- Help a1340522 (L149): "Access to your account may be restricted if you violate our Professional Community Policies."; "permanent account restriction after a single violation."; "result in temporary or permanent restriction of your account."; "If you believe your account was restricted in error, please login and follow the onscreen steps to verify your identity."; "please click here to learn more."
- PCP: "Be professional" (L39, L129); "Do not spam members or the platform." (L39, L95, L129); "Don't do things to artificially increase engagement with your content." (L39, L92, L129); "Respond authentically to others' content and don't agree with others ahead of time to like or re-share each other's content." (L93); "We don't allow untargeted, irrelevant, obviously unwanted, unauthorized, inappropriate commercial or promotional, or gratuitously repetitive messages or similar content." (L98); "Do not use our invitation feature to send promotional messages to people you don't know or to otherwise spam people." (L99); "Depending on the severity of violation, we may limit the visibility of certain content, label it, or remove it entirely." (L152); "Repeated or egregious offenses can result in account restriction." (L152); "If you believe action taken on your content or your account was in error, you can submit an appeal." (L152); "Combined with our automated defenses, these reports help us identify and prevent abuse." (L153); "we use automated systems to identify potentially violative content." (L153).
- API: "and not on an automated schedule" (L56); "to automate posting" (L56, L125, L226); "automate posting" (L87, L160); "Use the Content or the APIs to automate posting on the LinkedIn Services." (L65, L88); "you will store Content only for the duration necessary for you to provide your Application's services to your Users." (L69); "You may store the Application-specific Member tokens and authentication tokens acquired on a Member's behalf." (L70); "Member Profile Data" (L71, L84); "you may only do so when the Member is actually using your Application and not on an automated schedule." (L71, L84); "You must immediately delete all Content collected through the APIs on behalf of a User," (L72); "if you no longer operate your Application or otherwise no longer use the Content, you must delete all stored LinkedIn data." (L73); "We may suspend or terminate these Terms or your access to the APIs or Content at any time for any reason." (L74); "without their express permission" (L107); "You must not capture, copy, cache, or store any Content or any information expressed by the Content" (L108, no final period); "at any time for any reason" and "such breach is not cured within 10 days after written notice" (L156); "No Storing Any Content" (L69).
- GA: "Most permissions and partner programs require explicit approval from LinkedIn. Open Permissions are the only permissions that are available to all developers without special approval." (L59); "Post, comment and like posts on behalf of an authenticated member." (L56, L60, L87, L94, L130; ellipsis form at L91); "Retrieve authenticated member's name, headline, and photo." (L60, L83); "Retrieve authenticated member's primary email address." (L60).
- CM: "The Community Management API enables developers to manage LinkedIn company pages for clients and access account details (admins, roles, followers) and analytics, including comments, reactions, and page activity." (L62); "Create and manage posts, comments, and reactions while monitoring engagement on behalf of individual profiles." (L62); "Vetted Product with development and standard tiers." (L63, L104); "a screencast video demonstrating each use case" (L63); "r_member_social is a closed permission. We're not accepting access requests at this time due to resource constraints." (L64); "Create and manage company posts, comments, and reactions while monitoring member engagement." (L104); "for clients" (L104).
- Proskauer: "Stipulation and Proposed Consent Judgment"; "On December 8, 2022, the court issued an order granting the Consent Judgment and Permanent Injunction."; "Judgment in the amount of $500,000 is entered against hiQ, with all other monetary relief waived." (L174); "no express distinction between public and non-public/password-protected portions of LinkedIn." (L175); "has established judgment as to liability under California law"; "may establish liability"; "were not findings by the court" (L176); "raised at least serious questions"; "unauthorized access" (L177).
- SMT: "The Court has entered these requirements as a permanent injunction, which Proxycurl is obligated to send to its customers."; "permanently delete all LinkedIn data obtained through unauthorized means"; "stop accessing LinkedIn unlawfully." (L178).
- The Record: "last October"; "no longer access LinkedIn through fake accounts and delete the data that was scraped,"; "does not offer tools to scrape LinkedIn." (L179).
- GDPR Art. 2: "This Regulation does not apply to the processing of personal data:"; "by a natural person in the course of a purely personal or household activity;" (L211).

**Confirmed, words only** (the notes cut the sentence, or the punctuation differs; the words appear on the page):
- L8 "Effective on November 3, 2025." (UA page label, no period on the page). L11, L12, L13 "Last updated: ..." stamps (no period on the page). L27 "Prohibited software and extensions." (help page title).
- L35 "This list of 'Dos and Don'ts' along with our Professional Community Policies limits what you can and cannot do," (the sentence continues: "on our Services, unless ...").
- L41 "scraping, crawling, spidering or using any other technology or software to access LinkedIn content outside the APIs." (the page continues "(such content, collectively, "Non-Official Content")").
- L56 "to generate mass messages." (the page continues ", promotions or offers;"). L66 and L98 "to generate mass messages, promotions or offers." (the page ends with ";").
- L62 "Create and manage company posts, comments, and reactions while monitoring member engagement," (the page ends with a period).
- L67 "Access a Member's network of connections through your Application without their express permission." (the page continues "or enable a Member to share ...").
- L68 "Request or publish information impersonating a Member." (the page continues ", misrepresent any User ...").
- L87 "unauthorized automated methods." (the page continues "to access the Services ...").
- L88 and L103 "People Typeahead," (the page continues "People Typeahead: Discover members for @mentions ...").
- L126 and L154 "reserves the right to restrict, suspend, or terminate your account if you breach this Contract or the law or are misusing the Services." (the page continues "(e.g., violating any of the Dos and Don'ts or Professional Community Policies).").
- L127 "may also limit the availability of features." (the page continues ", content and other information so that ...").
- L149 "Automated inauthentic activity violates the LinkedIn User Agreement." (the page continues "and can result in temporary or permanent restriction of your account.").
- L175 "in violation of its User Agreement without the express written permission of LinkedIn" (in the hiQ post).
- L176 "not of precedential value,"; "do not establish any binding legal precedent." (in the hiQ post).
- L177 "mixed ruling,"; "subject to its equitable defenses." (in the hiQ post).
- L179 "A California federal judge on Thursday finalized a deal between LinkedIn and two software companies."; "requires the firms to stop scraping user data on a mass scale,"; "ProAPIs has agreed to a consent judgment in United States federal court." (The Record).

**Corrected:** L37, L69, L92, L103, L113, L131 (see the table above).

**Not found:** L5, L27, L51, L93, L164, L194 (see above).

### Inferences: notes claims that the live text changes (not quotes)
1. Matrix row 2 and the Key Q2 profile-refresh point treat API §4.3 as covering all profile data. The refresh limit applies only to "Profile Data that was stored pursuant to this Section" ([API Terms](https://www.linkedin.com/legal/l/api-terms-of-use) §4.3).
2. Matrix row 26 (§4.1) relies on a sentence that the page continues with an exception: "except to the extent expressly permitted by these Terms or any applicable Additional Terms". That exception bears directly on caching.
3. The "Allowed (plain reading)" labels for rows 5, 9 and 12 are not supported by the text (see Q2).
4. The gap "definitions of 'Content,' 'Member Data,' and 'Users' were not retrieved" is partly closed. "Content" is defined in §1.3 and "Users" in §1.4. "Member Data" does not appear in the Terms; the defined term is "Profile Data".
5. The gap "UA §8.2 items 10 and 17–19 were not retrieved" is closed (see Q1).
6. The notes' Q3 summary of [a1340567](https://www.linkedin.com/help/sales-navigator/answer/a1340567) omits the "This is a violation of LinkedIn's User Agreement" sentence about third-party software that automates tasks (see Q3). The notes' statement that the page does not say such software is permitted is consistent with the text.
7. Date conflict: the notes' "updated 2026-06-03" for [GA](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access) is the metadata value. The visible footer says "Last updated on 2025-06-26".
8. The notes say the PCP text does not mention bots or third-party tools. That holds: "bot" and "third" each occur zero times in the fetched PCP text. The PCP text also contains "automat" three times and "scrap" once. Those were not examined.
9. The notes say the network-access item in §3.1 has no item number. It is item 23.
10. The notes' statement that the Sales Navigator page "says nothing about scheduling" was not checked against the full page text.

### Gaps
- Quotes from sources the notes cite but I did not fetch: help a1339210, help a551012, the Mantheos item, and the CPPA threshold figures. These were not checked.
- The "may help shape the law" phrase may be missing from the SMT extract because the article rendered only partly. The check did not establish that.
- Dockets and order texts for the hiQ, Proxycurl and ProAPIs matters were not checked.
