import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { HumanInterventionError, linkedinUrl } from '../src/experimental/policy.js';
import { createWriteAdapter, OperationError, WRITE_OPERATIONS } from '../src/operations/writes.js';
import { createOperations } from '../src/operations/service.js';
import { createApprovalStore } from '../src/operations/approvals.js';

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/writes/', import.meta.url));
const PLAIN_HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body><main><p>Plain page</p></main>'
  + '<script>window.__pendingEvents = 0; window.__fixtureReady = true;</script></body></html>';

const FEED_URL = 'https://www.linkedin.com/feed/';
const ACTIVITY_URL = 'https://www.linkedin.com/in/me/recent-activity/all/';
const POST_URL = 'https://www.linkedin.com/feed/update/urn:li:activity:100/';
const COMMENT_URL = 'https://www.linkedin.com/posts/comment/urn:li:comment-urn:200/?trkCommentId=urn%3Ali%3Acomment-urn%3A200';
const PROFILE_URL = 'https://www.linkedin.com/in/alice-nguyen/';
const THREAD_URL = 'https://www.linkedin.com/messaging/thread/777/';
const COMPANY_URL = 'https://www.linkedin.com/company/acme/';
const SALES_LEAD_URL = 'https://www.linkedin.com/sales/lead/urn:li:lead:555/';
const SALES_THREAD_URL = 'https://www.linkedin.com/sales/threads/urn:li:thread:777/';

function fixtureFor(pathname) {
  if (pathname.startsWith('/in/me/recent-activity/all')) return 'activity.html';
  if (pathname.startsWith('/feed/update/')) return 'post.html';
  if (pathname.startsWith('/posts/comment/') || pathname.startsWith('/feed/comment/')) return 'post.html';
  if (pathname.startsWith('/feed/')) return 'feed.html';
  if (pathname.startsWith('/in/')) return 'profile.html';
  if (pathname.startsWith('/messaging/')) return 'messaging.html';
  if (pathname.startsWith('/company/')) return 'company.html';
  if (pathname.startsWith('/me/settings')) return 'settings.html';
  if (pathname.startsWith('/profile/view')) return 'profile-view.html';
  if (pathname.startsWith('/sales/')) return 'sales.html';
  return null;
}

// A fake surface session (contract: { page, context, navigate, check, close }).
// navigate enforces the controller URL policy via linkedinUrl() and serves the
// local fixture HTML; no external network is ever touched.
async function openFixtureSession(t, options = {}) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const sessionState = { events: [], navigations: [], checkCalls: 0 };
  if (options.seedEvents) for (const event of options.seedEvents) sessionState.events.push(event);
  await page.route('https://www.linkedin.com/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/__fixture-event') {
      sessionState.events.push(JSON.parse(request.postData() ?? 'null'));
      return route.fulfill({ status: 200, body: 'ok' });
    }
    if (url.pathname === '/__state') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: sessionState.events }) });
    }
    if (request.method() === 'GET') {
      const file = fixtureFor(url.pathname);
      const body = file ? await readFile(join(FIXTURE_DIR, file)) : PLAIN_HTML;
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
    }
    return route.fulfill({ status: 405, body: 'method not allowed' });
  });
  const session = {
    page,
    context,
    state: sessionState,
    async navigate(url) {
      const target = linkedinUrl(url);
      sessionState.navigations.push(target);
      if (options.navigateHook) {
        const hookError = options.navigateHook(target, sessionState.navigations.length);
        if (hookError) throw hookError;
      }
      const destination = options.rewrite ? options.rewrite(target) : target;
      await page.goto(destination, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForFunction('window.__fixtureReady === true', { timeout: 5000 }).catch(() => {});
    },
    async check() {
      // Let fixture fire-and-forget event posts settle so verification reads
      // the state the page actually sees.
      await page.waitForFunction('window.__pendingEvents === 0', { timeout: 5000 }).catch(() => {});
      sessionState.checkCalls += 1;
      if (options.checkError && options.checkFromCall && sessionState.checkCalls >= options.checkFromCall) {
        throw options.checkError;
      }
    },
    async close() {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    },
  };
  t.after(() => session.close());
  return session;
}

