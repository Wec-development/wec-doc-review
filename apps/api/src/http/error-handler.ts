import type { ErrorCode, ErrorEnvelope } from '@doc-review/shared';
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { DomainError, ValidationError } from '../errors.js';

export interface ErrorResponse {
  statusCode: number;
  body: ErrorEnvelope;
}

/** Fastify and plugin errors (body parsing, multipart limits) carry a status and an FST_ code. */
interface FrameworkError {
  statusCode: number;
  code?: string;
  message: string;
}

const PAYLOAD_TOO_LARGE_CODES = new Set([
  'FST_REQ_FILE_TOO_LARGE',
  'FST_FILES_LIMIT',
  'FST_PARTS_LIMIT',
  'FST_FIELDS_LIMIT',
  'FST_ERR_CTP_BODY_TOO_LARGE',
]);
const UNSUPPORTED_MEDIA_CODES = new Set([
  'FST_INVALID_MULTIPART_CONTENT_TYPE',
  'FST_ERR_CTP_INVALID_MEDIA_TYPE',
]);

function envelope(code: ErrorCode, message: string, details?: unknown): ErrorEnvelope {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

function isFrameworkError(error: unknown): error is FrameworkError {
  return (
    error instanceof Error &&
    'statusCode' in error &&
    typeof (error as { statusCode: unknown }).statusCode === 'number'
  );
}

function zodIssues(error: ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

function fromFrameworkError(error: FrameworkError): ErrorResponse | undefined {
  if (error.statusCode === 413 || PAYLOAD_TOO_LARGE_CODES.has(error.code ?? '')) {
    return {
      statusCode: 413,
      body: envelope('PAYLOAD_TOO_LARGE', 'Upload exceeds the size limit'),
    };
  }
  if (error.statusCode === 415 || UNSUPPORTED_MEDIA_CODES.has(error.code ?? '')) {
    return { statusCode: 415, body: envelope('UNSUPPORTED_MEDIA_TYPE', error.message) };
  }
  if (error.statusCode >= 400 && error.statusCode < 500) {
    // Client errors from Fastify (malformed JSON, empty body) have safe, descriptive messages.
    return { statusCode: 400, body: envelope('BAD_REQUEST', error.message) };
  }
  return undefined;
}

/** Maps any thrown error to the single error envelope. Never exposes stacks or SQL. */
export function toErrorResponse(error: unknown): ErrorResponse {
  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      body: envelope('VALIDATION_ERROR', 'Request is invalid', zodIssues(error)),
    };
  }
  if (error instanceof ValidationError) {
    return { statusCode: 400, body: envelope(error.code, error.message, error.details) };
  }
  if (error instanceof DomainError) {
    return { statusCode: error.statusCode, body: envelope(error.code, error.message) };
  }
  if (isFrameworkError(error)) {
    const mapped = fromFrameworkError(error);
    if (mapped) {
      return mapped;
    }
  }
  return { statusCode: 500, body: envelope('INTERNAL_ERROR', 'Internal server error') };
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const response = toErrorResponse(error);
    if (response.statusCode >= 500) {
      request.log.error({ err: error }, 'Request failed');
    } else {
      request.log.info({ code: response.body.error.code }, response.body.error.message);
    }
    return reply.code(response.statusCode).send(response.body);
  });

  app.setNotFoundHandler((request, reply) =>
    reply
      .code(404)
      .send(
        envelope('NOT_FOUND', `Route ${request.method} ${request.url.split('?')[0]} not found`),
      ),
  );
}
