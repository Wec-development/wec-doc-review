import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests share one Postgres; running files one at a time keeps table locks
    // (e.g. the seed test's TRUNCATE inside its rolled-back transaction) from deadlocking.
    fileParallelism: false,
  },
});
