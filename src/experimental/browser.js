import { mkdir } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { assertExperimental, assertResponse, HumanInterventionError, linkedinUrl } from './policy.js';

// A dedicated browser profile contains session cookies. Never use a normal Chrome profile.
export async function openExperimentalBrowser({ experimental, profileDirectory, chromium, headless = false }) {
  assertExperimental(experimental);
  if (!isAbsolute(profileDirectory ?? '')) throw new TypeError('An absolute browser profile directory is required.');
  await mkdir(profileDirectory, { recursive: true, mode: 0o700 });
  const engine = chromium ?? (await import('playwright')).chromium;
  const context = await engine.launchPersistentContext(profileDirectory, { headless });
  let page;
  try {
    page = context.pages()[0] ?? await context.newPage();
    page.setDefaultTimeout(15000);
  } catch (error) {
    await context.close().catch(() => {});
    throw error;
  }

  async function observeResponses(execute) {
    let failure;
    const observe = (response) => {
      if (failure) return;
      try {
        const url = new URL(response.url());
        const kind = response.request().resourceType();
        if (url.origin !== 'https://www.linkedin.com' || !['document', 'xhr', 'fetch'].includes(kind)) return;
        if ([401, 403, 429].includes(response.status())) assertResponse(response.status(), response.headers());
      } catch (error) {
        failure = error;
      }
    };
    page.on('response', observe);
    try {
      const result = await execute();
      if (failure) throw failure;
      return result;
    } finally {
      page.off('response', observe);
    }
  }

  async function checkPage() {
    linkedinUrl(page.url());
    const challenge = page.locator('iframe[src*="captcha"], iframe[src*="challenge"], input[name="captcha"], #captcha-internal');
    if (await challenge.count() > 0) throw new HumanInterventionError();
  }

  async function navigate(url) {
    const target = linkedinUrl(url);
    const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (response) assertResponse(response.status());
    await checkPage();
  }

  async function singleLocator(selector) {
    if (typeof selector !== 'string' || !selector.trim()) throw new TypeError('A nonempty selector is required.');
    const locator = page.locator(selector);
    if (await locator.count() !== 1) throw new Error('The selector must match exactly one element.');
    return locator;
  }

  function confirmAction(confirmed) {
    if (confirmed !== true) throw new Error('An external change requires explicit --confirm-action approval.');
  }

  return {
    async login({ waitForUser }) {
      if (typeof waitForUser !== 'function') throw new TypeError('Manual login needs an interactive confirmation callback.');
      const response = await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
      if (response) assertResponse(response.status());
      linkedinUrl(page.url(), { allowLogin: true });
      await waitForUser();
      await checkPage();
      const cookies = await context.cookies('https://www.linkedin.com');
      if (!cookies.some((cookie) => cookie.name === 'li_at' && cookie.value)) {
        throw new HumanInterventionError('No authenticated browser session was found. Complete sign-in manually.');
      }
      return { url: page.url(), message: 'Browser session saved. Credentials and challenges were handled manually.' };
    },
    async snapshot({ url }) {
      await navigate(url);
      const target = page.locator('main').first();
      await target.waitFor({ state: 'visible', timeout: 15000 });
      await checkPage();
      return { url: page.url(), title: await page.title(), text: (await target.innerText()).slice(0, 20000) };
    },
    async extract({ url, selector, limit = 10 }) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new RangeError('Extraction limit must be an integer from 1 to 50.');
      if (typeof selector !== 'string' || !selector.trim()) throw new TypeError('A nonempty selector is required.');
      await navigate(url);
      const matches = page.locator(selector);
      await matches.first().waitFor({ state: 'visible', timeout: 15000 });
      await checkPage();
      const count = Math.min(await matches.count(), limit);
      const items = [];
      for (let i = 0; i < count; i += 1) items.push((await matches.nth(i).innerText()).slice(0, 4000));
      return { url: page.url(), items };
    },
    async click({ url, selector, confirmed }) {
      confirmAction(confirmed);
      await navigate(url);
      const locator = await singleLocator(selector);
      return observeResponses(async () => {
        await locator.click({ timeout: 15000 });
        await checkPage();
        return { url: page.url(), dispatched: true, serverOutcome: 'unverified' };
      });
    },
    async fill({ url, selector, value, confirmed }) {
      confirmAction(confirmed);
      if (typeof value !== 'string' || value.length > 10000) throw new TypeError('Text must be a string of at most 10000 characters.');
      await navigate(url);
      const locator = await singleLocator(selector);
      // Login/password automation belongs to the manual login flow, not this adapter.
      const type = String(await locator.getAttribute('type')).toLowerCase();
      const autocomplete = String(await locator.getAttribute('autocomplete')).toLowerCase();
      if (type === 'password' || /(?:current|new)-password/.test(autocomplete)) {
        throw new Error('Enter credentials manually in browser login.');
      }
      return observeResponses(async () => {
        await locator.fill(value, { timeout: 15000 });
        await checkPage();
        return { url: page.url(), dispatched: true, serverOutcome: 'unverified' };
      });
    },
    async voyagerMe() {
      await navigate('https://www.linkedin.com/feed/');
      const cookies = await context.cookies('https://www.linkedin.com');
      const session = cookies.find((cookie) => cookie.name === 'JSESSIONID');
      if (!session) throw new HumanInterventionError('No browser session. Run experimental browser login first.');
      const csrfToken = session.value.replace(/^"|"$/g, '');
      const response = await context.request.get('https://www.linkedin.com/voyager/api/me', {
        headers: { 'csrf-token': csrfToken, accept: 'application/json' },
        maxRedirects: 0,
        maxRetries: 0,
        timeout: 30000,
      });
      try {
        assertResponse(response.status(), response.headers());
        const data = await response.json();
        if (data.status === 401 || data.status === 403 || data.status === 429) assertResponse(data.status);
        return data;
      } finally {
        await response.dispose();
      }
    },
    close: () => context.close(),
  };
}
