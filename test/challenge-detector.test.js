import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { assertNoVisibleChallenge } from '../src/experimental/challenge.js';
import { HumanInterventionError, assertResponse, linkedinUrl } from '../src/experimental/policy.js';

let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

async function fixture(t, html) {
  const context = await browser.newContext();
  // Fixture frames stay local, including when a src names a real provider.
  await context.route('**/*', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>Local fixture</p>' }));
  const page = await context.newPage();
  t.after(() => context.close());
  await page.setContent(`<main><p>Normal account content</p>${html}</main>`);
  return page;
}

function challenge(error) {
  return error instanceof HumanInterventionError && error.code === 'HUMAN_INTERVENTION_REQUIRED';
}

test('hidden, zero-size background reCAPTCHA is not a visible challenge and is not modified', async (t) => {
  const page = await fixture(t, '<div style="display:none"><iframe role="presentation" style="width:0;height:0;visibility:hidden" src="https://www.google.com/recaptcha/enterprise/anchor?fixture=1"></iframe></div>');
  const frames = page.locator('iframe');
  const before = await frames.evaluateAll((elements) => elements.map((element) => element.outerHTML));
  await assertNoVisibleChallenge(page);
  assert.deepEqual(await frames.evaluateAll((elements) => elements.map((element) => element.outerHTML)), before);
  assert.equal(await frames.count(), 1, 'the detector must not remove or disable any iframe');
});

test('display:none, visibility:hidden, and zero-size candidates do not block normal pages', async (t) => {
  const page = await fixture(t, '<iframe src="https://fixture.test/challenge" style="visibility:hidden"></iframe><input name="captcha" type="hidden"><div id="captcha-internal" style="display:none">Challenge component</div><iframe src="https://fixture.test/captcha" style="width:0;height:0;border:0"></iframe>');
  await assertNoVisibleChallenge(page);
});

test('a visible CAPTCHA iframe stops access without interacting with its contents', async (t) => {
  const page = await fixture(t, '<iframe src="https://fixture.test/captcha" style="width:320px;height:200px" title="Verification"></iframe>');
  await assert.rejects(assertNoVisibleChallenge(page), challenge);
});

test('a visible challenge marker or input still requires manual verification', async (t) => {
  for (const html of ['<input name="captcha">', '<div id="captcha-internal">Verify your identity</div>']) {
    const page = await fixture(t, html);
    await assert.rejects(assertNoVisibleChallenge(page), challenge);
  }
});

test('a hidden iframe becoming visible is detected on the next check', async (t) => {
  const page = await fixture(t, '<iframe src="https://fixture.test/challenge" style="visibility:hidden;width:320px;height:200px"></iframe>');
  await assertNoVisibleChallenge(page);
  // Test-only state transition. The production detector never changes the DOM.
  await page.locator('iframe').evaluate((element) => { element.style.visibility = 'visible'; });
  await assert.rejects(assertNoVisibleChallenge(page), challenge);
});

test('a visible verification dialog blocks even if the provider iframe is hidden', async (t) => {
  const page = await fixture(t, '<iframe src="https://fixture.test/captcha" hidden></iframe><div role="dialog">Verify your identity to continue.</div>');
  await assert.rejects(assertNoVisibleChallenge(page), challenge);
});

test('ordinary dialogs and hidden verification dialogs do not trigger the detector', async (t) => {
  const page = await fixture(t, '<div role="dialog">Create a post</div><div role="dialog" hidden>Complete the security check.</div>');
  await assertNoVisibleChallenge(page);
});

test('authentication routes and HTTP 401/403/429 remain blocked regardless of iframe visibility', () => {
  for (const route of ['checkpoint/challenge', 'authwall', 'login']) {
    assert.throws(() => linkedinUrl(`https://www.linkedin.com/${route}`), challenge);
  }
  assert.throws(() => assertResponse(401), challenge);
  assert.throws(() => assertResponse(403), challenge);
  assert.throws(() => assertResponse(429, { 'retry-after': '60' }), (error) => error.status === 429 && error.retryAfter === '60');
});

test('visibility inspection errors propagate instead of silently allowing access', async () => {
  const page = { locator: () => ({ count: async () => 1, nth: () => ({ isVisible: async () => { throw new Error('Target closed'); } }) }) };
  await assert.rejects(assertNoVisibleChallenge(page), /Target closed/);
});
