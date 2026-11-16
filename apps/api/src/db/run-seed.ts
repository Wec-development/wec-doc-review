import { loadConfig } from '../config.js';
import { describeSeed, seedFromFixtures } from './seed-from-fixtures.js';

try {
  console.info(describeSeed(await seedFromFixtures(loadConfig())));
} catch (error) {
  console.error('Seed failed:', error);
  process.exitCode = 1;
}
