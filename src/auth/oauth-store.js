// Store for the official OAuth token set. The access token and the refresh
// token are separate secrets, so they live in separate credential-store
// entries rather than in one JSON blob. Nothing here writes to disk.

import { Entry as KeyringEntry } from '@napi-rs/keyring';

const SERVICE = 'linkedin-cli';

export function createOAuthStore({ Entry = KeyringEntry, account = 'default' } = {}) {
  const open = (suffix) => new Entry(`${SERVICE}:${suffix}`, account);

  return {
    saveTokens({ accessToken, refreshToken, expiresIn, scope }) {
      if (typeof accessToken !== 'string' || accessToken.trim() === '') {
        throw new Error('Access token is empty');
      }
      open('access').setPassword(accessToken.trim());
      if (typeof refreshToken === 'string' && refreshToken.trim() !== '') {
        open('refresh').setPassword(refreshToken.trim());
      }
      const metadata = JSON.stringify({
        expiresAt: Number.isFinite(expiresIn) ? Date.now() + expiresIn * 1000 : null,
        scope: scope ?? null,
        savedAt: new Date().toISOString(),
      });
      open('metadata').setPassword(metadata);
      return true;
    },
    loadAccessToken() {
      return open('access').getPassword();
    },
    loadRefreshToken() {
      return open('refresh').getPassword();
    },
    loadMetadata() {
      const raw = open('metadata').getPassword();
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    clear() {
      const removed = open('access').deletePassword();
      open('refresh').deletePassword();
      open('metadata').deletePassword();
      return removed;
    },
  };
}
