import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.js';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      // Behaviour is asserted through roles and text, so stable class names are not needed.
      css: { modules: { classNameStrategy: 'non-scoped' } },
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx'],
        reporter: ['text-summary', 'json-summary', 'html'],
        // Gates the review-state logic the UI is built on; the rest is reported, not gated.
        thresholds: {
          'src/lib/status.ts': { lines: 90, branches: 90 },
          'src/lib/group-values.ts': { lines: 90, branches: 90 },
        },
      },
    },
  }),
);
