import type { Config } from '../../config.js';
import { AnthropicLlmClient } from './anthropic-client.js';
import type { LlmClient } from './llm-client.js';
import { OpenAiLlmClient } from './openai-client.js';

type LlmConfig = Pick<Config, 'LLM_API_KEY' | 'LLM_MODEL' | 'LLM_PROVIDER' | 'LLM_TIMEOUT_MS'>;

/**
 * The client for the configured provider. Throws (at worker start) when the key, the model or
 * the provider is missing, so a misconfiguration never turns into one failed job per document.
 */
export function createLlmClient(config: LlmConfig): LlmClient {
  const { LLM_API_KEY: apiKey, LLM_MODEL: model, LLM_PROVIDER: provider } = config;
  if (!apiKey) {
    throw new Error('EXTRACTOR=llm needs LLM_API_KEY');
  }
  if (!model) {
    throw new Error('EXTRACTOR=llm needs LLM_MODEL (e.g. claude-opus-5-5 or gpt-4o-mini)');
  }
  const options = { apiKey, model, timeoutMs: config.LLM_TIMEOUT_MS };
  switch (provider) {
    case 'anthropic':
      return new AnthropicLlmClient(options);
    case 'openai':
      return new OpenAiLlmClient(options);
    case undefined:
      throw new Error(
        `LLM_PROVIDER is not set and cannot be inferred from LLM_MODEL=${model}; set LLM_PROVIDER=anthropic or LLM_PROVIDER=openai`,
      );
  }
}
