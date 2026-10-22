import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OPERATIONS, validateInput } from '../src/operations/catalog.js';
import { createAccountStore, accountPaths } from '../src/operations/accounts.js';
import { createApprovalStore } from '../src/operations/approvals.js';
import { createOperations } from '../src/operations/service.js';
import { exitCode, publicError } from '../src/operations/errors.js';

async function directory(t) {
  const dir = await mkdtemp(join(tmpdir(), 'linkedin-operations-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('catalog enumerates distinct competitor read/write families with honest verification', () => {
  assert.equal(new Set(OPERATIONS.map((row) => row.name)).size, OPERATIONS.length);
  for (const name of ['profile.get', 'inbox.thread', 'connections.list', 'companies.posts', 'jobs.saved', 'analytics.ssi', 'sales.inbox', 'posts.create', 'messages.reply', 'profile.update']) {
    assert.ok(OPERATIONS.some((row) => row.name === name));
  }
  assert.ok(OPERATIONS.every((row) => row.verification !== 'live-tested'));
  assert.ok(Object.isFrozen(OPERATIONS[0].inputSchema.properties));
});

test('operation inputs reject unknown fields, invalid bounds, and off-origin targets', () => {
  assert.throws(() => validateInput('posts.create', { text: 'hello', confirmed: true }), /unexpected/);
  assert.throws(() => validateInput('profile.get', { limit: 51 }), /bounds/);
  assert.throws(() => validateInput('posts.delete', { url: '' }), /nonempty/);
  assert.throws(() => validateInput('profile.get', { url: 'https://www.linkedin.com/in/a\nb' }), /control/);
  assert.throws(() => validateInput('profile.get', { url: 'https://attacker.example/in/a' }), /LinkedIn/);
  assert.throws(() => validateInput('profile.update', { fields: {} }), /one field/);
  assert.throws(() => validateInput('messages.reply', { url: 'https://www.linkedin.com/messaging/thread/1/' }), /text/);
  assert.equal(validateInput('profile.get').limit, 10);
});

test('image-only, text-only, and empty posts follow the posts.create union', () => {
  assert.doesNotThrow(() => validateInput('posts.create', { text: 'hello' }));
  assert.doesNotThrow(() => validateInput('posts.create', { imagePath: 'C:\\tmp\\image.png' }));
  assert.doesNotThrow(() => validateInput('posts.create', { text: 'hello', imagePath: 'C:\\tmp\\image.png' }));
  assert.throws(() => validateInput('posts.create', {}), /requires text or an image/);
  assert.throws(() => validateInput('posts.create', { confirmed: true }), /unexpected field confirmed/);
});

test('named accounts isolate browser paths and credentials while preserving default state', async (t) => {
  const dir = await directory(t);
  const store = createAccountStore({ directory: dir });
  assert.equal(store.current(), 'default');
  store.add('work', 'Work');
  store.use('work');
  assert.equal(store.current(), 'work');
  store.rename('work', 'Office');
  assert.equal(store.list().accounts[1].label, 'Office');
  assert.equal(accountPaths(dir, 'default').profile, join(dir, 'browser-profile'));
  assert.notEqual(accountPaths(dir, 'work').credentialAccount, 'default');
  assert.throws(() => store.add('../escape'), /Account names/);
  assert.throws(() => store.use('unknown'), /Unknown/);
});

test('approvals require separate operator approval, bind account, and cannot execute twice', async (t) => {
  const dir = await directory(t);
  const store = createApprovalStore({ directory: dir });
  const record = store.prepare({ operation: 'posts.create', account: 'default', input: { text: 'hello' } });
  assert.throws(() => store.consume(record.id, { account: 'default' }), /operator/);
  assert.throws(() => store.approve(record.id, { account: 'work', expectedDigest: record.digest }), /different/);
  assert.throws(() => store.approve(record.id, { account: 'default', expectedDigest: 'wrong' }), /digest/);
  store.approve(record.id, { account: 'default', expectedDigest: record.digest });
  assert.equal(store.consume(record.id, { account: 'default' }).status, 'consumed');
  assert.throws(() => store.consume(record.id, { account: 'default' }), /consumed/);
  store.complete(record.id, 'verified');
  assert.equal(store.status(record.id, 'default').status, 'verified');
});

test('expiry and changed approval contents fail closed', async (t) => {
  const dir = await directory(t);
  let clock = 1000;
  const store = createApprovalStore({ directory: dir, now: () => clock, ttlMs: 100 });
  const record = store.prepare({ operation: 'posts.create', account: 'default', input: { text: 'hello' } });
  clock = 1101;
  assert.throws(() => store.approve(record.id, { account: 'default', expectedDigest: record.digest }), /expired/);
  clock = 1000;
  const file = join(dir, 'approvals', `${record.id}.json`);
  const tampered = JSON.parse(await readFile(file, 'utf8'));
  tampered.input.text = 'different';
  await writeFile(file, JSON.stringify(tampered));
  assert.throws(() => store.consume(record.id, { account: 'default' }), /changed/);
});

test('service uses shared read adapter and closes sessions', async (t) => {
  let closes = 0;
  const api = createOperations({ stateDirectory: await directory(t), experimental: true,
    openSession: async () => ({ close: async () => { closes += 1; } }),
    readAdapter: () => ({ execute: async (name, input) => ({ name, limit: input.limit }) }),
  });
  const result = await api.call('profile.get', {});
  assert.equal(result.data.name, 'profile.get');
  assert.equal(result.data.limit, 10);
  assert.equal(closes, 1);
  await assert.rejects(api.call('posts.create', { text: 'hello' }), /approve/);
});

test('preparation never opens browser and service consumes approval before dispatch', async (t) => {
  const dir = await directory(t);
  let opens = 0;
  let sends = 0;
  const api = createOperations({ stateDirectory: dir, experimental: true,
    openSession: async () => { opens += 1; return { close: async () => {} }; },
    writeAdapter: () => ({ execute: async (name, input) => { sends += 1; assert.equal(input.confirmed, true); return { outcome: 'verified', url: 'https://www.linkedin.com/feed/update/urn:li:activity:1/' }; } }),
  });
  const prepared = await api.prepare('posts.create', { text: 'hello' });
  const id = prepared.data.approvalId;
  assert.equal(opens, 0);
  await assert.rejects(api.execute(id), /operator/);
  const store = createApprovalStore({ directory: dir });
  store.approve(id, { account: 'default', expectedDigest: prepared.data.preview.digest });
  assert.equal((await api.execute(id)).data.outcome, 'verified');
  await assert.rejects(api.execute(id), /consumed/);
  assert.equal(sends, 1);
});

test('unknown write completion cannot be automatically retried', async (t) => {
  const dir = await directory(t);
  const api = createOperations({ stateDirectory: dir, experimental: true,
    openSession: async () => ({ close: async () => {} }),
    writeAdapter: () => ({ execute: async () => ({ outcome: 'unknown' }) }),
  });
  const prepared = await api.prepare('posts.create', { text: 'hello' });
  const store = createApprovalStore({ directory: dir });
  store.approve(prepared.data.approvalId, { account: 'default', expectedDigest: prepared.data.preview.digest });
  await assert.rejects(api.execute(prepared.data.approvalId), (error) => error.code === 'OUTCOME_UNKNOWN');
  assert.equal(api.approvalStatus(prepared.data.approvalId).data.status, 'unknown');
  await assert.rejects(api.execute(prepared.data.approvalId), /consumed/);
});

test('unexpected rate-limit failures during a write are never classified retry-safe', async (t) => {
  const dir = await directory(t);
  const api = createOperations({ stateDirectory: dir, experimental: true,
    openSession: async () => ({ close: async () => {} }),
    writeAdapter: () => ({ execute: async () => { throw Object.assign(new Error('limited'), { status: 429 }); } }),
  });
  const prepared = await api.prepare('posts.create', { text: 'fixture' });
  const approvals = createApprovalStore({ directory: dir });
  approvals.approve(prepared.data.approvalId, { account: 'default', expectedDigest: prepared.data.preview.digest });
  await assert.rejects(api.execute(prepared.data.approvalId), (error) => exitCode(error) === 8 && error.completionUnknown);
  assert.equal(api.approvalStatus(prepared.data.approvalId).data.status, 'unknown');
});

test('image approvals bind actual bytes and pass a snapshot rather than reloading the path', async (t) => {
  const dir = await directory(t);
  const imagePath = join(dir, 'image.png');
  const bytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from('fixture')]);
  await writeFile(imagePath, bytes);
  let upload;
  const api = createOperations({ stateDirectory: dir, experimental: true,
    openSession: async () => ({ close: async () => {} }),
    writeAdapter: () => ({ execute: async (name, input) => { upload = input.imageData; return { outcome: 'verified' }; } }),
  });
  const prepared = await api.prepare('posts.create', { text: 'image test', imagePath });
  const store = createApprovalStore({ directory: dir });
  store.approve(prepared.data.approvalId, { account: 'default', expectedDigest: prepared.data.preview.digest });
  await writeFile(imagePath, Buffer.concat([bytes, Buffer.from('changed')]));
  await assert.rejects(api.execute(prepared.data.approvalId), /changed/);
  assert.equal(store.status(prepared.data.approvalId, 'default').status, 'approved');
  await writeFile(imagePath, bytes);
  await api.execute(prepared.data.approvalId);
  assert.equal(upload.mimeType, 'image/png');
  assert.deepEqual(upload.buffer, bytes);
});

