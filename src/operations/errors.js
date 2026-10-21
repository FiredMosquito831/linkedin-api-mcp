export class OperationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'OperationError';
    this.code = code;
    Object.assign(this, details);
  }
}

export function publicError(error) {
  const code = ['INVALID_INPUT', 'UNSUPPORTED_OPERATION'].includes(error.code) ? 'VALIDATION_ERROR'
    : error.code === 'HUMAN_INTERVENTION_REQUIRED' ? 'AUTH_REQUIRED'
    : error.status === 429 ? 'RATE_LIMITED'
      : [401, 403].includes(error.status) ? 'AUTH_REQUIRED'
        : error.code ?? 'OPERATION_FAILED';
  const known = ['VALIDATION_ERROR', 'AUTH_REQUIRED', 'ACCESS_RESTRICTED', 'APPROVAL_REQUIRED', 'APPROVAL_EXPIRED', 'APPROVAL_CONSUMED', 'RATE_LIMITED', 'LAYOUT_UNSUPPORTED', 'OUTCOME_UNKNOWN', 'EXPERIMENTAL_DISABLED', 'LOCKED', 'OPERATION_FAILED'];
  const safeCode = known.includes(code) ? code : 'OPERATION_FAILED';
  return {
    schemaVersion: 1, success: false,
    error: {
      code: safeCode,
      message: safeCode === 'OPERATION_FAILED' ? 'The operation failed. No automatic retry was performed.' : String(error.message).slice(0, 400),
      ...(error.retryAfter ? { retryAfter: String(error.retryAfter).slice(0, 100) } : {}),
      ...(error.completionUnknown ? { completionUnknown: true } : {}),
    },
  };
}

export function exitCode(error) {
  const code = publicError(error).error.code;
  if (error.completionUnknown || code === 'OUTCOME_UNKNOWN') return 8;
  if (code === 'VALIDATION_ERROR') return 2;
  if (code === 'AUTH_REQUIRED') return 3;
  if (['ACCESS_RESTRICTED', 'EXPERIMENTAL_DISABLED'].includes(code)) return 4;
  if (code.startsWith('APPROVAL_')) return 5;
  if (code === 'RATE_LIMITED') return 6;
  if (code === 'LAYOUT_UNSUPPORTED') return 7;
  return 1;
}
