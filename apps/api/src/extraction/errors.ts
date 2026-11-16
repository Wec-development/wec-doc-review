import type { ExtractionDiagnostics } from '@doc-review/shared';
import { ZodError } from 'zod';

/**
 * A failed extraction that says whether retrying can help, and carries whatever debugging data
 * the attempt produced (prompt, raw response, usage), so it is stored on the job even on failure.
 */
export class ExtractionError extends Error {
  readonly retryable: boolean;
  diagnostics: ExtractionDiagnostics | null;

  constructor(
    message: string,
    options: { retryable: boolean; cause?: unknown; diagnostics?: ExtractionDiagnostics | null },
  ) {
    super(message, { cause: options.cause });
    this.name = 'ExtractionError';
    this.retryable = options.retryable;
    this.diagnostics = options.diagnostics ?? null;
  }
}

/** Worth retrying: timeouts, rate limits, 5xx, network errors, malformed model output. */
export class RetryableError extends ExtractionError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, { ...options, retryable: true });
    this.name = 'RetryableError';
  }
}

/** Retrying the same input cannot help: unreadable or empty PDF, too large, auth failure. */
export class PermanentError extends ExtractionError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, { ...options, retryable: false });
    this.name = 'PermanentError';
  }
}

export interface ErrorClassification {
  retryable: boolean;
  /** Safe to store on the job and show on the version; never includes document text or keys. */
  message: string;
  diagnostics: ExtractionDiagnostics | null;
}

/**
 * ExtractionError carries its own verdict. Output that fails validation is permanent (retrying
 * the same input will not fix it). Anything else, e.g. a dropped DB connection, is transient.
 */
export function classifyError(error: unknown): ErrorClassification {
  if (error instanceof ExtractionError) {
    return { retryable: error.retryable, message: error.message, diagnostics: error.diagnostics };
  }
  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    const where =
      firstIssue && firstIssue.path.length > 0 ? ` at ${firstIssue.path.join('.')}` : '';
    return {
      retryable: false,
      message: `Extractor returned invalid output${where}: ${firstIssue?.message ?? 'unknown issue'}`,
      diagnostics: null,
    };
  }
  if (error instanceof Error) {
    return { retryable: true, message: error.message, diagnostics: null };
  }
  return { retryable: true, message: `Unexpected failure: ${String(error)}`, diagnostics: null };
}
