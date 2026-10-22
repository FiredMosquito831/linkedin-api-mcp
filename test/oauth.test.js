import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  OAUTH_AUTHORIZE_URL,
  OAUTH_TOKEN_URL,
  buildAuthorizationUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  startCallbackServer,
  parseRedirect,
  generatePkce,
} from '../src/auth/oauth.js';
import { OperationError } from '../src/operations/errors.js';

function recordingFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  return { calls, fetchImpl };
}

function tokenResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

function unreadableResponse(status) {
  return {
    ok: false,
    status,
    text: async () => { throw new Error('the response body must not be read'); },
    json: async () => { throw new Error('the response body must not be read'); },
  };
}

function assertOperationError(error, code) {
  assert.ok(error instanceof OperationError, 'expected an OperationError');
  assert.equal(error.code, code);
}

// --- URL construction -------------------------------------------------------

test('buildAuthorizationUrl includes the required OAuth parameters and scope', () => {
  const url = buildAuthorizationUrl({
    clientId: 'client-123',
    redirectUri: 'http://127.0.0.1:8123/callback',
    scope: 'w_member_social r_organization_social',
    state: 'state-abc',
  });
  assert.ok(url.startsWith(`${OAUTH_AUTHORIZE_URL}?`));
  const params = new URL(url).searchParams;
  assert.equal(params.get('response_type'), 'code');
  assert.equal(params.get('client_id'), 'client-123');
  assert.equal(params.get('redirect_uri'), 'http://127.0.0.1:8123/callback');
  assert.equal(params.get('state'), 'state-abc');
  assert.equal(params.get('scope'), 'w_member_social r_organization_social');
  assert.equal(params.get('code_challenge'), null);
  assert.equal(params.get('code_challenge_method'), null);
  assert.equal(params.get('enable_extended_login'), null);
});

test('buildAuthorizationUrl omits PKCE parameters when no challenge is given', () => {
  const url = buildAuthorizationUrl({
    clientId: 'client-123',
    redirectUri: 'http://127.0.0.1:8123/callback',
    scope: 'w_member_social',
    state: 'state-abc',
  });
  const params = new URL(url).searchParams;
  assert.equal(params.get('code_challenge'), null);
  assert.equal(params.get('code_challenge_method'), null);
});

test('buildAuthorizationUrl adds S256 PKCE parameters when a challenge is given', () => {
  const url = buildAuthorizationUrl({
    clientId: 'client-123',
    redirectUri: 'http://127.0.0.1:8123/callback',
    scope: 'w_member_social',
    state: 'state-abc',
    codeChallenge: 'challenge-xyz',
  });
  const params = new URL(url).searchParams;
  assert.equal(params.get('code_challenge'), 'challenge-xyz');
  assert.equal(params.get('code_challenge_method'), 'S256');
});

test('buildAuthorizationUrl passes the state through unchanged', () => {
  const state = 'a-state/with+reserved=characters';
  const url = buildAuthorizationUrl({
    clientId: 'client-123',
    redirectUri: 'http://127.0.0.1:8123/callback',
    scope: 'w_member_social',
    state,
  });
  assert.equal(new URL(url).searchParams.get('state'), state);
  assert.equal(parseRedirect(url).state, state);
});

test('buildAuthorizationUrl adds enable_extended_login only when true', () => {
  const base = {
    clientId: 'client-123',
    redirectUri: 'http://127.0.0.1:8123/callback',
    scope: 'w_member_social',
    state: 'state-abc',
  };
  assert.equal(new URL(buildAuthorizationUrl({ ...base, enableExtendedLogin: true })).searchParams.get('enable_extended_login'), 'true');
  assert.equal(new URL(buildAuthorizationUrl({ ...base, enableExtendedLogin: false })).searchParams.get('enable_extended_login'), null);
  assert.equal(new URL(buildAuthorizationUrl(base)).searchParams.get('enable_extended_login'), null);
});

