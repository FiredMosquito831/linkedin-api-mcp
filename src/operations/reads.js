// Named, structured LinkedIn READ adapters.
//
// createReadAdapter(session) takes a controller-owned surface session
// ({ page, context, navigate(url), check(), close() }) and returns
// { execute(name, input) }. The adapter never opens or closes sessions itself.
//
// Guarantees:
//  - Reads are single-page: at most one navigation per execute() call, at most
//    input.limit (default 10, max 50) items parsed from the DOM that was loaded.
//    The adapter never auto-scrolls, clicks, types into, or submits anything.
//    (No send/apply/follow is ever dispatched from a read.)
//  - `cursor` is a nonnegative integer page offset, never a URL. For search
//    operations it selects the server page (URL `offset=`), and the returned
//    items always start at the first record of that loaded page (the cursor is
//    applied exactly once, on the server, not re-applied to the DOM). For
//    every other operation the cursor offsets into the items already visible
//    on the loaded page.
//  - `nextCursor` is returned only when a further page actually exists: more
//    items in the loaded DOM for page-based lists, or a filled (full-limit)
//    page for server-paged search lists (then `cursor + limit`).
//  - List containers get a bounded settle wait after domcontentloaded (the
//    DOM may populate lazily); a single immediate count would false-fail SPAs.
//  - URL inputs are validated for the exact https://www.linkedin.com origin and
//    for the route families each operation knows. Off-route or off-origin input
//    throws INVALID_INPUT before navigation.
//  - Missing required DOM throws ReadOperationError code LAYOUT_UNSUPPORTED.
//    Plan-restricted surfaces (Sales Navigator, paywalled analytics) throw
//    ACCESS_RESTRICTED. The session's navigate/check checkpoint/401/403/429
//    errors (HumanInterventionError and friends) propagate untouched.
//  - Analytics values are reported as null / available:false when absent; no
//    numbers are ever invented.
//
// Side effect to remember: opening /messaging/ or a thread may mark the
// conversation read; inbox results carry a `sideEffect` note.
//
// Browser DOM content is untrusted data; nothing parsed here is ever executed.

import { HumanInterventionError, linkedinUrl } from '../experimental/policy.js';

const LINKEDIN_ORIGIN = 'https://www.linkedin.com';
const OWN_PROFILE_URL = `${LINKEDIN_ORIGIN}/in/me/`;
const POST_FAMILIES = ['/feed/update/', '/posts/'];
const TEXT_LIMIT = 5000;
const ITEM_LIMIT = 50;
// Bounded settle window after navigation so SPA list endpoints that populate
// after domcontentloaded have a chance to render. Exceeding it is a
// LAYOUT_UNSUPPORTED verdict, never an unbounded loop.
const DOM_SETTLE_TIMEOUT = 5000;
// Text that means the plan-required surface is locked out, not merely empty.
const RESTRICTION_MARKERS =
  /sign in to sales navigator|try sales navigator|sales navigator.*free trial|premium required|not available with your (current )?plan|restricted to sales navigator|access denied/i;

export class ReadOperationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ReadOperationError';
    this.code = code;
  }
}

const invalid = (message) => new ReadOperationError('INVALID_INPUT', message);
const layout = (message) => new ReadOperationError('LAYOUT_UNSUPPORTED', message);
const restricted = (message) => new ReadOperationError('ACCESS_RESTRICTED', message);
const unsupported = (name) =>
  new ReadOperationError('UNSUPPORTED_OPERATION', `Unknown read operation: ${String(name)}.`);

function collapse(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

// Deterministic counter parsing: "3,456" -> 3456, "1.2K" -> 1200, "8M" -> 8000000.
// Anything else stays null (never guessed).
function splitCounter(raw) {
  if (raw == null) return null;
  const match = String(raw).match(/^\s*([\d][\d.,]*)\s*([KkMm])?\s*(.*)$/);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  const suffix = (match[2] ?? '').toLowerCase();
  const factor = suffix === 'm' ? 1e6 : suffix === 'k' ? 1e3 : 1;
  return { value: Math.round(value * factor), label: match[3].trim() || null, text: String(raw).trim() };
}

function classifyCounter(text) {
  if (/comment/i.test(text)) return 'comments';
  if (/share|repost|republish/i.test(text)) return 'shares';
  if (/react|like|love|applaud|celebrate|support|insightful|funny/i.test(text)) return 'reactions';
  return null;
}

async function textOf(scope, selectors, { required = false, label = 'field' } = {}) {
  for (const selector of selectors) {
    const locator = scope.locator(selector);
    if (await locator.count() === 0) continue;
    const raw = collapse(await locator.first().innerText({ timeout: 3000 }).catch(() => null));
    if (raw) return raw.length > TEXT_LIMIT ? raw.slice(0, TEXT_LIMIT) : raw;
  }
  if (required) throw layout(`Required DOM for ${label} was not found; this layout is not supported.`);
  return null;
}

// Bounded settle: SPAs may populate list containers after domcontentloaded, so a
// single immediate count() false-fails. Retry the candidate selectors for up to
// `settleMs` (no unbounded loop, no auto-scroll). The first check passes, so
// static fixtures add no delay.
async function findItems(page, selectors, { settleMs = DOM_SETTLE_TIMEOUT, stepMs = 200 } = {}) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  const deadline = Date.now() + settleMs;
  for (;;) {
    for (const selector of selectors) {
      const locator = page.locator(selector);
      if (await locator.count() > 0) return locator;
    }
    if (Date.now() >= deadline) return null;
    await page.waitForTimeout(stepMs);
  }
}

// Bounded, one-page slicing: the adapter never auto-scrolls for more.
function sliceWindow(total, { limit, cursor }) {
  const start = Math.min(cursor, total);
  const count = Math.min(limit, total - start);
  return { start, count, nextCursor: total > start + count ? start + count : null };
}

async function readTimestamp(scope, extraSelectors = []) {
  const time = scope.locator('time[datetime]');
  if (await time.count() > 0) {
    const first = time.first();
    const iso = (await first.getAttribute('datetime')) || null;
    const text = collapse(await first.innerText({ timeout: 3000 }).catch(() => ''));
    return { iso, text: text || null };
  }
  for (const selector of extraSelectors) {
    const locator = scope.locator(selector);
    if (await locator.count() === 0) continue;
    const text = collapse(await locator.first().innerText({ timeout: 3000 }).catch(() => ''));
    if (text) return { iso: null, text };
  }
  return null;
}

