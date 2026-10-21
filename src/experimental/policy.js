const ORIGIN = 'https://www.linkedin.com';

export class HumanInterventionError extends Error {
  constructor(message = 'LinkedIn requires manual verification. Open the browser and complete it yourself.') {
    super(message);
    this.name = 'HumanInterventionError';
    this.code = 'HUMAN_INTERVENTION_REQUIRED';
  }
}

export function assertExperimental(enabled) {
  if (enabled !== true) throw new Error('Experimental access requires --experimental and explicit confirmation.');
}

export function linkedinUrl(value, { allowLogin = false } = {}) {
  if (typeof value !== 'string' || value.trim() !== value || value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new TypeError('Use an HTTPS www.linkedin.com URL without whitespace, controls, or backslashes.');
  }
  const url = new URL(value);
  if (url.origin !== ORIGIN || url.username || url.password) {
    throw new TypeError('Only HTTPS www.linkedin.com URLs without credentials are supported.');
  }
  if (!allowLogin && /\/(?:checkpoint|challenge|captcha|authwall|login|uas|oauth)(?:\/|$)/i.test(url.pathname)) {
    throw new HumanInterventionError();
  }
  return url.href;
}

export function assertResponse(status, headers = {}) {
  if (status === 429) {
    const error = new Error('LinkedIn rate limited this request. Stop and wait; no retry is performed.');
    error.status = 429;
    error.retryAfter = headers['retry-after'] ?? null;
    throw error;
  }
  if (status === 401 || status === 403 || (status >= 300 && status < 400)) {
    const error = new HumanInterventionError();
    error.status = status;
    throw error;
  }
  if (status >= 400) {
    const error = new Error(`LinkedIn returned HTTP ${status}.`);
    error.status = status;
    throw error;
  }
}
