// Read adapter tests: a real Playwright Chromium page loads local fixture HTML
// (test/fixtures/reads/*.html) through a fake surface session. No live
// LinkedIn page, no user session, no network.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { HumanInterventionError } from '../src/experimental/policy.js';
import { createReadAdapter, ReadOperationError, READ_OPERATION_NAMES } from '../src/operations/reads.js';

const testDir = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(testDir, 'fixtures', 'reads', name), 'utf8');

// Every route the adapter knows for the operations under test, mapped to a
// fixture file. Unknown URLs fall back to an empty page.
const ROUTES = {
  'https://www.linkedin.com/in/me/': 'profile.html',
  'https://www.linkedin.com/in/jane-doe/': 'profile.html',
  'https://www.linkedin.com/in/bob-stone/': 'profile.html',
  'https://www.linkedin.com/in/me/recent-activity/all/': 'posts.html',
  'https://www.linkedin.com/feed/': 'posts.html',
  'https://www.linkedin.com/feed/update/urn:li:activity:123456789': 'posts.html',
  'https://www.linkedin.com/company/acme/': 'company.html',
  'https://www.linkedin.com/company/acme/posts/': 'posts.html',
  'https://www.linkedin.com/messaging/': 'messaging.html',
  'https://www.linkedin.com/messaging/thread/urn:li:mp-conversation:1001': 'thread.html',
  'https://www.linkedin.com/my-network/navigate/': 'connections.html',
  'https://www.linkedin.com/mynetwork/invite-connect/connections/': 'connections.html',
  'https://www.linkedin.com/mynetwork/invitations/': 'invitations.html',
  'https://www.linkedin.com/mynetwork/invitations/outgoing/': 'invitations.html',
  'https://www.linkedin.com/search/results/': 'search-people.html',
  'https://www.linkedin.com/jobs/search/': 'search-jobs.html',
  'https://www.linkedin.com/jobs/saved/': 'saved-jobs.html',
  'https://www.linkedin.com/jobs/view/2000001': 'job.html',
  'https://www.linkedin.com/jobs/view/2000002': 'job-no-apply.html',
  'https://www.linkedin.com/analytics/profile/': 'analytics.html',
  'https://www.linkedin.com/sales/ssi': 'analytics.html',
  'https://www.linkedin.com/sales/navigation/people': 'sales-leads.html',
  'https://www.linkedin.com/sales/navigation/companies': 'sales-companies.html',
  'https://www.linkedin.com/sales/navigation/inbox': 'sales-inbox.html',
  'https://www.linkedin.com/sales/navigation/inbox/thread/urn:li:mp-conversation:5': 'sales-thread.html',
};
const PAYWALL_ROUTES = {
  'https://www.linkedin.com/sales/navigation/people': 'sales-paywall.html',
  'https://www.linkedin.com/sales/navigation/companies': 'sales-paywall.html',
  'https://www.linkedin.com/sales/navigation/inbox': 'sales-paywall.html',
};

function resolveHtml(url, routes) {
  if (routes[url]) return fixture(routes[url]);
  let best = null;
  for (const key of Object.keys(routes)) {
    if (url.startsWith(key) && (!best || key.length > best.length)) best = key;
  }
  return best ? fixture(routes[best]) : '';
}

async function openSession(browser, { routes = ROUTES, check = null } = {}) {
  const state = { navigations: [] };
  const session = {
    state,
    async navigate(url) {
      state.navigations.push(url);
      await session.page.setContent(resolveHtml(url, routes), { waitUntil: 'load' });
    },
    async check() {
      if (check) await check();
    },
    close: null,
  };
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(3000);
  session.page = page;
  session.context = context;
  session.close = async () => context.close();
  return session;
}

function code(promise, expected) {
  return assert.rejects(promise, (error) => {
    assert.ok(error instanceof ReadOperationError, `expected ReadOperationError, got ${error}`);
    assert.equal(error.code, expected);
    return true;
  });
}

let browser;
before(async () => {
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser.close();
});

test('the catalog names are exactly the contract read operations', () => {
  const expected = [
    'profile.get', 'profile.skills', 'profile.contact',
    'posts.list', 'posts.get', 'comments.list', 'reactions.list',
    'inbox.list', 'inbox.thread', 'inbox.search',
    'connections.list', 'invitations.received', 'invitations.sent', 'connections.status',
    'feed.list',
    'search.people', 'search.companies', 'search.posts', 'search.jobs',
    'companies.get', 'companies.posts',
    'jobs.search', 'jobs.saved', 'jobs.get', 'jobs.apply-url',
    'analytics.profile-views', 'analytics.post', 'analytics.ssi',
    'sales.profile', 'sales.search-people', 'sales.search-companies', 'sales.inbox', 'sales.thread',
  ];
  assert.deepEqual(READ_OPERATION_NAMES.slice().sort(), expected.slice().sort());
});