async function readCounters(scope) {
  const counters = {};
  const entries = scope.locator('.update-components-counts li, .update-shared-card__stats li');
  const total = await entries.count();
  for (let i = 0; i < total; i += 1) {
    const text = collapse(await entries.nth(i).textContent().catch(() => ''));
    if (!text) continue;
    const key = classifyCounter(text);
    if (!key || key in counters) continue;
    const parsed = splitCounter(text);
    counters[key] = { value: parsed?.value ?? null, text };
  }
  return counters;
}

function absolutize(page, href) {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) {
    try {
      return new URL(href).href;
    } catch {
      return href;
    }
  }
  const base = /^https?:\/\//i.test(page.url()) ? page.url() : LINKEDIN_ORIGIN;
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

function activityId(url) {
  if (!url) return null;
  const match = String(url).match(/urn:li:activity:(\d+)/);
  return match ? `urn:li:activity:${match[1]}` : null;
}

function jobIdFromUrl(url) {
  if (!url) return null;
  const query = String(url).match(/[?&]id=(\d+)/);
  if (query) return query[1];
  const path = String(url).match(/\/jobs\/view\/(\d+)/);
  return path ? path[1] : null;
}

// ---------------------------------------------------------------------------
// Shared post-card parsing (posts.list, feed.list, companies.posts, posts.get)
// ---------------------------------------------------------------------------

// LinkedIn obfuscates its class names, so the live anchors are structural:
// data-testid, roles and aria labels. The class-based candidates stay for the
// older markup and for the fixtures.
const POST_CARD_SELECTORS = [
  'li[data-anonymize="post"]',
  'article.update',
  'li.update',
  '.organization-update',
  // Only list items that carry a reaction control are posts; the rest of the
  // feed list is suggested people, ads and module cards.
  '[data-testid="mainFeed"] [role="listitem"]:has([aria-label^="Reaction button state"])',
  '[data-testid="mainFeed"] [role="listitem"]',
  '[data-testid="mainFeed"] > div',
];
const POST_AUTHOR_SELECTORS = [
  '.update-components-actor-name',
  '.update-shared-card__author-name',
  '[data-anonymize="author"]',
  // Live markup: the author is the profile link inside the post card.
  'a[href*="/in/"]',
];
const POST_TEXT_SELECTORS = [
  '.update-components-text',
  '.update-shared-feed-content__text',
  '.show-more-less-text__text',
  '[data-testid="expandable-text-box"]',
];
const POST_TIMESTAMP_SELECTORS = ['.update-components-timestamp', '.update-feed-list__timestamp'];
const POST_LINK_SELECTOR = 'a[href*="feed/update"], a[href*="posts/"], a[href*="activity"]';

// The first profile link in a card is often the avatar, which has no text, so
// take the first link that actually renders a name.
async function authorLinkText(card) {
  const links = card.locator('a[href*="/in/"]');
  const total = Math.min(await links.count().catch(() => 0), 5);
  for (let i = 0; i < total; i += 1) {
    const text = collapse(await links.nth(i).innerText({ timeout: 2000 }).catch(() => ''));
    if (text) return text.slice(0, 200);
  }
  return null;
}

async function parsePostCard(card, page) {
  const link = card.locator(POST_LINK_SELECTOR);
  let url = null;
  let id = null;
  if (await link.count() > 0) {
    url = absolutize(page, await link.first().getAttribute('href'));
    id = activityId(url);
  }
  return {
    id,
    url,
    author: (await textOf(card, POST_AUTHOR_SELECTORS)) ?? await authorLinkText(card),
    postedAt: await readTimestamp(card, POST_TIMESTAMP_SELECTORS),
    text: await textOf(card, POST_TEXT_SELECTORS),
    counters: await readCounters(card),
  };
}

// An account with no posts or connections is a valid empty result, not a
// layout failure. Only an explicit empty-state marker counts; a page with
// neither rows nor the marker still fails closed.
async function hasEmptyState(page, pattern) {
  // Read the rendered text rather than per-element matches: LinkedIn splits
  // counts and labels across nodes, which defeats getByText.
  const text = await page.locator('main').first().innerText({ timeout: 3000 }).catch(() => '');
  return pattern.test(text);
}

async function runPostCards(ctx, page) {
  const items = await findItems(page, POST_CARD_SELECTORS);
  if (!items) {
    if (await hasEmptyState(page, /haven.t posted yet|no posts yet|no posts to show|nothing to see for now/i)) {
      return { items: [], nextCursor: null, empty: true };
    }
    throw layout('No post cards found; this post list layout is not supported.');
  }
  const { start, count, nextCursor } = sliceWindow(await items.count(), ctx);
  const result = [];
  for (let i = 0; i < count; i += 1) result.push(await parsePostCard(items.nth(start + i), page));
  return { items: result, nextCursor };
}

async function runPostGet(ctx, page) {
  const text = await textOf(page, POST_TEXT_SELECTORS, { required: true, label: 'post text' });
  let id = activityId(ctx.url);
  let url = ctx.url;
  if (id === null) {
    const link = page.locator(POST_LINK_SELECTOR);
    if (await link.count() > 0) {
      const linkUrl = absolutize(page, await link.first().getAttribute('href'));
      id = activityId(linkUrl) ?? activityId(ctx.url);
      url = linkUrl ?? ctx.url;
    }
  }
  return {
    id,
    url,
    author: await textOf(page, POST_AUTHOR_SELECTORS),
    postedAt: await readTimestamp(page, POST_TIMESTAMP_SELECTORS),
    text,
    counters: await readCounters(page),
  };
}

// ---------------------------------------------------------------------------
// Comments and reactions (post pages)
// ---------------------------------------------------------------------------

const COMMENT_ITEM_SELECTORS = [
  '.update-comments-list li.update-comment',
  'li.update-comment',
  '.update-comments li',
];
const COMMENT_AUTHOR_SELECTORS = ['.update-comment__actor-name', '.update-comment__author-name'];
const COMMENT_TEXT_SELECTORS = ['.update-comment__content', '.update-comment__body'];

