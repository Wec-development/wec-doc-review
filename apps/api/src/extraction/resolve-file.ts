import path from 'node:path';
import type { FileStorage } from '../storage/file-storage.js';

const FIXTURE_PREFIX = 'fixtures/';

/**
 * A version's file_path is either a storage key (uploads: `<documentId>/v1-<sha>.pdf`) or, for
 * seeded fixtures, a repo-relative `fixtures/...` path. Returns the absolute path to read.
 */
export function createFileResolver(storage: FileStorage, fixturesDir: string) {
  return (filePath: string): string =>
    filePath.startsWith(FIXTURE_PREFIX)
      ? path.join(fixturesDir, filePath.slice(FIXTURE_PREFIX.length))
      : storage.resolve(filePath);
}
