import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { run } from '../src/cli.js';

function sink() {
  return { value: '', write(text) { this.value += text; return true; } };
}

function fixture(options = {}) {
  const stdout = sink();
  const stderr = sink();
  const saved = [];
  const deps = {
    env: options.env ?? {},
    stdin: Readable.from([]),
    stdout,
    stderr,
    oauthStore: {
      saveTokens(tokens) { saved.push(tokens); return true; },
      loadRefreshToken: () => options.refreshToken ?? null,
    },
    openBrowser: (url) => { deps.openedUrl = url; },
    readLine: options.readLine,
  };
  return { deps, stdout, stderr, saved };
}

test('login-oauth refuses without a client id and opens no browser', async () => {
  const { deps, stdout, stderr } = fixture();
  assert.equal(await run(['node', 'linkedin', 'auth', 'login-oauth'], deps), 1);
  assert.match(stderr.value, /LINKEDIN_CLIENT_ID/);
  assert.equal(deps.openedUrl, undefined);
  assert.equal(stdout.value, '');
});

test('login-oauth builds the authorization URL without leaking the client secret', async () => {
  const { deps } = fixture({
    env: {
      LINKEDIN_CLIENT_ID: 'client-1',
      LINKEDIN_CLIENT_SECRET: 'secret-1',
      LINKEDIN_REDIRECT_URI: 'https://example.test/callback',
    },
  });
  // No pasted URL, so it cannot succeed, but the URL must be correct.
  assert.equal(await run(['node', 'linkedin', 'auth', 'login-oauth'], deps), 1);
  assert.match(deps.openedUrl, /response_type=code/);
  assert.match(deps.openedUrl, /client_id=client-1/);
  assert.match(deps.openedUrl, /state=/);
  assert.match(deps.openedUrl, /redirect_uri=https%3A%2F%2Fexample\.test%2Fcallback/);
  assert.doesNotMatch(deps.openedUrl, /secret-1/);
});

test('login-oauth refuses an HTTP redirect URI because LinkedIn rejects it', async () => {
  const { deps, stderr } = fixture({
    env: { LINKEDIN_CLIENT_ID: 'client-1', LINKEDIN_REDIRECT_URI: 'http://127.0.0.1:1234/callback' },
  });
  assert.equal(await run(['node', 'linkedin', 'auth', 'login-oauth'], deps), 1);
  assert.match(stderr.value, /https/i);
  assert.equal(deps.openedUrl, undefined);
});

test('login-oauth requires a registered redirect URI by default', async () => {
  const { deps, stderr } = fixture({ env: { LINKEDIN_CLIENT_ID: 'client-1' } });
  assert.equal(await run(['node', 'linkedin', 'auth', 'login-oauth'], deps), 1);
  assert.match(stderr.value, /redirect-uri|LINKEDIN_REDIRECT_URI/);
});

test('login-oauth without a client secret refuses --no-pkce', async () => {
  const { deps, stderr } = fixture({ env: { LINKEDIN_CLIENT_ID: 'client-1' } });
  assert.equal(await run(['node', 'linkedin', 'auth', 'login-oauth', '--no-pkce'], deps), 1);
  assert.match(stderr.value, /PKCE/);
});

test('auth refresh refuses without a stored refresh token', async () => {
  const { deps, stderr } = fixture({ env: { LINKEDIN_CLIENT_ID: 'client-1' } });
  assert.equal(await run(['node', 'linkedin', 'auth', 'refresh'], deps), 1);
  assert.match(stderr.value, /No refresh token/);
});
