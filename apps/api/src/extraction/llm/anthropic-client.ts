import Anthropic from '@anthropic-ai/sdk';
import { ExtractionError, PermanentError, RetryableError } from '../errors.js';
import type { LlmClient, LlmRequest, LlmResponse, WithRawResponse } from './llm-client.js';

/** Enough for every field plus adaptive thinking on a one-page document. */
const MAX_OUTPUT_TOKENS = 16_000;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
/** Models that accept server-side refusal fallbacks (`fallbacks: "default"`). */
const MODELS_WITH_FALLBACKS = new Set([
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5',
  'claude-fable-5-1',
  'claude-fable-5-2',
]);

export interface AnthropicClientOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  /** Injected in tests to replay HTTP responses; never set in production. */
  fetch?: typeof globalThis.fetch;
}

/** Keeps the unusable response (and what it cost) on the error, for the job row. */
function withRaw<T extends ExtractionError>(
  error: T,
  message: Anthropic.Beta.BetaMessage,
): T & WithRawResponse {
  return Object.assign(error, {
    rawResponse: message,
    usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
  });
}

/**
 * Maps SDK errors onto the job-queue retry policy. Status-specific classes are checked before
 * their base class (APIConnectionError is itself an APIError in the TypeScript SDK).
 */
export function toExtractionError(error: unknown): ExtractionError {
  if (error instanceof ExtractionError) return error;
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    // Never include the key or the provider's message, which can echo request details.
    return new PermanentError('LLM authentication failed — check LLM_API_KEY', { cause: error });
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new RetryableError('LLM rate limit reached (429)', { cause: error });
  }
  if (error instanceof Anthropic.InternalServerError) {
    return new RetryableError(`LLM provider error (${error.status})`, { cause: error });
  }
  if (error instanceof Anthropic.APIUserAbortError) {
    // The worker aborted the call (lease lost or shutdown); it decides what happens next.
    return new RetryableError('LLM request was aborted', { cause: error });
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new RetryableError('LLM request timed out', { cause: error });
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new RetryableError('Could not reach the LLM provider', { cause: error });
  }
  if (error instanceof Anthropic.APIError) {
    const status = error.status;
    if (status === 408 || status === 409 || (status !== undefined && status >= 500)) {
      return new RetryableError(`LLM provider error (${status})`, { cause: error });
    }
    return new PermanentError(
      `LLM rejected the request (${status ?? 'unknown'}): ${error.message}`,
      {
        cause: error,
      },
    );
  }
  return new RetryableError(error instanceof Error ? error.message : String(error), {
    cause: error,
  });
}

function textOf(message: Anthropic.Beta.BetaMessage): string | null {
  for (const block of message.content) {
    if (block.type === 'text') return block.text;
  }
  return null;
}

export class AnthropicLlmClient implements LlmClient {
  readonly model: string;
  private readonly client: Anthropic;

  constructor(options: AnthropicClientOptions) {
    this.model = options.model;
    this.client = new Anthropic({
      apiKey: options.apiKey,
      timeout: options.timeoutMs,
      // The job queue owns retries; one LLM call per job attempt.
      maxRetries: 0,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  }

  async extractFields(request: LlmRequest): Promise<LlmResponse> {
    const useFallbacks = MODELS_WITH_FALLBACKS.has(this.model);
    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await this.client.beta.messages.create(
        {
          model: this.model,
          max_tokens: MAX_OUTPUT_TOKENS,
          system: request.system,
          messages: [{ role: 'user', content: request.user }],
          // Structured output: the reply must be JSON matching the schema, never free text.
          output_config: {
            effort: 'medium',
            format: { type: 'json_schema', schema: request.schema },
          },
          ...(useFallbacks ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
        },
        request.signal ? { signal: request.signal } : undefined,
      );
    } catch (error) {
      throw toExtractionError(error);
    }

    const usage = {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };
    if (message.stop_reason === 'refusal') {
      throw withRaw(
        new PermanentError(
          `The model declined to extract this document${message.stop_details?.category ? ` (${message.stop_details.category})` : ''}`,
        ),
        message,
      );
    }
    if (message.stop_reason === 'max_tokens') {
      throw withRaw(new RetryableError('Model output was cut off (max_tokens)'), message);
    }
    const text = textOf(message);
    let output: unknown;
    try {
      output = text === null ? null : JSON.parse(text);
    } catch {
      throw withRaw(new RetryableError('Model output was not valid JSON'), message);
    }
    if (output === null) {
      throw withRaw(new RetryableError('Model returned no structured output'), message);
    }
    return { output, raw: message, usage, model: message.model };
  }
}
