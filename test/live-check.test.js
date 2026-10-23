import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { run } from '../src/cli.js';
import { OPERATIONS } from '../src/operations/catalog.js';
import { OperationError } from '../src/operations/errors.js';
import { LIVE_READ_OPERATIONS, catalogReadOperations, runLiveCheck, summarizeReport } from '../src/experimental/live-check.js';

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

// CLI-level tests. The session and the browser opener are injected fakes: every
// navigation is recorded and then fails, so no browser is launched and no request
// leaves the process.
const READS = OPERATIONS.filter((entry) => entry.access === 'read').map((entry) => entry.name);
const WRITES = OPERATIONS.filter((entry) => entry.access === 'write').map((entry) => entry.name);
const WITHOUT_INPUTS = OPERATIONS.filter((entry) => entry.access === 'read' && entry.inputSchema.required.length === 0).map((entry) => entry.name);
const WITH_INPUTS = OPERATIONS.filter((entry) => entry.access === 'read' && entry.inputSchema.required.length > 0).map((entry) => entry.name);

function cliFixture({ fail = null } = {}) {
  const navigations = [];
  const opened = [];
  const stdout = { value: '', write(value) { this.value += value; } };
  const stderr = { value: '', write(value) { this.value += value; } };
  const session = {
    page: { url: () => 'about:blank' },
    navigate: async (url) => {
      navigations.push(url);
      throw fail ?? new OperationError('LAYOUT_UNSUPPORTED', 'fixture layout');
    },
    check: async () => {},
    close: async () => {},
  };
  const deps = {
    env: { LINKEDIN_STATE_DIR: join(tmpdir(), 'live-check-test-state'), LINKEDIN_ACCOUNT: 'test' },
    stdin: Readable.from([]),
    stdout,
    stderr,
    store: { load: () => null },
    openSession: async () => { opened.push(true); return session; },
  };
  return { deps, navigations, opened, stdout, stderr };
}

function liveCheck(args, deps) {
  return run(['node', 'linkedin', 'experimental', 'live-check', '--experimental', '--yes', ...args], deps);
}

test('catalogReadOperations lists every catalog read in catalog order and no write', () => {
  assert.deepEqual([...catalogReadOperations()], READS);
  for (const name of WRITES) assert.ok(!catalogReadOperations().includes(name), `write ${name} must not be listed`);
  for (const name of LIVE_READ_OPERATIONS) assert.ok(READS.includes(name), `default ${name} must be a catalog read`);
});

test('default run keeps its seven-name list, skip notes, and summary unchanged', async () => {
  const { deps, navigations, stdout } = cliFixture();
  assert.equal(await liveCheck([], deps), 0);
  assert.equal(stdout.value, [
    'profile.get: unsupported (Unsupported: LAYOUT_UNSUPPORTED)',
    'posts.list: unsupported (Unsupported: LAYOUT_UNSUPPORTED)',
    'feed.list: unsupported (Unsupported: LAYOUT_UNSUPPORTED)',
    'inbox.list: unsupported (Unsupported: LAYOUT_UNSUPPORTED)',
    'connections.list: unsupported (Unsupported: LAYOUT_UNSUPPORTED)',
    'companies.get: skipped (needs --url)',
    'jobs.search: skipped (needs --query)',
    '',
    '5 checked: 0 ok, 5 unsupported, 0 failed. 2 skipped.',
    'Unsupported means LinkedIn changed the page, or the account lacks access. The adapter fails closed rather than guessing.',
    '',
  ].join('\n'));
  assert.equal(navigations.length, 5);
});

test('an explicit --operations list equal to the default prints exactly the default run', async () => {
  const fromDefault = cliFixture();
  const fromList = cliFixture();
  assert.equal(await liveCheck([], fromDefault.deps), 0);
  assert.equal(await liveCheck(['--operations', LIVE_READ_OPERATIONS.join(',')], fromList.deps), 0);
  assert.equal(fromList.stdout.value, fromDefault.stdout.value);
  assert.deepEqual(fromList.navigations, fromDefault.navigations);
});