function offlineSession() {
  return {
    page: { url: () => 'about:blank' },
    navigate() { throw new Error('offline session must not navigate'); },
    async check() {},
    async close() {},
  };
}

async function codeOf(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new assert.AssertionError({ message: 'expected the call to reject' });
}

test('createWriteAdapter requires a surface session', () => {
  assert.throws(() => createWriteAdapter({}), /surface session/);
});

test('every contract write name is recognized and gates on approval before navigation', async () => {
  const adapter = createWriteAdapter(offlineSession());
  assert.equal(WRITE_OPERATIONS.length, 21);
  for (const name of WRITE_OPERATIONS) {
    const error = await codeOf(adapter.execute(name, { confirmed: 'yes' }));
    assert.equal(error.code, 'APPROVAL_REQUIRED', name);
  }
});

test('unknown operation names are rejected, not guessed', async () => {
  const adapter = createWriteAdapter(offlineSession());
  const error = await codeOf(adapter.execute('posts.maybe', { confirmed: true }));
  assert.equal(error.code, 'UNSUPPORTED_OPERATION');
});

test('invalid inputs fail before any navigation', async () => {
  const adapter = createWriteAdapter(offlineSession());
  const cases = [
    ['posts.create', { confirmed: true }, 'INVALID_INPUT', /text|imagePath/],
    ['posts.create', { confirmed: true, imagePath: 42 }, 'INVALID_INPUT', /imagePath/],
    ['posts.create', { confirmed: true, text: 'x', imageData: { name: 'a', mimeType: 'image/png', buffer: 'raw' } }, 'INVALID_INPUT', /imageData/],
    ['messages.send', { confirmed: true, url: COMPANY_URL, text: 'x' }, 'INVALID_INPUT', /route families/],
    ['messages.send', { confirmed: true, url: PROFILE_URL }, 'INVALID_INPUT', /text/],
    ['reactions.add', { confirmed: true, url: POST_URL, reaction: 'CLAP' }, 'INVALID_INPUT', /reaction/],
    ['reactions.remove', { confirmed: true, url: POST_URL }, 'INVALID_INPUT', /reaction/],
    ['comments.create', { confirmed: true, url: POST_URL }, 'INVALID_INPUT', /text/],
    ['comments.reply', { confirmed: true, url: POST_URL, text: 'x' }, 'INVALID_INPUT', /specific comment/],
    ['profile.update', { confirmed: true, fields: {} }, 'INVALID_INPUT', /headline|about/],
    ['profile.update', { confirmed: true, fields: { nickname: 'zoe' } }, 'INVALID_INPUT', /only support/],
    ['profile.update', { confirmed: true, fields: 'headline' }, 'INVALID_INPUT', /fields/],
    ['invitations.accept', { confirmed: true }, 'INVALID_INPUT', /url/],
    ['sales.messages.reply', { confirmed: true, url: THREAD_URL, text: 'x' }, 'INVALID_INPUT', /route families/],
  ];
  for (const [name, input, expectedCode, message] of cases) {
    const error = await codeOf(adapter.execute(name, input));
    assert.equal(error.code, expectedCode, name);
    assert.match(error.message, message, name);
    assert.ok(error instanceof OperationError);
  }
});

test('shared service prepares, separately approves, publishes and verifies against local DOM', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'linkedin-write-service-'));
  t.after(() => rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  let opens = 0;
  const session = await openFixtureSession(t);
  const api = createOperations({ stateDirectory: directory, experimental: true,
    openSession: async () => { opens += 1; return { ...session, close: async () => {} }; },
  });
  const prepared = await api.prepare('posts.create', { text: 'End-to-end local fixture post' });
  assert.equal(opens, 0);
  await assert.rejects(api.execute(prepared.data.approvalId), /operator/);
  createApprovalStore({ directory }).approve(prepared.data.approvalId, { account: 'default', expectedDigest: prepared.data.preview.digest });
  const result = await api.execute(prepared.data.approvalId);
  assert.equal(result.success, true);
  assert.equal(result.data.outcome, 'verified');
  assert.equal(opens, 1);
  assert.equal(api.approvalStatus(prepared.data.approvalId).data.status, 'verified');
  await assert.rejects(api.execute(prepared.data.approvalId), /consumed/);
});

