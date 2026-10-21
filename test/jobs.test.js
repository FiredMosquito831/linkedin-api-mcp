import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createJobStore,
  runDueJobs,
  runWorker,
  validateJobInput,
  JobStoreError,
} from '../src/experimental/jobs.js';

const T0 = '2026-01-01T00:00:00.000Z';
const T1 = '2026-01-02T00:00:00.000Z';
const T2 = '2026-01-02T12:00:00.000Z';
const T3 = '2026-01-03T00:00:00.000Z';
const NOW_T1 = () => new Date(T1);
const NOW_T3 = () => new Date(T3);
const SNAPSHOT = { type: 'browser.snapshot', url: 'https://www.linkedin.com/feed' };
const EXTRACT = {
  type: 'browser.extract',
  url: 'https://www.linkedin.com/in/me',
  selector: 'main',
  limit: 10,
};
const VOYAGER = { type: 'voyager.me' };

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'linkedin-jobs-'));
}

async function withStore(run, options = {}) {
  const directory = makeTmpDir();
  try {
    const store = createJobStore({ directory, ...options });
    await run(store, directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function readState(directory) {
  return JSON.parse(fs.readFileSync(path.join(directory, 'jobs.json'), 'utf8'));
}

function writeState(directory, state) {
  fs.writeFileSync(path.join(directory, 'jobs.json'), JSON.stringify(state, null, 2));
}

function collect() {
  const events = [];
  return { events, onEvent: (event) => events.push(event) };
}

// ---------------------------------------------------------------------------
// Validation at enqueue time
// ---------------------------------------------------------------------------

test('add rejects disallowed and write-like action types', async () => {
  await withStore(async (store) => {
    const bad = [
      { type: 'messaging.send', to: 'urn:li:member:1' },
      { type: 'messaging.reply', text: 'hi' },
      { type: 'posts.create', text: 'hello' },
      { type: 'voyager.posts' },
      { type: 'stealth.browse' },
      { type: 'captcha.bypass' },
      { type: 'browser.navigate' },
      { type: '' },
      { type: 123 },
      {},
      null,
      'browser.snapshot',
    ];
    for (const action of bad) {
      await assert.rejects(store.add({ action, runAt: T0 }), /not allowed|plain object/);
    }
    assert.deepEqual(await store.list(), []);
  });
});

test('add rejects unsafe urls and accepts the canonical LinkedIn origin', async () => {
  await withStore(async (store) => {
    const rejectedUrls = [
      'http://www.linkedin.com/feed',
      'ftp://www.linkedin.com/feed',
      'https://linkedin.com/feed',
      'https://www.linkedin.com.evil.com/feed',
      'https://evil.com/www.linkedin.com/feed',
      'https://www.linkedin.com:8443/feed',
      'https://user:pass@www.linkedin.com/feed',
      'https://www.linkedin.com\\login',
      'https://www.linkedin.com/login',
      'https://www.linkedin.com/login/',
      'https://www.linkedin.com/uas/login',
      'https://www.linkedin.com/checkpoint/challenge/abc',
      'https://www.linkedin.com/authwall',
      ' https://www.linkedin.com/feed',
      'not a url',
      '',
      undefined,
      42,
    ];
    for (const url of rejectedUrls) {
      await assert.rejects(
        store.add({ action: { type: 'browser.snapshot', url }, runAt: T0 }),
        /url/,
        `expected rejection for ${String(url)}`,
      );
    }

    const acceptedUrls = [
      'https://www.linkedin.com',
      'https://www.linkedin.com/',
      'https://www.linkedin.com/feed',
      'https://www.linkedin.com:443/feed',
      'https://www.linkedin.com/in/me?trk=1#top',
    ];
    const accepted = [];
    for (const url of acceptedUrls) {
      accepted.push((await store.add({ action: { type: 'browser.snapshot', url }, runAt: T0 })).action.url);
    }
    assert.deepEqual(accepted, acceptedUrls);
  });
});

test('extract requires a selector and an integer limit of 1..50, stored canonically', async () => {
  await withStore(async (store) => {
    const bad = [
      { ...EXTRACT, selector: undefined },
      { ...EXTRACT, selector: '' },
      { ...EXTRACT, selector: '   ' },
      { ...EXTRACT, selector: 7 },
      { ...EXTRACT, limit: undefined },
      { ...EXTRACT, limit: 0 },
      { ...EXTRACT, limit: 51 },
      { ...EXTRACT, limit: -1 },
      { ...EXTRACT, limit: 1.5 },
      { ...EXTRACT, limit: '10' },
      { ...EXTRACT, limit: Number.NaN },
    ];
    for (const action of bad) {
      await assert.rejects(store.add({ action, runAt: T0 }), /selector|limit/);
    }
    const low = await store.add({ action: { ...EXTRACT, limit: 1 }, runAt: T0 });
    const high = await store.add({ action: { ...EXTRACT, limit: 50 }, runAt: T0 });
    assert.equal(low.action.limit, 1);
    assert.equal(high.action.limit, 50);
    assert.deepEqual(Object.keys(low.action).sort(), ['limit', 'selector', 'type', 'url']);
  });
});

test('voyager.me takes no url and actions are canonicalized (no secret extras)', async () => {
  await withStore(async (store) => {
    await assert.rejects(
      store.add({ action: { type: 'voyager.me', url: 'https://www.linkedin.com' }, runAt: T0 }),
      /unexpected fields/,
    );
    const secretExtras = [
      { ...SNAPSHOT, stealth: true },
      { ...SNAPSHOT, bypassCaptcha: true },
      { ...SNAPSHOT, accessToken: 'secret' },
      { ...EXTRACT, cookies: [{ name: 'li_at', value: 'secret' }] },
      { ...EXTRACT, headers: { authorization: 'Bearer secret' } },
      { ...VOYAGER, accessToken: 'secret' },
    ];
    for (const action of secretExtras) {
      await assert.rejects(store.add({ action, runAt: T0 }), /unexpected fields/);
    }
    const job = await store.add({ action: VOYAGER, runAt: T0 });
    assert.deepEqual(job.action, { type: 'voyager.me' });
  });
});

test('runAt must be an ISO string with an explicit timezone and is normalized', async () => {
  await withStore(async (store) => {
    const bad = [
      undefined,
      null,
      '',
      'not-a-date',
      '2026-01-01',
      '2026-01-01T00:00:00',
      '2026-01-01 00:00:00Z',
      '2026-01-01T00:00:00+02',
      '2026-13-01T00:00:00Z',
      '1751328000',
    ];
    for (const runAt of bad) {
      await assert.rejects(store.add({ action: VOYAGER, runAt }), /runAt/, `runAt ${String(runAt)}`);
    }

    const offset = await store.add({ action: VOYAGER, runAt: '2026-01-01T02:00:00+02:00' });
    assert.equal(offset.runAt, '2026-01-01T00:00:00.000Z');
    const zulu = await store.add({ action: VOYAGER, runAt: '2026-01-01T00:00:00Z' });
    assert.equal(zulu.runAt, '2026-01-01T00:00:00.000Z');
    const millis = await store.add({ action: VOYAGER, runAt: '2026-01-01T00:00:00.500Z' });
    assert.equal(millis.runAt, '2026-01-01T00:00:00.500Z');
  });
});

test('validateJobInput validates without effects and returns a canonical clone', () => {
  const entry = { action: EXTRACT, runAt: '2026-01-01T02:00:00+02:00' };
  const normalized = validateJobInput(entry);
  assert.deepEqual(normalized, { action: EXTRACT, runAt: T0 });
  assert.notEqual(normalized.action, entry.action);
  assert.notEqual(normalized.action, EXTRACT);

  assert.throws(
    () => validateJobInput({ action: { ...SNAPSHOT, accessToken: 'secret' }, runAt: T0 }),
    /unexpected fields/,
  );
  assert.throws(() => validateJobInput({ action: VOYAGER, runAt: 'no-zone' }), /runAt/);
  assert.throws(() => validateJobInput({ action: VOYAGER, runAt: T0, extra: 1 }), /unexpected fields/);
  assert.throws(() => validateJobInput(null), /job entry/);
  assert.throws(() => validateJobInput(), /job entry/);
});

test('createJobStore requires an explicit directory', () => {
  assert.throws(() => createJobStore({}), JobStoreError);
  assert.throws(() => createJobStore({ directory: '' }), /directory/);
  assert.throws(() => createJobStore({ directory: 42 }), /directory/);
  assert.throws(() => createJobStore(), /directory/);
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

test('add persists schemaVersion 1 records and creates nested directories', async () => {
  const base = makeTmpDir();
  try {
    const directory = path.join(base, 'nested', 'state');
    const store = createJobStore({ directory });
    const job = await store.add({ action: SNAPSHOT, runAt: T0 });

    const state = readState(directory);
    assert.equal(state.schemaVersion, 1);
    assert.equal(state.jobs.length, 1);
    assert.deepEqual(Object.keys(state.jobs[0]).sort(), ['action', 'createdAt', 'id', 'runAt', 'status']);
    assert.equal(state.jobs[0].id, job.id);
    assert.equal(state.jobs[0].status, 'queued');
    assert.equal(state.jobs[0].runAt, T0);
    assert.deepEqual(state.jobs[0].action, SNAPSHOT);

    const raw = fs.readFileSync(path.join(directory, 'jobs.json'), 'utf8');
    assert.equal(/token|credential|authorization|password|cookie/i.test(raw), false);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('list on an empty directory returns no jobs', async () => {
  await withStore(async (store) => {
    assert.deepEqual(await store.list(), []);
  });
});

test('adding and listing clone inputs so caller mutation cannot leak', async () => {
  await withStore(async (store) => {
    const action = { ...SNAPSHOT };
    await store.add({ action, runAt: T0 });

    action.type = 'messaging.send';
    action.url = 'https://evil.com';

    const first = await store.list();
    assert.deepEqual(first[0].action, SNAPSHOT);

    first[0].status = 'succeeded';
    first[0].action.url = 'https://evil.com';
    const second = await store.list();
    assert.equal(second[0].status, 'queued');
    assert.equal(second[0].action.url, SNAPSHOT.url);
  });
});

test('corrupt or malformed job stores fail closed', async () => {
  await withStore(async (store, directory) => {
    fs.writeFileSync(path.join(directory, 'jobs.json'), '{not json');
    await assert.rejects(store.list(), /corrupt/);
    await assert.rejects(store.add({ action: VOYAGER, runAt: T0 }), /corrupt/);
    await assert.rejects(store.claimNextDue(T3), /corrupt/);

    writeState(directory, { schemaVersion: 2, jobs: [] });
    await assert.rejects(store.list(), /schemaVersion/);

    writeState(directory, { schemaVersion: 1, jobs: 'nope' });
    await assert.rejects(store.list(), /corrupt/);

    writeState(directory, {
      schemaVersion: 1,
      jobs: [
        { id: 'x', action: VOYAGER, runAt: T0, status: 'queued', createdAt: T0, token: 'secret' },
      ],
    });
    await assert.rejects(store.list(), /unknown field/);

    writeState(directory, {
      schemaVersion: 1,
      jobs: [{ id: 'x', action: VOYAGER, runAt: T0, status: 'weird', createdAt: T0 }],
    });
    await assert.rejects(store.list(), /status/);
  });
});

test('unreadable or non-directory stores fail closed', async () => {
  await withStore(async (store, directory) => {
    // jobs.json that cannot be read as a file (here: a directory) is an error,
    // not an empty queue.
    fs.rmSync(path.join(directory, 'jobs.json'), { force: true });
    fs.mkdirSync(path.join(directory, 'jobs.json'));
    await assert.rejects(store.list(), /cannot read/);
    await assert.rejects(store.add({ action: VOYAGER, runAt: T0 }), /cannot write|cannot read/);
  });

  const base = makeTmpDir();
  try {
    const filePath = path.join(base, 'not-a-directory');
    fs.writeFileSync(filePath, 'x');
    const store = createJobStore({ directory: filePath });
    await assert.rejects(store.add({ action: VOYAGER, runAt: T0 }), /directory/);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('lock contention is rejected without losing successful adds', async () => {
  await withStore(async (store, directory) => {
    const lockPath = path.join(directory, 'jobs.json.lock');

    // A held lock is never stolen.
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(lockPath, '{"pid":99999}');
    await assert.rejects(store.add({ action: VOYAGER, runAt: T0 }), /locked by another process/);
    await assert.rejects(store.add({ action: VOYAGER, runAt: T0 }), /never stolen/);
    fs.unlinkSync(lockPath);

    // Sequential adds all persist.
    const a = await store.add({ action: VOYAGER, runAt: T0 });
    const b = await store.add({ action: SNAPSHOT, runAt: T0 });
    let state = readState(directory);
    assert.equal(state.jobs.length, 2);
    assert.deepEqual(state.jobs.map((job) => job.id), [a.id, b.id]);

    // Concurrent mutations either serialize or reject (lock contention);
    // either way every successful add must survive in the file.
    fs.unlinkSync(path.join(directory, 'jobs.json'));
    const results = await Promise.allSettled([
      store.add({ action: VOYAGER, runAt: T0 }),
      store.add({ action: VOYAGER, runAt: T0 }),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    assert.equal(fulfilled.length + rejected.length, 2);
    assert.ok(fulfilled.length >= 1);
    for (const failure of rejected) assert.match(failure.reason.message, /locked/);

    state = readState(directory);
    assert.equal(state.jobs.length, fulfilled.length);
    assert.deepEqual(
      state.jobs.map((job) => job.id).sort(),
      fulfilled.map((result) => result.value.id).sort(),
    );

    const c = await store.add({ action: VOYAGER, runAt: T0 });
    state = readState(directory);
    assert.equal(state.jobs.length, fulfilled.length + 1);
    assert.equal(state.jobs.at(-1).id, c.id);
  });
});

// ---------------------------------------------------------------------------
// Claims and due ordering
// ---------------------------------------------------------------------------

test('claimNextDue returns due jobs in runAt order and skips future jobs', async () => {
  await withStore(async (store) => {
    const late = await store.add({ action: VOYAGER, runAt: T2 });
    const early = await store.add({ action: VOYAGER, runAt: T0 });
    const middle = await store.add({ action: VOYAGER, runAt: T1 });
    const future = await store.add({ action: VOYAGER, runAt: '2026-02-01T00:00:00.000Z' });

    assert.equal((await store.claimNextDue(T1)).id, early.id);
    assert.equal((await store.claimNextDue(T1)).id, middle.id);
    assert.equal(await store.claimNextDue(T1), null);

    assert.equal((await store.claimNextDue(T3)).id, late.id);
    assert.equal(await store.claimNextDue(T3), null);

    assert.equal((await store.claimNextDue('2026-03-01T00:00:00.000Z')).id, future.id);
    assert.equal(await store.claimNextDue('2026-03-01T00:00:00.000Z'), null);
  });
});

test('runDueJobs executes only due jobs', async () => {
  await withStore(async (store, directory) => {
    const due = await store.add({ action: VOYAGER, runAt: T0 });
    const future = await store.add({ action: SNAPSHOT, runAt: '2026-02-01T00:00:00.000Z' });
    const executed = [];
    const events = await runDueJobs({
      store,
      execute: async (action) => {
        executed.push(action.type);
      },
      now: NOW_T1,
    });

    assert.deepEqual(executed, ['voyager.me']);
    assert.deepEqual(events.map((event) => event.type), ['claimed', 'succeeded']);
    const byId = new Map(readState(directory).jobs.map((job) => [job.id, job]));
    assert.equal(byId.get(due.id).status, 'succeeded');
    assert.equal(byId.get(future.id).status, 'queued');
  });
});

test('each job is claimed exactly once and settled jobs never repeat', async () => {
  await withStore(async (store) => {
    const job = await store.add({ action: VOYAGER, runAt: T0 });
    let calls = 0;
    const execute = async () => {
      calls += 1;
    };

    await runDueJobs({ store, execute, now: NOW_T1 });
    await runDueJobs({ store, execute, now: NOW_T1 });
    assert.equal(calls, 1);
    assert.equal((await store.list())[0].status, 'succeeded');
    assert.equal(await store.claimNextDue(T3), null);
    assert.equal(job.id, (await store.list())[0].id);
  });
});

test('execute receives a cloned action and results are neither persisted nor in events', async () => {
  await withStore(async (store, directory) => {
    const job = await store.add({ action: SNAPSHOT, runAt: T0 });
    const events = await runDueJobs({
      store,
      execute: async (action) => {
        action.url = 'https://evil.com';
        action.type = 'messaging.send';
        return { snapshot: 'SUPER_SECRET_RESULT' };
      },
      now: NOW_T1,
    });

    assert.deepEqual(events, [
      { type: 'claimed', jobId: job.id, action: SNAPSHOT, runAt: T0 },
      { type: 'succeeded', jobId: job.id },
    ]);
    // Events must be plain JSON-serializable data.
    assert.deepEqual(JSON.parse(JSON.stringify(events)), events);

    const raw = fs.readFileSync(path.join(directory, 'jobs.json'), 'utf8');
    assert.equal(raw.includes('SUPER_SECRET_RESULT'), false);
    assert.equal(raw.includes('evil.com'), false);
    const stored = readState(directory).jobs[0];
    assert.deepEqual(stored.action, SNAPSHOT);
    assert.equal('result' in stored, false);
  });
});

// ---------------------------------------------------------------------------
// Failures and blocking
// ---------------------------------------------------------------------------

test('failed jobs persist only a generic message, never a response body, and are not retried', async () => {
  await withStore(async (store, directory) => {
    const job = await store.add({ action: VOYAGER, runAt: T0 });
    let calls = 0;
    const execute = async () => {
      calls += 1;
      const err = new Error('request failed with SUPER_SECRET_TOKEN');
      err.status = 500;
      err.body = { secret: 'SUPER_SECRET_TOKEN', tokens: ['a', 'b'] };
      throw err;
    };

    const events = await runDueJobs({ store, execute, now: NOW_T1 });
    assert.deepEqual(events, [
      { type: 'claimed', jobId: job.id, action: VOYAGER, runAt: T0 },
      { type: 'failed', jobId: job.id, message: 'job execution failed' },
    ]);

    const raw = fs.readFileSync(path.join(directory, 'jobs.json'), 'utf8');
    assert.equal(raw.includes('SUPER_SECRET_TOKEN'), false);
    assert.equal(raw.includes('request failed'), false);
    assert.equal(raw.includes('"body"'), false);
    // Events are printed by the CLI: they must never carry secrets or results.
    assert.equal(JSON.stringify(events).includes('SUPER_SECRET_TOKEN'), false);
    assert.equal(JSON.stringify(events).includes('"result"'), false);
    const stored = readState(directory).jobs[0];
    assert.equal(stored.status, 'failed');
    assert.equal(stored.message, 'job execution failed');

    await runDueJobs({ store, execute, now: NOW_T1 });
    assert.equal(calls, 1);
    assert.equal((await store.list())[0].status, 'failed');
  });
});

test('HTTP 429 blocks the job and stops the cycle without automatic retry', async () => {
  await withStore(async (store, directory) => {
    const first = await store.add({ action: VOYAGER, runAt: T0 });
    const second = await store.add({ action: VOYAGER, runAt: T1 });
    const calls = [];
    const execute = async () => {
      calls.push(calls.length + 1);
      if (calls.length === 1) {
        const err = new Error('throttled');
        err.status = 429;
        throw err;
      }
    };

    const events = await runDueJobs({ store, execute, now: NOW_T3 });
    assert.equal(calls.length, 1);
    assert.deepEqual(events.map((event) => event.type), ['claimed', 'blocked', 'stopped']);
    assert.equal(events[0].jobId, first.id);
    assert.equal(events[1].reason, 'rate_limited');

    const byId = new Map(readState(directory).jobs.map((job) => [job.id, job]));
    assert.equal(byId.get(first.id).status, 'blocked');
    assert.match(byId.get(first.id).message, /429/);
    assert.equal(byId.get(second.id).status, 'queued');

    // The blocked job is terminal: the next cycle runs the remaining job but
    // never retries the blocked one.
    await runDueJobs({ store, execute, now: NOW_T3 });
    assert.equal(calls.length, 2);
    const after = new Map(readState(directory).jobs.map((job) => [job.id, job]));
    assert.equal(after.get(first.id).status, 'blocked');
    assert.equal(after.get(second.id).status, 'succeeded');
  });
});

test('401/403, HumanInterventionError, and checkpoints block and stop the cycle', async () => {
  await withStore(async (store, directory) => {
    const auth = await store.add({ action: VOYAGER, runAt: T0 });
    const after = await store.add({ action: VOYAGER, runAt: T1 });

    const authError = new Error('unauthorized');
    authError.status = 403;
    let calls = 0;
    let events = await runDueJobs({
      store,
      execute: async () => {
        calls += 1;
        throw authError;
      },
      now: NOW_T3,
    });
    assert.equal(calls, 1);
    assert.deepEqual(events.map((event) => event.type), ['claimed', 'blocked', 'stopped']);
    assert.equal(events[1].reason, 'auth_required');
    assert.equal(readState(directory).jobs.find((job) => job.id === after.id).status, 'queued');

    // Recognized by name and code even when the message has no keywords.
    const humanError = new Error('stopped by provider');
    humanError.name = 'HumanInterventionError';
    humanError.code = 'HUMAN_INTERVENTION_REQUIRED';
    events = await runDueJobs({
      store,
      execute: async () => {
        throw humanError;
      },
      now: NOW_T3,
    });
    assert.deepEqual(events.map((event) => event.type), ['claimed', 'blocked', 'stopped']);
    assert.equal(events[1].reason, 'human_intervention');

    const checkpoint = await store.add({ action: VOYAGER, runAt: T0 });
    events = await runDueJobs({
      store,
      execute: async () => {
        throw new Error('checkpoint required');
      },
      now: NOW_T3,
    });
    assert.equal(events[1].reason, 'human_intervention');

    const byId = new Map(readState(directory).jobs.map((job) => [job.id, job]));
    assert.equal(byId.get(auth.id).status, 'blocked');
    assert.equal(byId.get(after.id).status, 'blocked');
    assert.equal(byId.get(checkpoint.id).status, 'blocked');
  });
});

test('tampered jobs are rejected at execution time and never executed', async () => {
  await withStore(async (store, directory) => {
    const job = await store.add({ action: SNAPSHOT, runAt: T0 });
    const state = readState(directory);
    state.jobs[0].action = { type: 'messaging.send', to: 'urn:li:member:1' };
    writeState(directory, state);

    let calls = 0;
    const events = await runDueJobs({
      store,
      execute: async () => {
        calls += 1;
      },
      now: NOW_T1,
    });

    assert.equal(calls, 0);
    assert.deepEqual(events.map((event) => event.type), ['claimed', 'failed']);
    assert.equal(events[1].message, 'job action failed validation at execution');
    const stored = readState(directory).jobs.find((entry) => entry.id === job.id);
    assert.equal(stored.status, 'failed');
    assert.equal(stored.message, 'job action failed validation at execution');

    // A tampered URL is caught as well.
    writeState(directory, {
      schemaVersion: 1,
      jobs: [
        {
          id: 'tampered-url',
          action: { type: 'browser.snapshot', url: 'https://evil.com/steal' },
          runAt: T0,
          status: 'queued',
          createdAt: T0,
        },
      ],
    });
    const events2 = await runDueJobs({
      store,
      execute: async () => {
        calls += 1;
      },
      now: NOW_T1,
    });
    assert.equal(calls, 0);
    assert.equal(events2[1].type, 'failed');
  });
});

// ---------------------------------------------------------------------------
// Cancellation and recovery
// ---------------------------------------------------------------------------

test('cancel works for queued jobs and rejects terminal or running jobs', async () => {
  await withStore(async (store) => {
    const job = await store.add({ action: VOYAGER, runAt: T0 });
    const canceled = await store.cancel(job.id);
    assert.equal(canceled.status, 'canceled');
    assert.equal(canceled.id, job.id);
    assert.equal((await store.list())[0].status, 'canceled');

    await assert.rejects(store.cancel(job.id), /terminal/);
    await assert.rejects(store.cancel('missing-id'), /no job/);
    await assert.rejects(store.cancel(''), /job id/);

    let calls = 0;
    await runDueJobs({
      store,
      execute: async () => {
        calls += 1;
      },
      now: NOW_T1,
    });
    assert.equal(calls, 0);

    const running = await store.add({ action: VOYAGER, runAt: T0 });
    await store.claimNextDue(T1);
    await assert.rejects(store.cancel(running.id), /running/);
    await store.settle(running.id, 'succeeded');
    await assert.rejects(store.cancel(running.id), /terminal/);
  });
});

test('recover marks interrupted running jobs failed and they never execute', async () => {
  await withStore(async (store, directory) => {
    const job = await store.add({ action: VOYAGER, runAt: T0 });
    await store.claimNextDue(T1); // simulate a worker that crashed mid-job

    const marked = await store.recover();
    assert.deepEqual(marked, [job.id]);
    const stored = readState(directory).jobs[0];
    assert.equal(stored.status, 'failed');
    assert.match(stored.message, /interrupted/);

    const events = await runDueJobs({
      store,
      execute: async () => {
        throw new Error('must not run');
      },
      now: NOW_T1,
    });
    assert.deepEqual(events, []);
    assert.deepEqual(await store.recover(), []);
  });
});

test('recover refuses to touch an active worker lease', async () => {
  await withStore(async (store) => {
    const job = await store.add({ action: VOYAGER, runAt: T0 });
    await store.claimNextDue(T1); // in-flight job owned by a live worker

    const lease = store.acquireWorkerLease();
    await assert.rejects(store.recover(), /worker/);
    assert.equal((await store.list())[0].status, 'running');

    const marked = await store.recover({ leaseToken: lease.token });
    assert.deepEqual(marked, [job.id]);
    lease.release();
    assert.deepEqual(await store.recover(), []);
  });
});

// ---------------------------------------------------------------------------
// runDueJobs options and batch cap
// ---------------------------------------------------------------------------

test('runDueJobs validates its options and caps the batch at 1..20', async () => {
  await withStore(async (store) => {
    const execute = async () => {};
    for (const maxJobs of [0, 21, 1.5, '2', -1]) {
      await assert.rejects(runDueJobs({ store, execute, maxJobs }), /maxJobs/, `maxJobs ${maxJobs}`);
    }
    await assert.rejects(runDueJobs({ store, execute: 'nope' }), /execute/);
    await assert.rejects(runDueJobs({ store: {}, execute }), /store/);
    await assert.rejects(runDueJobs({ store, execute, signal: {} }), /AbortSignal/);
    await assert.rejects(runDueJobs({ store, execute, onEvent: 'x' }), /onEvent/);

    for (let index = 0; index < 4; index += 1) {
      await store.add({ action: VOYAGER, runAt: T0 });
    }
    let executed = 0;
    await runDueJobs({ store, execute: async () => { executed += 1; }, maxJobs: 2, now: NOW_T3 });
    assert.equal(executed, 2);
    const statuses = (await store.list()).map((job) => job.status);
    assert.equal(statuses.filter((status) => status === 'succeeded').length, 2);
    assert.equal(statuses.filter((status) => status === 'queued').length, 2);
  });
});

test('runDueJobs aborts between jobs and reports it', async () => {
  await withStore(async (store) => {
    await store.add({ action: VOYAGER, runAt: T0 });
    await store.add({ action: VOYAGER, runAt: T1 });
    const controller = new AbortController();
    controller.abort();
    const events = await runDueJobs({
      store,
      execute: async () => {},
      now: NOW_T3,
      signal: controller.signal,
    });
    assert.deepEqual(events, [{ type: 'stopped', reason: 'aborted' }]);
    assert.equal((await store.list())[0].status, 'queued');
  });
});

test('onEvent receives every plain event in order', async () => {
  await withStore(async (store) => {
    const job = await store.add({ action: VOYAGER, runAt: T0 });
    const { events: seen, onEvent } = collect();
    const events = await runDueJobs({ store, execute: async () => {}, now: NOW_T1, onEvent });
    assert.deepEqual(seen, events);
    assert.deepEqual(events, [
      { type: 'claimed', jobId: job.id, action: VOYAGER, runAt: T0 },
      { type: 'succeeded', jobId: job.id },
    ]);
    assert.deepEqual(JSON.parse(JSON.stringify(seen)), seen);
  });
});

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

test('runWorker validates intervalMs and requires an abort signal', async () => {
  await withStore(async (store) => {
    await assert.rejects(
      runWorker({ store, execute: async () => {}, intervalMs: 999, signal: new AbortController().signal }),
      /intervalMs/,
    );
    await assert.rejects(
      runWorker({ store, execute: async () => {}, intervalMs: 3600001, signal: new AbortController().signal }),
      /intervalMs/,
    );
    await assert.rejects(
      runWorker({ store, execute: async () => {}, intervalMs: 1.5, signal: new AbortController().signal }),
      /intervalMs/,
    );
    await assert.rejects(runWorker({ store, execute: async () => {}, intervalMs: 1000 }), /AbortSignal/);
  });
});

test('runWorker recovers on start, executes due jobs sequentially, and exits on abort', async () => {
  await withStore(async (store, directory) => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const interrupted = await store.add({ action: VOYAGER, runAt: past });
    await store.claimNextDue(new Date().toISOString()); // running, left behind
    const queued = await store.add({ action: SNAPSHOT, runAt: past });

    const controller = new AbortController();
    const executed = [];
    const worker = runWorker({
      store,
      intervalMs: 1000,
      signal: controller.signal,
      execute: async (action) => {
        executed.push(action.type);
        controller.abort();
      },
    });

    await Promise.race([
      worker,
      new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('worker did not stop on abort')), 5000);
      }),
    ]);

    assert.deepEqual(executed, ['browser.snapshot']);
    const byId = new Map(readState(directory).jobs.map((job) => [job.id, job]));
    assert.equal(byId.get(interrupted.id).status, 'failed');
    assert.match(byId.get(interrupted.id).message, /interrupted/);
    assert.equal(byId.get(queued.id).status, 'succeeded');
    assert.equal(fs.existsSync(path.join(directory, 'jobs.worker.lock')), false);

    // A worker started with an already-aborted signal exits immediately.
    const pre = new AbortController();
    pre.abort();
    await runWorker({ store, execute: async () => {}, intervalMs: 1000, signal: pre.signal });
    assert.deepEqual(executed, ['browser.snapshot']);
  });
});

test('worker ownership is exclusive; runDueJobs and recover conflict explicitly', async () => {
  await withStore(async (store, directory) => {
    await store.add({ action: VOYAGER, runAt: T0 });
    const controller = new AbortController();
    let calls = 0;
    const worker = runWorker({
      store,
      intervalMs: 1000,
      signal: controller.signal,
      execute: async () => {
        calls += 1;
      },
    });

    const leasePath = path.join(directory, 'jobs.worker.lock');
    assert.equal(fs.existsSync(leasePath), true);

    // Give the worker time to finish its first cycle and enter its delay.
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(calls, 1);

    await assert.rejects(
      runWorker({ store, intervalMs: 1000, signal: new AbortController().signal, execute: async () => {} }),
      /another worker/,
    );
    await assert.rejects(runDueJobs({ store, execute: async () => {} }), /another worker/);
    await assert.rejects(store.recover(), /worker/);

    controller.abort();
    await worker;
    assert.equal(fs.existsSync(leasePath), false);

    // After the worker exits, a direct batch works again.
    const next = await store.add({ action: VOYAGER, runAt: T0 });
    const events = await runDueJobs({ store, execute: async () => {}, now: NOW_T1 });
    assert.deepEqual(events.map((event) => event.type), ['claimed', 'succeeded']);
    assert.equal(events[0].jobId, next.id);
  });
});

test('runWorker returns permanently when a cycle is blocked, without waiting or restarting', async () => {
  await withStore(async (store, directory) => {
    const older = new Date(Date.now() - 120_000).toISOString();
    const newer = new Date(Date.now() - 60_000).toISOString();
    const first = await store.add({ action: VOYAGER, runAt: older });
    const second = await store.add({ action: SNAPSHOT, runAt: newer });

    const controller = new AbortController(); // never aborted by the test
    let calls = 0;
    const worker = runWorker({
      store,
      intervalMs: 1000,
      signal: controller.signal,
      execute: async () => {
        calls += 1;
        const err = new Error('throttled');
        err.status = 429;
        throw err;
      },
    });

    await Promise.race([
      worker,
      new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('worker kept running after a blocked cycle')), 2000);
      }),
    ]);

    assert.equal(calls, 1);
    const byId = new Map(readState(directory).jobs.map((job) => [job.id, job]));
    assert.equal(byId.get(first.id).status, 'blocked');
    assert.equal(byId.get(second.id).status, 'queued');
    assert.equal(fs.existsSync(path.join(directory, 'jobs.worker.lock')), false);
  });
});
