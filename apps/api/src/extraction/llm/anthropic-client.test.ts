import { describe, expect, it } from 'vitest';
import {
  jsonResponse,
  loadRecording,
  replayFetch,
  TEST_API_KEY,
  TEST_MODEL,
} from '../../test/llm.js';
import { PermanentError, RetryableError } from '../errors.js';
import { buildPrompt } from '../prompt/build-prompt.js';
import { AnthropicLlmClient } from './anthropic-client.js';

const prompt = buildPrompt('invoice', 'Invoice Number: INV-1');
const recorded = loadRecording('invoice-001') as Record<string, unknown>;

function clientAnswering(respond: () => Response, model = TEST_MODEL) {
  const replay = replayFetch(respond);
  const client = new AnthropicLlmClient({
    apiKey: TEST_API_KEY,
    model,
    timeoutMs: 2000,
    fetch: replay.fetch,
  });
  return { client, calls: replay.calls };
}

const apiError = (status: number, type: string) =>
  jsonResponse(status, { type: 'error', error: { type, message: `${type} for ${TEST_API_KEY}` } });

describe('AnthropicLlmClient request', () => {
  it('asks for structured JSON output, with no sampling parameters or forced tool choice', async () => {
    const { client, calls } = clientAnswering(() => jsonResponse(200, recorded));
    await client.extractFields(prompt);

    const body = calls[0]?.body ?? {};
    expect(body).toMatchObject({
      model: TEST_MODEL,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: prompt.schema } },
      fallbacks: 'default',
    });
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('tool_choice');
    expect(calls[0]?.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
  });

  it('omits refusal fallbacks for models that do not support them', async () => {
    const { client, calls } = clientAnswering(
      () => jsonResponse(200, recorded),
      'claude-haiku-5-5',
    );
    await client.extractFields(prompt);
    expect(calls[0]?.body).not.toHaveProperty('fallbacks');
  });

  it('returns the parsed output, the raw response, usage and the serving model', async () => {
    const { client } = clientAnswering(() => jsonResponse(200, recorded));
    const response = await client.extractFields(prompt);
    expect(response).toMatchObject({
      output: { fields: expect.any(Array) },
      raw: expect.objectContaining({ id: 'msg_rec_invoice_001' }),
      usage: { inputTokens: 912, outputTokens: 486 },
      model: 'claude-opus-5-5',
    });
  });
});

describe('AnthropicLlmClient error mapping', () => {
  it('maps 429 to a RetryableError and makes exactly one request (no SDK retries)', async () => {
    const { client, calls } = clientAnswering(() => apiError(429, 'rate_limit_error'));
    await expect(client.extractFields(prompt)).rejects.toBeInstanceOf(RetryableError);
    expect(calls).toHaveLength(1);
  });

  it.each([500, 503, 529])('maps %i to a RetryableError', async (status) => {
    const { client } = clientAnswering(() => apiError(status, 'overloaded_error'));
    await expect(client.extractFields(prompt)).rejects.toBeInstanceOf(RetryableError);
  });

  it('maps 401 to a PermanentError with a readable message that never contains the key', async () => {
    const { client } = clientAnswering(() => apiError(401, 'authentication_error'));
    const error = await client.extractFields(prompt).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PermanentError);
    expect((error as Error).message).toBe('LLM authentication failed — check LLM_API_KEY');
    expect(JSON.stringify(error)).not.toContain(TEST_API_KEY);
  });

  it('maps 400 to a PermanentError', async () => {
    const { client } = clientAnswering(() => apiError(400, 'invalid_request_error'));
    await expect(client.extractFields(prompt)).rejects.toBeInstanceOf(PermanentError);
  });

  it('maps a network failure to a RetryableError', async () => {
    const { client } = clientAnswering(() => {
      throw new TypeError('fetch failed');
    });
    await expect(client.extractFields(prompt)).rejects.toBeInstanceOf(RetryableError);
  });

  it('treats a refusal as permanent and keeps the response', async () => {
    const { client } = clientAnswering(() =>
      jsonResponse(200, { ...recorded, stop_reason: 'refusal', content: [] }),
    );
    const error = await client.extractFields(prompt).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PermanentError);
    expect(error).toHaveProperty('rawResponse');
  });

  it('treats truncated or non-JSON output as retryable, keeping the raw response', async () => {
    const truncated = clientAnswering(() =>
      jsonResponse(200, { ...recorded, stop_reason: 'max_tokens' }),
    );
    await expect(truncated.client.extractFields(prompt)).rejects.toBeInstanceOf(RetryableError);

    const garbled = clientAnswering(() =>
      jsonResponse(200, {
        ...recorded,
        content: [{ type: 'text', text: 'Sure! Here are the fields' }],
      }),
    );
    const error = await garbled.client.extractFields(prompt).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RetryableError);
    expect(error).toMatchObject({ usage: { inputTokens: 912, outputTokens: 486 } });
  });
});