test('posts.create with text publishes and verifies a new permalink', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('posts.create', { confirmed: true, text: 'New post about CLI automation' });
  assert.equal(result.outcome, 'verified');
  assert.match(result.evidence.permalink, /urn:li:activity:9\d\d/);
  assert.doesNotMatch(result.evidence.permalink, /activity:100|activity:101/);
  const event = session.state.events.find((e) => e.type === 'post.create');
  assert.equal(event.text, 'New post about CLI automation');
  assert.equal(session.state.navigations.filter((u) => u.includes('/recent-activity')).length, 2);
});

test('posts.create with payload-bound imageData uploads one file and verifies', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('posts.create', {
    confirmed: true,
    imageData: { name: 'pic.png', mimeType: 'image/png', buffer: Buffer.from('1x1png') },
  });
  assert.equal(result.outcome, 'verified');
  assert.equal(result.evidence.imageName, 'pic.png');
  assert.equal(result.evidence.imageSource, 'payload-bound imageData');
  const event = session.state.events.find((e) => e.type === 'post.create');
  assert.equal(event.image, 'pic.png');
});

test('posts.create with imagePath uploads the file path', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'linkedin-writes-img-'));
  t.after(() => rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  const imagePath = join(directory, 'photo.png');
  await writeFile(imagePath, Buffer.from('iVBORw0KGgo=', 'base64'));
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('posts.create', { confirmed: true, imagePath });
  assert.equal(result.outcome, 'verified');
  assert.equal(result.evidence.imageName, 'photo.png');
  assert.equal(result.evidence.imageSource, 'imagePath');
  const event = session.state.events.find((e) => e.type === 'post.create');
  assert.equal(event.image, 'photo.png');
});

test('posts.create rejects a missing imagePath before navigation', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const error = await codeOf(adapter.execute('posts.create', { confirmed: true, imagePath: join(tmpdir(), 'does-not-exist-xyz.png') }));
  assert.equal(error.code, 'INVALID_INPUT');
  assert.equal(session.state.navigations.length, 0);
});

test('posts.create ambiguity in the composer fails closed before dispatch', async (t) => {
  const session = await openFixtureSession(t, {
    rewrite: (url) => (url === FEED_URL ? `${FEED_URL}?state=dup` : url),
  });
  const adapter = createWriteAdapter(session);
  const error = await codeOf(adapter.execute('posts.create', { confirmed: true, text: 'x' }));
  assert.equal(error.code, 'LAYOUT_UNSUPPORTED');
  assert.match(error.message, /ambiguous/);
  assert.equal(session.state.events.length, 0);
});

test('posts.create with an unverifiable dispatch reports unknown without retry', async (t) => {
  const session = await openFixtureSession(t, {
    navigateHook: (url, nth) => (url === ACTIVITY_URL && nth === 3 ? new Error('verification navigation failed') : undefined),
  });
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('posts.create', { confirmed: true, text: 'will not verify' });
  assert.equal(result.outcome, 'unknown');
  assert.equal(result.evidence.completionUnknown, true);
  assert.match(result.evidence.reason, /verification navigation failed/);
  assert.equal(session.state.events.filter((e) => e.type === 'post.create').length, 1);
  assert.equal(session.state.navigations.length, 3);
});

test('posts.create propagates a 429 with completionUnknown after dispatch', async (t) => {
  const session = await openFixtureSession(t, {
    checkError: Object.assign(new Error('rate limited'), { status: 429, retryAfter: '60' }),
    checkFromCall: 3,
  });
  const adapter = createWriteAdapter(session);
  const error = await codeOf(adapter.execute('posts.create', { confirmed: true, text: 'x' }));
  assert.equal(error.status, 429);
  assert.equal(error.completionUnknown, true);
});

