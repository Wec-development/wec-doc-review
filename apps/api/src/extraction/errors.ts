import { ZodError } from 'zod';

/**
 * A failed extraction that says whether retrying can help: timeouts and rate limits are
 * retryable; an unreadable or empty PDF is permanent.
 */
export class ExtractionError extends Error {
  readonly retryable: boolean;

  constructor(message: string, options: { retryable: boolean; cause?: unknown }) {
    super(message, { cause: options.cause });
    this.name = 'ExtractionError';
    this.retryable = options.retryable;
  }
}

export interface ErrorClassification {
  retryable: boolean;
  /** Safe to store on the job and show on the version; never includes document text. */
  message: string;
}

/**
 * ExtractionError carries its own verdict. Output that fails validation is permanent (retrying
 * the same input will not fix it). Anything else, e.g. a dropped DB connection, is transient.
 */
export function classifyError(error: unknown): ErrorClassification {
  if (error instanceof ExtractionError) {
    return { retryable: error.retryable, message: error.message };
  }
  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    const where =
      firstIssue && firstIssue.path.length > 0 ? ` at ${firstIssue.path.join('.')}` : '';
    return {
      retryable: false,
      message: `Extractor returned invalid output${where}: ${firstIssue?.message ?? 'unknown issue'}`,
    };
  }
  if (error instanceof Error) {
    return { retryable: true, message: error.message };
  }
  return { retryable: true, message: `Unexpected failure: ${String(error)}` };
}
