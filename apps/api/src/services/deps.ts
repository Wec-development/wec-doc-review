import type { Database } from '../db/client.js';
import type { FileStorage } from '../storage/file-storage.js';

export interface ServiceDeps {
  db: Database;
  storage: FileStorage;
}