async function runComments(ctx, page) {
  const items = await findItems(page, COMMENT_ITEM_SELECTORS);
  if (items) {
    const { start, count, nextCursor } = sliceWindow(await items.count(), ctx);
    const result = [];
    for (let i = 0; i < count; i += 1) {
      const item = items.nth(start + i);
      result.push({
        author: await textOf(item, COMMENT_AUTHOR_SELECTORS),
        text: await textOf(item, COMMENT_TEXT_SELECTORS, { required: true, label: 'comment text' }),
        postedAt: await readTimestamp(item),
      });
    }
    return { items: result, nextCursor, postUrl: ctx.url };
  }
  // A visible "no comments" region is an empty state, not a layout failure.
  if (await page.getByText(/add a comment|no comments yet|be the first/i).count() > 0) {
    return { items: [], nextCursor: null, empty: true, postUrl: ctx.url };
  }
  throw layout('No comment list found on this post page; this layout is not supported.');
}

const REACTION_ITEM_SELECTORS = [
  'li.update-reaction-component',
  '.update-reaction-component',
  '[data-anonymize="reaction"]',
];

async function runReactions(ctx, page) {
  const groups = await findItems(page, REACTION_ITEM_SELECTORS);
  if (groups) {
    const { start, count, nextCursor } = sliceWindow(await groups.count(), ctx);
    const result = [];
    for (let i = 0; i < count; i += 1) {
      const group = groups.nth(start + i);
      const text = collapse(await group.textContent().catch(() => ''));
      const parsed = splitCounter(text);
      result.push({
        type: (await group.getAttribute('aria-label')) ?? (await group.getAttribute('title')) ?? null,
        value: parsed?.value ?? null,
        text: text || null,
      });
    }
    return { items: result, nextCursor, postUrl: ctx.url };
  }
  // Reaction groups may be collapsed into plain counts; that is still structured.
  const counters = await readCounters(page);
  if (counters.reactions !== undefined) {
    return { items: [], nextCursor: null, counters, postUrl: ctx.url };
  }
  throw layout('No reaction data found on this post page; this layout is not supported.');
}

// ---------------------------------------------------------------------------
// Profile readers
// ---------------------------------------------------------------------------

const PROFILE_NAME_SELECTORS = [
  '#profile-header-card .pv-text-body--heading3',
  '.profile-hero__name',
  '#profile-header-card h1',
  // Live markup: the member name is the first h2 inside the content column,
  // in an SDUI profile card; no h1 exists on the page.
  '[componentkey*="profile.card"] h2',
  'main h2',
];

async function runProfileGet(ctx, page) {
  const name = await textOf(page, PROFILE_NAME_SELECTORS, { required: true, label: 'profile name' });
  const sections = [];
  for (const section of [
    { id: 'profile-experience', name: 'experience' },
    { id: 'profile-education', name: 'education' },
  ]) {
    const scope = page.locator(`[data-section-id="${section.id}"]`);
    if (await scope.count() === 0) continue;
    const entries = scope.locator('li');
    const total = await entries.count();
    const texts = [];
    for (let i = 0; i < Math.min(total, ctx.limit); i += 1) {
      const text = collapse(await entries.nth(i).innerText({ timeout: 3000 }).catch(() => ''));
      if (text) texts.push(text.length > TEXT_LIMIT ? text.slice(0, TEXT_LIMIT) : text);
    }
    sections.push({ id: section.id, name: section.name, items: texts });
  }
  return {
    url: ctx.url,
    name,
    headline: await textOf(page, ['#profile-header-card .pv-text--large', '.profile-overview__headline']),
    about: await textOf(page, [
      '[data-section-id="profile-about"] .show-more-less-text__text',
      '.pv-about__summary',
      '[data-section-id="profile-about"] p',
    ]),
    location: await textOf(page, [
      '[data-section-id="profile-locations"] .pv-entry-list__text',
      '#profile-header-card .pv-text--muted',
    ]),
    sections,
  };
}

const SKILL_ITEM_SELECTORS = [
  '[data-section-id="profile-skills"] li[data-anonymize="skill"]',
  '[data-section-id="profile-skills"] .skill-list li',
  '[data-section-id="profile-skills"] li',
];

async function runProfileSkills(ctx, page) {
  const items = await findItems(page, SKILL_ITEM_SELECTORS);
  if (!items) throw layout('No skills section found; this profile layout is not supported.');
  const { start, count, nextCursor } = sliceWindow(await items.count(), ctx);
  const result = [];
  for (let i = 0; i < count; i += 1) {
    const item = items.nth(start + i);
    result.push({
      name: await textOf(item, ['.skill-list__item-title'], { required: true, label: 'skill name' }),
      details: await textOf(item, ['.skill-list__item-count']),
    });
  }
  return { items: result, nextCursor };
}

async function runProfileContact(ctx, page) {
  const section = page.locator('[data-section-id="profile-contact-info"]');
  if (await section.count() === 0) {
    throw layout('No contact-info section found; this profile layout is not supported.');
  }
  const anchors = section.locator('a');
  const total = await anchors.count();
  const items = [];
  for (let i = 0; i < Math.min(total, ctx.limit); i += 1) {
    const anchor = anchors.nth(i);
    const href = (await anchor.getAttribute('href')) ?? '';
    const label = collapse(await anchor.innerText({ timeout: 3000 }).catch(() => '')) || null;
    let type = null;
    let value = null;
    if (href.startsWith('mailto:')) {
      type = 'email';
      value = label ?? href.slice('mailto:'.length);
    } else if (href.startsWith('tel:')) {
      type = 'phone';
      value = label ?? href.slice('tel:'.length);
    } else if (/^https?:/i.test(href)) {
      type = 'website';
      value = href;
    } else if (label) {
      type = 'other';
      value = label;
    }
    if (type) items.push({ type, value, label });
  }
  return { items };
}

const DEGREE_SELECTORS = [
  '[data-anonymize="connections"] .text-body-small--muted',
  '[data-anonymize="connections"] span',
  'li[data-anonymize="connections"]',
];

async function runConnectionsStatus(ctx, page) {
  const degree = await textOf(page, DEGREE_SELECTORS);
  const followAvailable = (await page.locator('a:has-text("Follow"), button:has-text("Follow")').count()) > 0;
  if (degree === null && !followAvailable) {
    throw layout('No connection-degree or follow indicator found; this profile layout is not supported.');
  }
  let connected = null;
  if (/^1st/i.test(degree ?? '')) connected = true;
  else if (followAvailable || degree !== null) connected = false;
  return {
    profileUrl: ctx.url,
    degree,
    connected,
    followAvailable,
    note: connected === null ? 'Connection state could not be determined from this layout.' : null,
  };
}