test('posts.create propagates a pre-dispatch checkpoint without completionUnknown', async (t) => {
  const session = await openFixtureSession(t, { checkError: new HumanInterventionError(), checkFromCall: 1 });
  const adapter = createWriteAdapter(session);
  const error = await codeOf(adapter.execute('posts.create', { confirmed: true, text: 'x' }));
  assert.ok(error instanceof HumanInterventionError);
  assert.notEqual(error.completionUnknown, true);
});

test('posts.edit replaces the post text and verifies on the same page', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('posts.edit', { confirmed: true, url: POST_URL, text: 'Edited post content 123' });
  assert.equal(result.outcome, 'verified');
  assert.equal(session.state.events.find((e) => e.type === 'post.edit')?.text, 'Edited post content 123');
});

test('posts.edit fails closed on a layout without the edit controls', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const error = await codeOf(adapter.execute('posts.edit', {
    confirmed: true,
    url: `${POST_URL}?state=missing`,
    text: 'nope',
  }));
  assert.equal(error.code, 'LAYOUT_UNSUPPORTED');
  assert.equal(session.state.events.length, 0);
});

test('posts.delete confirms and verifies the post is gone', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('posts.delete', { confirmed: true, url: POST_URL });
  assert.equal(result.outcome, 'verified');
  assert.ok(session.state.events.some((e) => e.type === 'post.delete'));
});

test('posts.delete reports unknown when the gone state is not observable', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('posts.delete', { confirmed: true, url: `${POST_URL}?state=delete-lost` });
  assert.equal(result.outcome, 'unknown');
  assert.equal(session.state.events.find((e) => e.type === 'post.delete')?.type, 'post.delete');
});

test('reactions.add applies a reaction through the picker and verifies the state', async (t) => {
  for (const reaction of ['LIKE', 'CELEBRATE']) {
    const session = await openFixtureSession(t);
    const adapter = createWriteAdapter(session);
    const result = await adapter.execute('reactions.add', { confirmed: true, url: POST_URL, reaction });
    assert.equal(result.outcome, 'verified', reaction);
    assert.equal(result.evidence.reaction, reaction);
    assert.ok(session.state.events.some((e) => e.type === 'reaction.add' && e.reaction === reaction), reaction);
  }
});

test('reactions.remove removes the active reaction', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('reactions.remove', {
    confirmed: true,
    url: `${POST_URL}?reacted=CELEBRATE`,
    reaction: 'CELEBRATE',
  });
  assert.equal(result.outcome, 'verified');
  assert.ok(session.state.events.some((e) => e.type === 'reaction.remove' && e.reaction === 'CELEBRATE'));
});

test('reactions.remove without an active reaction is a safe no-op', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('reactions.remove', { confirmed: true, url: POST_URL, reaction: 'CELEBRATE' });
  assert.equal(result.outcome, 'verified');
  assert.equal(result.evidence.noop, true);
  assert.equal(session.state.events.length, 0);
});

test('comments.create posts a comment and verifies its text on the post', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('comments.create', { confirmed: true, url: POST_URL, text: 'Thanks for sharing!' });
  assert.equal(result.outcome, 'verified');
  assert.equal(result.evidence.newRecord, true);
  assert.equal(session.state.events.find((e) => e.type === 'comment.create')?.text, 'Thanks for sharing!');
});

test('comments.create with preexisting identical text and a no-op send reports unknown', async (t) => {
  const session = await openFixtureSession(t, {
    seedEvents: [{ type: 'comment.create', text: 'Hello duplicate' }],
  });
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('comments.create', {
    confirmed: true,
    url: `${POST_URL}?state=noop-comment`,
    text: 'Hello duplicate',
  });
  assert.equal(result.outcome, 'unknown');
  assert.equal(result.evidence.completionUnknown, true);
  assert.match(result.evidence.reason, /preexisting text or no-op send/);
});

test('comments.reply scopes the reply to the comment identified by the URL', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('comments.reply', { confirmed: true, url: COMMENT_URL, text: 'Good point.' });
  assert.equal(result.outcome, 'verified');
  assert.equal(result.evidence.commentUrn, 'urn:li:comment-urn:200');
  assert.equal(session.state.events.find((e) => e.type === 'comment.reply')?.text, 'Good point.');
});

