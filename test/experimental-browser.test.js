import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertExperimental, assertResponse, HumanInterventionError, linkedinUrl } from '../src/experimental/policy.js';
import { openExperimentalBrowser } from '../src/experimental/browser.js';

async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'linkedin-browser-test-'));
  t.after(() => rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  let currentUrl = 'about:blank';
  const calls = [];
  const listeners = new Set();
  const emitActionResponse = () => {
    if (options.actionStatus) {
      for (const listener of listeners) listener({
        url: () => 'https://www.linkedin.com/action',
        status: () => options.actionStatus,
        headers: () => ({ 'retry-after': '60' }),
        request: () => ({ resourceType: () => 'xhr' }),
      });
    }
  };
  const locator = {
    count: async () => options.matches ?? 1,
    innerText: async () => options.text ?? 'Page text',
    nth: () => locator,
    first: () => locator,
    waitFor: async () => calls.push('waitFor'),
    click: async () => { calls.push('click'); emitActionResponse(); },
    fill: async (value) => { calls.push(['fill', value]); emitActionResponse(); },
    getAttribute: async (name) => name === 'type' ? options.type ?? 'text' : options.autocomplete ?? null,
  };
  const page = {
    setDefaultTimeout() {},
    on: (event, listener) => listeners.add(listener),
    off: (event, listener) => listeners.delete(listener),
    goto: async (url) => {
      calls.push(url);
      currentUrl = options.redirect ?? url;
      return { status: () => options.status ?? 200 };
    },
    url: () => currentUrl,
    title: async () => 'Title',
    locator: (selector) => {
      if (selector.includes('iframe[')) return {
        count: async () => options.challenge ? 1 : 0,
        nth: () => ({ isVisible: async () => options.challengeHidden !== true }),
      };
      if (selector === '[role="dialog"], [role="alert"], h1, h2') return { count: async () => 0 };
      return locator;
    },
  };
  const context = {
    pages: () => [page],
    close: async () => calls.push('close'),
    cookies: async () => options.cookies ?? [{ name: 'JSESSIONID', value: '"session-test"' }, { name: 'li_at', value: 'test-auth-session' }],
    request: {
      get: async (url, init) => {
        calls.push({ url, init });
        return {
          status: () => options.apiStatus ?? 200,
          headers: () => ({ 'retry-after': '30' }),
          json: async () => ({ miniProfile: { firstName: 'Test' } }),
          dispose: async () => calls.push('dispose'),
        };
      },
    },
  };
  const browser = await openExperimentalBrowser({
    experimental: true, profileDirectory: directory,
    chromium: { launchPersistentContext: async (dir, config) => {
      assert.equal(config.headless, false);
      return context;
    } },
  });
  return { browser, calls };
}

test('experimental opt-in is mandatory', () => {
  assert.throws(() => assertExperimental(false), /Experimental/);
  assert.doesNotThrow(() => assertExperimental(true));
});

test('URLs cannot move the session to other hosts or challenge routes', () => {
  for (const url of ['http://www.linkedin.com/feed/', 'https://attacker.example/', 'https://www.linkedin.com@attacker.example/', 'https://user@www.linkedin.com/', 'https://www.linkedin.com:444/', 'https://www.linkedin.com\\@attacker.example/']) {
    assert.throws(() => linkedinUrl(url));
  }
  assert.throws(() => linkedinUrl('https://www.linkedin.com/checkpoint/challenge/'), HumanInterventionError);
  assert.equal(linkedinUrl('https://www.linkedin.com/feed/'), 'https://www.linkedin.com/feed/');
});

test('429 exposes wait information and challenges require a human', () => {
  assert.throws(() => assertResponse(429, { 'retry-after': '60' }), (error) => error.status === 429 && error.retryAfter === '60');
  assert.throws(() => assertResponse(403), HumanInterventionError);
  assert.throws(() => assertResponse(302), HumanInterventionError);
});

test('snapshot and extraction are bounded', async (t) => {
  const { browser } = await fixture(t, { text: 'x'.repeat(30000), matches: 100 });
  assert.equal((await browser.snapshot({ url: 'https://www.linkedin.com/in/me/' })).text.length, 20000);
  const result = await browser.extract({ url: 'https://www.linkedin.com/feed/', selector: 'article', limit: 2 });
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].length, 4000);
  await assert.rejects(browser.extract({ url: 'https://www.linkedin.com/feed/', selector: 'article', limit: 51 }), /limit/);
});

test('actions need separate approval and one unambiguous element', async (t) => {
  const { browser, calls } = await fixture(t, { matches: 2 });
  await assert.rejects(browser.click({ url: 'https://www.linkedin.com/feed/', selector: 'button' }), /confirm-action/);
  assert.equal(calls.length, 0);
  await assert.rejects(browser.click({ url: 'https://www.linkedin.com/feed/', selector: 'button', confirmed: true }), /exactly one/);
  assert.ok(!calls.includes('click'));
});