test('--all-reads checks each catalog read once, catalog order within each group, and skips those without their input', async () => {
  const { deps, navigations, stdout } = cliFixture();
  assert.equal(await liveCheck(['--all-reads'], deps), 0);
  const names = stdout.value.split('\n')
    .filter((line) => /^[a-z][\w.-]*: (ok|unsupported|failed|skipped) /.test(line))
    .map((line) => line.slice(0, line.indexOf(':')));
  // Checked operations print first, then skipped ones; each group keeps catalog order.
  assert.deepEqual(names, [...WITHOUT_INPUTS, ...WITH_INPUTS]);
  assert.equal(new Set(names).size, READS.length);
  // Only the checked operations navigate, and each navigates once.
  assert.equal(navigations.length, WITHOUT_INPUTS.length);
});

test('--all-reads with --operations is a validation error, even when the list equals the default', async () => {
  for (const operations of ['profile.get', LIVE_READ_OPERATIONS.join(',')]) {
    const { deps, opened, navigations, stderr } = cliFixture();
    assert.equal(await liveCheck(['--all-reads', '--operations', operations], deps), 1);
    assert.equal(stderr.value, 'Use either --all-reads or --operations, not both.\n');
    assert.equal(opened.length, 0);
    assert.equal(navigations.length, 0);
  }
});

test('every catalog write name is rejected before any browser opens', async () => {
  const { deps, opened, navigations, stderr } = cliFixture();
  assert.equal(await liveCheck(['--operations', ['profile.get', ...WRITES].join(',')], deps), 1);
  assert.equal(stderr.value, `Unknown operation(s): ${WRITES.join(', ')}. Live checks are read-only.\n`);
  assert.equal(opened.length, 0);
  assert.equal(navigations.length, 0);
});

test('an unknown operation name is rejected with the same message shape', async () => {
  const { deps, opened, navigations, stderr } = cliFixture();
  assert.equal(await liveCheck(['--operations', 'profile.get,nope.nothing'], deps), 1);
  assert.equal(stderr.value, 'Unknown operation(s): nope.nothing. Live checks are read-only.\n');
  assert.equal(opened.length, 0);
  assert.equal(navigations.length, 0);
});

test('--operations accepts a catalog read outside the default list', async () => {
  const { deps, navigations, stdout } = cliFixture();
  assert.equal(await liveCheck(['--operations', 'search.companies,analytics.profile-views', '--query', 'software'], deps), 0);
  assert.equal(navigations.length, 2);
  assert.ok(stdout.value.includes('search.companies: unsupported (Unsupported: LAYOUT_UNSUPPORTED)\n'));
  assert.ok(stdout.value.includes('analytics.profile-views: unsupported (Unsupported: LAYOUT_UNSUPPORTED)\n'));
});

test('a read whose required input is missing is skipped, and nothing is opened when nothing remains', async () => {
  const { deps, opened, navigations, stderr } = cliFixture();
  assert.equal(await liveCheck(['--operations', 'search.companies'], deps), 1);
  // The experimental warning comes first (gate runs before the selection check).
  assert.ok(stderr.value.endsWith('Nothing to check: pass --url or --query for the selected operations.\n'), stderr.value);
  assert.equal(opened.length, 0);
  assert.equal(navigations.length, 0);
});

test('--url and --query reach the operations that require them', async () => {
  const { deps, navigations } = cliFixture();
  assert.equal(await liveCheck(['--operations', 'companies.get,jobs.search', '--url', 'https://www.linkedin.com/company/example/', '--query', 'software'], deps), 0);
  assert.deepEqual(navigations, [
    'https://www.linkedin.com/company/example/',
    'https://www.linkedin.com/jobs/search/?keywords=software',
  ]);
});

test('a failing read is navigated once and never retried', async () => {
  const { deps, navigations } = cliFixture({ fail: new Error('fixture failure') });
  assert.equal(await liveCheck(['--operations', 'profile.get,posts.list'], deps), 1);
  assert.equal(navigations.length, 2);
});
