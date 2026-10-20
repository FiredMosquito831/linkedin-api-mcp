import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTokenStore } from '../src/auth/token-store.js';

class FakeEntry {
  static items = new Map();
  constructor(service, account) { this.key = `${service}/${account}`; }
  setPassword(value) { FakeEntry.items.set(this.key, value); }
  getPassword() { return FakeEntry.items.get(this.key) ?? null; }
  deletePassword() { return FakeEntry.items.delete(this.key); }
}

beforeEach(() => FakeEntry.items.clear());

test('save trims whitespace and newlines', () => {
  const store = createTokenStore({ Entry: FakeEntry });
  store.save('  abc\n');
  assert.equal(store.load(), 'abc');
});

test('save writes under service linkedin-cli and account default', () => {
  createTokenStore({ Entry: FakeEntry }).save('abc');
  assert.deepEqual([...FakeEntry.items.keys()], ['linkedin-cli/default']);
});

test('an empty token is rejected and nothing is stored', () => {
  const store = createTokenStore({ Entry: FakeEntry });
  assert.throws(() => store.save(' \n '), /Token is empty/);
  assert.equal(FakeEntry.items.size, 0);
});

test('load returns null when nothing is stored', () => {
  assert.equal(createTokenStore({ Entry: FakeEntry }).load(), null);
});

test('clear reports whether something was deleted', () => {
  const store = createTokenStore({ Entry: FakeEntry });
  store.save('abc');
  assert.equal(store.clear(), true);
  assert.equal(store.clear(), false);
});

test('backend errors propagate and nothing is stored', () => {
  class BrokenEntry extends FakeEntry {
    setPassword() { throw new Error('no credential store available'); }
  }
  const store = createTokenStore({ Entry: BrokenEntry });
  assert.throws(() => store.save('abc'), /no credential store available/);
  assert.equal(FakeEntry.items.size, 0);
});
