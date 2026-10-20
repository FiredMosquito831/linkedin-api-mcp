import { Entry as KeyringEntry } from '@napi-rs/keyring';

export function createTokenStore({
  Entry = KeyringEntry,
  service = 'linkedin-cli',
  account = 'default',
} = {}) {
  const openEntry = () => new Entry(service, account);

  return {
    save(token) {
      const trimmed = token.trim();
      if (trimmed === '') {
        throw new Error('Token is empty');
      }
      openEntry().setPassword(trimmed);
    },
    // getPassword returns null and deletePassword returns false when nothing is stored,
    // so no catch is needed here; every other backend error propagates.
    load() {
      return openEntry().getPassword();
    },
    clear() {
      return openEntry().deletePassword();
    },
  };
}