test('comments.reply with preexisting identical reply and a no-op send reports unknown', async (t) => {
  const session = await openFixtureSession(t, {
    seedEvents: [{ type: 'comment.reply', text: 'Seen this already' }],
  });
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('comments.reply', {
    confirmed: true,
    url: `${COMMENT_URL.replace('?', '?state=noop-comment&')}`,
    text: 'Seen this already',
  });
  assert.equal(result.outcome, 'unknown');
  assert.equal(result.evidence.completionUnknown, true);
  assert.match(result.evidence.reason, /preexisting text or no-op send/);
});

test('comments.reply fails closed when the comment card cannot be located', async (t) => {
  const session = await openFixtureSession(t, {
    rewrite: (url) => (url.startsWith('https://www.linkedin.com/posts/comment/') ? `${POST_URL}?state=missing` : url),
  });
  const adapter = createWriteAdapter(session);
  const error = await codeOf(adapter.execute('comments.reply', { confirmed: true, url: COMMENT_URL, text: 'x' }));
  assert.equal(error.code, 'LAYOUT_UNSUPPORTED');
  assert.equal(session.state.events.length, 0);
});

test('posts.share opens the share dialog, posts the caption, and verifies a new feed item', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('posts.share', { confirmed: true, url: POST_URL, text: 'Worth a read' });
  assert.equal(result.outcome, 'verified');
  assert.equal(result.evidence.permalinkIdentity, 'urn:li:activity:100');
  assert.equal(result.evidence.captionMatched, true);
  assert.equal(session.state.events.find((e) => e.type === 'post.share')?.caption, 'Worth a read');
});

test('posts.share without a caption verifies by shared-target permalink identity', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('posts.share', { confirmed: true, url: POST_URL });
  assert.equal(result.outcome, 'verified');
  assert.equal(result.evidence.permalinkIdentity, 'urn:li:activity:100');
  assert.equal(result.evidence.captionMatched, false);
});

test('posts.share reports unknown when the feed item cannot be matched to the target', async (t) => {
  const session = await openFixtureSession(t, {
    rewrite: (url) => (url.startsWith('https://www.linkedin.com/in/me/recent-activity') ? `${url}?no-share=1` : url),
  });
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('posts.share', { confirmed: true, url: POST_URL, text: 'Worth a read' });
  assert.equal(result.outcome, 'unknown');
  assert.equal(result.evidence.completionUnknown, true);
  assert.match(result.evidence.reason, /permalink/i);
});

test('posts.share fails closed when two Share controls are visible', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const error = await codeOf(adapter.execute('posts.share', { confirmed: true, url: `${POST_URL}?state=dup` }));
  assert.equal(error.code, 'LAYOUT_UNSUPPORTED');
  assert.match(error.message, /ambiguous/);
});

test('messages.send matches the messenger pane to the target profile before sending', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('messages.send', { confirmed: true, url: PROFILE_URL, text: 'Hello Alice, quick note' });
  assert.equal(result.outcome, 'verified');
  assert.equal(result.evidence.targetName, 'Alice Nguyen');
  assert.equal(result.evidence.enteredThread, true);
  assert.match(result.url, /messaging\/thread/);
  assert.equal(session.state.events.find((e) => e.type === 'message.send')?.text, 'Hello Alice, quick note');
});

test('messages.send refuses to send when the pane header does not match the target', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const error = await codeOf(adapter.execute('messages.send', {
    confirmed: true,
    url: `${PROFILE_URL}?state=mismatch`,
    text: 'Hello Alice, quick note',
  }));
  assert.equal(error.code, 'LAYOUT_UNSUPPORTED');
  assert.match(error.message, /does not match target profile/);
  assert.equal(session.state.events.length, 0);
});

test('messages.send with preexisting identical pane text and a no-op send reports unknown', async (t) => {
  const session = await openFixtureSession(t, {
    seedEvents: [{ type: 'message.send', text: 'Preexisting duplicate note' }],
  });
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('messages.send', {
    confirmed: true,
    url: `${PROFILE_URL}?state=send-noop`,
    text: 'Preexisting duplicate note',
  });
  assert.equal(result.outcome, 'unknown');
  assert.equal(result.evidence.completionUnknown, true);
  assert.match(result.evidence.reason, /preexisting text or no-op send/);
});

