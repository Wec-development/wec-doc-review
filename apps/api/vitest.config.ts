import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Three layers, each its own Vitest project:
 * - unit: pure logic, no database (`src/**\/*.test.ts`)
 * - integration: real Postgres (`src/**\/*.int.test.ts`)
 * - e2e: HTTP + real worker + real PDF parsing + recorded LLM (`test/e2e/**\/*.e2e.test.ts`)
 * Live tests call the real LLM provider and only run via `pnpm test:live`.
 */
const databaseProject = {
  // Creates and migrates the <db>_test database; tests never touch the dev database.
  globalSetup: ['./src/test/global-setup.ts'],
  // Database tests share one Postgres; running files one at a time keeps table locks
  // (TRUNCATE between tests) from deadlocking and keeps tests deterministic.
  fileParallelism: false,
};

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/test/**',
        'src/index.ts',
        'src/worker/index.ts',
        'src/db/run-*.ts',
      ],
      reporter: ['text-summary', 'json-summary', 'html'],
      // Gates only the modules the client's tests depend on; the rest is reported, not gated.
      thresholds: {
        'src/extraction/validate/verify-fields.ts': { lines: 90, branches: 90 },
        'src/extraction/validate/value-support.ts': { lines: 90, branches: 90 },
        'src/extraction/normalise/match-text.ts': { lines: 90, branches: 90 },
        'src/extraction/carry-over/compare-versions.ts': { lines: 90, branches: 90 },
        'src/repositories/jobs.repository.ts': { lines: 90, branches: 90 },
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          sequence: { groupOrder: 0 },
          include: ['src/**/*.test.ts'],
          exclude: [...configDefaults.exclude, 'src/**/*.int.test.ts', 'src/**/*.live.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          // Integration and e2e both truncate the test database, so they never run at once.
          sequence: { groupOrder: 1 },
          include: ['src/**/*.int.test.ts'],
          ...databaseProject,
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          sequence: { groupOrder: 2 },
          include: ['test/e2e/**/*.e2e.test.ts'],
          testTimeout: 30_000,
          ...databaseProject,
        },
      },
    ],
  },
});
