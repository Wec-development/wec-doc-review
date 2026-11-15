import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { createDb } from '../db.js';
import { createDatabase } from './client.js';
import { readFixtureManifest, seedFixtures } from './seed.js';

// Repo-root fixtures/ from both src/db (tsx) and dist/db (built); override with FIXTURES_DIR.
const defaultFixturesDir = fileURLToPath(new URL('../../../../fixtures', import.meta.url));

async function runSeed(): Promise<void> {
  const config = loadConfig();
  const manifest = await readFixtureManifest(config.FIXTURES_DIR ?? defaultFixturesDir);
  const pool = createDb(config.DATABASE_URL);
  try {
    const summary = await createDatabase(pool).transaction((tx) => seedFixtures(tx, manifest));
    console.info(
      `Seed: inserted ${summary.inserted.length} [${summary.inserted.join(', ')}], ` +
        `skipped ${summary.skipped.length} [${summary.skipped.join(', ')}]`,
    );
  } finally {
    await pool.end();
  }
}

try {
  await runSeed();
} catch (error) {
  console.error('Seed failed:', error);
  process.exitCode = 1;
}
