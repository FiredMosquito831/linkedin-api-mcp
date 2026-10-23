import { OperationError } from '../operations/errors.js';
import { OPERATIONS } from '../operations/catalog.js';

// Read-only operations that can be verified against the user's own account.
export const LIVE_READ_OPERATIONS = Object.freeze([
  'profile.get',
  'posts.list',
  'feed.list',
  'inbox.list',
  'connections.list',
  'companies.get',
  'jobs.search',
]);

// Every read operation in the catalog, in catalog order. The write filter lives
// here, so a write operation can never reach the live check, whichever flag is used.
export function catalogReadOperations(catalog = OPERATIONS) {
  return Object.freeze(catalog.filter((entry) => entry.access === 'read').map((entry) => entry.name));
}

// The input fields a catalog read requires, such as ['url'] or ['query'].
export function requiredInputs(name, catalog = OPERATIONS) {
  const entry = catalog.find((candidate) => candidate.name === name);
  return entry && entry.access === 'read' ? [...(entry.inputSchema.required ?? [])] : [];
}

const UNSUPPORTED_CODES = new Set(['LAYOUT_UNSUPPORTED', 'ACCESS_RESTRICTED']);

// An operation whose input was rejected before any navigation was never attempted,
// so it is skipped rather than failed.
export const NOT_ATTEMPTED_DETAIL = 'input does not match this operation';

// Detail strings must stay short and never carry a page body, token, cookie,
// or raw error message: only the stable error code is reported.
function statusForError(error) {
  if (error?.notAttempted === true) return { status: 'skipped', detail: NOT_ATTEMPTED_DETAIL };
  const code = typeof error?.code === 'string' && error.code ? error.code : 'OPERATION_FAILED';
  return { status: UNSUPPORTED_CODES.has(code) ? 'unsupported' : 'failed', detail: `${UNSUPPORTED_CODES.has(code) ? 'Unsupported' : 'Failed'}: ${code}` };
}

export async function runLiveCheck({ operations = LIVE_READ_OPERATIONS, execute, now = () => new Date() } = {}) {
  if (typeof execute !== 'function') {
    throw new OperationError('INVALID_INPUT', 'runLiveCheck requires an execute function that runs one operation.');
  }
  if (!Array.isArray(operations)) {
    throw new OperationError('INVALID_INPUT', 'runLiveCheck requires operations to be an array of operation names.');
  }

  const startedAt = now().toISOString();
  const results = [];
  for (const operation of operations) {
    const name = String(operation);
    const started = now().getTime();
    let status = 'ok';
    let detail = 'Succeeded.';
    try {
      await execute(name);
    } catch (error) {
      ({ status, detail } = statusForError(error));
    }
    const durationMs = Math.max(0, now().getTime() - started);
    // Never retry: each operation runs exactly once, in the given order.
    results.push({ operation: name, status, detail, durationMs });
  }

  return { schemaVersion: 1, startedAt, finishedAt: now().toISOString(), results };
}

export function summarizeReport(report) {
  if (!report || !Array.isArray(report.results)) {
    throw new OperationError('INVALID_INPUT', 'summarizeReport requires a live-check report with a results array.');
  }
  let ok = 0;
  let unsupported = 0;
  let failed = 0;
  let skipped = 0;
  const lines = [];
  for (const result of report.results) {
    if (!result || typeof result.operation !== 'string' || !result.operation) {
      throw new OperationError('INVALID_INPUT', 'summarizeReport found a result entry without an operation name.');
    }
    if (result.status === 'ok') ok += 1;
    else if (result.status === 'unsupported') unsupported += 1;
    else if (result.status === 'failed') failed += 1;
    else if (result.status === 'skipped') skipped += 1;
    const detail = typeof result.detail === 'string' && result.detail ? result.detail : '';
    lines.push(`${result.operation}: ${result.status}${detail ? ` (${detail})` : ''}`);
  }
  // Skipped operations were never attempted, so they are not counted as checked.
  return { checked: ok + unsupported + failed, ok, unsupported, failed, skipped, lines };
}
