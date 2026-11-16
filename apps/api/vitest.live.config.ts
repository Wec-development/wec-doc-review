import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Live tests need LLM_LIVE_TEST_PROVIDER / LLM_LIVE_TEST_MODEL / LLM_LIVE_TEST_KEY (test-only;
// the app itself reads its key from Settings). Values set in the shell win; a repo .env is also
// loaded with Node's built-in loader when present. Nothing here prints them.
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
