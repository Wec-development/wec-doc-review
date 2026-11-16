import OpenAI from 'openai';
import { ExtractionError, PermanentError, RetryableError } from '../errors.js';
import {
  AUTH_FAILED_MESSAGE,
  type LlmClient,
  type LlmRequest,
  type LlmResponse,
  type WithRawResponse,
} from './llm-client.js';

/** Enough for every field of a one-page document, and within every current model's limit. */
const MAX_OUTPUT_TOKENS = 16_000;
/** Names the structured-output schema in the request (OpenAI requires a name). */
const SCHEMA_NAME = 'extracted_fields';

export interface OpenAiClientOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  /** Injected in tests to replay HTTP responses; never set in production. */
  fetch?: typeof globalThis.fetch;
}

function usageOf(completion: OpenAI.Chat.ChatCompletion) {
  return {
    inputTokens: completion.usage?.prompt_tokens ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0,
  };
}

/** Keeps the unusable response (and what it cost) on the error, for the job row. */
function withRaw<T extends ExtractionError>(
  error: T,
  completion: OpenAI.Chat.ChatCompletion,
): T & WithRawResponse {
  return Object.assign(error, { rawResponse: completion, usage: usageOf(completion) });
}

/**
 * Maps SDK errors onto the job-queue retry policy, exactly as for Anthropic. Status-specific
 * classes are checked before their base class (APIConnectionError is itself an APIError).
 */
export function toExtractionError(error: unknown): ExtractionError {
  if (error instanceof ExtractionError) return error;
  if (
    error instanceof OpenAI.AuthenticationError ||
    error instanceof OpenAI.PermissionDeniedError
  ) {
    // Never include the key or the provider's message, which can echo request details.
    return new PermanentError(AUTH_FAILED_MESSAGE, { cause: error });
  }
  if (error instanceof OpenAI.RateLimitError) {
    return new RetryableError('LLM rate limit reached (429)', { cause: error });
  }
  if (error instanceof OpenAI.InternalServerError) {
    return new RetryableError(`LLM provider error (${error.status})`, { cause: error });
  }
  if (error instanceof OpenAI.APIUserAbortError) {
    // The worker aborted the call (lease lost or shutdown); it decides what happens next.
    return new RetryableError('LLM request was aborted', { cause: error });
  }
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new RetryableError('LLM request timed out', { cause: error });
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return new RetryableError('Could not reach the LLM provider', { cause: error });
  }
  if (error instanceof OpenAI.APIError) {
    const status = error.status;
    if (status === 408 || status === 409 || (status !== undefined && status >= 500)) {
      return new RetryableError(`LLM provider error (${status})`, { cause: error });
    }
    return new PermanentError(
      `LLM rejected the request (${status ?? 'unknown'}): ${error.message}`,
      { cause: error },
    );
  }
  return new RetryableError(error instanceof Error ? error.message : String(error), {
    cause: error,
  });
}

/** One Chat Completions call with a strict JSON schema (structured outputs). */
export class OpenAiLlmClient implements LlmClient {
  readonly provider = 'openai' as const;
  readonly model: string;
  private readonly client: OpenAI;

  constructor(options: OpenAiClientOptions) {
    this.model = options.model;
    this.client = new OpenAI({
      apiKey: options.apiKey,
      timeout: options.timeoutMs,
      // The job queue owns retries; one LLM call per job attempt.
      maxRetries: 0,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  }

  async extractFields(request: LlmRequest): Promise<LlmResponse> {
    let completion: OpenAI.Chat.ChatCompletion;
    try {
      completion = await this.client.chat.completions.create(
        {
          model: this.model,
          max_completion_tokens: MAX_OUTPUT_TOKENS,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.user },
          ],
          // Strict structured output: the reply must be JSON matching the schema.
          response_format: {
            type: 'json_schema',
            json_schema: { name: SCHEMA_NAME, strict: true, schema: request.schema },
          },
        },
        request.signal ? { signal: request.signal } : undefined,
      );
    } catch (error) {
      throw toExtractionError(error);
    }

    const choice = completion.choices[0];
    if (choice?.message.refusal) {
      throw withRaw(new PermanentError('The model declined to extract this document'), completion);
    }
    if (choice?.finish_reason === 'content_filter') {
      throw withRaw(
        new PermanentError('The model declined to extract this document (content filter)'),
        completion,
      );
    }
    if (choice?.finish_reason === 'length') {
      throw withRaw(new RetryableError('Model output was cut off (max_tokens)'), completion);
    }
    const text = choice?.message.content ?? null;
    if (text === null || text.trim() === '') {
      throw withRaw(new RetryableError('Model returned no structured output'), completion);
    }
    let output: unknown;
    try {
      output = JSON.parse(text);
    } catch {
      throw withRaw(new RetryableError('Model output was not valid JSON'), completion);
    }
    return { output, raw: completion, usage: usageOf(completion), model: completion.model };
  }
}
