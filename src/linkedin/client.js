// Official LinkedIn API client. Each call is one fetch and is never retried, so a 429
// reaches the caller with its Retry-After value. Non-2xx responses raise LinkedInApiError.
//
// createClient returns named endpoint functions only, with no generic request method.
// sendRequest is the transport behind them. It is exported for tests only, and src/index.js
// does not re-export it.

const DEFAULT_BASE_URL = 'https://api.linkedin.com';
const LINKEDIN_VERSION = '202610';
const RESTLI_PROTOCOL_VERSION = '2.0.0';

export class LinkedInApiError extends Error {
  constructor({ status, retryAfter, body }) {
    super(`LinkedIn API request failed with HTTP ${status}`);
    this.name = 'LinkedInApiError';
    this.status = status;
    this.retryAfter = retryAfter;
    this.body = body;
  }
}

function parseJsonOrText(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function sendRequest(options, path, requestOptions = {}) {
  const { accessToken, fetch = globalThis.fetch, baseUrl = DEFAULT_BASE_URL } = options;
  const { method = 'GET', body } = requestOptions;
  if (typeof accessToken !== 'string' || accessToken.trim() === '') {
    throw new TypeError('accessToken must be a non-empty string');
  }
  if (typeof path !== 'string' || !path.startsWith('/')) {
    throw new TypeError(`path must start with "/": ${String(path)}`);
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  };
  if (path.startsWith('/rest/')) {
    headers['Linkedin-Version'] = LINKEDIN_VERSION;
    headers['X-Restli-Protocol-Version'] = RESTLI_PROTOCOL_VERSION;
  }
  const init = { method, headers };
  if (body != null) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, init);
  const text = await response.text();
  if (!response.ok) {
    throw new LinkedInApiError({
      status: response.status,
      retryAfter: response.headers.get('Retry-After'),
      body: parseJsonOrText(text),
    });
  }
  if (response.status === 204 || text === '') {
    return null;
  }
  return JSON.parse(text);
}

export function createClient({ accessToken, fetch = globalThis.fetch, baseUrl = DEFAULT_BASE_URL }) {
  const options = { accessToken, fetch, baseUrl };
  return {
    getIdentity: () => sendRequest(options, '/v2/userinfo'),
  };
}
