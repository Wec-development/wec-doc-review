import Anthropic from '@anthropic-ai/sdk';
import type { LlmModelOption, LlmProvider } from '@doc-review/shared';
import OpenAI from 'openai';
import { InvalidApiKeyError, ProviderUnavailableError } from './errors.js';

/** Testing a key is a free list-models call; it must answer within this time. */
export const LIST_MODELS_TIMEOUT_MS = 10_000;

/** What the extraction needs from a model, as reported by the provider's list-models call. */
export interface AvailableModel {
  id: string;
  displayName: string | null;
  /** Live capability flags (Anthropic reports them; null when the provider does not). */
  structuredOutputs: boolean | null;
  effort: boolean | null;
  /** The provider has scheduled or announced the model's retirement. */
  deprecated: boolean;
}

interface CuratedModel {
  id: string;
  label: string;
}

/**
 * Low-cost models suited to one-page PDF field extraction, best default first. Checked against
 * the providers' model docs (Nov 2026) and the live list-models response (`pnpm llm:models`).
 * Only models that accept the client's request shape are listed: structured output, and for
 * Anthropic `output_config.effort`.
 */
export const CURATED_MODELS: Record<LlmProvider, readonly CuratedModel[]> = {
  anthropic: [
    { id: 'claude-haiku-5-5', label: 'Recommended — low cost' },
    { id: 'claude-sonnet-5-5', label: 'Higher accuracy — higher cost' },
  ],
  openai: [
    { id: 'gpt-6-luna', label: 'Recommended — low cost' },
    { id: 'gpt-6.1-terra', label: 'Balanced — moderate cost' },
    { id: 'gpt-6.1-sol', label: 'Higher accuracy — higher cost' },
  ],
};

/** OpenAI's list has no capability flags, so non-chat families are excluded by name. */
const OPENAI_NON_TEXT =
  /(embedding|tts|whisper|audio|realtime|image|dall-e|moderation|transcribe|search|instruct|computer-use|codex|-pro\b|nano)/;
/** Current chat families with Chat Completions + structured outputs (undated aliases only). */
const OPENAI_CHAT_FAMILY = /^gpt-(6(\.\d+)?|5\.[4-9])(-[a-z]+)?$/;
/** Without capability flags, only Anthropic generations known to accept effort + structured output. */
const ANTHROPIC_KNOWN_FAMILY = /^claude-(haiku|sonnet|opus)-5(-\d+)?$/;
/** When no curated model is available, prefer the cheaper tiers by name. */
const CHEAP_TIERS = [/haiku/, /luna/, /mini/, /terra/, /sonnet/, /sol/];

function supportsExtraction(provider: LlmProvider, model: AvailableModel): boolean {
  if (model.deprecated) return false;
  if (provider === 'anthropic') {
    if (model.structuredOutputs !== null && model.effort !== null) {
      return model.structuredOutputs && model.effort;
    }
    return ANTHROPIC_KNOWN_FAMILY.test(model.id);
  }
  return OPENAI_CHAT_FAMILY.test(model.id) && !OPENAI_NON_TEXT.test(model.id);
}

function cheapRank(id: string): number {
  const rank = CHEAP_TIERS.findIndex((tier) => tier.test(id));
  return rank === -1 ? CHEAP_TIERS.length : rank;
}

/**
 * The models a key can use for extraction, curated ones first (in their order), then the rest
 * cheapest-tier first. Exactly one is `recommended`: the first curated model the key has,
 * otherwise the cheapest available match.
 */
export function extractionModelOptions(
  provider: LlmProvider,
  available: readonly AvailableModel[],
): LlmModelOption[] {
  const usable = available.filter((model) => supportsExtraction(provider, model));
  const curated = CURATED_MODELS[provider];
  const curatedIndex = (id: string) => {
    const index = curated.findIndex((model) => model.id === id);
    return index === -1 ? curated.length : index;
  };
  const sorted = [...usable].sort(
    (a, b) =>
      curatedIndex(a.id) - curatedIndex(b.id) ||
      cheapRank(a.id) - cheapRank(b.id) ||
      a.id.localeCompare(b.id),
  );
  return sorted.map((model, index) => ({
    id: model.id,
    label: curated.find((entry) => entry.id === model.id)?.label ?? model.displayName ?? model.id,
    recommended: index === 0,
  }));
}

function toListError(error: unknown): Error {
  const authFailed =
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError ||
    error instanceof OpenAI.AuthenticationError ||
    error instanceof OpenAI.PermissionDeniedError;
  // Fixed messages only: provider messages can echo request details.
  return authFailed ? new InvalidApiKeyError('Invalid API key') : new ProviderUnavailableError();
}

export interface ListModelsOptions {
  /** Injected in tests to replay HTTP responses; never set in production. */
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

async function listAnthropic(apiKey: string, options: ListModelsOptions) {
  const client = new Anthropic({
    apiKey,
    maxRetries: 0,
    timeout: options.timeoutMs ?? LIST_MODELS_TIMEOUT_MS,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const models: AvailableModel[] = [];
  for await (const model of client.models.list({ limit: 1000 })) {
    models.push({
      id: model.id,
      displayName: model.display_name,
      structuredOutputs: model.capabilities?.structured_outputs.supported ?? null,
      effort: model.capabilities?.effort.supported ?? null,
      deprecated: model.deprecated_at !== null && model.deprecated_at !== undefined,
    });
  }
  return models;
}

async function listOpenAi(apiKey: string, options: ListModelsOptions) {
  const client = new OpenAI({
    apiKey,
    maxRetries: 0,
    timeout: options.timeoutMs ?? LIST_MODELS_TIMEOUT_MS,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const models: AvailableModel[] = [];
  for await (const model of client.models.list()) {
    models.push({
      id: model.id,
      displayName: null,
      structuredOutputs: null,
      effort: null,
      deprecated: model.shutdown_date !== null && model.shutdown_date !== undefined,
    });
  }
  return models;
}

/**
 * Calls the provider's list-models endpoint with `apiKey` (free; no completion is run). A
 * success means the key is valid. Throws InvalidApiKeyError or ProviderUnavailableError.
 */
export async function listAvailableModels(
  provider: LlmProvider,
  apiKey: string,
  options: ListModelsOptions = {},
): Promise<AvailableModel[]> {
  try {
    return provider === 'anthropic'
      ? await listAnthropic(apiKey, options)
      : await listOpenAi(apiKey, options);
  } catch (error) {
    throw toListError(error);
  }
}
