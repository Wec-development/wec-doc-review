/**
 * Bodies of the providers' list-models endpoints, shaped like the real ones, for replaying
 * through an injected fetch. Anthropic reports capabilities per model; OpenAI does not.
 */

interface AnthropicModelInput {
  id: string;
  structuredOutputs?: boolean;
  effort?: boolean;
  deprecated?: boolean;
  /** Older API versions return no capabilities at all. */
  noCapabilities?: boolean;
}

export function anthropicModelsBody(models: AnthropicModelInput[]) {
  return {
    data: models.map((model) => ({
      type: 'model',
      id: model.id,
      display_name: model.id.replace(/^claude-/, 'Claude ').replace(/-/g, ' '),
      created_at: '2026-10-01T00:00:00Z',
      deprecated_at: model.deprecated ? '2026-11-01T00:00:00Z' : null,
      max_input_tokens: 1_000_000,
      max_tokens: 128_000,
      capabilities: model.noCapabilities
        ? null
        : {
            structured_outputs: { supported: model.structuredOutputs ?? true },
            effort: {
              supported: model.effort ?? true,
              low: { supported: true },
              medium: { supported: true },
              high: { supported: true },
              max: { supported: true },
            },
          },
    })),
    has_more: false,
    first_id: models[0]?.id ?? null,
    last_id: models.at(-1)?.id ?? null,
  };
}

export function openAiModelsBody(models: (string | { id: string; shutdownDate: string })[]) {
  return {
    object: 'list',
    data: models.map((model) => {
      const id = typeof model === 'string' ? model : model.id;
      return {
        id,
        object: 'model',
        created: 1_760_000_000,
        owned_by: 'openai',
        ...(typeof model === 'string' ? {} : { shutdown_date: model.shutdownDate }),
      };
    }),
  };
}

/** A list a typical Anthropic key sees: current models plus ones extraction cannot use. */
export const ANTHROPIC_MODELS = anthropicModelsBody([
  { id: 'claude-opus-5-5' },
  { id: 'claude-sonnet-5-5' },
  { id: 'claude-haiku-5-5' },
  { id: 'claude-haiku-4-5', effort: false },
  { id: 'claude-3-5-haiku-20241022', structuredOutputs: false, effort: false, deprecated: true },
]);

/** A list a typical OpenAI key sees: chat models mixed with embeddings, audio, images, … */
export const OPENAI_MODELS = openAiModelsBody([
  'gpt-6.1-sol',
  'gpt-6-luna',
  'gpt-6.1-terra',
  'gpt-5.4-mini',
  'gpt-5.4-mini-2026-03-17',
  { id: 'gpt-4o-mini', shutdownDate: '2027-01-14' },
  { id: 'gpt-5-mini', shutdownDate: '2026-12-11' },
  'gpt-5.4-nano',
  'text-embedding-3-large',
  'gpt-6-luna-realtime',
  'gpt-6-luna-transcribe',
  'gpt-image-2',
  'omni-moderation-latest',
  'tts-1',
]);