test('OAuth endpoint constants point at LinkedIn over HTTPS', () => {
  assert.equal(OAUTH_AUTHORIZE_URL, 'https://www.linkedin.com/oauth/v2/authorization');
  assert.equal(OAUTH_TOKEN_URL, 'https://www.linkedin.com/oauth/v2/accessToken');
});

// --- Code exchange ----------------------------------------------------------

test('exchangeCodeForToken posts a form-encoded authorization_code request and maps the response', async () => {
  const { calls, fetchImpl } = recordingFetch(async () => tokenResponse(200, {
    access_token: 'access-token-1',
    expires_in: 3600,
    refresh_token: 'refresh-token-1',
    refresh_token_expires_in: 31536000,
    scope: 'w_member_social',
  }));

  const result = await exchangeCodeForToken({
    code: 'auth-code',
    clientId: 'client-123',
    clientSecret: 'client-secret',
    redirectUri: 'http://127.0.0.1:8123/callback',
    codeVerifier: 'verifier-abc',
    fetchImpl,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, OAUTH_TOKEN_URL);
  assert.equal(calls[0].init.method, 'POST');
  assert.match(calls[0].init.headers['Content-Type'], /application\/x-www-form-urlencoded/);
  const body = new URLSearchParams(calls[0].init.body);
  assert.equal(body.get('grant_type'), 'authorization_code');
  assert.equal(body.get('code'), 'auth-code');
  assert.equal(body.get('client_id'), 'client-123');
  assert.equal(body.get('redirect_uri'), 'http://127.0.0.1:8123/callback');
  assert.equal(body.get('client_secret'), 'client-secret');
  assert.equal(body.get('code_verifier'), 'verifier-abc');

  assert.deepEqual(result, {
    accessToken: 'access-token-1',
    expiresIn: 3600,
    refreshToken: 'refresh-token-1',
    refreshTokenExpiresIn: 31536000,
    scope: 'w_member_social',
  });
});

test('exchangeCodeForToken omits client_secret and code_verifier when they are not provided', async () => {
  const { calls, fetchImpl } = recordingFetch(async () => tokenResponse(200, {
    access_token: 'access-token-1',
    expires_in: 3600,
    scope: 'w_member_social',
  }));

  const result = await exchangeCodeForToken({
    code: 'auth-code',
    clientId: 'client-123',
    redirectUri: 'http://127.0.0.1:8123/callback',
    fetchImpl,
  });

  const body = new URLSearchParams(calls[0].init.body);
  assert.equal(body.get('client_secret'), null);
  assert.equal(body.get('code_verifier'), null);
  assert.equal(result.refreshToken, undefined);
  assert.equal(result.refreshTokenExpiresIn, undefined);
});

test('exchangeCodeForToken reports a non-2xx status without leaking the response body', async () => {
  const { fetchImpl } = recordingFetch(async () => unreadableResponse(400));
  await assert.rejects(
    () => exchangeCodeForToken({
      code: 'auth-code',
      clientId: 'client-123',
      clientSecret: 'client-secret',
      redirectUri: 'http://127.0.0.1:8123/callback',
      fetchImpl,
    }),
    (error) => {
      assertOperationError(error, 'AUTH_REQUIRED');
      assert.match(error.message, /400/);
      assert.ok(!error.message.includes('client-secret'));
      return true;
    },
  );
});

test('exchangeCodeForToken treats a response without an access token as a failure', async () => {
  const { fetchImpl } = recordingFetch(async () => tokenResponse(200, { error: 'invalid_grant', error_description: 'body-marker' }));
  await assert.rejects(
    () => exchangeCodeForToken({
      code: 'auth-code',
      clientId: 'client-123',
      redirectUri: 'http://127.0.0.1:8123/callback',
      fetchImpl,
    }),
    (error) => {
      assertOperationError(error, 'AUTH_REQUIRED');
      assert.ok(!error.message.includes('body-marker'));
      return true;
    },
  );
});

// --- Refresh ----------------------------------------------------------------

test('refreshAccessToken posts a form-encoded refresh_token request and maps the response', async () => {
  const { calls, fetchImpl } = recordingFetch(async () => tokenResponse(200, {
    access_token: 'access-token-2',
    expires_in: 3600,
    refresh_token: 'refresh-token-2',
    refresh_token_expires_in: 31536000,
    scope: 'w_member_social',
  }));

  const result = await refreshAccessToken({
    refreshToken: 'refresh-token-1',
    clientId: 'client-123',
    clientSecret: 'client-secret',
    fetchImpl,
  });

  assert.equal(calls[0].url, OAUTH_TOKEN_URL);
  assert.equal(calls[0].init.method, 'POST');
  const body = new URLSearchParams(calls[0].init.body);
  assert.equal(body.get('grant_type'), 'refresh_token');
  assert.equal(body.get('refresh_token'), 'refresh-token-1');
  assert.equal(body.get('client_id'), 'client-123');
  assert.equal(body.get('client_secret'), 'client-secret');
  assert.equal(result.accessToken, 'access-token-2');
  assert.equal(result.refreshToken, 'refresh-token-2');
});

test('refreshAccessToken omits client_secret when it is not provided', async () => {
  const { calls, fetchImpl } = recordingFetch(async () => tokenResponse(200, {
    access_token: 'access-token-2',
    expires_in: 3600,
    scope: 'w_member_social',
  }));

  await refreshAccessToken({ refreshToken: 'refresh-token-1', clientId: 'client-123', fetchImpl });

  const body = new URLSearchParams(calls[0].init.body);
  assert.equal(body.get('client_secret'), null);
});

test('refreshAccessToken reports a non-2xx status without leaking the response body', async () => {
  const { fetchImpl } = recordingFetch(async () => unreadableResponse(401));
  await assert.rejects(
    () => refreshAccessToken({ refreshToken: 'refresh-token-1', clientId: 'client-123', fetchImpl }),
    (error) => {
      assertOperationError(error, 'AUTH_REQUIRED');
      assert.match(error.message, /401/);
      assert.ok(!error.message.includes('refresh-token-1'));
      return true;
    },
  );
});

// --- parseRedirect ----------------------------------------------------------

test('parseRedirect reads a successful redirect from a full URL', () => {
  const parsed = parseRedirect('http://127.0.0.1:8123/callback?code=auth-code&state=state-abc');
  assert.deepEqual(parsed, { code: 'auth-code', state: 'state-abc', error: null, errorDescription: null });
});

test('parseRedirect reads a successful redirect from a bare query string', () => {
  const parsed = parseRedirect('code=auth-code&state=state-abc');
  assert.deepEqual(parsed, { code: 'auth-code', state: 'state-abc', error: null, errorDescription: null });
  const withQuestionMark = parseRedirect('?code=auth-code&state=state-abc');
  assert.deepEqual(withQuestionMark, { code: 'auth-code', state: 'state-abc', error: null, errorDescription: null });
});

test('parseRedirect reads an error redirect', () => {
  const parsed = parseRedirect('https://www.linkedin.com/oauth/v2/authorization?error=access_denied&error_description=The%20user%20denied%20the%20request&state=state-abc');
  assert.equal(parsed.code, null);
  assert.equal(parsed.state, 'state-abc');
  assert.equal(parsed.error, 'access_denied');
  assert.equal(parsed.errorDescription, 'The user denied the request');
});

test('parseRedirect tolerates input with no query parameters', () => {
  const parsed = parseRedirect('/callback');
  assert.deepEqual(parsed, { code: null, state: null, error: null, errorDescription: null });
});

// --- PKCE -------------------------------------------------------------------

test('generatePkce returns a base64url verifier and its SHA-256 challenge', () => {
  const { codeVerifier, codeChallenge, state } = generatePkce();
  assert.match(codeVerifier, /^[A-Za-z0-9_-]{43}$/); // 32 random bytes, base64url, no padding
  assert.equal(codeChallenge, createHash('sha256').update(codeVerifier, 'utf8').digest('base64url'));
  assert.match(codeChallenge, /^[A-Za-z0-9_-]{43}$/);
  assert.match(state, /^[A-Za-z0-9_-]{22}$/); // 16 random bytes, base64url, no padding
});

test('generatePkce produces fresh values on every call', () => {
  const first = generatePkce();
  const second = generatePkce();
  assert.notEqual(first.codeVerifier, second.codeVerifier);
  assert.notEqual(first.state, second.state);
});

// --- Callback server (real loopback requests only) --------------------------

async function withServer(options, run) {
  const server = await startCallbackServer(options);
  try {
    return await run(server);
  } finally {
    await server.close();
  }
}

test('startCallbackServer serves the redirect URI and resolves the code over a real loopback request', async () => {
  await withServer({}, async ({ url, waitForCode }) => {
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/callback$/);

    const pending = waitForCode();
    const response = await fetch(`${url}?code=auth-code-1&state=state-abc`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.ok(!body.includes('auth-code-1'), 'the page body must not echo the code');
    assert.deepEqual(await pending, { code: 'auth-code-1', state: 'state-abc' });
  });
});

test('startCallbackServer resolves immediately when the code has already arrived', async () => {
  await withServer({ redirectPath: '/auth/callback', port: 0 }, async ({ url, waitForCode }) => {
    assert.match(url, /\/auth\/callback$/);
    await fetch(`${url}?code=late-code&state=state-late`);
    assert.deepEqual(await waitForCode(), { code: 'late-code', state: 'state-late' });
  });
});

test('startCallbackServer rejects when the callback state does not match', async () => {
  await withServer({}, async ({ url, waitForCode }) => {
    // Attach the rejection handler before triggering the request so the
    // rejection is never unhandled, even for a moment.
    const assertion = assert.rejects(waitForCode('expected-state'), (error) => {
      assertOperationError(error, 'AUTH_REQUIRED');
      assert.match(error.message, /state/i);
      assert.ok(!error.message.includes('attacker-state'), 'the received state is not echoed');
      return true;
    });
    await fetch(`${url}?code=auth-code-1&state=attacker-state`);
    await assertion;
  });
});

test('startCallbackServer resolves when the callback state matches', async () => {
  await withServer({}, async ({ url, waitForCode }) => {
    const pending = waitForCode('expected-state');
    await fetch(`${url}?code=auth-code-1&state=expected-state`);
    assert.deepEqual(await pending, { code: 'auth-code-1', state: 'expected-state' });
  });
});

test('startCallbackServer rejects an error redirect', async () => {
  await withServer({}, async ({ url, waitForCode }) => {
    const assertion = assert.rejects(waitForCode(), (error) => {
      assertOperationError(error, 'AUTH_REQUIRED');
      assert.match(error.message, /access_denied/);
      return true;
    });
    const response = await fetch(`${url}?error=access_denied&error_description=The+user+denied+the+request&state=state-abc`);
    const body = await response.text();

    assert.equal(response.status, 400);
    assert.ok(!body.includes('The user denied the request'));
    await assertion;
  });
});

test('startCallbackServer times out waiting for a callback', async () => {
  await withServer({ timeoutMs: 150 }, async ({ waitForCode }) => {
    await assert.rejects(waitForCode(), (error) => {
      assertOperationError(error, 'OPERATION_FAILED');
      assert.match(error.message, /[Tt]imed out/);
      return true;
    });
  });
});

test('startCallbackServer close rejects a pending waitForCode', async () => {
  const { waitForCode, close } = await startCallbackServer({ timeoutMs: 60000 });
  const pending = waitForCode();
  await close();
  await assert.rejects(pending, (error) => {
    assertOperationError(error, 'OPERATION_FAILED');
    assert.match(error.message, /closed/i);
    return true;
  });
});
