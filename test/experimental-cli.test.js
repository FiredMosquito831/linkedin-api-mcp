import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { run } from '../src/cli.js';

function fixture(options = {}) {
  const calls = [];
  const stdout = { value: '', write(value) { this.value += value; } };
  const stderr = { value: '', write(value) { this.value += value; } };
  const browser = {
    snapshot: async (input) => { calls.push(['snapshot', input]); return { text: 'test page' }; },
    extract: async (input) => { calls.push(['extract', input]); return { items: ['test'] }; },
    click: async (input) => { calls.push(['click', input]); return { clicked: true }; },
    fill: async (input) => { calls.push(['fill', input]); return { filled: true }; },
    voyagerMe: async () => ({ firstName: 'Test' }),
    login: async ({ waitForUser }) => { await waitForUser(); return { loggedIn: true }; },
    close: async () => calls.push(['close']),
  };
  const deps = {
    store: { load: () => null }, env: {}, stdin: Readable.from([]), stdout, stderr,
    openExperimentalBrowser: async () => { calls.push(['open']); return browser; },
    ...options,
  };
  return { deps, calls, stdout, stderr };
}

function invoke(args, deps) {
  return run(['node', 'linkedin', 'experimental', ...args], deps);
}

test('experimental capabilities truthfully lists unsupported evasion', async () => {
  const { deps, stdout, calls } = fixture();
  assert.equal(await invoke(['capabilities'], deps), 0);
  const data = JSON.parse(stdout.value);
  assert.ok(data.unsupported.includes('captcha-bypass'));
  assert.ok(data.unsupported.includes('rate-limit-evasion'));
  assert.equal(calls.length, 0);
});

test('browser reads need opt-in AND acknowledgment before opening a browser', async () => {
  const { deps, calls } = fixture();
  assert.equal(await invoke(['browser', 'snapshot', '--url', 'https://www.linkedin.com/feed/'], deps), 1);
  assert.equal(await invoke(['browser', 'snapshot', '--url', 'https://www.linkedin.com/feed/', '--experimental'], deps), 1);
  assert.equal(calls.length, 0);
});

test('explicit invocation acknowledgment enables one bounded read and closes the browser', async () => {
  const { deps, calls, stdout } = fixture();
  assert.equal(await invoke(['browser', 'snapshot', '--url', 'https://www.linkedin.com/feed/', '--experimental', '--yes'], deps), 0);
  assert.deepEqual(calls.map((call) => call[0]), ['open', 'snapshot', 'close']);
  assert.equal(JSON.parse(stdout.value).text, 'test page');
});

test('interactive opt-in can be declined before opening a browser', async () => {
  const { deps, calls } = fixture({ confirmExperimental: async () => false });
  assert.equal(await invoke(['browser', 'snapshot', '--url', 'https://www.linkedin.com/feed/', '--experimental'], deps), 1);
  assert.equal(calls.length, 0);
});

test('click needs action approval separate from experimental acknowledgment', async () => {
  const { deps, calls } = fixture();
  const args = ['browser', 'click', '--url', 'https://www.linkedin.com/feed/', '--selector', '#one', '--experimental', '--yes'];
  assert.equal(await invoke(args, deps), 1);
  assert.equal(calls.length, 0);
  assert.equal(await invoke([...args, '--confirm-action'], deps), 0);
  assert.deepEqual(calls[1], ['click', { url: 'https://www.linkedin.com/feed/', selector: '#one', confirmed: true }]);
});

test('fill reads stdin instead of placing text in command arguments', async () => {
  const { deps, calls } = fixture({ stdin: Readable.from(['draft text']) });
  assert.equal(await invoke(['browser', 'fill', '--url', 'https://www.linkedin.com/feed/', '--selector', '#one', '--experimental', '--yes', '--confirm-action'], deps), 0);
  assert.equal(calls.find((call) => call[0] === 'fill')[1].value, 'draft text');
});

test('browser is closed when an action fails', async () => {
  let closed = false;
  const { deps } = fixture({ openExperimentalBrowser: async () => ({ snapshot: async () => { throw new Error('checkpoint'); }, close: async () => { closed = true; } }) });
  assert.equal(await invoke(['browser', 'snapshot', '--url', 'https://www.linkedin.com/feed/', '--experimental', '--yes'], deps), 1);
  assert.equal(closed, true);
});

test('Voyager command is fixed to the own-account me read', async () => {
  const { deps, stdout } = fixture();
  assert.equal(await invoke(['voyager', 'me', '--experimental', '--yes'], deps), 0);
  assert.equal(JSON.parse(stdout.value).firstName, 'Test');
  assert.equal(await invoke(['voyager', 'request', '--experimental', '--yes'], deps), 1);
});
