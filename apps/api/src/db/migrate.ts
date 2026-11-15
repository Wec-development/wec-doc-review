import { loadConfig } from '../config.js';
import { applyMigrations } from './migrations.js';

try {
  await applyMigrations(loadConfig().DATABASE_URL);
  console.info('Migrations applied');
} catch (error) {
  console.error('Migration failed:', error);
  process.exitCode = 1;
}
