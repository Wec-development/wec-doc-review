import { z } from 'zod';

export const LLM_PROVIDERS = ['anthropic', 'openai'] as const;
export const llmProviderSchema = z.enum(LLM_PROVIDERS);
export type LlmProvider = z.infer<typeof llmProviderSchema>;

export const LLM_PROVIDER_LABELS: Record<LlmProvider, string> = {
  anthropic: 'Claude (Anthropic)',
  openai: 'OpenAI',
};

/** An API key as typed: trimmed, no inner whitespace, a sane length. Provider prefixes are
 * checked server-side (apps/api/src/llm/key-format.ts); the provider's answer is the truth. */
export const apiKeyInputSchema = z
  .string()
  .trim()
  .min(20, 'API key looks too short')
  .max(300, 'API key looks too long')
  .regex(/^\S+$/, 'API key must not contain spaces');

/** Response of GET /settings/llm and PUT /settings/llm. Never contains the key itself. */
export const llmSettingsSchema = z.object({
  configured: z.boolean(),
  provider: llmProviderSchema.nullable(),
  model: z.string().nullable(),
  /** Last 4 characters of the stored key, e.g. "a1b2"; shown as "…a1b2". */
  keyHint: z.string().nullable(),
  lastVerifiedAt: z.iso.datetime({ offset: true }).nullable(),
  updatedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type LlmSettings = z.infer<typeof llmSettingsSchema>;

/** Body of POST /settings/llm/test. Without apiKey the stored key is tested. */
export const llmTestRequestSchema = z.object({
  provider: llmProviderSchema,
  apiKey: apiKeyInputSchema.optional(),
});
export type LlmTestRequest = z.infer<typeof llmTestRequestSchema>;

export const llmModelOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  recommended: z.boolean(),
});
export type LlmModelOption = z.infer<typeof llmModelOptionSchema>;

/** Response of POST /settings/llm/test. */
export const llmTestResultSchema = z.object({
  valid: z.literal(true),
  models: z.array(llmModelOptionSchema),
});
export type LlmTestResult = z.infer<typeof llmTestResultSchema>;

/** Body of PUT /settings/llm. apiKey may be omitted only to keep the stored key (same provider). */
export const llmSaveRequestSchema = z.object({
  provider: llmProviderSchema,
  model: z.string().trim().min(1).max(200),
  apiKey: apiKeyInputSchema.optional(),
});
export type LlmSaveRequest = z.infer<typeof llmSaveRequestSchema>;
