import http from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { OperationError } from '../operations/errors.js';

export const OAUTH_AUTHORIZE_URL = 'https://www.linkedin.com/oauth/v2/authorization';
export const OAUTH_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';

export function buildAuthorizationUrl({ clientId, redirectUri, scope, state, codeChallenge, enableExtendedLogin }) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state: String(state ?? ''),
    scope,
  });
  if (codeChallenge) {
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');
  }
  if (enableExtendedLogin === true) {
    params.set('enable_extended_login', 'true');
  }
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

async function postTokenForm(fields, fetchImpl) {
  const body = new URLSearchParams(fields).toString();
  const fetcher = fetchImpl ?? globalThis.fetch;
  const response = await fetcher(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    // Deliberately report the status only: the response body is not read or
    // included, so secrets in it cannot leak into logs or error output.
    throw new OperationError('AUTH_REQUIRED', `Token request failed with status ${response.status}. No automatic retry was performed.`);
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new OperationError('AUTH_REQUIRED', 'The token endpoint returned a malformed response. No automatic retry was performed.');
  }
  if (typeof data.access_token !== 'string' || data.access_token.length === 0) {
    throw new OperationError('AUTH_REQUIRED', 'The token endpoint response was missing an access token. No automatic retry was performed.');
  }
  const result = {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
    scope: data.scope,
  };
  if (data.refresh_token !== undefined) result.refreshToken = data.refresh_token;
  if (data.refresh_token_expires_in !== undefined) result.refreshTokenExpiresIn = data.refresh_token_expires_in;
  return result;
}

export async function exchangeCodeForToken({ code, clientId, clientSecret, redirectUri, codeVerifier, fetchImpl }) {
  const fields = {
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
  };
  if (clientSecret) fields.client_secret = clientSecret;
  if (codeVerifier) fields.code_verifier = codeVerifier;
  return postTokenForm(fields, fetchImpl);
}

export async function refreshAccessToken({ refreshToken, clientId, clientSecret, fetchImpl }) {
  const fields = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  };
  if (clientSecret) fields.client_secret = clientSecret;
  return postTokenForm(fields, fetchImpl);
}

export function parseRedirect(url) {
  const raw = String(url ?? '').trim();
  let params;
  try {
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
      params = new URL(raw).searchParams;
    } else if (raw.startsWith('?')) {
      params = new URLSearchParams(raw.slice(1));
    } else if (raw.includes('?')) {
      // A bare path plus query, as seen in the callback server's request line.
      params = new URLSearchParams(raw.slice(raw.indexOf('?') + 1));
    } else {
      params = new URLSearchParams(raw);
    }
  } catch {
    params = new URLSearchParams();
  }
  return {
    code: params.get('code'),
    state: params.get('state'),
    error: params.get('error'),
    errorDescription: params.get('error_description'),
  };
}

export function generatePkce() {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier, 'utf8').digest('base64url');
  const state = randomBytes(16).toString('base64url');
  return { codeVerifier, codeChallenge, state };
}

export async function startCallbackServer({
  redirectPath = '/callback',
  port = 0,
  host = '127.0.0.1',
  timeoutMs = 300000,
  fetchImpl: _fetchImpl, // accepted for signature uniformity; the server only
} = {}) { // accepts inbound loopback connections and never initiates requests.
  let outcome = null;
  const waiters = new Set();

  const server = http.createServer((req, res) => {
    let parsed;
    try {
      parsed = parseRedirect(req.url);
    } catch {
      parsed = { code: null, state: null, error: null, errorDescription: null };
    }
    if (parsed.code) {
      outcome ??= { kind: 'code', code: parsed.code, state: parsed.state };
      sendPage(res, 200, 'Sign-in complete.');
      settleWaiters();
    } else if (parsed.error) {
      outcome ??= { kind: 'error', error: parsed.error, errorDescription: parsed.errorDescription };
      sendPage(res, 400, 'Sign-in was not completed.');
      settleWaiters();
    } else {
      sendPage(res, 200, 'No authorization code received yet.');
    }
  });

  await new Promise((resolve, reject) => {
    const onError = (err) => reject(err);
    server.once('error', onError);
    server.listen(port, host, () => {
      server.removeListener('error', onError);
      server.on('error', () => {}); // post-listen errors must not crash the process
      resolve();
    });
  });

  const address = server.address();
  const resolvedPort = typeof address === 'object' && address ? address.port : port;
  const url = `http://${host}:${resolvedPort}${redirectPath}`;

  function sendPage(res, status, heading) {
    // Static text only: nothing from the redirect query ever reaches the page.
    const body = [
      '<!doctype html>',
      '<html lang="en">',
      '<head><meta charset="utf-8"><title>LinkedIn sign-in</title></head>',
      '<body style="font-family: system-ui, sans-serif; margin: 2rem;">',
      `<h1>${heading}</h1>`,
      '<p>You can close this tab and return to the terminal.</p>',
      '</body>',
      '</html>',
    ].join('\n');
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(body);
  }

  function errorOutcomeMessage() {
    return `The sign-in was aborted: ${outcome.error}${outcome.errorDescription ? ` (${outcome.errorDescription})` : ''}. No automatic retry was performed.`;
  }

  function settleWaiters() {
    for (const waiter of [...waiters]) {
      waiters.delete(waiter);
      clearTimeout(waiter.timer);
      if (outcome.kind === 'error') {
        waiter.reject(new OperationError('AUTH_REQUIRED', errorOutcomeMessage()));
      } else if (waiter.expectedState !== undefined && outcome.state !== waiter.expectedState) {
        waiter.reject(new OperationError('AUTH_REQUIRED', 'The callback state did not match the expected state, so the sign-in was aborted. No automatic retry was performed.'));
      } else {
        waiter.resolve({ code: outcome.code, state: outcome.state });
      }
    }
  }

  function waitForCode(expectedState) {
    if (outcome) {
      if (outcome.kind === 'error') {
        return Promise.reject(new OperationError('AUTH_REQUIRED', errorOutcomeMessage()));
      }
      if (expectedState !== undefined && outcome.state !== expectedState) {
        return Promise.reject(new OperationError('AUTH_REQUIRED', 'The callback state did not match the expected state, so the sign-in was aborted. No automatic retry was performed.'));
      }
      return Promise.resolve({ code: outcome.code, state: outcome.state });
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        expectedState,
        resolve,
        reject,
        timer: setTimeout(() => {
          waiters.delete(waiter);
          reject(new OperationError('OPERATION_FAILED', `Timed out waiting for the OAuth callback after ${timeoutMs} ms.`));
        }, timeoutMs),
      };
      waiters.add(waiter);
    });
  }

  function close() {
    return new Promise((resolve) => {
      const finish = () => {
        for (const waiter of [...waiters]) {
          waiters.delete(waiter);
          clearTimeout(waiter.timer);
          waiter.reject(new OperationError('OPERATION_FAILED', 'The OAuth callback server was closed before an authorization code arrived.'));
        }
        resolve();
      };
      if (!server.listening) return finish();
      server.close(() => finish());
      server.closeAllConnections?.(); // terminate idle keep-alive sockets so close() completes
    });
  }

  return { url, waitForCode, close };
}
