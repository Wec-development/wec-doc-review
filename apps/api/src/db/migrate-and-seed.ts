import { loadConfig } from '../config.js';
import { applyMigrations } from './migrations.js';
import { describeSeed, seedFromFixtures } from './seed-from-fixtures.js';

/**
 * The one-shot `migrate` container: applies pending migrations, then seeds version 1 of the
 * fixtures. Both steps are idempotent (applied migrations are skipped; seeded documents are
 * found by fixture key), so it runs on every `docker compose up`. Exit code 0 lets the api and
 * worker start; anything else keeps them from starting against a half-migrated database.
 */
const config = loadConfig();
try {
  await applyMigrations(config.DATABASE_URL);
  console.info('Migrations applied');
  console.info(describeSeed(await seedFromFixtures(config)));
} catch (error) {
  console.error('Migrate and seed failed:', error);
  process.exitCode = 1;
}
