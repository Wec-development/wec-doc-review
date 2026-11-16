import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      // Reported, not gated: the schemas are exercised through the API and web tests.
      reporter: ['text-summary', 'json-summary'],
    },
  },
});
