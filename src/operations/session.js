import { mkdir, open, unlink } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { chromium } from 'playwright';
import { assertResponse, linkedinUrl } from '../experimental/policy.js';
import { assertNoVisibleChallenge } from '../experimental/challenge.js';
import { OperationError } from './errors.js';

export async function openSurfaceSession({ profileDirectory, headless = false }) {
  if (!isAbsolute(profileDirectory ?? '')) throw new OperationError('VALIDATION_ERROR', 'An absolute browser profile path is required.');
  await mkdir(profileDirectory, { recursive: true, mode: 0o700 });
  const lockPath = `${profileDirectory}/operations.lock`;
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); } catch (error) {
    if (error.code === 'EEXIST') throw new OperationError('LOCKED', 'Another operation owns this browser profile. If it crashed, verify it exited before removing operations.lock.');
    throw error;
  }
  let context;
  const release = async () => { await lock.close(); await unlink(lockPath).catch(() => {}); };
  try {
    context = await chromium.launchPersistentContext(profileDirectory, { headless });
    const page = context.pages()[0] ?? await context.newPage();
    page.setDefaultTimeout(15000);
    let failure;
    const observe = (response) => {
      try {
        if (new URL(response.url()).origin !== 'https://www.linkedin.com') return;
        if (['document', 'xhr', 'fetch'].includes(response.request().resourceType()) && [401, 403, 429].includes(response.status())) {
          assertResponse(response.status(), response.headers());
        }
      } catch (error) { failure ??= error; }
    };
    page.on('response', observe);
    async function check() {
      if (failure) throw failure;
      linkedinUrl(page.url());
      await assertNoVisibleChallenge(page);
    }
    return {
      page, context, check,
      async navigate(url) {
        const target = linkedinUrl(url);
        const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
        if (response) {
          const status = response.status();
          if (status === 404) {
            // LinkedIn's app shell returns 404 intermittently for routes the SPA
            // still renders. Wait for that shell before treating it as an error;
            // the adapter still fails closed if the DOM turns out to be wrong.
            const rendered = await page.locator('main, [role="main"]').first()
              .waitFor({ state: 'attached', timeout: 15000 })
              .then(() => true)
              .catch(() => false);
            if (!rendered) assertResponse(status, response.headers());
          } else {
            assertResponse(status, response.headers());
          }
        }
        await check();
      },
      async close() {
        page.off('response', observe);
        try { await context.close(); } finally { await release(); }
      },
    };
  } catch (error) {
    await context?.close().catch(() => {});
    await release();
    throw error;
  }
}
