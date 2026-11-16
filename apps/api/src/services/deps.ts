import type { Database } from '../db/client.js';
import type { FileStorage } from '../storage/file-storage.js';

export interface ServiceDeps {
  db: Database;
  storage: FileStorage;
  /** Where seeded fixture PDFs live (their file_path starts with `fixtures/`). */
  fixturesDir?: string;
}
