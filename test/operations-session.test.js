import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSurfaceSession } from '../src/operations/session.js';

async function fixture(t, { status = 200, html = '<main><h1>Normal page</h1></main>' } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'linkedin-session-detector-'));
  const session = await openSurfaceSession({ profileDirectory: directory, headless: true });
  t.after(async () => {
    try { await session.close(); } finally { await rm(directory, { recursive: true, force: true }); }
  });
  // Intercept every browser request. No LinkedIn or CAPTCHA provider is contacted.
  await session.context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/local-auth-status') return route.fulfill({ status: 403, body: 'Fixture only' });
    if (url.hostname !== 'www.linkedin.com') return route.fulfill({ status: 200, body: 'Local frame fixture' });
    return route.fulfill({ status, contentType: 'text/html', body: html, headers: { 'retry-after': '60' } });
  });
  return session;
}

const isChallenge = (error) => error.code === 'HUMAN_INTERVENTION_REQUIRED';

test('operations session accepts hidden background reCAPTCHA without removing the frame', async (t) => {
  const session = await fixture(t, { html: '<main><h1>Company fixture</h1><div style="display:none"><iframe src="https://www.google.com/recaptcha/enterprise/anchor" role="presentation" style="width:0;height:0;visibility:hidden"></iframe></div></main>' });
  await session.navigate('https://www.linkedin.com/company/fixture/');
  await session.check();
  assert.equal(await session.page.locator('iframe').count(), 1);
  assert.equal(await session.page.locator('iframe').getAttribute('src'), 'https://www.google.com/recaptcha/enterprise/anchor');
  assert.equal(await session.page.locator('iframe').isVisible(), false);
});

test('operations session stops when the hidden frame becomes a visible challenge', async (t) => {
  const session = await fixture(t, { html: '<main><iframe src="https://fixture.test/challenge" style="visibility:hidden;width:320px;height:200px"></iframe></main>' });
  await session.navigate('https://www.linkedin.com/company/fixture/');
  await session.check();
  // A simulated site transition, not a production attempt to modify a challenge.
  await session.page.locator('iframe').evaluate((element) => { element.style.visibility = 'visible'; });
  await assert.rejects(session.check(), isChallenge);
});

test('operations session still blocks a visible verification prompt', async (t) => {
  const session = await fixture(t, { html: '<main><h1>Verify your identity</h1></main>' });
  await assert.rejects(session.navigate('https://www.linkedin.com/company/fixture/'), isChallenge);
});

test('HTTP 401, 403 and 429 still block operations even without challenge elements', async (t) => {
  for (const status of [401, 403, 429]) {
    const session = await fixture(t, { status });
    await assert.rejects(session.navigate('https://www.linkedin.com/company/fixture/'), (error) => error.status === status);
    await assert.rejects(session.check(), (error) => error.status === status);
  }
});

test('background authentication failures are not suppressed by the visibility fix', async (t) => {
  const session = await fixture(t);
  await session.navigate('https://www.linkedin.com/company/fixture/');
  await session.page.evaluate(() => fetch('/local-auth-status').then((response) => response.status));
  await assert.rejects(session.check(), (error) => isChallenge(error) && error.status === 403);
});

test('checkpoint routes remain blocked before browser navigation', async (t) => {
  const session = await fixture(t);
  await assert.rejects(session.navigate('https://www.linkedin.com/checkpoint/challenge/'), isChallenge);
  assert.equal(session.page.url(), 'about:blank');
});
