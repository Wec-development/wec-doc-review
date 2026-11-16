import { fileURLToPath } from 'node:url';
import type { Config } from './config.js';

// Repo-root fixtures/ from both src/ (tsx) and dist/ (built).
const REPO_FIXTURES_DIR = fileURLToPath(new URL('../../../fixtures', import.meta.url));

/** FIXTURES_DIR when set (e.g. in a container), otherwise the repo's fixtures/ folder. */
export function resolveFixturesDir(config: Pick<Config, 'FIXTURES_DIR'>): string {
  return config.FIXTURES_DIR ?? REPO_FIXTURES_DIR;
}