// ---------------------------------------------------------------------------
// Messaging (inbox) readers. Side effect: opening these surfaces may mark
// conversations read; results carry a `sideEffect` note.
// ---------------------------------------------------------------------------

const INBOX_ITEM_SELECTORS = [
  'li.msg-s-listitem',
  'li[class^="msg-s-"]',
  '.messaging-conversations li[class*="msg-s-"]',
  // Live markup: real conversations are the thread links in the labelled list.
  // The "new message" stub is excluded, because it is not a conversation.
  '[aria-label="Conversation List"] a[href*="/messaging/thread/"]:not([href$="/thread/new/"]):not([href*="/thread/new/"])',
];

async function parseInboxItems(ctx, page) {
  const items = await findItems(page, INBOX_ITEM_SELECTORS);
  if (!items) {
    if (await hasEmptyState(page, /no messages.{0,4}yet|reach out and start a conversation/i)) {
      return { items: [], nextCursor: null, empty: true };
    }
    throw layout('No conversation rows found; this messaging layout is not supported.');
  }
  const { start, count, nextCursor } = sliceWindow(await items.count(), ctx);
  const result = [];
  for (let i = 0; i < count; i += 1) {
    const row = items.nth(start + i);
    const link = row.locator('a[href*="/messaging/thread/"]');
    const snippet = row.locator('.msg-s-truncate:not(.msg-s-truncate--first-name)');
    const snippetText =
      (await snippet.count()) > 0 ? collapse(await snippet.first().innerText({ timeout: 3000 }).catch(() => '')) : '';
    // Live rows are the thread links themselves, so fall back to the row's own
    // text when the named spans are absent.
    let peer = await textOf(row, ['.msg-s-truncate--first-name', '.msg-s-truncate']);
    if (!peer) {
      const own = collapse(await row.innerText({ timeout: 3000 }).catch(() => ''));
      peer = own ? own.slice(0, 200) : null;
    }
    if (!peer) throw layout('Required DOM for conversation peer was not found; this layout is not supported.');
    // The row is the thread link in the live markup, so read its own href then.
    let threadHref = (await link.count()) > 0 ? await link.first().getAttribute('href') : null;
    if (!threadHref) threadHref = await row.getAttribute('href').catch(() => null);
    result.push({
      peer,
      snippet: snippetText || null,
      unread: (await row.locator('.msg-s-truncate--unread, .msg-s-new-item-bubble').count()) > 0,
      threadUrl: threadHref ? absolutize(page, threadHref) : null,
      lastActivity: await readTimestamp(row, ['.msg-s-truncate__timestamp']),
    });
  }
  return { items: result, nextCursor };
}

async function runInboxList(ctx, page) {
  return parseInboxItems(ctx, page);
}

async function runInboxSearch(ctx, page) {
  const data = await parseInboxItems(ctx, page);
  const needle = ctx.query.toLowerCase();
  data.items = data.items.filter((item) => `${item.peer} ${item.snippet ?? ''}`.toLowerCase().includes(needle));
  data.query = ctx.query;
  data.matchedCount = data.items.length;
  data.nextCursor = null;
  data.note = 'Filters the conversations visible on this page; the in-app search box is not automated.';
  return data;
}

const THREAD_ITEM_SELECTORS = ['li.msg-s-im-fragment', 'li[class*="msg-s-im"]'];

async function runInboxThread(ctx, page) {
  const items = await findItems(page, THREAD_ITEM_SELECTORS);
  if (!items) throw layout('No message fragments found; this conversation layout is not supported.');
  const { start, count, nextCursor } = sliceWindow(await items.count(), ctx);
  const result = [];
  for (let i = 0; i < count; i += 1) {
    const fragment = items.nth(start + i);
    result.push({
      author: await textOf(fragment, ['.msg-s-im-fragment__author-name', '.msg-s-im-fragment__actor-name']),
      text: await textOf(fragment, ['.msg-s-im-fragment__message-text', '.msg-s-im-fragment__text'], {
        required: true,
        label: 'message text',
      }),
      postedAt: await readTimestamp(fragment, ['.msg-s-im-fragment__timestamp']),
    });
  }
  return { items: result, nextCursor, threadUrl: ctx.url };
}

// ---------------------------------------------------------------------------
// Network: connections and invitations
// ---------------------------------------------------------------------------

const CONNECTION_ITEM_SELECTORS = [
  'li[data-anonymize="connections-list-item"]',
  'li.my-network-card',
  '#connections-list li',
  // Live markup: the results container is stable even though the row markup is
  // obfuscated, so accept the list items it holds. A generic `main li` is
  // deliberately not used: it would match sidebar rows and return junk.
  '[data-testid="show-results-inline-container"] [class*="mn-connection"]',
];

async function runConnectionsList(ctx, page) {
  const items = await findItems(page, CONNECTION_ITEM_SELECTORS);
  if (!items) {
    if (await hasEmptyState(page, /0\s*connections|no connections yet|you don.t have any connections/i)) {
      return { items: [], nextCursor: null, empty: true };
    }
    throw layout('No connection rows found; this network layout is not supported.');
  }
  const { start, count, nextCursor } = sliceWindow(await items.count(), ctx);
  const result = [];
  for (let i = 0; i < count; i += 1) {
    const row = items.nth(start + i);
    const link = row.locator('a[href^="/in/"], a[href*="/in/"]');
    result.push({
      name: await textOf(row, ['.my-network-card__title', '.entity-result__title-text', '.title'], {
        required: true,
        label: 'connection name',
      }),
      headline: await textOf(row, ['.subtitle', '.text-body-small--muted']),
      url: (await link.count()) > 0 ? absolutize(page, await link.first().getAttribute('href')) : null,
    });
  }
  return { items: result, nextCursor };
}

const INVITATION_ITEM_SELECTORS = ['li[data-anonymize="invitation"]', 'li.invitation', '.invitation-card'];

