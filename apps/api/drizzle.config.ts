import { defineConfig } from 'drizzle-kit';

// Only `drizzle-kit generate` is used; migrations are applied by src/db/migrate.ts.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
});
