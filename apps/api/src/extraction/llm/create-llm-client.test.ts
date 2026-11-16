import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../config.js';
import { AnthropicLlmClient } from './anthropic-client.js';
import { createLlmClient } from './create-llm-client.js';
import { OpenAiLlmClient } from './openai-client.js';

const KEY = 'sk-test-not-a-real-key';

describe('createLlmClient', () => {
  it('builds the client for the provider inferred from the model', () => {
    expect(
      createLlmClient(loadConfig({ LLM_API_KEY: KEY, LLM_MODEL: 'claude-opus-5-5' })),
    ).toBeInstanceOf(AnthropicLlmClient);
    expect(
      createLlmClient(loadConfig({ LLM_API_KEY: KEY, LLM_MODEL: 'gpt-4o-mini' })),
    ).toBeInstanceOf(OpenAiLlmClient);
  });

  it('uses an explicit LLM_PROVIDER for a model name it cannot infer', () => {
    const client = createLlmClient(
      loadConfig({ LLM_API_KEY: KEY, LLM_MODEL: 'my-proxy-model', LLM_PROVIDER: 'openai' }),
    );
    expect(client).toBeInstanceOf(OpenAiLlmClient);
    expect(client.model).toBe('my-proxy-model');
  });

  it('refuses to start when the provider cannot be determined, naming the fix', () => {
    expect(() =>
      createLlmClient(loadConfig({ LLM_API_KEY: KEY, LLM_MODEL: 'mistral-large' })),
    ).toThrow(/set LLM_PROVIDER=anthropic or LLM_PROVIDER=openai/);
  });

  it('refuses to start without a key or a model, never echoing the key', () => {
    expect(() => createLlmClient(loadConfig({ LLM_MODEL: 'gpt-4o-mini' }))).toThrow(
      'EXTRACTOR=llm needs LLM_API_KEY',
    );
    const error = (() => {
      try {
        createLlmClient(loadConfig({ LLM_API_KEY: KEY }));
      } catch (caught) {
        return caught as Error;
      }
      return null;
    })();
    expect(error?.message).toMatch(/needs LLM_MODEL/);
    expect(error?.message).not.toContain(KEY);
  });
});
