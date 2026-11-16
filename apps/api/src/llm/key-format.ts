import type { LlmProvider } from '@doc-review/shared';
import { ValidationError } from '../errors.js';

/**
 * A cheap sanity check before calling out: the provider's own answer is the source of truth.
 * Anthropic keys start with sk-ant-; OpenAI keys with sk- (sk-proj-, sk-svcacct-, …).
 */
export function assertKeyFormat(provider: LlmProvider, apiKey: string): void {
  const isAnthropicKey = apiKey.startsWith('sk-ant-');
  if (provider === 'anthropic' && !isAnthropicKey) {
    throw new ValidationError(
      'This does not look like an Anthropic API key (they start with sk-ant-)',
    );
  }
  if (provider === 'openai' && isAnthropicKey) {
    throw new ValidationError(
      'This is an Anthropic key; choose Claude (Anthropic) as the provider',
    );
  }
  if (provider === 'openai' && !apiKey.startsWith('sk-')) {
    throw new ValidationError('This does not look like an OpenAI API key (they start with sk-)');
  }
}

/** The last 4 characters, the only part of a key ever shown again. */
export function keyHintOf(apiKey: string): string {
  return apiKey.slice(-4);
}
