import type { ErrorCode } from '@doc-review/shared';

/** An expected failure with a known HTTP status; mapped once by the error handler. */
export abstract class DomainError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: ErrorCode;
}

export class NotFoundError extends DomainError {
  readonly statusCode = 404;
  readonly code = 'NOT_FOUND';
}

export class ConflictError extends DomainError {
  readonly statusCode = 409;
  readonly code = 'CONFLICT';
}

export class UnsupportedMediaTypeError extends DomainError {
  readonly statusCode = 415;
  readonly code = 'UNSUPPORTED_MEDIA_TYPE';
}

/** Input that is well-formed HTTP but semantically invalid (e.g. a missing multipart file). */
export class ValidationError extends DomainError {
  readonly statusCode = 400;
  readonly code = 'VALIDATION_ERROR';

  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export class RateLimitedError extends DomainError {
  readonly statusCode = 429;
  readonly code = 'RATE_LIMITED';
}
