import type { LlmProvider, TokenUsage } from '@doc-review/shared';

export interface LlmRequest {
  system: string;
  user: string;
  /** JSON schema the reply must follow. */
  schema: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface LlmResponse {
  /** The parsed structured output (validated by the caller, never trusted). */
  output: unknown;
  /** The provider's full response, stored on the job for debugging. */
  raw: unknown;
  usage: TokenUsage;
  /** The model that actually served the request. */
  model: string;
}

/**
 * One structured-output call to a model. Implementations make exactly one request (no hidden
 * retries: the job queue owns retries) and throw RetryableError / PermanentError. Errors may
 * carry the raw response in `rawResponse` when the provider returned one.
 */
export interface LlmClient {
  readonly provider: LlmProvider;
  readonly model: string;
  extractFields(request: LlmRequest): Promise<LlmResponse>;
}

/** Thrown by clients when a response arrived but was unusable; keeps it for the job row. */
export interface WithRawResponse {
  rawResponse?: unknown;
  usage?: TokenUsage;
}

/** Shown when the provider rejects the stored key; the fix is in the app, not in .env. */
export const AUTH_FAILED_MESSAGE = 'LLM authentication failed — update the API key in Settings';
