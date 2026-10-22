import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { run } from '../src/cli.js';
import { createApprovalStore } from '../src/operations/approvals.js';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'linkedin-ops-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const sink = () => ({ value: '', write(value) { this.value += value; } });
  const calls = [];
  const deps = { env: { LINKEDIN_STATE_DIR: dir }, stdin: Readable.from([]), stdout: sink(), stderr: sink(),
    operationsFactory: (config) => ({
      call: async (name, input) => { calls.push({ config, name, input }); return { schemaVersion: 1, success: true, operation: name, account: config.account, data: { items: [{ name: 'One', url: 'https://www.linkedin.com/in/one/' }] } }; },
      prepare: async (name, input) => { calls.push({ config, name, input }); return { schemaVersion: 1, success: true, operation: name, account: config.account, data: { approvalId: 'preview-only' } }; },
    }),
  };
  return { dir, deps, calls, invoke: (args) => run(['node', 'linkedin', ...args], deps) };
}

test('named reads share operations service and support fields and JSONL', async (t) => {
  const { deps, calls, invoke } = await fixture(t);
  assert.equal(await invoke(['profile', 'get', '--experimental', '--fields', 'name', '--jsonl']), 0);
  assert.equal(calls[0].name, 'profile.get');
  assert.equal(calls[0].config.experimental, true);
  assert.deepEqual(JSON.parse(deps.stdout.value).data, { name: 'One' });
});

test('named writes only prepare from stdin; they do not execute', async (t) => {
  const { deps, calls, invoke } = await fixture(t);
  deps.stdin = Readable.from(['{"text":"hello"}']);
  assert.equal(await invoke(['posts', 'create', '--stdin', '--experimental']), 0);
  assert.equal(calls[0].name, 'posts.create');
  assert.deepEqual(calls[0].input, { text: 'hello' });
  assert.equal(JSON.parse(deps.stdout.value).data.approvalId, 'preview-only');
});

test('nested Sales Navigator commands route to distinct named operations', async (t) => {
  const { deps, calls, invoke } = await fixture(t);
  deps.stdin = Readable.from(['{"url":"https://www.linkedin.com/sales/inbox/thread/one","text":"hello"}']);
  assert.equal(await invoke(['sales', 'messages', 'reply', '--stdin', '--experimental']), 0);
  assert.equal(calls[0].name, 'sales.messages.reply');
});

test('account CLI adds selects and renames metadata without contacting LinkedIn', async (t) => {
  const { deps, invoke, calls } = await fixture(t);
  assert.equal(await invoke(['accounts', 'add', 'work']), 0);
  assert.equal(await invoke(['accounts', 'use', 'work']), 0);
  assert.equal(await invoke(['accounts', 'rename', 'work', 'Office']), 0);
  deps.stdout.value = '';
  assert.equal(await invoke(['profile', 'get', '--experimental']), 0);
  assert.equal(calls[0].config.account, 'work');
});

test('approval CLI refuses non-interactive requests and accepts only operator-confirmed digest', async (t) => {
  const { dir, deps, invoke } = await fixture(t);
  const approvals = createApprovalStore({ directory: dir });
  const record = approvals.prepare({ operation: 'posts.create', account: 'default', input: { text: 'hello' } });
  assert.equal(await invoke(['approvals', 'approve', record.id, '--digest', record.digest]), 5);
  assert.equal(approvals.status(record.id, 'default').status, 'prepared');
  deps.confirmApproval = async () => true;
  assert.equal(await invoke(['approvals', 'approve', record.id, '--digest', record.digest]), 0);
  assert.equal(approvals.status(record.id, 'default').status, 'approved');
});

test('CLI flags merge with a private JSON payload instead of being discarded', async (t) => {
  const { deps, calls, invoke } = await fixture(t);
  deps.stdin = Readable.from(['{"text":"hello"}']);
  assert.equal(await invoke(['messages', 'send', '--url', 'https://www.linkedin.com/in/target/', '--stdin', '--experimental']), 0);
  assert.deepEqual(calls[0].input, { url: 'https://www.linkedin.com/in/target/', text: 'hello' });
});

test('JSON payload wins over the same CLI flag on a conflict', async (t) => {
  const { deps, calls, invoke } = await fixture(t);
  deps.stdin = Readable.from(['{"url":"https://www.linkedin.com/in/json-target/","text":"from-json"}']);
  assert.equal(await invoke(['messages', 'send', '--url', 'https://www.linkedin.com/in/flag-target/', '--stdin', '--experimental']), 0);
  assert.equal(calls[0].input.url, 'https://www.linkedin.com/in/json-target/');
  assert.equal(calls[0].input.text, 'from-json');
});

test('invalid stdin JSON is a controlled validation failure', async (t) => {
  const { deps, invoke, calls } = await fixture(t);
  deps.stdin = Readable.from(['not-json']);
  assert.equal(await invoke(['posts', 'create', '--stdin', '--experimental']), 2);
  assert.equal(JSON.parse(deps.stdout.value).error.code, 'VALIDATION_ERROR');
  assert.equal(calls.length, 0);
});

test('quiet mode suppresses results and unknown fields return structured validation errors', async (t) => {
  const { deps, invoke } = await fixture(t);
  assert.equal(await invoke(['profile', 'get', '--quiet']), 0);
  assert.equal(deps.stdout.value, '');
  assert.equal(await invoke(['profile', 'get', '--fields', '__proto__']), 2);
  assert.equal(JSON.parse(deps.stdout.value).error.code, 'VALIDATION_ERROR');
});

test('approvals approve --yes still requires the exact digest', async (t) => {
  const { dir, invoke } = await fixture(t);
  const approvals = createApprovalStore({ directory: dir });
  const record = approvals.prepare({ operation: 'posts.create', account: 'default', input: { text: 'hello' } });
  assert.equal(await invoke(['approvals', 'approve', record.id, '--digest', 'wrong', '--yes']), 5);
  assert.equal(approvals.status(record.id, 'default').status, 'prepared');
  assert.equal(await invoke(['approvals', 'approve', record.id, '--digest', record.digest, '--yes']), 0);
  assert.equal(approvals.status(record.id, 'default').status, 'approved');
});