test('messages.reply sends in the thread and verifies the bubble', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('messages.reply', { confirmed: true, url: THREAD_URL, text: 'Replying in the fixture' });
  assert.equal(result.outcome, 'verified');
  assert.equal(result.evidence.newRecord, true);
  assert.equal(result.evidence.threadLabel, 'Alice Nguyen');
  assert.equal(session.state.events.find((e) => e.type === 'message.reply')?.text, 'Replying in the fixture');
});

test('messages.reply with preexisting identical text and a no-op send reports unknown', async (t) => {
  const session = await openFixtureSession(t, {
    seedEvents: [{ type: 'message.reply', threadId: '777', text: 'Already said that' }],
  });
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('messages.reply', {
    confirmed: true,
    url: 'https://www.linkedin.com/messaging/thread/777/?state=noop-message',
    text: 'Already said that',
  });
  assert.equal(result.outcome, 'unknown');
  assert.equal(result.evidence.completionUnknown, true);
  assert.match(result.evidence.reason, /preexisting text or no-op send/);
});

test('messages.mark-read opens the unread thread and verifies it is no longer unread', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('messages.mark-read', { confirmed: true, url: THREAD_URL });
  assert.equal(result.outcome, 'verified');
  assert.equal(result.evidence.markedRead, true);
  assert.ok(session.state.events.some((e) => e.type === 'thread.opened'));
});

test('messages.mark-read on an already-read thread is a verified no-op', async (t) => {
  const session = await openFixtureSession(t, { seedEvents: [{ type: 'thread.opened', threadId: '777' }] });
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('messages.mark-read', { confirmed: true, url: THREAD_URL });
  assert.equal(result.outcome, 'verified');
  assert.equal(result.evidence.alreadyRead, true);
  assert.equal(session.state.navigations.length, 1);
});

test('messages.mark-read fails closed when the thread row is not in the list', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const error = await codeOf(adapter.execute('messages.mark-read', {
    confirmed: true,
    url: 'https://www.linkedin.com/messaging/thread/999/',
  }));
  assert.equal(error.code, 'LAYOUT_UNSUPPORTED');
  assert.match(error.message, /inbox row/);
});

test('invitations.send connects a single target and verifies the pending state', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('invitations.send', { confirmed: true, url: PROFILE_URL });
  assert.equal(result.outcome, 'verified');
  assert.equal(session.state.events.find((e) => e.type === 'invitation.send')?.note, false);
});

test('invitations.send with a note routes through the note dialog', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('invitations.send', { confirmed: true, url: PROFILE_URL, text: 'Looking forward to connecting.' });
  assert.equal(result.outcome, 'verified');
  const event = session.state.events.find((e) => e.type === 'invitation.send');
  assert.equal(event.note, 'Looking forward to connecting.');
});

test('invitations.accept accepts on the profile and verifies Connected', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('invitations.accept', { confirmed: true, url: `${PROFILE_URL}?state=received` });
  assert.equal(result.outcome, 'verified');
  assert.ok(session.state.events.some((e) => e.type === 'invitation.accept'));
});

test('invitations.reject ignores and verifies the profile returns to Connect', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('invitations.reject', { confirmed: true, url: `${PROFILE_URL}?state=received` });
  assert.equal(result.outcome, 'verified');
  assert.ok(session.state.events.some((e) => e.type === 'invitation.reject'));
});

test('invitations.withdraw withdraws a pending invitation', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('invitations.withdraw', { confirmed: true, url: `${PROFILE_URL}?state=pending` });
  assert.equal(result.outcome, 'verified');
  assert.ok(session.state.events.some((e) => e.type === 'invitation.withdraw'));
});

test('connections.remove confirms the removal dialog and verifies the state', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('connections.remove', { confirmed: true, url: `${PROFILE_URL}?state=connected` });
  assert.equal(result.outcome, 'verified');
  assert.ok(session.state.events.some((e) => e.type === 'connection.remove'));
});

