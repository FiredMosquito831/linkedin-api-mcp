import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OperationError } from '../src/operations/errors.js';
import { LIVE_READ_OPERATIONS, runLiveCheck, summarizeReport } from '../src/experimental/live-check.js';

const PAGE_BODY = 'html-page-body with TOKEN abcdef123 and cookie SESSION=xyz987';

function makeNow(startMs = 1_000_000, stepMs = 100) {
  let current = startMs;
  return () => { current += stepMs; return new Date(current); };
}

test('LIVE_READ_OPERATIONS lists the seven live-checkable read operations', () => {
  assert.deepEqual(LIVE_READ_OPERATIONS, [
    'profile.get', 'posts.list', 'feed.list', 'inbox.list', 'connections.list', 'companies.get', 'jobs.search',
  ]);
});

test('all-ok run reports ok for every operation in order with timing metadata', async () => {
  const executed = [];
  const report = await runLiveCheck({
    operations: ['profile.get', 'posts.list'],
    execute: async (operation) => { executed.push(operation); return { html: PAGE_BODY }; },
    now: makeNow(),
  });
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.startedAt, '1970-01-01T00:16:40.100Z'); // makeNow: 100ms after start per call
  assert.equal(report.finishedAt, '1970-01-01T00:16:40.600Z'); // start + 2 ops x 2 reads + finish
  assert.deepEqual(report.results, [
    { operation: 'profile.get', status: 'ok', detail: 'Succeeded.', durationMs: 100 },
    { operation: 'posts.list', status: 'ok', detail: 'Succeeded.', durationMs: 100 },
  ]);
  assert.deepEqual(executed, ['profile.get', 'posts.list']);
  // An ok detail must not carry the resolved value back out.
  assert.ok(!JSON.stringify(report).includes('TOKEN'));
  assert.ok(!JSON.stringify(report).includes('abc123'));
});

test('a LAYOUT_UNSUPPORTED error maps to unsupported with a code-only detail', async () => {
  const report = await runLiveCheck({
    operations: ['feed.list'],
    execute: async () => {
      throw new OperationError('LAYOUT_UNSUPPORTED', `The page body was ${PAGE_BODY}`);
    },
    now: makeNow(),
  });
  assert.deepEqual(report.results, [
    { operation: 'feed.list', status: 'unsupported', detail: 'Unsupported: LAYOUT_UNSUPPORTED', durationMs: 100 },
  ]);
});

test('an ACCESS_RESTRICTED error maps to unsupported', async () => {
  const report = await runLiveCheck({
    operations: ['inbox.list'],
    execute: async () => { throw new OperationError('ACCESS_RESTRICTED', 'restricted'); },
    now: makeNow(),
  });
  assert.equal(report.results[0].status, 'unsupported');
  assert.equal(report.results[0].detail, 'Unsupported: ACCESS_RESTRICTED');
});

test('a generic error maps to failed with a code-only detail', async () => {
  const report = await runLiveCheck({
    operations: ['posts.list'],
    execute: async () => { throw new OperationError('OPERATION_FAILED', `boom: ${PAGE_BODY}`); },
    now: makeNow(),
  });
  assert.deepEqual(report.results, [
    { operation: 'posts.list', status: 'failed', detail: 'Failed: OPERATION_FAILED', durationMs: 100 },
  ]);
});

test('an error without a code or a non-Error throw maps to failed as OPERATION_FAILED', async () => {
  const report = await runLiveCheck({
    operations: ['jobs.search', 'connections.list'],
    execute: async (operation) => {
      if (operation === 'jobs.search') throw new Error(`plain error leaking ${PAGE_BODY}`);
      throw 'a raw string throw';
    },
    now: makeNow(),
  });
  assert.deepEqual(report.results.map((r) => [r.status, r.detail]), [
    ['failed', 'Failed: OPERATION_FAILED'],
    ['failed', 'Failed: OPERATION_FAILED'],
  ]);
});

