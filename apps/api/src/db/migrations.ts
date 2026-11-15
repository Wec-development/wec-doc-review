import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from '../db.js';
import { createDatabase } from './client.js';

// Resolves to apps/api/drizzle from both src/db (tsx) and dist/db (built).
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

export async function applyMigrations(databaseUrl: string): Promise<void> {
  const pool = createDb(databaseUrl);
  try {
    await migrate(createDatabase(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}