test('single clicks work only after approval; password fill is denied', async (t) => {
  const { browser, calls } = await fixture(t, { type: 'password' });
  await browser.click({ url: 'https://www.linkedin.com/feed/', selector: '#specific', confirmed: true });
  assert.ok(calls.includes('click'));
  await assert.rejects(browser.fill({ url: 'https://www.linkedin.com/feed/', selector: '#password', value: 'not-a-secret', confirmed: true }), /manually/);
});

test('challenge pages and 429 responses stop before extraction', async (t) => {
  for (const options of [{ challenge: true }, { redirect: 'https://www.linkedin.com/checkpoint/challenge' }, { status: 429 }]) {
    const { browser } = await fixture(t, options);
    await assert.rejects(browser.snapshot({ url: 'https://www.linkedin.com/feed/' }));
  }
});

test('a hidden background challenge iframe does not block a normal snapshot', async (t) => {
  const { browser } = await fixture(t, { challenge: true, challengeHidden: true });
  const result = await browser.snapshot({ url: 'https://www.linkedin.com/feed/' });
  assert.equal(result.text, 'Page text');
});

test('Voyager is a fixed read-only me request with no redirects or retries', async (t) => {
  const { browser, calls } = await fixture(t);
  assert.deepEqual(await browser.voyagerMe(), { miniProfile: { firstName: 'Test' } });
  const request = calls.find((call) => typeof call === 'object');
  assert.equal(request.url, 'https://www.linkedin.com/voyager/api/me');
  assert.equal(request.init.maxRedirects, 0);
  assert.equal(request.init.maxRetries, 0);
  assert.equal(request.init.headers['csrf-token'], 'session-test');
  assert.ok(calls.includes('dispose'));
  await browser.close();
  assert.equal(calls.at(-1), 'close');
});

test('Voyager stops on throttling without another request', async (t) => {
  const { browser, calls } = await fixture(t, { apiStatus: 429 });
  await assert.rejects(browser.voyagerMe(), (error) => error.status === 429);
  assert.equal(calls.filter((call) => typeof call === 'object').length, 1);
  assert.ok(calls.includes('dispose'));
});

test('login is manual and cannot report success on a checkpoint', async (t) => {
  const { browser } = await fixture(t, { redirect: 'https://www.linkedin.com/checkpoint/challenge' });
  let prompted = false;
  await assert.rejects(browser.login({ waitForUser: async () => { prompted = true; } }), HumanInterventionError);
  assert.equal(prompted, true);
});

test('login rejects external redirects and throttling before prompting', async (t) => {
  for (const options of [{ redirect: 'https://attacker.example/' }, { status: 429 }]) {
    const { browser } = await fixture(t, options);
    let prompted = false;
    await assert.rejects(browser.login({ waitForUser: async () => { prompted = true; } }));
    assert.equal(prompted, false);
  }
});

test('login without a terminal waits for the session cookie instead of prompting', async (t) => {
  const signedIn = await fixture(t, { redirect: 'https://www.linkedin.com/feed/' });
  const result = await signedIn.browser.login({ waitForSessionMs: 1000 });
  assert.match(result.message, /saved/);

  const signedOut = await fixture(t, { redirect: 'https://www.linkedin.com/feed/', cookies: [] });
  await assert.rejects(signedOut.browser.login({ waitForSessionMs: 100 }), /authenticated/);
});

test('login needs a confirmation callback or a session timeout', async (t) => {
  const { browser } = await fixture(t);
  await assert.rejects(browser.login({}), /confirmation callback or a session timeout/);
});

test('login needs an authenticated cookie before reporting success', async (t) => {
  const { browser } = await fixture(t, { redirect: 'https://www.linkedin.com/feed/', cookies: [] });
  await assert.rejects(browser.login({ waitForUser: async () => {} }), /authenticated/);
  const success = await fixture(t, { redirect: 'https://www.linkedin.com/feed/' });
  assert.match((await success.browser.login({ waitForUser: async () => {} })).message, /saved/);
});

test('UI actions observe throttling responses and deny mixed-case password fields', async (t) => {
  const limited = await fixture(t, { actionStatus: 429 });
  await assert.rejects(limited.browser.click({ url: 'https://www.linkedin.com/feed/', selector: '#one', confirmed: true }), (error) => error.status === 429);
  for (const options of [{ type: 'PASSWORD' }, { autocomplete: 'current-password' }]) {
    const { browser } = await fixture(t, options);
    await assert.rejects(browser.fill({ url: 'https://www.linkedin.com/feed/', selector: '#one', value: 'test', confirmed: true }), /manually/);
  }
});

test('browser setup failure closes the launched context', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'linkedin-browser-setup-'));
  t.after(() => rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  let closed = false;
  await assert.rejects(openExperimentalBrowser({ experimental: true, profileDirectory: directory, chromium: {
    launchPersistentContext: async () => ({ pages: () => [], newPage: async () => { throw new Error('target crashed'); }, close: async () => { closed = true; } }),
  } }), /crashed/);
  assert.equal(closed, true);
});
