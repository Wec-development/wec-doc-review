import type { LlmProvider } from '@doc-review/shared';
import { DecryptionError, decryptSecret } from '../crypto/secret-box.js';
import type { Database } from '../db/client.js';
import { PermanentError, RetryableError } from '../extraction/errors.js';
import { AnthropicLlmClient } from '../extraction/llm/anthropic-client.js';
import type { LlmClient } from '../extraction/llm/llm-client.js';
import { OpenAiLlmClient } from '../extraction/llm/openai-client.js';
import {
  findLlmSettings,
  findLlmSettingsSummary,
} from '../repositories/llm-settings.repository.js';

export interface LlmSettingsResolverOptions {
  db: Database;
  encryptionKey: Buffer;
  /** Per-call timeout for extraction requests (LLM_TIMEOUT_MS). */
  timeoutMs: number;
  /** How long the non-secret "is it configured?" answer may be reused. */
  cacheMs?: number;
  now?: () => number;
  /** Injected in tests to replay provider HTTP; never set in production. */
  fetch?: typeof globalThis.fetch;
}

/**
 * Reads the LLM settings for the worker. `isConfigured` is polled before every claim, so its
 * answer (non-secret fields only) is cached briefly. `clientForJob` reads the row fresh and
 * decrypts the key at that moment, for one job's call; the plaintext is not kept anywhere else.
 */
export class LlmSettingsResolver {
  private cached: { at: number; configured: boolean } | null = null;

  constructor(private readonly options: LlmSettingsResolverOptions) {}

  async isConfigured(): Promise<boolean> {
    const now = (this.options.now ?? Date.now)();
    const cacheMs = this.options.cacheMs ?? 5000;
    if (this.cached && now - this.cached.at < cacheMs) {
      return this.cached.configured;
    }
    const configured = (await findLlmSettingsSummary(this.options.db)) !== null;
    this.cached = { at: now, configured };
    return configured;
  }

  async clientForJob(): Promise<LlmClient> {
    const settings = await findLlmSettings(this.options.db);
    if (!settings) {
      // Only reachable if settings vanish between the claim and the call.
      throw new RetryableError('No LLM is configured; configure one in Settings');
    }
    let apiKey: string;
    try {
      apiKey = decryptSecret(
        { ciphertext: settings.apiKeyCiphertext, iv: settings.apiKeyIv, tag: settings.apiKeyTag },
        this.options.encryptionKey,
      );
    } catch (error) {
      if (error instanceof DecryptionError) {
        throw new PermanentError(
          'The saved API key cannot be decrypted (the encryption key changed); enter it again in Settings',
        );
      }
      throw error;
    }
    return createLlmClient(settings.provider, {
      apiKey,
      model: settings.model,
      timeoutMs: this.options.timeoutMs,
      ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
    });
  }
}

export function createLlmClient(
  provider: LlmProvider,
  options: { apiKey: string; model: string; timeoutMs: number; fetch?: typeof globalThis.fetch },
): LlmClient {
  return provider === 'anthropic' ? new AnthropicLlmClient(options) : new OpenAiLlmClient(options);
}
