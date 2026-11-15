import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

describe('GET /health', () => {
  it('reports ok when the database answers', async () => {
    const app = buildApp({ db: { query: async () => ({ rows: [] }) } as never });
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', database: 'up' });
  });

  it('returns 503 when the database is unreachable', async () => {
    const app = buildApp({
      db: {
        query: async () => {
          throw new Error('connection refused');
        },
      } as never,
    });
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(503);
  });
});
