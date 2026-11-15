import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Where uploaded PDFs live. Keys are relative, slash-separated paths such as `<doc>/v1-<sha>.pdf`. */
export interface FileStorage {
  write(key: string, contents: Buffer): Promise<void>;
  /** Removes the file; succeeds if it does not exist. */
  remove(key: string): Promise<void>;
  /** Absolute path for readers such as the extraction worker. */
  resolve(key: string): string;
}

export function versionFileKey(documentId: string, versionNo: number, sha256: string): string {
  return `${documentId}/v${versionNo}-${sha256}.pdf`;
}

export class LocalDiskStorage implements FileStorage {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = path.resolve(rootDir);
  }

  resolve(key: string): string {
    const resolved = path.resolve(this.root, key);
    // Keys are built internally, but never let one escape the storage root.
    if (!resolved.startsWith(this.root + path.sep)) {
      throw new Error(`Storage key escapes the storage root: ${key}`);
    }
    return resolved;
  }

  async write(key: string, contents: Buffer): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}
