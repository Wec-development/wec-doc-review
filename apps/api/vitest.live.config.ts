import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Live tests need LLM_API_KEY / LLM_MODEL. Load them from the repo's .env when present (Node's
// built-in loader; values already set in the shell win). Nothing here prints them.
const envFile = new URL('../../.env', import.meta.url);
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

export default defineConfig({
  test: {
    include: ['src/**/*.live.test.ts'],
    testTimeout: 180_000,
  },
});
