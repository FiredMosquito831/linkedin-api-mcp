// Local experimental job subsystem.
//
// A persistent JSON job queue (jobs.json) guarded by an exclusive lock file,
// plus a sequential, abortable worker. For internal testing only: the queue
// accepts a small allowlist of readonly action types and never performs
// network calls itself. Execution is injected by the caller (the CLI
// integration) through `execute`, so nothing here talks to LinkedIn, a
// browser, or the network.
//
// Node built-ins only. No dependencies.
//
// Exports:
//   createJobStore({ directory, now, id })
//     -> { add, list, cancel, recover, claimNextDue, settle,
//          acquireWorkerLease, readWorkerLease }
//   runDueJobs({ store, execute, now, onEvent, signal, maxJobs, leaseToken })
//     -> events (plain JSON-serializable objects)
//   runWorker({ store, execute, intervalMs, signal, onEvent, maxJobs })
//     -> resolves when the signal aborts
//   validateJobInput({ action, runAt }) -> canonical { action, runAt }
//   JobStoreError, validateAction, validateRunAt
//
// Actions are canonicalized: only the allowlisted fields survive, so secrets
// (accessToken, cookies, headers, ...) cannot be queued under any type.
// Persisted error details are generic; response bodies, error messages, and
// other error properties are never written to the store. Job results are not
// persisted: execute(action) streams them outside the queue.
//
// Worker ownership: runWorker holds an exclusive `jobs.worker.lock` lease for
// its whole lifetime. Only the lease holder runs recover() (so another live
// worker's in-flight jobs are never marked failed); a second worker, or a
// runDueJobs call that does not present the lease token, is rejected with an
// explicit lock conflict. The lease is never stolen.

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as abortableDelay } from 'node:timers/promises';

const SCHEMA_VERSION = 1;
const STATE_FILE = 'jobs.json';
const LOCK_FILE = 'jobs.json.lock';
const WORKER_LEASE_FILE = 'jobs.worker.lock';

const STATUSES = new Set(['queued', 'running', 'succeeded', 'failed', 'blocked', 'canceled']);
const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'blocked', 'canceled']);
const JOB_FIELDS = new Set(['id', 'action', 'runAt', 'status', 'createdAt', 'message']);

// Readonly actions only. Anything that writes, messages, or tries to evade
// detection is rejected both at enqueue time and at execution time.
const ALLOWED_ACTION_TYPES = Object.freeze(['browser.snapshot', 'browser.extract', 'voyager.me']);
const ACTION_FIELDS = Object.freeze({
  'browser.snapshot': Object.freeze(['type', 'url']),
  'browser.extract': Object.freeze(['type', 'url', 'selector', 'limit']),
  'voyager.me': Object.freeze(['type']),
});
const FORBIDDEN_ROUTES = new Set(['login', 'checkpoint', 'authwall']);
const RUN_AT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

