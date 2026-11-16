import type {
  LlmModelOption,
  LlmProvider,
  LlmSaveRequest,
  LlmSettings,
  LlmTestRequest,
  LlmTestResult,
} from '@doc-review/shared';
import { LLM_PROVIDER_LABELS } from '@doc-review/shared';
import { DecryptionError, decryptSecret, encryptSecret } from '../crypto/secret-box.js';
import type { Database } from '../db/client.js';
import { ValidationError } from '../errors.js';
import { assertKeyFormat, keyHintOf } from '../llm/key-format.js';
import {
  type AvailableModel,
  extractionModelOptions,
  listAvailableModels,
} from '../llm/modelCatalog.js';
import {
  findLlmSettings,
  type LlmSettingsRow,
  upsertLlmSettings,
} from '../repositories/llm-settings.repository.js';

export type ListModels = (provider: LlmProvider, apiKey: string) => Promise<AvailableModel[]>;

export interface SettingsDeps {
  db: Database;
  /** Encrypts stored API keys; resolved at startup, never stored in the database. */
  encryptionKey: Buffer;
  /** The provider's list-models call (replayed in tests). */
  listModels?: ListModels;
}

function toDto(row: LlmSettingsRow | null): LlmSettings {
  if (!row) {
    return {
      configured: false,
      provider: null,
      model: null,
      keyHint: null,
      lastVerifiedAt: null,
      updatedAt: null,
    };
  }
  return {
    configured: true,
    provider: row.provider,
    model: row.model,
    keyHint: row.keyHint,
    lastVerifiedAt: row.lastVerifiedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getLlmSettings(deps: SettingsDeps): Promise<LlmSettings> {
  return toDto(await findLlmSettings(deps.db));
}

/**
 * The key to test or save: the one entered (format-checked first), or the stored one, which is
 * only reusable for the same provider. The plaintext lives only for this request.
 */
function keyToUse(
  deps: SettingsDeps,
  stored: LlmSettingsRow | null,
  provider: LlmProvider,
  apiKey: string | undefined,
): { apiKey: string; isNew: boolean } {
  if (apiKey !== undefined) {
    assertKeyFormat(provider, apiKey);
    return { apiKey, isNew: true };
  }
  if (!stored) {
    throw new ValidationError('Enter an API key');
  }
  if (stored.provider !== provider) {
    throw new ValidationError(
      `The saved key is for ${LLM_PROVIDER_LABELS[stored.provider]}; enter a key for ${LLM_PROVIDER_LABELS[provider]}`,
    );
  }
  try {
    return {
      apiKey: decryptSecret(
        { ciphertext: stored.apiKeyCiphertext, iv: stored.apiKeyIv, tag: stored.apiKeyTag },
        deps.encryptionKey,
      ),
      isNew: false,
    };
  } catch (error) {
    if (error instanceof DecryptionError) {
      // The encryption key changed (e.g. a new SECRETS_DIR): the stored key is unreadable.
      throw new ValidationError('The saved key cannot be read any more; enter it again');
    }
    throw error;
  }
}

async function modelOptionsFor(
  deps: SettingsDeps,
  provider: LlmProvider,
  apiKey: string,
): Promise<LlmModelOption[]> {
  const listModels = deps.listModels ?? listAvailableModels;
  return extractionModelOptions(provider, await listModels(provider, apiKey));
}

/** Verifies a key with the provider's free list-models call and returns the usable models. */
export async function testLlmConnection(
  deps: SettingsDeps,
  request: LlmTestRequest,
): Promise<LlmTestResult> {
  const stored = await findLlmSettings(deps.db);
  const { apiKey } = keyToUse(deps, stored, request.provider, request.apiKey);
  return { valid: true, models: await modelOptionsFor(deps, request.provider, apiKey) };
}

/**
 * Re-verifies key and model with the provider (never trusting an earlier test in the browser),
 * then encrypts and stores them. Returns the same shape as GET.
 */
export async function saveLlmSettings(
  deps: SettingsDeps,
  request: LlmSaveRequest,
): Promise<LlmSettings> {
  const stored = await findLlmSettings(deps.db);
  const { apiKey, isNew } = keyToUse(deps, stored, request.provider, request.apiKey);
  const models = await modelOptionsFor(deps, request.provider, apiKey);
  if (!models.some((model) => model.id === request.model)) {
    throw new ValidationError(`Model ${request.model} is not available for this key`);
  }
  const encrypted =
    isNew || !stored
      ? encryptSecret(apiKey, deps.encryptionKey)
      : {
          ciphertext: stored.apiKeyCiphertext,
          iv: stored.apiKeyIv,
          tag: stored.apiKeyTag,
          keyVersion: stored.keyVersion,
        };
  await deps.db.transaction((tx) =>
    upsertLlmSettings(tx, {
      provider: request.provider,
      model: request.model,
      apiKeyCiphertext: encrypted.ciphertext,
      apiKeyIv: encrypted.iv,
      apiKeyTag: encrypted.tag,
      keyVersion: encrypted.keyVersion,
      keyHint: isNew ? keyHintOf(apiKey) : (stored?.keyHint ?? keyHintOf(apiKey)),
    }),
  );
  return getLlmSettings(deps);
}
