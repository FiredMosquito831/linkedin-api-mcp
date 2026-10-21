import fs from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { OperationError } from './errors.js';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
export function digest(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

// Local operator authorization. No network/MCP method grants approval.
export function createApprovalStore({ directory, now = () => Date.now(), ttlMs = 600000 }) {
  const dir = join(directory, 'approvals');
  function file(id) {
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) throw new OperationError('VALIDATION_ERROR', 'Invalid approval ID.');
    return join(dir, `${id}.json`);
  }
  function read(id) {
    let record;
    try { record = JSON.parse(fs.readFileSync(file(id), 'utf8')); } catch {
      throw new OperationError('APPROVAL_REQUIRED', 'Approval does not exist or is unreadable.');
    }
    if (!record || record.id !== id || !['prepared', 'approved', 'consumed', 'verified', 'unknown', 'failed'].includes(record.status)
      || digest({ operation: record.operation, account: record.account, input: record.input, imageDigest: record.imageDigest }) !== record.digest) {
      throw new OperationError('APPROVAL_REQUIRED', 'Approval contents are invalid or changed.');
    }
    if (!Number.isFinite(record.expiresAt)) throw new OperationError('APPROVAL_REQUIRED', 'Approval expiry is invalid.');
    return record;
  }
  function update(id, fn) {
    const path = file(id);
    let fd;
    try { fd = fs.openSync(`${path}.lock`, 'wx', 0o600); } catch (error) {
      if (error.code === 'EEXIST') throw new OperationError('LOCKED', 'Approval is locked. Verify the owning process exited before manually removing its .json.lock file; locks are never stolen.');
      throw error;
    }
    const tmp = `${path}.${randomUUID()}.tmp`;
    try {
      const record = read(id);
      const result = fn(record);
      fs.writeFileSync(tmp, JSON.stringify(record), { mode: 0o600, flag: 'wx' });
      fs.renameSync(tmp, path);
      return result;
    } finally {
      fs.closeSync(fd);
      fs.rmSync(`${path}.lock`, { force: true });
      fs.rmSync(tmp, { force: true });
    }
  }
  function assertUsable(record, account) {
    if (record.account !== account) throw new OperationError('APPROVAL_REQUIRED', 'Approval belongs to a different account.');
    if (record.expiresAt <= now()) throw new OperationError('APPROVAL_EXPIRED', 'Approval expired. Prepare and review a new action.');
    if (!['prepared', 'approved'].includes(record.status)) throw new OperationError('APPROVAL_CONSUMED', 'Approval was already consumed. It cannot be retried.');
  }
  return {
    prepare({ operation, account, input, imageDigest = null }) {
      const payload = { operation, account, input: structuredClone(input), imageDigest };
      const record = { ...payload, id: randomUUID(), digest: digest(payload), status: 'prepared', createdAt: now(), expiresAt: now() + ttlMs };
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(file(record.id), JSON.stringify(record), { mode: 0o600, flag: 'wx' });
      return structuredClone(record);
    },
    get: (id) => structuredClone(read(id)),
    approve(id, { account, expectedDigest }) {
      return update(id, (record) => {
        assertUsable(record, account);
        if (expectedDigest !== record.digest) throw new OperationError('APPROVAL_REQUIRED', 'Approval digest does not match the reviewed payload.');
        record.status = 'approved';
        record.approvedAt = now();
        return { approvalId: id, status: record.status, account: record.account };
      });
    },
    consume(id, { account }) {
      return update(id, (record) => {
        assertUsable(record, account);
        if (record.status !== 'approved') throw new OperationError('APPROVAL_REQUIRED', 'An operator must approve this exact payload through the separate CLI first.');
        record.status = 'consumed';
        record.consumedAt = now();
        return structuredClone(record);
      });
    },
    complete(id, outcome) {
      return update(id, (record) => {
        if (record.status !== 'consumed') throw new OperationError('APPROVAL_CONSUMED', 'Approval is not awaiting completion.');
        record.status = ['verified', 'failed'].includes(outcome) ? outcome : 'unknown';
        record.completedAt = now();
        return { approvalId: id, status: record.status };
      });
    },
    status(id, account) {
      const record = read(id);
      if (record.account !== account) throw new OperationError('APPROVAL_REQUIRED', 'Approval belongs to another account.');
      return { approvalId: id, operation: record.operation, account, status: record.status, expiresAt: new Date(record.expiresAt).toISOString(), expired: record.expiresAt <= now() };
    },
  };
}
