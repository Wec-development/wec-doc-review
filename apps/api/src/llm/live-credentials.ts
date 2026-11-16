import { type LlmProvider, llmProviderSchema } from '@doc-review/shared';

/**
 * Test-only credentials for the live checks (`pnpm test:live`, `pnpm llm:models`), read from the
 * shell so the app's encrypted settings are never involved. Never set in CI. Never printed.
 */
export function liveTestCredentials(env: NodeJS.ProcessEnv = process.env): {
  provider: LlmProvider;
  apiKey: string;
  model: string | undefined;
} {
  const provider = llmProviderSchema.safeParse(env.LLM_LIVE_TEST_PROVIDER?.trim());
  const apiKey = env.LLM_LIVE_TEST_KEY?.trim();
  if (!provider.success || !apiKey) {
    throw new Error(
      'Set LLM_LIVE_TEST_PROVIDER (anthropic | openai) and LLM_LIVE_TEST_KEY in your shell',
    );
  }
  return { provider: provider.data, apiKey, model: env.LLM_LIVE_TEST_MODEL?.trim() || undefined };
}