test('missing image is a validation error without consuming approval', async (t) => {
  const api = createOperations({ stateDirectory: await directory(t), experimental: true });
  await assert.rejects(api.prepare('posts.create', { text: 'fixture', imagePath: join(tmpdir(), 'nonexistent-linkedin-image.png') }), (error) => error.code === 'VALIDATION_ERROR');
});

test('disabled operations never open browser and errors have distinct exit codes', async (t) => {
  const api = createOperations({ stateDirectory: await directory(t), openSession: () => { throw new Error('must not run'); } });
  await assert.rejects(api.call('profile.get'), (error) => error.code === 'EXPERIMENTAL_DISABLED');
  assert.equal(exitCode({ status: 429, message: 'limit' }), 6);
  assert.equal(exitCode({ status: 429, message: 'limit', completionUnknown: true }), 8);
  assert.equal(exitCode({ code: 'APPROVAL_REQUIRED', message: 'review' }), 5);
  assert.equal(publicError({ message: 'token SECRET', request: { token: 'SECRET' } }).error.message.includes('SECRET'), false);
});

test('a pre-dispatch challenge is not reported as an uncertain outcome', async (t) => {
  const dir = await directory(t);
  const api = createOperations({ stateDirectory: dir, experimental: true,
    openSession: async () => ({ close: async () => {} }),
    writeAdapter: () => ({ execute: async () => { throw Object.assign(new Error('verification'), { code: 'HUMAN_INTERVENTION_REQUIRED' }); } }),
  });
  const prepared = await api.prepare('posts.create', { text: 'fixture' });
  const approvals = createApprovalStore({ directory: dir });
  approvals.approve(prepared.data.approvalId, { account: 'default', expectedDigest: prepared.data.preview.digest });
  await assert.rejects(api.execute(prepared.data.approvalId), (error) => error.code === 'HUMAN_INTERVENTION_REQUIRED'
    && error.completionUnknown !== true
    && exitCode(error) === 3
    && publicError(error).error.code === 'AUTH_REQUIRED');
});
