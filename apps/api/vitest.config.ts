import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Creates and migrates the <db>_test database; tests never touch the dev database.
    globalSetup: ['./src/test/global-setup.ts'],
    // Live tests call the real LLM provider; they only run via `pnpm test:live`.
    exclude: [...configDefaults.exclude, 'src/**/*.live.test.ts'],
    // Integration tests share one Postgres; running files one at a time keeps table locks
    // (TRUNCATE between tests) from deadlocking and keeps tests deterministic.
    fileParallelism: false,
  },
});