async function runInvitations(ctx, page) {
  const items = await findItems(page, INVITATION_ITEM_SELECTORS);
  if (!items) throw layout('No invitation cards found; this invitations layout is not supported.');
  const { start, count, nextCursor } = sliceWindow(await items.count(), ctx);
  const result = [];
  for (let i = 0; i < count; i += 1) {
    const card = items.nth(start + i);
    const link = card.locator('a[href^="/in/"]');
    result.push({
      name: await textOf(card, ['.invitation-card__title', '.entity-result__title-text', '.title'], {
        required: true,
        label: 'invitation name',
      }),
      headline: await textOf(card, ['.invitation-card__subtitle', '.subtitle']),
      url: (await link.count()) > 0 ? absolutize(page, await link.first().getAttribute('href')) : null,
      requestedAt: await readTimestamp(card),
    });
  }
  return { items: result, nextCursor };
}

// ---------------------------------------------------------------------------
// Search readers: the URL is always built from the known route + query + offset.
// ---------------------------------------------------------------------------

// Built from documented LinkedIn routes only (no live verification): the
// global search UI lives at /search/results/ (legacy /search/<entity>/ routes
// are still accepted as landed routes via the family list), and the jobs
// search UI at /jobs/search/. `cursor` becomes the page `offset` parameter.
function buildSearchUrl(route, { query, cursor, origin }) {
  const url = new URL(`${LINKEDIN_ORIGIN}${route}`);
  url.searchParams.set('keywords', query);
  if (origin) url.searchParams.set('origin', origin);
  if (cursor > 0) url.searchParams.set('offset', String(cursor));
  return url.href;
}

const SEARCH_ITEM_SELECTORS = [
  'li.search-results__list-item',
  // Live job results carry a job id on the card itself.
  '[data-occludable-job-id]',
  '[data-job-id]',
];
const SEARCH_TITLE_SELECTORS = [
  '.entity-result__title-text',
  '.search-result__entity-name',
  '.job-card-list__title',
  // Live markup: the job title is the link text to the job page.
  'a[href*="/jobs/view/"]',
];
const SEARCH_SNIPPET_SELECTORS = [
  '.entity-result__summary',
  '.search-result__description',
  '.job-card-container__metadata',
];

async function runSearch(ctx, page) {
  const items = await findItems(page, SEARCH_ITEM_SELECTORS);
  if (!items) {
    if (await page.getByText(/no results/i).count() > 0) {
      return { items: [], nextCursor: null, query: ctx.query, empty: true };
    }
    throw layout('No search results found; this search layout is not supported.');
  }
  // Server-paged lists: ctx.cursor already moved the URL to the requested page
  // (offset=), so the DOM slice ALWAYS starts at 0. Applying cursor twice
  // (offset in URL and skip in DOM) would skip records on every page.
  const total = await items.count();
  const count = Math.min(ctx.limit, total);
  const result = [];
  for (let i = 0; i < count; i += 1) {
    const row = items.nth(i);
    const record = {
      type: ctx.config.kind,
      title: await textOf(row, SEARCH_TITLE_SELECTORS, { required: true, label: 'result title' }),
      snippet: await textOf(row, SEARCH_SNIPPET_SELECTORS),
      url: null,
    };
    const link = row.locator('a[href]');
    if (await link.count() > 0) record.url = absolutize(page, await link.first().getAttribute('href'));
    if (ctx.config.kind === 'job') {
      record.company = await textOf(row, ['.job-card-container__primary-description', '.job-card__company']);
      record.location = await textOf(row, ['.job-card-container__metadata']);
      record.id = jobIdFromUrl(record.url) ?? jobIdFromUrl(ctx.url);
    }
    if (ctx.config.kind === 'post') record.id = activityId(record.url);
    result.push(record);
  }
  // A filled page is the only honest "another page may exist" signal we can
  // get without navigating further. Never invent a nextCursor for a short page.
  const nextCursor = count === ctx.limit ? ctx.cursor + ctx.limit : null;
  return { items: result, nextCursor, query: ctx.query };
}

// ---------------------------------------------------------------------------
// Company readers
// ---------------------------------------------------------------------------

const COMPANY_NAME_SELECTORS = [
  '.org-company-header__title',
  '.org-header__title',
  '[data-test-id="org-header"] h1',
  // Live markup: the company name is the page's only h1.
  'main h1',
];

function companySlug(url) {
  try {
    return new URL(url).pathname.split('/').filter(Boolean)[1] ?? null;
  } catch {
    return null;
  }
}

async function runCompanyGet(ctx, page) {
  const metrics = page.locator('.org-summary-info__metrics .org-summary-info__metrics-list-item');
  let followers = null;
  if (await metrics.count() > 0) {
    const text = collapse(await metrics.first().innerText({ timeout: 3000 }).catch(() => ''));
    const parsed = splitCounter(text);
    followers = parsed ? { value: parsed.value, text } : { value: null, text };
  }
  return {
    slug: companySlug(ctx.url),
    name: await textOf(page, COMPANY_NAME_SELECTORS, { required: true, label: 'company name' }),
    about: await textOf(page, ['.org-about__text', '.org-about__subtitle']),
    followers,
  };
}

// Accept /company/<slug>/ and /company/<slug>/posts/; always read /posts/.
function normalizeCompanyPostsUrl(url) {
  const target = new URL(url);
  const base = target.pathname.replace(/\/+$/, '').replace(/\/posts\/?$/, '');
  target.pathname = `${base}/posts/`;
  target.search = '';
  target.hash = '';
  return target.href;
}

// ---------------------------------------------------------------------------
// Job readers. Reads never click the apply button; jobs.apply-url only reads
// the apply link's href attribute.
// ---------------------------------------------------------------------------

const JOB_CARD_SELECTORS = [
  'li.job-card',
  '.job-card',
  '.job-card-container',
  'li[class*="job-card"]',
  // Live markup: job cards expose an id attribute instead of named classes.
  '[data-occludable-job-id]',
  '[data-job-id]',
];
const JOB_TITLE_SELECTORS = [
  '.job-card-list__title',
  '.job-card-bubble-title',
  '.job-card-container__job-title',
  'a[href*="/jobs/view/"]',
];

async function parseJobCard(card, page) {
  const link = card.locator('a[href*="/jobs/"]');
  const url = (await link.count()) > 0 ? absolutize(page, await link.first().getAttribute('href')) : null;
  return {
    id: jobIdFromUrl(url),
    url,
    title: await textOf(card, JOB_TITLE_SELECTORS, { required: true, label: 'job title' }),
    company: await textOf(card, ['.job-card-container__primary-description', '.job-card__company']),
    location: await textOf(card, ['.job-card-container__metadata', '.job-card__location']),
    postedAt: await readTimestamp(card, ['.job-card__dates']),
    salary: await textOf(card, ['.job-search-card-wages', '.job-card__salary']),
  };
}