test('companies.follow toggles to Following and verifies', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('companies.follow', { confirmed: true, url: COMPANY_URL });
  assert.equal(result.outcome, 'verified');
  assert.ok(session.state.events.some((e) => e.type === 'company.follow'));
});

test('companies.unfollow confirms the inline Unfollow control', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('companies.unfollow', { confirmed: true, url: `${COMPANY_URL}?state=following` });
  assert.equal(result.outcome, 'verified');
  assert.ok(session.state.events.some((e) => e.type === 'company.unfollow'));
});

test('companies.follow fails closed with ACCESS_RESTRICTED on a paywall', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const error = await codeOf(adapter.execute('companies.follow', { confirmed: true, url: `${COMPANY_URL}?restricted=1` }));
  assert.equal(error.code, 'ACCESS_RESTRICTED');
  assert.equal(session.state.events.length, 0);
});

test('profile.update edits headline and about through the Basics card and verifies', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('profile.update', {
    confirmed: true,
    fields: { headline: 'Staff Engineer', about: 'Updated about text here.' },
  });
  assert.equal(result.outcome, 'verified');
  const event = session.state.events.find((e) => e.type === 'profile.update');
  assert.equal(event.headline, 'Staff Engineer');
  assert.equal(event.about, 'Updated about text here.');
});

test('profile.update accepts only a self /in/me url and rejects other profiles', async () => {
  const adapter = createWriteAdapter(offlineSession());
  const rejected = await codeOf(adapter.execute('profile.update', {
    confirmed: true,
    url: 'https://www.linkedin.com/in/bob-other/',
    fields: { headline: 'x' },
  }));
  assert.equal(rejected.code, 'INVALID_INPUT');
  assert.match(rejected.message, /own profile/);
  const selfUrlError = await codeOf(adapter.execute('profile.update', {
    confirmed: true,
    url: 'https://www.linkedin.com/in/me/',
    fields: { headline: 'x' },
  }));
  assert.notEqual(selfUrlError.code, 'INVALID_INPUT');
  assert.match(selfUrlError.message, /navigate/);
});

test('sales.messages.send matches the Sales pane to the lead before sending', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('sales.messages.send', { confirmed: true, url: SALES_LEAD_URL, text: 'Re: our call' });
  assert.equal(result.outcome, 'verified');
  assert.equal(result.evidence.targetName, 'Zoe Smith');
  assert.equal(session.state.events.find((e) => e.type === 'sales.message.send')?.text, 'Re: our call');
});

test('sales.messages.send refuses a pane whose header does not match the lead', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const error = await codeOf(adapter.execute('sales.messages.send', {
    confirmed: true,
    url: `${SALES_LEAD_URL}?state=mismatch`,
    text: 'Re: our call',
  }));
  assert.equal(error.code, 'LAYOUT_UNSUPPORTED');
  assert.match(error.message, /does not match target lead/);
  assert.equal(session.state.events.length, 0);
});

test('sales.messages.reply sends inside the Sales thread', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const result = await adapter.execute('sales.messages.reply', { confirmed: true, url: SALES_THREAD_URL, text: 'Following up' });
  assert.equal(result.outcome, 'verified');
  assert.equal(session.state.events.find((e) => e.type === 'sales.message.reply')?.text, 'Following up');
});

test('sales.messages.send fails closed with ACCESS_RESTRICTED on a paywall', async (t) => {
  const session = await openFixtureSession(t);
  const adapter = createWriteAdapter(session);
  const error = await codeOf(adapter.execute('sales.messages.send', {
    confirmed: true,
    url: `${SALES_LEAD_URL}?restricted=1`,
    text: 'Re: our call',
  }));
  assert.equal(error.code, 'ACCESS_RESTRICTED');
  assert.equal(session.state.events.length, 0);
});

test('navigations never leave the LinkedIn origin in the fixture session', () => {
  for (const url of ['https://attacker.example/x', 'https://www.linkedin.com@evil.example/', 'http://www.linkedin.com/feed/']) {
    assert.throws(() => linkedinUrl(url));
  }
});