export class JobStoreError extends Error {
  constructor(message) {
    super(message);
    this.name = 'JobStoreError';
  }
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

function urlProblem(raw) {
  if (typeof raw !== 'string' || raw.length === 0) {
    return 'action.url must be a non-empty string';
  }
  // Reject before URL parsing: WHATWG normalizes "\" into "/", which would
  // let "https://www.linkedin.com\login" slip through.
  if (raw.trim() !== raw) return 'action.url must not have leading or trailing whitespace';
  if (raw.includes('\\')) return 'action.url must not contain backslashes';
  if (/[\u0000-\u001f\u007f]/.test(raw)) return 'action.url must not contain control characters';

  let url;
  try {
    url = new URL(raw);
  } catch {
    return 'action.url is not a parseable URL';
  }
  if (url.protocol !== 'https:') return 'action.url must use https';
  if (url.hostname !== 'www.linkedin.com') {
    return 'action.url origin must be exactly https://www.linkedin.com';
  }
  if (url.port !== '') return 'action.url must not specify a port (443 only)';
  if (url.username !== '' || url.password !== '') {
    return 'action.url must not contain credentials';
  }
  for (const segment of url.pathname.split('/')) {
    if (segment !== '' && FORBIDDEN_ROUTES.has(segment.toLowerCase())) {
      return `action.url route "${segment}" is not allowed (login/checkpoint/authwall)`;
    }
  }
  return null;
}

export function validateAction(action) {
  if (action === null || typeof action !== 'object' || Array.isArray(action)) {
    return { error: 'action must be a plain object', action: null };
  }
  const type = action.type;
  if (typeof type !== 'string' || !Object.hasOwn(ACTION_FIELDS, type)) {
    return {
      error: `action type "${String(type)}" is not allowed; only ${ALLOWED_ACTION_TYPES.join(', ')} may be queued`,
      action: null,
    };
  }
  const fields = ACTION_FIELDS[type];
  const extra = Object.keys(action).filter((key) => !fields.includes(key));
  if (extra.length > 0) {
    return { error: `action has unexpected fields: ${extra.join(', ')}`, action: null };
  }
  if (type !== 'voyager.me') {
    const problem = urlProblem(action.url);
    if (problem !== null) return { error: problem, action: null };
  }
  if (type === 'browser.extract') {
    if (typeof action.selector !== 'string' || action.selector.trim() === '') {
      return { error: 'browser.extract requires a non-empty selector', action: null };
    }
    if (!Number.isInteger(action.limit) || action.limit < 1 || action.limit > 50) {
      return { error: 'browser.extract requires an integer limit between 1 and 50', action: null };
    }
  }
  const normalized = {};
  for (const field of fields) normalized[field] = structuredClone(action[field]);
  return { error: null, action: normalized };
}

export function validateRunAt(runAt) {
  if (typeof runAt !== 'string' || !RUN_AT_RE.test(runAt)) {
    throw new JobStoreError(
      'runAt must be an ISO 8601 string with an explicit timezone ' +
        '(for example 2026-01-01T00:00:00Z or 2026-01-01T02:00:00+02:00)',
    );
  }
  const ms = Date.parse(runAt);
  if (Number.isNaN(ms)) {
    throw new JobStoreError(`runAt "${runAt}" does not parse to a valid time`);
  }
  return new Date(ms).toISOString();
}

// Side-effect-free pre-validation for CLI batches: validates an entry and
// returns the canonical { action, runAt }. Unknown action fields are
// rejected, so secrets (accessToken, cookies, headers, ...) cannot be queued
// even under an allowlisted type. `add()` applies the same validation.
export function validateJobInput(entry) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new JobStoreError('job entry must be an object with action and runAt');
  }
  const extra = Object.keys(entry).filter((key) => key !== 'action' && key !== 'runAt');
  if (extra.length > 0) {
    throw new JobStoreError(`job entry has unexpected fields: ${extra.join(', ')}`);
  }
  const checked = validateAction(entry.action);
  if (checked.error !== null) throw new JobStoreError(checked.error);
  const runAt = validateRunAt(entry.runAt);
  return { action: structuredClone(checked.action), runAt };
}

function toIso(value, label) {
  const date = new Date(value);
  const ms = date.getTime();
  if (Number.isNaN(ms)) throw new JobStoreError(`${label} did not produce a valid date`);
  return date.toISOString();
}

// ---------------------------------------------------------------------------
// Persistent state: jobs.json, written atomically, guarded by an exclusive
// jobs.json.lock file for every mutation.
// ---------------------------------------------------------------------------

