import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadConfig } from '../config.js';
import { createDb } from '../db.js';
import { createDatabase } from './client.js';

// Resolves to apps/api/drizzle from both src/db (tsx) and dist/db (built).
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

async function runMigrations(): Promise<void> {
  const config = loadConfig();
  const pool = createDb(config.DATABASE_URL);
  try {
    await migrate(createDatabase(pool), { migrationsFolder });
    console.info('Migrations applied');
  } finally {
    await pool.end();
  }
}

try {
  await runMigrations();
} catch (error) {
  console.error('Migration failed:', error);
  process.exitCode = 1;
}
