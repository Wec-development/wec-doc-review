import { llmSaveRequestSchema, llmTestRequestSchema } from '@doc-review/shared';
import type { FastifyInstance } from 'fastify';
import { createRateLimiter } from '../http/rate-limit.js';
import {
  getLlmSettings,
  saveLlmSettings,
  type SettingsDeps,
  testLlmConnection,
} from '../services/settings.service.js';

const TESTS_PER_MINUTE = 10;

/**
 * LLM settings. There is no authentication in this app (see README): anyone who can reach the
 * API can change these. Responses never contain the API key, only its last 4 characters.
 */
export function registerSettingsRoutes(app: FastifyInstance, deps: SettingsDeps): void {
  const consumeTest = createRateLimiter({ limit: TESTS_PER_MINUTE, windowMs: 60_000 });

  app.get('/settings/llm', async () => getLlmSettings(deps));

  app.post('/settings/llm/test', async (request) => {
    consumeTest(request.ip);
    return testLlmConnection(deps, llmTestRequestSchema.parse(request.body));
  });

  app.put('/settings/llm', async (request) =>
    saveLlmSettings(deps, llmSaveRequestSchema.parse(request.body)),
  );
}
