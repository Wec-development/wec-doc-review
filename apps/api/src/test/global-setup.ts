import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { loadConfig } from '../config.js';
import { applyMigrations } from '../db/migrations.js';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

const SAFE_DATABASE_NAME = /^[A-Za-z0-9_]+$/;

/** The dev database name with a `_test` suffix, on the same server (e.g. app -> app_test). */
export function testDatabaseUrl(baseUrl: string): { url: string; name: string } {
  const url = new URL(baseUrl);
  const baseName = url.pathname.replace(/^\//, '');
  const name = baseName.endsWith('_test') ? baseName : `${baseName}_test`;
  if (!SAFE_DATABASE_NAME.test(name)) {
    throw new Error(`Refusing to use test database name "${name}"`);
  }
  url.pathname = `/${name}`;
  return { url: url.toString(), name };
}

async function ensureDatabaseExists(serverUrl: string, name: string): Promise<void> {
  const client = new pg.Client({ connectionString: serverUrl });
  await client.connect();
  try {
    const existing = await client.query('select 1 from pg_database where datname = $1', [name]);
    if (existing.rowCount === 0) {
      // Name is validated above; identifiers cannot be bound as parameters.
      await client.query(`create database "${name}"`);
    }
  } finally {
    await client.end();
  }
}

/**
 * Tests run against a separate `<db>_test` database in the same Postgres, created and migrated
 * here, so truncating between tests never touches the developer's data.
 */
export default async function setup(project: TestProject): Promise<void> {
  const baseUrl = loadConfig().DATABASE_URL;
  const { url, name } = testDatabaseUrl(baseUrl);
  await ensureDatabaseExists(baseUrl, name);
  await applyMigrations(url);
  project.provide('databaseUrl', url);
}