test('operations run in the given order and a failed operation is never retried', async () => {
  const calls = [];
  const operations = ['profile.get', 'posts.list', 'feed.list', 'inbox.list'];
  const report = await runLiveCheck({
    operations,
    execute: async (operation) => {
      calls.push(operation);
      if (operation === 'posts.list') throw new OperationError('OPERATION_FAILED', 'first attempt failed');
    },
    now: makeNow(),
  });
  assert.deepEqual(report.results.map((r) => r.operation), operations);
  assert.deepEqual(calls, operations);
  assert.equal(calls.filter((op) => op === 'posts.list').length, 1);
  assert.deepEqual(report.results.map((r) => r.status), ['ok', 'failed', 'ok', 'ok']);
});

test('detail strings never leak a thrown error\'s body, token, or cookie', async () => {
  const report = await runLiveCheck({
    operations: LIVE_READ_OPERATIONS,
    execute: async () => {
      throw new OperationError('OPERATION_FAILED',
        `The page body contained ${PAGE_BODY} and header bearer-secret=sk-live-deadbeef`);
    },
    now: makeNow(),
  });
  for (const result of report.results) {
    assert.ok(typeof result.detail === 'string' && result.detail.length < 100);
    for (const secret of ['page-body', 'TOKEN', 'abc123', 'cookie', 'SESSION', 'sk-live', 'deadbeef', 'bearer']) {
      assert.ok(!result.detail.includes(secret), `detail must not contain ${secret}: ${result.detail}`);
    }
  }
  const summary = summarizeReport(report);
  for (const line of summary.lines) {
    for (const secret of ['TOKEN', 'abc123', 'SESSION', 'sk-live']) {
      assert.ok(!line.includes(secret), `line must not contain ${secret}: ${line}`);
    }
  }
});

test('runLiveCheck defaults to LIVE_READ_OPERATIONS and to a Date clock', async () => {
  const executed = [];
  const report = await runLiveCheck({
    execute: async (operation) => { executed.push(operation); },
  });
  assert.deepEqual(executed, [...LIVE_READ_OPERATIONS]);
  assert.equal(report.results.length, LIVE_READ_OPERATIONS.length);
  assert.equal(typeof report.startedAt, 'string');
  assert.ok(Number.isFinite(Date.parse(report.startedAt)));
});

test('runLiveCheck validates its inputs with OperationError', async () => {
  await assert.rejects(runLiveCheck({ operations: ['profile.get'] }),
    (error) => error instanceof OperationError && error.code === 'INVALID_INPUT');
  await assert.rejects(runLiveCheck({ operations: 'not-an-array', execute: async () => {} }),
    (error) => error instanceof OperationError && error.code === 'INVALID_INPUT');
});

test('summarizeReport counts statuses and builds one printable line per operation', () => {
  const report = {
    schemaVersion: 1,
    startedAt: '1970-01-01T00:00:00.000Z',
    finishedAt: '1970-01-01T00:00:01.000Z',
    results: [
      { operation: 'profile.get', status: 'ok', detail: 'Succeeded.', durationMs: 10 },
      { operation: 'feed.list', status: 'unsupported', detail: 'Unsupported: LAYOUT_UNSUPPORTED', durationMs: 10 },
      { operation: 'posts.list', status: 'failed', detail: 'Failed: OPERATION_FAILED', durationMs: 10 },
      { operation: 'inbox.list', status: 'failed', detail: 'Failed: RATE_LIMITED', durationMs: 10 },
    ],
  };
  const summary = summarizeReport(report);
  assert.equal(summary.checked, 4);
  assert.equal(summary.ok, 1);
  assert.equal(summary.unsupported, 1);
  assert.equal(summary.failed, 2);
  assert.equal(summary.lines.length, 4);
  assert.ok(summary.lines[0].includes('profile.get') && summary.lines[0].includes('ok'));
  assert.ok(summary.lines[1].includes('feed.list') && summary.lines[1].includes('unsupported'));
  assert.ok(summary.lines[2].includes('posts.list') && summary.lines[2].includes('failed'));
  for (const line of summary.lines) {
    assert.ok(line.length < 120, `line must stay short: ${line}`);
  }
});

test('summarizeReport rejects a non-report', () => {
  assert.throws(() => summarizeReport({}), (error) => error instanceof OperationError && error.code === 'INVALID_INPUT');
});