test('session shape is validated up front', () => {
  assert.throws(() => createReadAdapter({}), TypeError);
  assert.throws(() => createReadAdapter({ page: {}, navigate: () => {} }), TypeError);
});

test('unknown operations fail with a typed error before navigation', async (t) => {
  const session = await openSession(browser);
  t.after(() => session.close());
  const adapter = createReadAdapter(session);
  await code(adapter.execute('posts.publish'), 'UNSUPPORTED_OPERATION');
  // Inherited-object names must not resolve into OPS lookups.
  await code(adapter.execute('constructor'), 'UNSUPPORTED_OPERATION');
  await code(adapter.execute('__proto__'), 'UNSUPPORTED_OPERATION');
  await code(adapter.execute('toString'), 'UNSUPPORTED_OPERATION');
  assert.equal(session.state.navigations.length, 0);
});

test('profile.get returns a structured profile record', async (t) => {
  const session = await openSession(browser);
  t.after(() => session.close());
  const data = await createReadAdapter(session).execute('profile.get');
  assert.equal(data.name, 'Jane Doe');
  assert.match(data.headline, /Senior engineer/);
  assert.match(data.about, /bounded browser tooling/);
  assert.match(data.location, /Berlin/);
  assert.deepEqual(
    data.sections.map((section) => section.name),
    ['experience', 'education'],
  );
  assert.deepEqual(data.sections[0].items, [
    'Engineer at Acme 2020 – Present',
    'Analyst at Beta 2018 – 2020',
    'Intern at Gamma 2017 – 2018',
  ]);
  assert.equal(data.sourceUrl, 'https://www.linkedin.com/in/me/');
  assert.match(data.observedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(data.nextCursor, undefined);
});

test('profile.skills and profile.contact parse their sections', async (t) => {
  const session = await openSession(browser);
  t.after(() => session.close());
  const adapter = createReadAdapter(session);
  const skills = await adapter.execute('profile.skills');
  assert.deepEqual(skills.items[0], { name: 'Playwright', details: '12 endorsements' });
  assert.equal(skills.items.length, 3);

  const contact = await adapter.execute('profile.contact');
  assert.deepEqual(contact.items, [
    { type: 'email', value: 'jane@example.com', label: 'jane@example.com' },
    { type: 'phone', value: '+49 30 123456', label: '+49 30 123456' },
    { type: 'website', value: 'https://jane.example/', label: 'jane.example' },
  ]);
});

test('connections.status reads degree and follow affordance without clicking', async (t) => {
  const session = await openSession(browser);
  t.after(() => session.close());
  const data = await createReadAdapter(session).execute('connections.status', {
    url: 'https://www.linkedin.com/in/bob-stone/',
  });
  assert.equal(data.degree, '3rd degree');
  assert.equal(data.connected, false);
  assert.equal(data.followAvailable, true);
});

test('posts.list is bounded by limit/cursor and parses counters and ids', async (t) => {
  const session = await openSession(browser);
  t.after(() => session.close());
  const adapter = createReadAdapter(session);
  const page1 = await adapter.execute('posts.list', { limit: 2 });
  assert.equal(page1.items.length, 2);
  assert.equal(page1.nextCursor, 2);
  assert.equal(page1.items[0].id, 'urn:li:activity:123456789');
  assert.equal(page1.items[0].url, 'https://www.linkedin.com/feed/update/urn:li:activity:123456789');
  assert.equal(page1.items[0].author, 'Jane Doe');
  assert.equal(page1.items[0].text, 'Shipping a bounded read adapter. No auto-scroll, no spam.');
  assert.deepEqual(page1.items[0].counters, {
    reactions: { value: 1200, text: '1.2K likes' },
    comments: { value: 3, text: '3 comments' },
    shares: { value: 1, text: '1 repost' },
  });
  assert.equal(page1.items[0].postedAt.iso, '2026-10-10T09:00:00Z');

  const page2 = await adapter.execute('posts.list', { cursor: 2 });
  assert.equal(page2.items.length, 1);
  assert.equal(page2.nextCursor, null);
  assert.equal(page2.items[0].id, 'urn:li:activity:345678901');
});

test('post bounds are enforced: limit 51 and negative cursor are rejected', async (t) => {
  const session = await openSession(browser);
  t.after(() => session.close());
  const adapter = createReadAdapter(session);
  await code(adapter.execute('posts.list', { limit: 51 }), 'INVALID_INPUT');
  await code(adapter.execute('posts.list', { limit: 0 }), 'INVALID_INPUT');
  await code(adapter.execute('posts.list', { cursor: -1 }), 'INVALID_INPUT');
  await code(adapter.execute('posts.list', { cursor: 1.5 }), 'INVALID_INPUT');
  assert.equal(session.state.navigations.length, 0);
});

test('feed.list reads the same card layout from /feed/', async (t) => {
  const session = await openSession(browser);
  t.after(() => session.close());
  const data = await createReadAdapter(session).execute('feed.list');
  assert.equal(data.items.length, 3);
  assert.equal(data.sourceUrl, 'https://www.linkedin.com/feed/');
});

test('posts.get parses a single post with counters and timestamp', async (t) => {
  const session = await openSession(browser);
  t.after(() => session.close());
  const data = await createReadAdapter(session).execute('posts.get', {
    url: 'https://www.linkedin.com/feed/update/urn:li:activity:123456789',
  });
  assert.equal(data.id, 'urn:li:activity:123456789');
  assert.equal(data.author, 'Jane Doe');
  assert.match(data.text, /bounded read adapter/);
  assert.equal(data.postedAt.iso, '2026-10-10T09:00:00Z');
  assert.equal(data.counters.comments.value, 3);
});

test('comments.list and reactions.list parse structured rows', async (t) => {
  const session = await openSession(browser);
  t.after(() => session.close());
  const postUrl = { url: 'https://www.linkedin.com/feed/update/urn:li:activity:123456789' };
  const adapter = createReadAdapter(session);
  const comments = await adapter.execute('comments.list', postUrl);
  assert.deepEqual(comments.items[0], {
    author: 'Sam Lee',
    text: 'Great write-up.',
    postedAt: { iso: '2026-10-11T10:00:00Z', text: '4d' },
  });
  assert.equal(comments.items.length, 2);

  const reactions = await adapter.execute('reactions.list', postUrl);
  assert.deepEqual(reactions.items[0], { type: 'like', value: 1000, text: '1000' });
  assert.equal(reactions.items.length, 2);
});

test('missing comment DOM is a layout failure, not a fake empty result', async (t) => {
  const session = await openSession(browser, { routes: {} });
  t.after(() => session.close());
  await code(
    createReadAdapter(session).execute('comments.list', {
      url: 'https://www.linkedin.com/feed/update/urn:li:activity:1',
    }),
    'LAYOUT_UNSUPPORTED',
  );
});

test('inbox.list flags unread rows, thread URLs, and the read side effect', async (t) => {
  const session = await openSession(browser);
  t.after(() => session.close());
  const data = await createReadAdapter(session).execute('inbox.list');
  assert.equal(data.items.length, 3);
  assert.deepEqual(
    data.items.map((item) => item.peer),
    ['Alice Rivers', 'Bob Stone', 'Carol Vance'],
  );
  assert.equal(data.items[0].unread, true);
  assert.equal(data.items[1].unread, false);
  assert.equal(data.items[0].threadUrl, 'https://www.linkedin.com/messaging/thread/urn:li:mp-conversation:1001');
  assert.equal(data.items[0].snippet, 'Snippet: unread message about the fix');
  assert.match(data.sideEffect, /mark conversations read/);
  assert.equal(data.nextCursor, null);
});

test('inbox.thread parses message fragments', async (t) => {
  const session = await openSession(browser);
  t.after(() => session.close());
  const data = await createReadAdapter(session).execute('inbox.thread', {
    url: 'https://www.linkedin.com/messaging/thread/urn:li:mp-conversation:1001',
  });
  assert.equal(data.items.length, 3);
  assert.equal(data.items[0].author, 'Alice Rivers');
  assert.equal(data.items[0].text, 'First message in the thread.');
  assert.equal(data.items[2].postedAt.iso, '2026-10-18T10:00:00Z');
  assert.match(data.sideEffect, /mark conversations read/);
});

test('inbox.search filters the visible rows and says so', async (t) => {
  const session = await openSession(browser);
  t.after(() => session.close());
  const data = await createReadAdapter(session).execute('inbox.search', { query: 'bob' });
  assert.deepEqual(
    data.items.map((item) => item.peer),
    ['Bob Stone', 'Carol Vance'],
  );
  assert.equal(data.matchedCount, 2);
  assert.match(data.note, /in-app search box is not automated/);
});

test('connections.list and invitations parse network rows', async (t) => {
  const session = await openSession(browser);
  t.after(() => session.close());
  const adapter = createReadAdapter(session);
  const connections = await adapter.execute('connections.list');
  assert.deepEqual(connections.items[0], {
    name: 'Alice Rivers',
    headline: 'Product manager at Acme',
    url: 'https://www.linkedin.com/in/alice-rivers',
  });
  assert.equal(connections.items.length, 3);

  const incoming = await adapter.execute('invitations.received');
  assert.equal(incoming.items[0].name, 'Bob Stone');
  assert.equal(incoming.items[0].requestedAt.iso, '2026-10-01T00:00:00Z');
  const outgoing = await adapter.execute('invitations.sent');
  assert.equal(outgoing.sourceUrl, 'https://www.linkedin.com/mynetwork/invitations/outgoing/');
});

test('search.people builds the URL from the known route and enforces it', async (t) => {
  const session = await openSession(browser);
  t.after(() => session.close());
  const adapter = createReadAdapter(session);
  const data = await adapter.execute('search.people', { query: 'widgets', limit: 2 });
  assert.equal(
    session.state.navigations[0],
    'https://www.linkedin.com/search/results/people/?keywords=widgets&origin=GLOBAL_SEARCH_HEADER',
  );
  assert.equal(data.items.length, 2);
  // A filled page is the only next-page signal: cursor + limit.
  assert.equal(data.nextCursor, 2);
  assert.equal(data.items[0].type, 'person');
  assert.equal(data.items[0].title, 'Alice Rivers');
  assert.equal(data.items[0].url, 'https://www.linkedin.com/in/alice-rivers');
  assert.match(data.items[0].snippet, /Product manager/);

  const paged = await adapter.execute('search.people', { query: 'widgets', limit: 10, cursor: 2 });
  assert.match(paged.sourceUrl, /offset=2/);
  // The cursor moved the SERVER page (offset=); the DOM is not re-skipped, so a
  // nonzero cursor still returns the first records of the loaded page.
  assert.equal(paged.items.length, 3);
  assert.equal(paged.items[0].title, 'Alice Rivers');
  assert.equal(paged.nextCursor, null); // short page: no next-page signal
});

test('search operations reject caller-supplied URLs and missing queries', async (t) => {
  const session = await openSession(browser);
  t.after(() => session.close());
  const adapter = createReadAdapter(session);
  await code(
    adapter.execute('search.people', { url: 'https://www.linkedin.com/search/people/' }),
    'INVALID_INPUT',
  );
  await code(adapter.execute('search.jobs', {}), 'INVALID_INPUT');
  await code(adapter.execute('search.posts', { query: ' ' }), 'INVALID_INPUT');
});

test('search.jobs and jobs.search parse job records with ids', async (t) => {
  const session = await openSession(browser);
  t.after(() => session.close());
  const adapter = createReadAdapter(session);
  const results = await adapter.execute('search.jobs', { query: 'automation' });
  assert.equal(
    session.state.navigations[0],
    'https://www.linkedin.com/jobs/search/?keywords=automation',
  );
  assert.equal(results.items.length, 2);
  assert.equal(results.items[0].type, 'job');
  assert.equal(results.items[0].title, 'Senior Playwright Engineer');
  assert.equal(results.items[0].company, 'Acme');
  assert.equal(results.items[0].location, 'Berlin, DE · Hybrid · 5d');
  assert.equal(results.items[0].id, '3000001');

  const alias = await adapter.execute('jobs.search', { query: 'automation' });
  assert.equal(alias.items[0].id, '3000001');
});

test('companies.get returns a company record; companies.posts normalizes the URL', async (t) => {
  const session = await openSession(browser);
  t.after(() => session.close());
  const adapter = createReadAdapter(session);
  const company = await adapter.execute('companies.get', {
    url: 'https://www.linkedin.com/company/acme/',
  });
  assert.equal(company.slug, 'acme');
  assert.equal(company.name, 'Acme');
  assert.match(company.about, /platform rules/);
  assert.deepEqual(company.followers, { value: 10000, text: '10K followers' });

  const posts = await adapter.execute('companies.posts', {
    url: 'https://www.linkedin.com/company/acme/',
  });
  assert.equal(
    session.state.navigations.at(-1),
    'https://www.linkedin.com/company/acme/posts/',
  );
  assert.equal(posts.items.length, 3);
});

test('jobs.saved and jobs.get parse saved jobs and a job detail page', async (t) => {
  const session = await openSession(browser);
  t.after(() => session.close());
  const adapter = createReadAdapter(session);
  const saved = await adapter.execute('jobs.saved');
  assert.equal(saved.items.length, 2);
  assert.equal(saved.items[0].id, '3000001');
  assert.equal(saved.items[0].postedAt.iso, '2026-10-10T00:00:00Z');

  const job = await adapter.execute('jobs.get', {
    url: 'https://www.linkedin.com/jobs/view/2000001',
  });
  assert.equal(job.id, '2000001');
  assert.equal(job.title, 'Staff Engineer');
  assert.equal(job.company, 'Acme');
  assert.equal(job.location, 'Berlin, DE');
  assert.match(job.description, /bounded automation/);
});

test('jobs.apply-url reads the apply link without clicking it; absent link is honest', async (t) => {
  const session = await openSession(browser);
  t.after(() => session.close());
  const adapter = createReadAdapter(session);
  const withLink = await adapter.execute('jobs.apply-url', {
    url: 'https://www.linkedin.com/jobs/view/2000001',
  });
  assert.equal(withLink.applyUrl, 'https://acme.example/careers/apply/2000001');
  assert.equal(withLink.note, null);

  const withoutLink = await adapter.execute('jobs.apply-url', {
    url: 'https://www.linkedin.com/jobs/view/2000002',
  });
  assert.equal(withoutLink.applyUrl, null);
  assert.equal(withoutLink.note, 'apply_url_not_found');
});

test('analytics parse real numbers; absent analytics data is null, not invented', async (t) => {
  const session = await openSession(browser);
  t.after(() => session.close());
  const adapter = createReadAdapter(session);
  const views = await adapter.execute('analytics.profile-views');
  assert.deepEqual(views, {
    ...views,
    metric: 'profile-views',
    value: 3456,
    text: '3,456',
    available: true,
    url: 'https://www.linkedin.com/analytics/profile/',
  });

  const ssi = await adapter.execute('analytics.ssi');
  assert.equal(ssi.rating, 'Strong');
  assert.equal(ssi.available, true);

  const post = await adapter.execute('analytics.post', {
    url: 'https://www.linkedin.com/feed/update/urn:li:activity:123456789',
  });
  assert.equal(post.available, true);
  assert.equal(post.metrics.impressions.value, 8012);
  assert.equal(post.metrics.reactions.value, 12);
});

test('analytics on an empty page report available:false without throwing', async (t) => {
  const session = await openSession(browser, { routes: {} });
  t.after(() => session.close());
  const adapter = createReadAdapter(session);
  const views = await adapter.execute('analytics.profile-views');
  assert.equal(views.value, null);
  assert.equal(views.available, false);
  const ssi = await adapter.execute('analytics.ssi');
  assert.equal(ssi.available, false);
  const post = await adapter.execute('analytics.post', {
    url: 'https://www.linkedin.com/feed/update/urn:li:activity:1',
  });
  assert.equal(post.available, false);
  assert.deepEqual(post.metrics, {});
});

test('sales operations throw ACCESS_RESTRICTED on a paywall page', async (t) => {
  const session = await openSession(browser, { routes: PAYWALL_ROUTES });
  t.after(() => session.close());
  const adapter = createReadAdapter(session);
  for (const [name, input] of [
    ['sales.profile', {}],
    ['sales.search-people', { query: 'gamma' }],
    ['sales.search-companies', { query: 'gamma' }],
    ['sales.inbox', {}],
    [
      'sales.thread',
      { url: 'https://www.linkedin.com/sales/navigation/inbox/thread/urn:li:mp-conversation:5' },
    ],
  ]) {
    await code(adapter.execute(name, input), 'ACCESS_RESTRICTED');
  }
});

test('sales readers parse lead/company/inbox/thread cards when the surface is open', async (t) => {
  const session = await openSession(browser);
  t.after(() => session.close());
  const adapter = createReadAdapter(session);

  const lead = await adapter.execute('sales.profile');
  assert.equal(lead.name, 'Carol Vance');
  assert.equal(lead.company, 'Gamma');
  assert.equal(lead.url, 'https://www.linkedin.com/in/carol-vance');

  const search = await adapter.execute('sales.search-people', { query: 'gamma' });
  assert.deepEqual(
    search.items.map((item) => item.name),
    ['Carol Vance', 'Eve Adams'],
  );
  assert.match(search.note, /in-app search is not automated/);

  const companies = await adapter.execute('sales.search-companies', { query: 'gamma' });
  assert.equal(companies.items.length, 1);
  assert.equal(companies.items[0].name, 'Gamma Inc');

  const inbox = await adapter.execute('sales.inbox');
  assert.equal(inbox.items[0].peer, 'Carol Vance');
  assert.equal(inbox.items[0].snippet, 'Following up on the demo');

  const thread = await adapter.execute('sales.thread', {
    url: 'https://www.linkedin.com/sales/navigation/inbox/thread/urn:li:mp-conversation:5',
  });
  assert.equal(thread.items.length, 2);
  assert.equal(thread.items[0].text, 'First message in the thread.');
});

test('URL input is validated against the operation route families', async (t) => {
  const session = await openSession(browser);
  t.after(() => session.close());
  const adapter = createReadAdapter(session);
  await code(adapter.execute('connections.status', { url: 'https://www.linkedin.com/feed/' }), 'INVALID_INPUT');
  await code(adapter.execute('posts.get', { url: 'https://www.linkedin.com/messaging/thread/x' }), 'INVALID_INPUT');
  await code(adapter.execute('profile.get', { url: 'https://attacker.example/in/me/' }), 'INVALID_INPUT');
  await code(adapter.execute('profile.get', { url: 'http://www.linkedin.com/in/me/' }), 'INVALID_INPUT');
  await code(adapter.execute('posts.get', { url: 'https://www.linkedin.com/in/me/' }), 'INVALID_INPUT');
  await code(adapter.execute('inbox.thread'), 'INVALID_INPUT');
  assert.equal(session.state.navigations.length, 0);
});

test('a landing page off the LinkedIn origin is refused, not parsed', async (t) => {
  const session = await openSession(browser);
  t.after(() => session.close());
  const adapter = createReadAdapter(session);
  // Simulate a navigation that leaked to a foreign origin without any real
  // network: shadow page.url() on a delegating proxy of the real page.
  const pageAt = (url) => new Proxy(session.page, {
    get(target, prop) {
      if (prop === 'url') return () => url;
      const value = Reflect.get(target, prop);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const offOrigin = { ...session, page: pageAt('https://evil.example/in/me/') };
  await code(createReadAdapter(offOrigin).execute('profile.get'), 'LAYOUT_UNSUPPORTED');
  const wrongRoute = { ...session, page: pageAt('https://www.linkedin.com/signup/route?x=1') };
  await code(createReadAdapter(wrongRoute).execute('profile.get'), 'LAYOUT_UNSUPPORTED');
  // The unmodified session still works, proving the refusal is URL-origin driven.
  assert.equal((await adapter.execute('profile.get')).name, 'Jane Doe');
});

test('checkpoint failures from the session propagate with their own code', async (t) => {
  const session = await openSession(browser, {
    check: async () => {
      throw new HumanInterventionError();
    },
  });
  t.after(() => session.close());
  await assert.rejects(
    createReadAdapter(session).execute('profile.get'),
    (error) => error instanceof HumanInterventionError,
  );
});

test('empty DOM throws LAYOUT_UNSUPPORTED for required readers', async (t) => {
  const session = await openSession(browser, { routes: {} });
  t.after(() => session.close());
  const adapter = createReadAdapter(session);
  await code(adapter.execute('posts.list'), 'LAYOUT_UNSUPPORTED');
  await code(adapter.execute('profile.get'), 'LAYOUT_UNSUPPORTED');
  await code(adapter.execute('connections.status', { url: 'https://www.linkedin.com/in/bob-stone/' }), 'LAYOUT_UNSUPPORTED');
  await code(adapter.execute('inbox.list'), 'LAYOUT_UNSUPPORTED');
  await code(adapter.execute('connections.list'), 'LAYOUT_UNSUPPORTED');
});

test('inbox.list parses live-style thread links as conversation rows', async (t) => {
  const session = await openSession(browser, {
    routes: { 'https://www.linkedin.com/messaging/': 'inbox-links.html' },
  });
  t.after(() => session.close());
  const data = await createReadAdapter(session).execute('inbox.list');
  assert.equal(data.items.length, 1, 'the "new message" stub is not a conversation');
  assert.equal(data.items[0].peer, 'Ada Lovelace');
  assert.match(data.items[0].threadUrl, /\/messaging\/thread\/urn:li:conv:1\/$/);
});
