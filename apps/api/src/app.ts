import Fastify, { type FastifyInstance } from 'fastify';
import type { Db } from './db.js';

export interface AppDeps {
  db: Pick<Db, 'query'>;
}

/** Builds the HTTP app without listening, so tests can call it with `app.inject()`. */
export function buildApp({ db }: AppDeps): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  app.get('/health', async (_request, reply) => {
    try {
      await db.query('SELECT 1');
      return { status: 'ok', database: 'up' };
    } catch (error) {
      app.log.error({ err: error }, 'Health check: database unreachable');
      return reply.code(503).send({ status: 'error', database: 'down' });
    }
  });

  // Routes to add: POST /documents, POST /documents/:id/versions, GET /documents,
  // GET /documents/:id, GET /documents/:id/progress, POST /values/:id/review.

  return app;
}
