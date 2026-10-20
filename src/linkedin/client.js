// Official LinkedIn API client. Each call is one fetch and is never retried, so a 429
// reaches the caller with its Retry-After value. Non-2xx responses raise LinkedInApiError.

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

export function createClient({ accessToken, fetch = globalThis.fetch, baseUrl = 'https://api.linkedin.com' }) {
  async function request(path, { method = 'GET', body } = {}) {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    };
    if (path.startsWith('/rest/')) {
      headers['Linkedin-Version'] = LINKEDIN_VERSION;
      headers['X-Restli-Protocol-Version'] = RESTLI_PROTOCOL_VERSION;
    }
    const init = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    const response = await fetch(`${baseUrl}${path}`, init);
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

  return {
    request,
    getIdentity: () => request('/v2/userinfo'),
  };
}