function assertStoredState(data, filePath) {
  const corrupt = (detail) => new JobStoreError(`job store ${filePath} is corrupt: ${detail}`);
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw corrupt('top level must be an object');
  }
  if (data.schemaVersion !== SCHEMA_VERSION) {
    throw corrupt(`unsupported schemaVersion ${String(data.schemaVersion)}`);
  }
  if (!Array.isArray(data.jobs)) throw corrupt('"jobs" must be an array');

  const ids = new Set();
  data.jobs.forEach((job, index) => {
    const where = `job at index ${index}`;
    if (typeof job !== 'object' || job === null || Array.isArray(job)) {
      throw corrupt(`${where} is not an object`);
    }
    for (const key of Object.keys(job)) {
      if (!JOB_FIELDS.has(key)) throw corrupt(`${where} has unknown field "${key}"`);
    }
    if (typeof job.id !== 'string' || job.id.length === 0) throw corrupt(`${where} has no id`);
    if (ids.has(job.id)) throw corrupt(`duplicate job id ${job.id}`);
    ids.add(job.id);
    if (
      typeof job.action !== 'object' ||
      job.action === null ||
      Array.isArray(job.action) ||
      typeof job.action.type !== 'string'
    ) {
      throw corrupt(`${where} has no action.type`);
    }
    if (typeof job.runAt !== 'string' || !RUN_AT_RE.test(job.runAt)) {
      throw corrupt(`${where} has an invalid runAt`);
    }
    if (typeof job.status !== 'string' || !STATUSES.has(job.status)) {
      throw corrupt(`${where} has an invalid status`);
    }
    if (typeof job.createdAt !== 'string') throw corrupt(`${where} has no createdAt`);
    if (job.message !== undefined && typeof job.message !== 'string') {
      throw corrupt(`${where} has a non-string message`);
    }
  });
}

