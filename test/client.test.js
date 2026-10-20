import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, LinkedInApiError } from '../src/linkedin/client.js';

test('sends the bearer token to the base URL', async () => {
  let seen;
  const fetch = async (url, init) => { seen = { url, init }; return new Response('{}', { status: 200 }); };
  await createClient({ accessToken: 'tok', fetch }).request('/v2/userinfo');
  assert.equal(seen.url, 'https://api.linkedin.com/v2/userinfo');
  assert.equal(seen.init.headers.Authorization, 'Bearer tok');
});

test('version headers only on /rest paths', async () => {
  const headers = [];
  const fetch = async (url, init) => { headers.push(init.headers); return new Response('{}', { status: 200 }); };
  const client = createClient({ accessToken: 'tok', fetch });
  await client.request('/rest/posts');
  await client.request('/v2/userinfo');
  assert.equal(headers[0]['Linkedin-Version'], '202610');
  assert.equal(headers[0]['X-Restli-Protocol-Version'], '2.0.0');
  assert.equal(headers[1]['Linkedin-Version'], undefined);
});

test('a 401 raises LinkedInApiError with status 401', async () => {
  const fetch = async () => new Response('{"message":"expired"}', { status: 401 });
  await assert.rejects(
    createClient({ accessToken: 'old', fetch }).getIdentity(),
    (err) => err instanceof LinkedInApiError && err.status === 401,
  );
});

test('a 429 keeps Retry-After and is never retried', async () => {
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    return new Response('{}', { status: 429, headers: { 'Retry-After': '120' } });
  };
  await assert.rejects(
    createClient({ accessToken: 'tok', fetch }).request('/rest/posts', { method: 'POST', body: {} }),
    (err) => err.status === 429 && err.retryAfter === '120',
  );
  assert.equal(calls, 1);
});

test('204 resolves to null', async () => {
  const fetch = async () => new Response(null, { status: 204 });
  assert.equal(await createClient({ accessToken: 'tok', fetch }).request('/rest/posts/x', { method: 'DELETE' }), null);
});

test('a 201 with an empty body resolves to null', async () => {
  const fetch = async () => new Response(null, { status: 201 });
  assert.equal(await createClient({ accessToken: 'tok', fetch }).request('/rest/posts', { method: 'POST', body: {} }), null);
});

test('a POST body is JSON-encoded and sent as application/json', async () => {
  let seen;
  const fetch = async (url, init) => { seen = init; return new Response('{}', { status: 200 }); };
  await createClient({ accessToken: 'tok', fetch }).request('/rest/posts', { method: 'POST', body: { text: 'hi' } });
  assert.equal(seen.method, 'POST');
  assert.equal(seen.body, '{"text":"hi"}');
  assert.equal(seen.headers['Content-Type'], 'application/json');
});

test('a GET sends neither a body nor a Content-Type', async () => {
  let seen;
  const fetch = async (url, init) => { seen = init; return new Response('{}', { status: 200 }); };
  await createClient({ accessToken: 'tok', fetch }).request('/v2/userinfo');
  assert.equal(seen.method, 'GET');
  assert.equal(seen.body, undefined);
  assert.equal(seen.headers['Content-Type'], undefined);
});

test('a non-JSON error body is kept as text in LinkedInApiError.body', async () => {
  const fetch = async () => new Response('<html>Bad gateway</html>', { status: 502 });
  await assert.rejects(
    createClient({ accessToken: 'tok', fetch }).request('/v2/userinfo'),
    (err) => err instanceof LinkedInApiError && err.status === 502 && err.body === '<html>Bad gateway</html>',
  );
});

test('a baseUrl override changes the request URL', async () => {
  let seenUrl;
  const fetch = async (url) => { seenUrl = url; return new Response('{}', { status: 200 }); };
  await createClient({ accessToken: 'tok', fetch, baseUrl: 'http://localhost:9999' }).request('/v2/userinfo');
  assert.equal(seenUrl, 'http://localhost:9999/v2/userinfo');
});

test('uses globalThis.fetch when no fetch is injected', async (t) => {
  let seen;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    seen = { url, init };
    return new Response('{"sub":"abc"}', { status: 200 });
  });
  const identity = await createClient({ accessToken: 'tok' }).getIdentity();
  assert.equal(seen.url, 'https://api.linkedin.com/v2/userinfo');
  assert.equal(seen.init.headers.Authorization, 'Bearer tok');
  assert.deepEqual(identity, { sub: 'abc' });
});
