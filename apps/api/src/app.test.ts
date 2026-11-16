import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { Database } from './db/client.js';
import type { FileStorage } from './storage/file-storage.js';

const unusedStorage: FileStorage = {
  write: async () => undefined,
  remove: async () => undefined,
  resolve: (key) => key,
};

/** Only `execute` is used by /health; the rest of the database is never touched here. */
function fakeDb(execute: () => Promise<unknown>): Database {
  return { execute } as unknown as Database;
}

describe('GET /health', () => {
  it('reports ok when the database answers', async () => {
    const app = buildApp({
      db: fakeDb(async () => ({ rows: [] })),
      storage: unusedStorage,
      encryptionKey: Buffer.alloc(32),
    });
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', database: 'up' });
  });

  it('returns 503 when the database is unreachable', async () => {
    const app = buildApp({
      db: fakeDb(async () => {
        throw new Error('connection refused');
      }),
      storage: unusedStorage,
      encryptionKey: Buffer.alloc(32),
    });
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(503);
  });
});
