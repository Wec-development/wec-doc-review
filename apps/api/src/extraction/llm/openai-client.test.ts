import { describe, expect, it } from 'vitest';
import {
  jsonResponse,
  OPENAI_TEST_MODEL,
  openAiRecording,
  replayFetch,
  TEST_API_KEY,
} from '../../test/llm.js';
import { PermanentError, RetryableError } from '../errors.js';
import { buildPrompt } from '../prompt/build-prompt.js';
import { OpenAiLlmClient } from './openai-client.js';

const prompt = buildPrompt('invoice', 'Invoice Number: INV-1');
const recorded = openAiRecording('invoice-001', { id: 'chatcmpl_rec_invoice_001' });

function clientAnswering(respond: () => Response) {
  const replay = replayFetch(respond);
  const client = new OpenAiLlmClient({
    apiKey: TEST_API_KEY,
    model: OPENAI_TEST_MODEL,
    timeoutMs: 2000,
    fetch: replay.fetch,
  });
  return { client, calls: replay.calls };
}

const apiError = (status: number, type: string) =>
  jsonResponse(status, {
    error: { type, code: type, message: `${type} for ${TEST_API_KEY}`, param: null },
  });

describe('OpenAiLlmClient request', () => {
  it('asks for strict JSON-schema output with the system and user prompts, no sampling parameters', async () => {
    const { client, calls } = clientAnswering(() => jsonResponse(200, recorded));
    await client.extractFields(prompt);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toMatch(/\/chat\/completions$/);
    const body = calls[0]?.body ?? {};
    expect(body).toEqual({
      model: OPENAI_TEST_MODEL,
      max_completion_tokens: 16_000,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'extracted_fields', strict: true, schema: prompt.schema },
      },
    });
    expect(calls[0]?.headers.get('authorization')).toBe(`Bearer ${TEST_API_KEY}`);
  });

  it('returns the parsed output, the raw response, usage and the serving model', async () => {
    const { client } = clientAnswering(() => jsonResponse(200, recorded));
    const response = await client.extractFields(prompt);
    expect(response).toMatchObject({
      output: { fields: expect.any(Array) },
      raw: expect.objectContaining({ id: 'chatcmpl_rec_invoice_001' }),
      usage: { inputTokens: 905, outputTokens: 212 },
      model: 'gpt-4o-mini-2024-07-18',
    });
  });
});

describe('OpenAiLlmClient error mapping', () => {
  it('maps 429 to a RetryableError and makes exactly one request (no SDK retries)', async () => {
    const { client, calls } = clientAnswering(() => apiError(429, 'rate_limit_exceeded'));
    await expect(client.extractFields(prompt)).rejects.toBeInstanceOf(RetryableError);
    expect(calls).toHaveLength(1);
  });

  it.each([500, 503])('maps %i to a RetryableError', async (status) => {
    const { client } = clientAnswering(() => apiError(status, 'server_error'));
    await expect(client.extractFields(prompt)).rejects.toBeInstanceOf(RetryableError);
  });

  it('maps 401 to a PermanentError with a readable message that never contains the key', async () => {
    const { client } = clientAnswering(() => apiError(401, 'invalid_api_key'));
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

  it('treats a refusal or a content-filter stop as permanent and keeps the response', async () => {
    const refusal = clientAnswering(() =>
      jsonResponse(200, openAiRecording('invoice-001', { id: 'r', refusal: 'I cannot help' })),
    );
    const error = await refusal.client.extractFields(prompt).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PermanentError);
    expect(error).toMatchObject({ rawResponse: expect.objectContaining({ id: 'r' }) });

    const filtered = clientAnswering(() =>
      jsonResponse(
        200,
        openAiRecording('invoice-001', { id: 'f', finishReason: 'content_filter', content: '' }),
      ),
    );
    await expect(filtered.client.extractFields(prompt)).rejects.toBeInstanceOf(PermanentError);
  });

  it('treats truncated, empty or non-JSON output as retryable, keeping the raw response', async () => {
    for (const changes of [
      { finishReason: 'length' as const },
      { content: '' },
      { content: 'Sure! Here are the fields' },
    ]) {
      const { client } = clientAnswering(() =>
        jsonResponse(200, openAiRecording('invoice-001', { id: 'x', ...changes })),
      );
      const error = await client.extractFields(prompt).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(RetryableError);
      expect(error).toMatchObject({ usage: { inputTokens: 905, outputTokens: 212 } });
    }
  });
});
