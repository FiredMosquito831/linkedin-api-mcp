import { readFile, stat } from 'node:fs/promises';
import { basename, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { OPERATIONS, operation, validateInput } from './catalog.js';
import { accountName, accountPaths } from './accounts.js';
import { createApprovalStore } from './approvals.js';
import { OperationError } from './errors.js';
import { openSurfaceSession } from './session.js';

async function imageSnapshot(input) {
  if (!input.imagePath) return { hash: null, upload: undefined };
  if (!isAbsolute(input.imagePath)) throw new OperationError('VALIDATION_ERROR', 'imagePath must be an absolute local image path.');
  let info;
  let bytes;
  try {
    info = await stat(input.imagePath);
    if (!info.isFile() || info.size > 10 * 1024 * 1024) throw new OperationError('VALIDATION_ERROR', 'An image must be a regular file up to 10 MiB.');
    bytes = await readFile(input.imagePath);
  } catch (error) {
    if (error.code === 'VALIDATION_ERROR') throw error;
    throw new OperationError('VALIDATION_ERROR', 'The image is missing or unreadable. Prepare a valid local PNG/JPEG image.');
  }
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!png && !jpeg) throw new OperationError('VALIDATION_ERROR', 'Only PNG and JPEG images are supported.');
  if (bytes.length > 10 * 1024 * 1024) throw new OperationError('VALIDATION_ERROR', 'Image exceeds 10 MiB.');
  return { hash: createHash('sha256').update(bytes).digest('hex'), upload: { name: basename(input.imagePath), mimeType: png ? 'image/png' : 'image/jpeg', buffer: bytes } };
}

export function createOperations({ stateDirectory, account = 'default', experimental = false, openSession = openSurfaceSession, now, approvalTtlMs, readAdapter, writeAdapter } = {}) {
  if (!isAbsolute(stateDirectory ?? '')) throw new OperationError('VALIDATION_ERROR', 'An absolute stateDirectory is required.');
  accountName(account);
  const paths = accountPaths(stateDirectory, account);
  const approvals = createApprovalStore({ directory: paths.root, ...(now ? { now } : {}), ...(approvalTtlMs ? { ttlMs: approvalTtlMs } : {}) });
  function enabled() {
    if (experimental !== true) throw new OperationError('EXPERIMENTAL_DISABLED', 'Enable experimental operations explicitly for this process.');
  }
  function envelope(name, data) { return { schemaVersion: 1, success: true, operation: name, account, data }; }
  async function withAdapter(access, name, input, onDispatch = () => {}) {
    const session = await openSession({ profileDirectory: paths.profile, headless: false });
    try {
      if (access === 'read') {
        const create = readAdapter ?? (await import('./reads.js')).createReadAdapter;
        const result = await create(session).execute(name, input);
        if (session.check) await session.check();
        return result;
      }
      const create = writeAdapter ?? (await import('./writes.js')).createWriteAdapter;
      onDispatch();
      const result = await create(session).execute(name, input);
      if (session.check) await session.check();
      return result;
    } finally {
      await session.close();
    }
  }
  return {
    experimental,
    list: () => structuredClone(OPERATIONS),
    async call(name, input = {}) {
      enabled();
      if (operation(name).access !== 'read') throw new OperationError('APPROVAL_REQUIRED', 'Prepare and approve writes before execution.');
      return envelope(name, await withAdapter('read', name, validateInput(name, input)));
    },
    async prepare(name, input = {}) {
      enabled();
      if (operation(name).access !== 'write') throw new OperationError('VALIDATION_ERROR', 'Only write operations need preparation.');
      const normalized = validateInput(name, input);
      const record = approvals.prepare({ operation: name, account, input: normalized, imageDigest: (await imageSnapshot(normalized)).hash });
      return envelope(name, { approvalId: record.id, expiresAt: new Date(record.expiresAt).toISOString(), preview: { account, operation: name, input: normalized, digest: record.digest } });
    },
    approvalStatus(id) {
      return envelope('approval.status', approvals.status(id, account));
    },
    async execute(approvalId) {
      enabled();
      const pending = approvals.get(approvalId);
      // Revalidate before consuming; a changed file or payload cannot inherit approval.
      const input = validateInput(pending.operation, pending.input);
      const image = await imageSnapshot(input);
      if (pending.imageDigest !== image.hash) throw new OperationError('APPROVAL_REQUIRED', 'Image content changed since preparation. Prepare it again.');
      const record = approvals.consume(approvalId, { account });
      let result;
      let adapterEntered = false;
      try {
        result = await withAdapter('write', record.operation, { ...input, ...(image.upload ? { imageData: image.upload } : {}), confirmed: true }, () => { adapterEntered = true; });
        const outcome = result?.outcome === 'verified' ? 'verified' : 'unknown';
        approvals.complete(approvalId, outcome);
        if (outcome === 'unknown') throw new OperationError('OUTCOME_UNKNOWN', 'The action may have completed, but it was not verified. Do not retry automatically.', { completionUnknown: true });
        return envelope(record.operation, result);
      } catch (error) {
        // If an adapter unexpectedly drops its dispatch marker, treat runtime failures conservatively.
        if (adapterEntered && !['VALIDATION_ERROR', 'INVALID_INPUT', 'LAYOUT_UNSUPPORTED', 'ACCESS_RESTRICTED', 'APPROVAL_REQUIRED'].includes(error.code)) error.completionUnknown = true;
        if (error.code !== 'OUTCOME_UNKNOWN') approvals.complete(approvalId, error.completionUnknown ? 'unknown' : 'failed');
        throw error;
      }
    },
  };
}
