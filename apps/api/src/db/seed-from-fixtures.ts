import type { Config } from '../config.js';
import { createDb } from '../db.js';
import { resolveFixturesDir } from '../fixtures-dir.js';
import { createDatabase } from './client.js';
import { readFixtureManifest, type SeedSummary, seedFixtures } from './seed.js';

/** Seeds version 1 of every fixture document in one transaction. Safe to run repeatedly. */
export async function seedFromFixtures(
  config: Pick<Config, 'DATABASE_URL' | 'FIXTURES_DIR'>,
): Promise<SeedSummary> {
  const manifest = await readFixtureManifest(resolveFixturesDir(config));
  const pool = createDb(config.DATABASE_URL);
  try {
    return await createDatabase(pool).transaction((tx) => seedFixtures(tx, manifest));
  } finally {
    await pool.end();
  }
}

export function describeSeed(summary: SeedSummary): string {
  return (
    `Seed: inserted ${summary.inserted.length} [${summary.inserted.join(', ')}], ` +
    `skipped ${summary.skipped.length} [${summary.skipped.join(', ')}]`
  );
}