async function runJobCards(ctx, page) {
  const items = await findItems(page, JOB_CARD_SELECTORS);
  if (!items) throw layout('No job cards found; this jobs layout is not supported.');
  const { start, count, nextCursor } = sliceWindow(await items.count(), ctx);
  const result = [];
  for (let i = 0; i < count; i += 1) result.push(await parseJobCard(items.nth(start + i), page));
  return { items: result, nextCursor };
}

async function runJobGet(ctx, page) {
  return {
    id: jobIdFromUrl(ctx.url),
    url: ctx.url,
    title: await textOf(page, ['#job-title', 'h1.job-title', '.show-more-less-text__h3', 'h1'], {
      required: true,
      label: 'job title',
    }),
    company: await textOf(page, ['.job-cb__title', '.job-cb__link']),
    location: await textOf(page, ['.job-search-card-location', '.job-location']),
    salary: await textOf(page, ['.job-search-card-salary', '.job-search-card-wages']),
    postedAt: await readTimestamp(page, ['.job-posted-date']),
    description: await textOf(page, ['.show-more-less-text__showing-more-text', '#job-description']),
  };
}

const APPLY_LINK_SELECTORS = [
  'a[data-control-name*="apply"]',
  '.jobs-utility-bar__apply-button a[href]',
  'a.jobs-utility-bar__apply-button[href]',
  'a[href*="apply"]',
];

async function runJobApplyUrl(ctx, page) {
  await textOf(page, ['#job-title', 'h1.job-title', '.job-card-list__title'], {
    required: true,
    label: 'job page',
  });
  for (const selector of APPLY_LINK_SELECTORS) {
    const link = page.locator(selector);
    if (await link.count() === 0) continue;
    const href = await link.first().getAttribute('href');
    if (href) return { id: jobIdFromUrl(ctx.url), url: ctx.url, applyUrl: absolutize(page, href), note: null };
  }
  return { id: jobIdFromUrl(ctx.url), url: ctx.url, applyUrl: null, note: 'apply_url_not_found' };
}

// ---------------------------------------------------------------------------
// Analytics readers: absent data is reported as null / available:false, never
// invented. Plan-restricted pages throw ACCESS_RESTRICTED.
// ---------------------------------------------------------------------------

async function detectAccessRestriction(page, name) {
  let text = '';
  try {
    text = await page.locator('main, body').first().innerText({ timeout: 3000 });
  } catch {
    return;
  }
  if (RESTRICTION_MARKERS.test(text.slice(0, 40000))) {
    throw restricted(`${name} is not available on this account (plan-restricted surface).`);
  }
}

async function runAnalyticsProfileViews(ctx, page) {
  const value = await textOf(page, [
    '.analytics-metric .text-heading-xlarge',
    '[data-test*="profile-view"]',
    '.pv-analytics-value',
  ]);
  const parsed = value ? splitCounter(value) : null;
  return {
    metric: 'profile-views',
    value: parsed?.value ?? null,
    text: parsed?.text ?? null,
    available: parsed !== null,
    url: ctx.url,
  };
}

async function runAnalyticsSsi(ctx, page) {
  const rating = await textOf(page, ['.simplified-strength h3', '[data-test*="simplified-strength"] h3']);
  return {
    metric: 'simplified-strength',
    rating,
    available: rating !== null,
    url: ctx.url,
  };
}

async function runAnalyticsPost(ctx, page) {
  const card = await findItems(page, ['.post-insights-card', '[data-anonymize="post-analytics"]']);
  if (!card) {
    return { metrics: {}, available: false, url: ctx.url, note: 'post insights are not visible on this page' };
  }
  const rows = card.locator('div:has(> .text-heading-xlarge)');
  const total = await rows.count();
  const metrics = {};
  for (let i = 0; i < total; i += 1) {
    const row = rows.nth(i);
    const raw = collapse(
      await row
        .locator('.text-heading-xlarge')
        .first()
        .innerText({ timeout: 3000 })
        .catch(() => ''),
    );
    const parsed = splitCounter(raw);
    if (!parsed) continue;
    const label = collapse(await row.innerText({ timeout: 3000 }).catch(() => ''));
    const key = /impression/i.test(label)
      ? 'impressions'
      : /reaction|like/i.test(label)
        ? 'reactions'
        : /click/i.test(label)
          ? 'clicks'
          : null;
    if (key && metrics[key] === undefined) metrics[key] = { value: parsed.value, text: parsed.text };
  }
  return { metrics, available: Object.keys(metrics).length > 0, url: ctx.url };
}

// ---------------------------------------------------------------------------
// Sales Navigator readers (plan-restricted; ACCESS_RESTRICTED when paywalled).
// In-app search cannot be expressed in a URL, so sales.search-* filter the
// cards visible on the current page and say so in `note`.
// ---------------------------------------------------------------------------

const LEAD_CARD_SELECTORS = ['li[data-anonymize="lead"]', '.lead-card', 'li.lead-item'];
const LEAD_NAME_SELECTORS = ['.lead-card__title', '.lead-card__name', '[data-anonymize="lead-name"]'];
const LEAD_COMPANY_SELECTORS = ['.lead-card__company', '.lead-card__headline'];

async function parseLeadCards(ctx, page) {
  const items = await findItems(page, LEAD_CARD_SELECTORS);
  if (!items) throw layout('No lead cards found; this Sales layout is not supported.');
  const { start, count, nextCursor } = sliceWindow(await items.count(), ctx);
  const result = [];
  for (let i = 0; i < count; i += 1) {
    const card = items.nth(start + i);
    const link = card.locator('a[href*="/sales/"], a[href^="/in/"]');
    result.push({
      name: await textOf(card, LEAD_NAME_SELECTORS, { required: true, label: 'lead name' }),
      company: await textOf(card, LEAD_COMPANY_SELECTORS),
      url: (await link.count()) > 0 ? absolutize(page, await link.first().getAttribute('href')) : null,
    });
  }
  return { items: result, nextCursor };
}

async function runSalesProfile(ctx, page) {
  const { items } = await parseLeadCards({ ...ctx, limit: 1 }, page);
  if (items.length === 0) return { name: null, company: null, url: null };
  return items[0];
}