function classifyExecutionError(err) {
  const status = Number(err?.status);
  if (status === 429) {
    return {
      status: 'blocked',
      reason: 'rate_limited',
      message: 'rate limited (HTTP 429); job blocked without automatic retry',
    };
  }
  if (status === 401 || status === 403) {
    return {
      status: 'blocked',
      reason: 'auth_required',
      message: 'authentication required (HTTP 401/403); job blocked',
    };
  }
  const probe = [err?.code, err?.name, err?.message, err?.checkpoint === true ? 'checkpoint' : null]
    .filter((part) => part !== undefined && part !== null && part !== '')
    .join(' ')
    .toLowerCase();
  if (
    err?.checkpoint === true ||
    err?.code === 'HUMAN_INTERVENTION_REQUIRED' ||
    err?.name === 'HumanInterventionError' ||
    /checkpoint|authwall|human[\s_-]*intervention|captcha/.test(probe)
  ) {
    return {
      status: 'blocked',
      reason: 'human_intervention',
      message: 'checkpoint or human intervention required; job blocked',
    };
  }
  // Persist a generic message only: never echo error messages, response
  // bodies, or other error properties into the job store.
  return { status: 'failed', message: 'job execution failed' };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export function createJobStore({ directory, now = () => new Date(), id = () => randomUUID() } = {}) {
  if (typeof directory !== 'string' || directory.length === 0) {
    throw new JobStoreError('createJobStore requires an explicit directory path');
  }
  if (typeof now !== 'function') throw new JobStoreError('now must be a function');
  if (typeof id !== 'function') throw new JobStoreError('id must be a function');

  const dir = directory;
  const statePath = path.join(dir, STATE_FILE);
  const lockPath = path.join(dir, LOCK_FILE);
  const leasePath = path.join(dir, WORKER_LEASE_FILE);
  let tmpCounter = 0;

  function ensureDir() {
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    } catch (err) {
      throw new JobStoreError(`cannot create job store directory ${dir}: ${err.code ?? err.message}`);
    }
  }

  function acquireLock() {
    ensureDir();
    let fd;
    try {
      fd = fs.openSync(lockPath, 'wx');
    } catch (err) {
      if (err.code === 'EEXIST') {
        let owner = '';
        try {
          owner = fs.readFileSync(lockPath, 'utf8').trim();
        } catch {
          owner = '';
        }
        const held = owner === '' ? '' : ` (lock info: ${owner})`;
        throw new JobStoreError(
          `job store is locked by another process at ${lockPath}${held}. ` +
            'Locks are never stolen: verify the owning process has exited, then delete the lock file and retry.',
        );
      }
      throw new JobStoreError(`cannot acquire job store lock at ${lockPath}: ${err.message}`);
    }

    try {
      try {
        fs.writeSync(fd, `${JSON.stringify({ pid: process.pid, heldAt: new Date().toISOString() })}\n`);
      } finally {
        fs.closeSync(fd);
      }
    } catch (err) {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // best effort
      }
      throw new JobStoreError(`cannot initialize job store lock at ${lockPath}: ${err.message}`);
    }

    return () => {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // best effort: never mask the original error
      }
    };
  }

  function readState() {
    let raw;
    try {
      raw = fs.readFileSync(statePath, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return { schemaVersion: SCHEMA_VERSION, jobs: [] };
      throw new JobStoreError(`cannot read job store ${statePath}: ${err.code ?? err.message}`);
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new JobStoreError(
        `job store ${statePath} contains corrupt JSON; refusing to use it (fail closed)`,
      );
    }
    assertStoredState(data, statePath);
    return data;
  }

  function writeStateAtomic(state) {
    ensureDir();
    const tmpPath = `${statePath}.tmp.${process.pid}.${tmpCounter++}`;
    try {
      fs.writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      fs.renameSync(tmpPath, statePath);
    } catch (err) {
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {
        // best effort
      }
      throw new JobStoreError(`cannot write job store ${statePath}: ${err.message}`);
    }
  }

  async function add(input) {
    const { action, runAt } = validateJobInput(input);

    const release = acquireLock();
    try {
      const state = readState();
      const job = {
        id: id(),
        action: structuredClone(action),
        runAt,
        status: 'queued',
        createdAt: toIso(now(), 'now()'),
      };
      state.jobs.push(job);
      writeStateAtomic(state);
      return structuredClone(job);
    } finally {
      release();
    }
  }

  async function list() {
    return structuredClone(readState().jobs);
  }

  async function cancel(jobId) {
    if (typeof jobId !== 'string' || jobId.length === 0) {
      throw new JobStoreError('cancel requires a job id');
    }
    const release = acquireLock();
    try {
      const state = readState();
      const job = state.jobs.find((candidate) => candidate.id === jobId);
      if (job === undefined) throw new JobStoreError(`no job with id ${jobId}`);
      if (job.status === 'running') {
        throw new JobStoreError(`job ${jobId} is running and cannot be canceled; abort the worker instead`);
      }
      if (TERMINAL_STATUSES.has(job.status)) {
        throw new JobStoreError(`job ${jobId} is already terminal (${job.status}) and cannot be canceled`);
      }
      job.status = 'canceled';
      delete job.message;
      writeStateAtomic(state);
      return structuredClone(job);
    } finally {
      release();
    }
  }

  // Worker ownership lease: held by runWorker for its whole lifetime, or by a
  // direct runDueJobs batch for that batch's duration. A second owner is
  // rejected explicitly; leases are never stolen.
  function readWorkerLease() {
    let raw;
    try {
      raw = fs.readFileSync(leasePath, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw new JobStoreError(`cannot read worker lease ${leasePath}: ${err.code ?? err.message}`);
    }
    let info = null;
    try {
      info = JSON.parse(raw);
    } catch {
      info = null;
    }
    if (info === null || typeof info !== 'object' || typeof info.token !== 'string') {
      return { path: leasePath, token: null, pid: null, heldAt: null };
    }
    return {
      path: leasePath,
      token: info.token,
      pid: typeof info.pid === 'number' ? info.pid : null,
      heldAt: typeof info.heldAt === 'string' ? info.heldAt : null,
    };
  }

  function acquireWorkerLease() {
    const releaseLock = acquireLock();
    try {
      const existing = readWorkerLease();
      if (existing !== null) {
        const owner = existing.pid === null ? '' : ` (pid ${existing.pid}, since ${existing.heldAt})`;
        throw new JobStoreError(
          `another worker already owns this job store at ${existing.path}${owner}. ` +
            'Worker leases are never stolen: wait for it to exit, or abort it.',
        );
      }
      const token = randomUUID();
      let fd;
      try {
        fd = fs.openSync(leasePath, 'wx');
      } catch (err) {
        if (err.code === 'EEXIST') {
          throw new JobStoreError(
            `another worker already owns this job store at ${leasePath}; worker leases are never stolen`,
          );
        }
        throw new JobStoreError(`cannot acquire worker lease at ${leasePath}: ${err.message}`);
      }
      try {
        try {
          fs.writeSync(fd, `${JSON.stringify({ pid: process.pid, token, heldAt: new Date().toISOString() })}\n`);
        } finally {
          fs.closeSync(fd);
        }
      } catch (err) {
        try {
          fs.unlinkSync(leasePath);
        } catch {
          // best effort
        }
        throw new JobStoreError(`cannot initialize worker lease at ${leasePath}: ${err.message}`);
      }
      return {
        token,
        release() {
          try {
            const current = readWorkerLease();
            if (current !== null && current.token === token) fs.unlinkSync(leasePath);
          } catch {
            // best effort
          }
        },
      };
    } finally {
      releaseLock();
    }
  }

  async function recover(options = {}) {
    const leaseToken = options?.leaseToken;
    const release = acquireLock();
    try {
      // Never mark another live worker's running jobs as failed. Both this
      // check and acquireWorkerLease run under jobs.json.lock, so ownership is
      // serialized.
      const active = readWorkerLease();
      if (active !== null && active.token !== leaseToken) {
        throw new JobStoreError(
          `refusing to recover: another worker owns this job store (${active.path}); ` +
            'abort it first (worker leases are never stolen)',
        );
      }
      const state = readState();
      const marked = [];
      for (const job of state.jobs) {
        if (job.status === 'running') {
          job.status = 'failed';
          job.message = 'interrupted: job was running when the store was recovered';
          marked.push(job.id);
        }
      }
      if (marked.length > 0) writeStateAtomic(state);
      return marked;
    } finally {
      release();
    }
  }

  // Internal helpers used by runDueJobs. The claim is atomic under the lock:
  // a job leaves "queued" exactly once, so it can never execute twice.
  async function claimNextDue(nowIso) {
    if (typeof nowIso !== 'string' || nowIso.length === 0) {
      throw new JobStoreError('claimNextDue requires an ISO timestamp');
    }
    const release = acquireLock();
    try {
      const state = readState();
      const due = state.jobs
        .filter((job) => job.status === 'queued' && job.runAt <= nowIso)
        .sort((a, b) => (a.runAt === b.runAt ? a.id.localeCompare(b.id) : a.runAt < b.runAt ? -1 : 1));
      if (due.length === 0) return null;
      const job = due[0];
      job.status = 'running';
      delete job.message;
      writeStateAtomic(state);
      return structuredClone(job);
    } finally {
      release();
    }
  }

  async function settle(jobId, status, message) {
    if (!TERMINAL_STATUSES.has(status)) {
      throw new JobStoreError('settle requires a terminal status');
    }
    const release = acquireLock();
    try {
      const state = readState();
      const job = state.jobs.find((candidate) => candidate.id === jobId);
      if (job === undefined) throw new JobStoreError(`no job with id ${jobId}`);
      if (job.status !== 'running') return; // already settled by someone else
      job.status = status;
      if (typeof message === 'string' && message.length > 0) job.message = message;
      else delete job.message;
      writeStateAtomic(state);
    } finally {
      release();
    }
  }

  return { add, list, cancel, recover, claimNextDue, settle, acquireWorkerLease, readWorkerLease };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runDueJobs({
  store,
  execute,
  now = () => new Date(),
  onEvent = () => {},
  signal,
  maxJobs = 10,
  leaseToken,
} = {}) {
  if (
    store === null ||
    typeof store !== 'object' ||
    typeof store.claimNextDue !== 'function' ||
    typeof store.settle !== 'function'
  ) {
    throw new JobStoreError('runDueJobs requires a store created by createJobStore');
  }
  if (typeof execute !== 'function') throw new JobStoreError('runDueJobs requires an execute function');
  if (typeof now !== 'function') throw new JobStoreError('now must be a function');
  if (typeof onEvent !== 'function') throw new JobStoreError('onEvent must be a function');
  if (signal !== undefined && !(signal instanceof AbortSignal)) {
    throw new JobStoreError('signal must be an AbortSignal');
  }
  if (!Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > 20) {
    throw new JobStoreError('maxJobs must be an integer between 1 and 20');
  }

  // A direct batch takes the worker lease for its own duration; a worker or
  // another batch that already owns the store is an explicit lock conflict.
  // runWorker passes its own lease token instead, sharing lease semantics.
  const leaseAware =
    typeof store.acquireWorkerLease === 'function' && typeof store.readWorkerLease === 'function';
  let ownLease = null;
  if (leaseAware) {
    if (leaseToken === undefined) {
      ownLease = store.acquireWorkerLease();
    } else {
      const active = store.readWorkerLease();
      if (active === null || active.token !== leaseToken) {
        throw new JobStoreError('runDueJobs was given a leaseToken that does not own this job store');
      }
    }
  }

  try {
    const nowIso = toIso(now(), 'now()');
    const events = [];
    const emit = (event) => {
      events.push(event);
      onEvent(event);
    };

    let processed = 0;
    while (processed < maxJobs) {
      if (signal?.aborted) {
        emit({ type: 'stopped', reason: 'aborted' });
        break;
      }

      const job = await store.claimNextDue(nowIso);
      if (job === null) break;
      processed += 1;
      const checked = validateAction(job.action);
      emit({ type: 'claimed', jobId: job.id, ...(checked.error === null ? { action: structuredClone(checked.action) } : {}), runAt: job.runAt });

      let outcome;
      if (checked.error !== null) {
        // The stored record no longer matches the allowlist (tampering or
        // corruption): never execute it, fail closed.
        outcome = { status: 'failed', message: 'job action failed validation at execution' };
      } else {
        try {
          // execute(action) is owned by the CLI integration; results are
          // streamed outside the queue and never persisted here.
          await execute(structuredClone(checked.action));
          outcome = { status: 'succeeded' };
        } catch (err) {
          outcome = classifyExecutionError(err);
        }
      }

      await store.settle(job.id, outcome.status, outcome.message);

      if (outcome.status === 'succeeded') {
        emit({ type: 'succeeded', jobId: job.id });
      } else if (outcome.status === 'blocked') {
        emit({ type: 'blocked', jobId: job.id, reason: outcome.reason, message: outcome.message });
        emit({ type: 'stopped', reason: outcome.reason, afterJobId: job.id });
        break;
      } else {
        emit({ type: 'failed', jobId: job.id, message: outcome.message });
      }
    }

    return events;
  } finally {
    ownLease?.release();
  }
}

export async function runWorker({
  store,
  execute,
  intervalMs = 5000,
  signal,
  onEvent = () => {},
  maxJobs = 10,
} = {}) {
  if (
    store === null ||
    typeof store !== 'object' ||
    typeof store.recover !== 'function' ||
    typeof store.acquireWorkerLease !== 'function'
  ) {
    throw new JobStoreError('runWorker requires a store created by createJobStore');
  }
  if (typeof execute !== 'function') throw new JobStoreError('runWorker requires an execute function');
  if (typeof onEvent !== 'function') throw new JobStoreError('onEvent must be a function');
  if (!(signal instanceof AbortSignal)) {
    throw new JobStoreError('runWorker requires an AbortSignal so the worker can be stopped');
  }
  if (!Number.isInteger(intervalMs) || intervalMs < 1000 || intervalMs > 3600000) {
    throw new JobStoreError('intervalMs must be an integer between 1000 and 3600000');
  }

  // One worker per store for its whole process lifetime. Recover only after
  // we own the lease, so a live worker's running jobs are never marked failed.
  const lease = store.acquireWorkerLease();
  try {
    await store.recover({ leaseToken: lease.token });

    for (;;) {
      if (signal.aborted) break;
      // Sequential by construction: each cycle runs one job at a time and we
      // await it before starting the next cycle.
      const events = await runDueJobs({ store, execute, onEvent, signal, maxJobs, leaseToken: lease.token });
      if (signal.aborted) break;
      // A blocked cycle (429/401/403/checkpoint) ends this worker invocation.
      // It does not wait for the next interval, and the blocked batch is not
      // restarted automatically: a new user invocation is required.
      if (events.some((event) => event.type === 'blocked')) return;
      try {
        await abortableDelay(intervalMs, undefined, { signal });
      } catch (err) {
        if (signal.aborted) break;
        throw err;
      }
    }
  } finally {
    lease.release();
  }
}
