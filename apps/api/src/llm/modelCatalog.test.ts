import { describe, expect, it } from 'vitest';
import { jsonResponse, replayFetch } from '../test/llm.js';
import {
  ANTHROPIC_MODELS,
  anthropicModelsBody,
  OPENAI_MODELS,
  openAiModelsBody,
} from '../test/models.js';
import { InvalidApiKeyError, ProviderUnavailableError } from './errors.js';
import { extractionModelOptions, listAvailableModels } from './modelCatalog.js';

const KEY = { anthropic: 'sk-ant-test-0000000000000000', openai: 'sk-proj-test-00000000000000' };

async function optionsFor(provider: 'anthropic' | 'openai', body: unknown) {
  const { fetch, calls } = replayFetch(() => jsonResponse(200, body));
  const available = await listAvailableModels(provider, KEY[provider], { fetch });
  return { options: extractionModelOptions(provider, available), calls };
}

describe('listAvailableModels + extractionModelOptions', () => {
  it('Anthropic: keeps models with structured output and effort, Haiku recommended first', async () => {
    const { options, calls } = await optionsFor('anthropic', ANTHROPIC_MODELS);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toMatch(/api\.anthropic\.com\/v1\/models/);
    // The SDK sends the key as x-api-key or as a bearer token, depending on its version.
    const sentKey =
      calls[0]?.headers.get('x-api-key') ?? calls[0]?.headers.get('authorization') ?? '';
    expect(sentKey).toContain(KEY.anthropic);
    expect(options).toEqual([
      { id: 'claude-haiku-5-5', label: 'Recommended — low cost', recommended: true },
      { id: 'claude-sonnet-5-5', label: 'Higher accuracy — higher cost', recommended: false },
      { id: 'claude-opus-5-5', label: 'Claude opus 5 5', recommended: false },
    ]);
  });

  it('OpenAI: keeps current chat models only, Luna recommended first', async () => {
    const { options, calls } = await optionsFor('openai', OPENAI_MODELS);

    expect(calls[0]?.url).toMatch(/api\.openai\.com\/v1\/models$/);
    expect(calls[0]?.headers.get('authorization')).toBe(`Bearer ${KEY.openai}`);
    expect(options.map((o) => o.id)).toEqual([
      'gpt-6-luna',
      'gpt-6.1-terra',
      'gpt-6.1-sol',
      'gpt-5.4-mini',
    ]);
    expect(options.filter((o) => o.recommended)).toEqual([
      { id: 'gpt-6-luna', label: 'Recommended — low cost', recommended: true },
    ]);
  });

  it('recommends the cheapest available match when the key has no curated model', async () => {
    const { options } = await optionsFor(
      'openai',
      openAiModelsBody(['gpt-6.1-sol', 'gpt-5.4-mini', 'text-embedding-3-small']),
    );
    expect(options).toEqual([
      { id: 'gpt-6.1-sol', label: 'Higher accuracy — higher cost', recommended: true },
      { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini', recommended: false },
    ]);

    const cheapest = await optionsFor(
      'anthropic',
      anthropicModelsBody([{ id: 'claude-opus-5' }, { id: 'claude-haiku-5' }]),
    );
    expect(cheapest.options[0]).toMatchObject({ id: 'claude-haiku-5', recommended: true });
  });

  it('falls back to known families when Anthropic reports no capabilities', async () => {
    const { options } = await optionsFor(
      'anthropic',
      anthropicModelsBody([
        { id: 'claude-haiku-5-5', noCapabilities: true },
        { id: 'claude-haiku-4-5', noCapabilities: true },
      ]),
    );
    expect(options.map((o) => o.id)).toEqual(['claude-haiku-5-5']);
  });

  it('returns no options when the key can use no suitable model', async () => {
    const { options } = await optionsFor('openai', openAiModelsBody(['text-embedding-3-small']));
    expect(options).toEqual([]);
  });

  it.each([401, 403])(
    'maps %i to "Invalid API key" without echoing the provider message',
    async (status) => {
      const { fetch } = replayFetch(() =>
        jsonResponse(status, {
          type: 'error',
          error: { type: 'authentication_error', message: KEY.anthropic },
        }),
      );
      const error = await listAvailableModels('anthropic', KEY.anthropic, { fetch }).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(InvalidApiKeyError);
      expect((error as Error).message).toBe('Invalid API key');
      expect(JSON.stringify(error)).not.toContain(KEY.anthropic);
    },
  );

  it('maps a 5xx, a network failure and a timeout to "Provider unreachable — try again"', async () => {
    const serverError = replayFetch(() => jsonResponse(503, { error: { message: 'overloaded' } }));
    const network = replayFetch(() => {
      throw new TypeError('fetch failed');
    });
    const slow: typeof globalThis.fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });

    for (const fetch of [serverError.fetch, network.fetch, slow]) {
      const error = await listAvailableModels('openai', KEY.openai, { fetch, timeoutMs: 50 }).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(ProviderUnavailableError);
      expect((error as Error).message).toBe('Provider unreachable — try again');
    }
  });
});