async function runSalesSearchPeople(ctx, page) {
  const data = await parseLeadCards({ ...ctx, limit: ITEM_LIMIT }, page);
  const needle = ctx.query.toLowerCase();
  data.items = data.items.filter((item) => `${item.name} ${item.company ?? ''}`.toLowerCase().includes(needle));
  data.query = ctx.query;
  data.note = 'Filters the leads visible on this page; Sales Navigator in-app search is not automated.';
  return data;
}

const SALES_COMPANY_SELECTORS = ['li[data-anonymize="company-card"]', '.company-card'];

async function runSalesSearchCompanies(ctx, page) {
  const items = await findItems(page, SALES_COMPANY_SELECTORS);
  if (!items) throw layout('No company cards found; this Sales layout is not supported.');
  const needle = ctx.query.toLowerCase();
  const rows = [];
  const total = await items.count();
  for (let i = 0; i < total; i += 1) {
    const card = items.nth(i);
    const name = await textOf(card, ['.company-card__title', '.company-card__name']);
    if (name && `${name}`.toLowerCase().includes(needle)) {
      rows.push({ name, about: await textOf(card, ['.company-card__about']), url: null });
    }
    if (rows.length >= ctx.limit) break;
  }
  return { items: rows, nextCursor: null, query: ctx.query };
}

const SALES_INBOX_SELECTORS = ['li[data-anonymize="inbox-item"]', '.inbox-thread'];

async function runSalesInbox(ctx, page) {
  const items = await findItems(page, SALES_INBOX_SELECTORS);
  if (!items) throw layout('No inbox threads found; this Sales layout is not supported.');
  const { start, count, nextCursor } = sliceWindow(await items.count(), ctx);
  const result = [];
  for (let i = 0; i < count; i += 1) {
    const row = items.nth(start + i);
    result.push({
      peer: await textOf(row, ['.inbox-thread__peer', '.inbox-item__peer', '.inbox-thread__title']),
      snippet: await textOf(row, ['.inbox-thread__snippet']),
    });
  }
  return { items: result, nextCursor };
}

const SALES_MESSAGE_SELECTORS = ['li[data-anonymize="inbox-message"]', '.inbox-message', '.inbox-message-fragment'];

async function runSalesThread(ctx, page) {
  const items = await findItems(page, SALES_MESSAGE_SELECTORS);
  if (!items) throw layout('No messages found in this thread; this Sales layout is not supported.');
  const { start, count, nextCursor } = sliceWindow(await items.count(), ctx);
  const result = [];
  for (let i = 0; i < count; i += 1) {
    const message = items.nth(start + i);
    result.push({
      author: await textOf(message, ['.inbox-message__author']),
      text: await textOf(message, ['.inbox-message__text', '.inbox-message__content'], {
        required: true,
        label: 'message text',
      }),
    });
  }
  return { items: result, nextCursor, threadUrl: ctx.url };
}

// ---------------------------------------------------------------------------
// Operation table: one route family list and one reader per operation.
// ---------------------------------------------------------------------------

const OPS = {
  'profile.get': { families: ['/in/'], defaultUrl: OWN_PROFILE_URL, run: runProfileGet },
  'profile.skills': { families: ['/in/'], defaultUrl: OWN_PROFILE_URL, run: runProfileSkills },
  'profile.contact': { families: ['/in/'], defaultUrl: OWN_PROFILE_URL, run: runProfileContact },
  'connections.status': { families: ['/in/'], requiredUrl: true, run: runConnectionsStatus },
  'posts.list': {
    families: ['/in/'],
    defaultUrl: `${LINKEDIN_ORIGIN}/in/me/recent-activity/all/`,
    run: runPostCards,
  },
  'posts.get': { families: POST_FAMILIES, requiredUrl: true, run: runPostGet },
  'comments.list': { families: POST_FAMILIES, requiredUrl: true, run: runComments },
  'reactions.list': { families: POST_FAMILIES, requiredUrl: true, run: runReactions },
  'feed.list': { families: ['/feed/'], defaultUrl: `${LINKEDIN_ORIGIN}/feed/`, run: runPostCards },
  'inbox.list': {
    families: ['/messaging/'],
    defaultUrl: `${LINKEDIN_ORIGIN}/messaging/`,
    sideEffect: true,
    run: runInboxList,
  },
  'inbox.thread': {
    families: ['/messaging/thread/'],
    requiredUrl: true,
    sideEffect: true,
    run: runInboxThread,
  },
  'inbox.search': {
    families: ['/messaging/'],
    defaultUrl: `${LINKEDIN_ORIGIN}/messaging/`,
    requiredQuery: true,
    sideEffect: true,
    run: runInboxSearch,
  },
  'connections.list': {
    // Live route is /mynetwork/invite-connect/connections/; the older
    // /my-network/ path stays accepted for older markup and fixtures.
    families: ['/my-network/', '/mynetwork/'],
    defaultUrl: `${LINKEDIN_ORIGIN}/mynetwork/invite-connect/connections/`,
    run: runConnectionsList,
  },
  'invitations.received': {
    families: ['/mynetwork/invitations/'],
    defaultUrl: `${LINKEDIN_ORIGIN}/mynetwork/invitations/`,
    run: runInvitations,
  },
  'invitations.sent': {
    families: ['/mynetwork/invitations/'],
    defaultUrl: `${LINKEDIN_ORIGIN}/mynetwork/invitations/outgoing/`,
    run: runInvitations,
  },
  'search.people': {
    families: ['/search/'],
    searchRoute: '/search/results/people/',
    searchOrigin: 'GLOBAL_SEARCH_HEADER',
    kind: 'person',
    requiredQuery: true,
    run: runSearch,
  },
  'search.companies': {
    families: ['/search/'],
    searchRoute: '/search/results/companies/',
    searchOrigin: 'GLOBAL_SEARCH_HEADER',
    kind: 'company',
    requiredQuery: true,
    run: runSearch,
  },
  'search.posts': {
    families: ['/search/'],
    searchRoute: '/search/results/content/',
    searchOrigin: 'GLOBAL_SEARCH_HEADER',
    kind: 'post',
    requiredQuery: true,
    run: runSearch,
  },
  'search.jobs': {
    families: ['/jobs/'],
    searchRoute: '/jobs/search/',
    kind: 'job',
    requiredQuery: true,
    run: runSearch,
  },
  'jobs.search': {
    families: ['/jobs/'],
    searchRoute: '/jobs/search/',
    kind: 'job',
    requiredQuery: true,
    run: runSearch,
  },
  'companies.get': { families: ['/company/'], requiredUrl: true, run: runCompanyGet },
  'companies.posts': {
    families: ['/company/'],
    requiredUrl: true,
    normalizeUrl: normalizeCompanyPostsUrl,
    run: runPostCards,
  },
  'jobs.saved': { families: ['/jobs/saved/'], defaultUrl: `${LINKEDIN_ORIGIN}/jobs/saved/`, run: runJobCards },
  'jobs.get': { families: ['/jobs/'], requiredUrl: true, run: runJobGet },
  'jobs.apply-url': { families: ['/jobs/'], requiredUrl: true, run: runJobApplyUrl },
  'analytics.profile-views': {
    families: ['/analytics/'],
    defaultUrl: `${LINKEDIN_ORIGIN}/analytics/profile/`,
    restricted: true,
    run: runAnalyticsProfileViews,
  },
  'analytics.ssi': {
    families: ['/sales/ssi'],
    defaultUrl: `${LINKEDIN_ORIGIN}/sales/ssi`,
    restricted: true,
    run: runAnalyticsSsi,
  },
  'analytics.post': { families: POST_FAMILIES, requiredUrl: true, restricted: true, run: runAnalyticsPost },
  'sales.profile': {
    families: ['/sales/'],
    defaultUrl: `${LINKEDIN_ORIGIN}/sales/navigation/people`,
    restricted: true,
    run: runSalesProfile,
  },
  'sales.search-people': {
    families: ['/sales/'],
    defaultUrl: `${LINKEDIN_ORIGIN}/sales/navigation/people`,
    restricted: true,
    requiredQuery: true,
    run: runSalesSearchPeople,
  },
  'sales.search-companies': {
    families: ['/sales/'],
    defaultUrl: `${LINKEDIN_ORIGIN}/sales/navigation/companies`,
    restricted: true,
    requiredQuery: true,
    run: runSalesSearchCompanies,
  },
  'sales.inbox': {
    families: ['/sales/navigation/inbox'],
    defaultUrl: `${LINKEDIN_ORIGIN}/sales/navigation/inbox`,
    restricted: true,
    run: runSalesInbox,
  },
  'sales.thread': {
    families: ['/sales/navigation/inbox'],
    requiredUrl: true,
    restricted: true,
    run: runSalesThread,
  },
};

