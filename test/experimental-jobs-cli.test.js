import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { run } from '../src/cli.js';

async function fixture(t, { fail = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'linkedin-job-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const stdout = { value: '', write(value) { this.value += value; } };
  const stderr = { value: '', write(value) { this.value += value; } };
  let calls = 0;
  const deps = {
    env: { LINKEDIN_STATE_DIR: directory }, stdin: Readable.from([]), stdout, stderr,
    openExperimentalBrowser: async () => ({
      snapshot: async () => {
        calls += 1;
        if (fail) throw Object.assign(new Error('rate limited'), { status: 429 });
        return { text: 'private output' };
      },
      close: async () => {},
    }),
  };
  const invoke = (args) => run(['node', 'linkedin', 'experimental', ...args, '--experimental', '--yes'], deps);
  return { directory, deps, stdout, stderr, invoke, calls: () => calls };
}

test('jobs add/list/run use persistent metadata and never save read output', async (t) => {
  const { directory, invoke, stdout, calls } = await fixture(t);
  assert.equal(await invoke(['jobs', 'add', '--type', 'browser.snapshot', '--url', 'https://www.linkedin.com/in/me/', '--at', '2026-01-01T00:00:00Z']), 0);
  assert.equal(await invoke(['jobs', 'run', '--max', '1']), 0);
  assert.equal(calls(), 1);
  assert.match(stdout.value, /private output/);
  const raw = await readFile(join(directory, 'jobs', 'jobs.json'), 'utf8');
  assert.ok(!raw.includes('private output'));
  assert.equal(JSON.parse(raw).jobs[0].status, 'succeeded');
  assert.equal(await invoke(['jobs', 'run']), 0);
  assert.equal(calls(), 1);
});

test('a batch validates all rows before any job is saved', async (t) => {
  const { directory, invoke } = await fixture(t);
  const file = join(directory, 'batch.json');
  await writeFile(file, JSON.stringify([
    { action: { type: 'voyager.me' }, runAt: '2026-01-01T00:00:00Z' },
    { action: { type: 'send-message' }, runAt: '2026-01-01T00:00:00Z' },
  ]));
  assert.equal(await invoke(['batch', file]), 1);
  await assert.rejects(readFile(join(directory, 'jobs', 'jobs.json')), { code: 'ENOENT' });
});

test('batch enqueues explicit read jobs and cancellation does not launch a browser', async (t) => {
  const { directory, invoke, stdout, calls } = await fixture(t);
  const file = join(directory, 'batch.json');
  await writeFile(file, JSON.stringify([{ action: { type: 'voyager.me' }, runAt: '2026-01-01T00:00:00Z' }]));
  assert.equal(await invoke(['batch', file]), 0);
  const job = JSON.parse(stdout.value);
  assert.equal(await invoke(['jobs', 'cancel', job.id]), 0);
  assert.equal(calls(), 0);
  assert.equal(JSON.parse(await readFile(join(directory, 'jobs', 'jobs.json'), 'utf8')).jobs[0].status, 'canceled');
});

test('throttled jobs return failure and leave later reads queued', async (t) => {
  const { directory, invoke, stderr, calls } = await fixture(t, { fail: true });
  for (let i = 0; i < 2; i += 1) {
    assert.equal(await invoke(['jobs', 'add', '--type', 'browser.snapshot', '--url', 'https://www.linkedin.com/in/me/', '--at', '2026-01-01T00:00:00Z']), 0);
  }
  assert.equal(await invoke(['jobs', 'run']), 1);
  assert.equal(calls(), 1);
  assert.match(stderr.value, /failed or were blocked/);
  const state = JSON.parse(await readFile(join(directory, 'jobs', 'jobs.json'), 'utf8'));
  assert.deepEqual(state.jobs.map((job) => job.status).sort(), ['blocked', 'queued']);
});

test('named read jobs share the operations service and cannot queue a write', async (t) => {
  const { directory, deps, invoke } = await fixture(t);
  let operation;
  deps.operationsFactory = () => ({ call: async (name) => { operation = name; return { success: true, data: { name: 'Fixture' } }; } });
  assert.equal(await invoke(['jobs', 'add', '--type', 'operation.read', '--operation', 'profile.get', '--at', '2026-01-01T00:00:00Z']), 0);
  assert.equal(await invoke(['jobs', 'run']), 0);
  assert.equal(operation, 'profile.get');
  assert.equal(await invoke(['jobs', 'add', '--type', 'operation.read', '--operation', 'posts.create', '--payload', '{"text":"no"}', '--at', '2026-01-01T00:00:00Z']), 1);
  assert.equal(JSON.parse(await readFile(join(directory, 'jobs', 'jobs.json'), 'utf8')).jobs.length, 1);
});

test('unsupported state directory is rejected before local job files are created', async (t) => {
  const { deps, invoke, stderr } = await fixture(t);
  deps.env.LINKEDIN_STATE_DIR = 'relative-directory';
  assert.equal(await invoke(['jobs', 'list']), 1);
  assert.match(stderr.value, /absolute/);
});
