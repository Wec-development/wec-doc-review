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
    },
  }),
);