export const READ_OPERATION_NAMES = Object.keys(OPS);

function resolveUrl(name, rawUrl, config) {
  let url;
  try {
    url = linkedinUrl(rawUrl);
  } catch (error) {
    if (error instanceof HumanInterventionError) throw error;
    throw invalid(`${name}: url must be an HTTPS www.linkedin.com URL without credentials or challenge routes.`);
  }
  const parsed = new URL(url);
  if (!config.families.some((family) => parsed.pathname.startsWith(family))) {
    throw invalid(`${name} requires a URL under one of these route families: ${config.families.join(', ')}.`);
  }
  return parsed.href;
}

function prepare(name, input, config) {
  const value = input === undefined || input === null ? {} : input;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw invalid(`${name}: input must be an object (url/query/limit/cursor).`);
  }
  let { limit, cursor } = value;
  if (limit === undefined) limit = 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > ITEM_LIMIT) {
    throw invalid('limit must be an integer from 1 to 50.');
  }
  if (cursor === undefined) cursor = 0;
  if (!Number.isInteger(cursor) || cursor < 0) {
    throw invalid('cursor must be a non-negative integer page offset.');
  }
  let query = null;
  if (value.query !== undefined) {
    if (typeof value.query !== 'string') throw invalid('query must be a string.');
    query = value.query.trim();
    if (query.length > 500) throw invalid('query must be at most 500 characters.');
  }
  if (config.requiredQuery && !query) throw invalid(`${name} requires a non-empty query.`);

  let url;
  if (config.searchRoute) {
    if (value.url !== undefined) {
      throw invalid(`${name} builds its own search-page URL; do not pass url.`);
    }
    url = buildSearchUrl(config.searchRoute, { query, cursor, origin: config.searchOrigin });
  } else if (value.url !== undefined) {
    url = resolveUrl(name, value.url, config);
  } else if (config.defaultUrl) {
    url = config.defaultUrl;
  } else {
    throw invalid(`${name} requires a url.`);
  }
  if (config.normalizeUrl) url = config.normalizeUrl(url);

  return { name, url, limit, cursor, query, config };
}

async function assertStillOnRoute(page, ctx) {
  // setContent-based test sessions stay on about:blank; only real origins are checked.
  const current = page.url();
  if (!/^https?:\/\//.test(current)) return;
  let url;
  try {
    url = new URL(current);
  } catch {
    return;
  }
  if (url.origin !== LINKEDIN_ORIGIN) {
    // Fail closed: the session should already have guarded this, but never parse
    // a foreign-origin page.
    throw layout(`Page for ${ctx.name} left the LinkedIn origin (${url.origin}); refusing to parse untrusted content.`);
  }
  if (!ctx.config.families.some((family) => url.pathname.startsWith(family))) {
    throw layout(`Page for ${ctx.name} landed on an unsupported route (${url.pathname}).`);
  }
}

export function createReadAdapter(session) {
  if (!session || typeof session.navigate !== 'function' || typeof session.check !== 'function' || !session.page) {
    throw new TypeError('createReadAdapter requires a surface session with page, navigate(url) and check().');
  }

  async function execute(name, input) {
    if (typeof name !== 'string') throw unsupported(name);
    // hasOwn guard: a bare OPS[name] would resolve inherited names such as
    // "constructor" or "__proto__".
    const config = Object.hasOwn(OPS, name) ? OPS[name] : undefined;
    if (!config) throw unsupported(name);
    const ctx = prepare(name, input, config);

    await session.navigate(ctx.url);
    await session.check();
    const page = session.page;
    await assertStillOnRoute(page, ctx);
    if (config.restricted) await detectAccessRestriction(page, ctx.name);

    const data = await config.run(ctx, page);
    data.sourceUrl = ctx.url;
    data.observedAt = new Date().toISOString();
    if (config.sideEffect) data.sideEffect = 'Reading the inbox may mark conversations read.';
    return data;
  }

  return { execute };
}
