import type { Database, Transaction } from '../db/client.js';
import type { FileStorage } from '../storage/file-storage.js';

/**
 * Runs `work` in a transaction that may write one file. The file is written before the commit;
 * if anything fails (including the commit), the file is removed so no orphan stays on disk.
 */
export async function inTransactionWithFile<T>(
  db: Database,
  storage: FileStorage,
  work: (
    tx: Transaction,
    writeFile: (key: string, contents: Buffer) => Promise<void>,
  ) => Promise<T>,
): Promise<T> {
  let writtenKey: string | undefined;
  const writeFile = async (key: string, contents: Buffer) => {
    // Recorded before writing, so a partial write is cleaned up too.
    writtenKey = key;
    await storage.write(key, contents);
  };

  try {
    return await db.transaction((tx) => work(tx, writeFile));
  } catch (error) {
    if (writtenKey !== undefined) {
      try {
        await storage.remove(writtenKey);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          `Upload failed and its file ${writtenKey} could not be removed`,
          { cause: cleanupError },
        );
      }
    }
    throw error;
  }
}
