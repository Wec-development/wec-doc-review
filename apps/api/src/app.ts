import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { sql } from 'drizzle-orm';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Database } from './db/client.js';
import { registerErrorHandling } from './http/error-handler.js';
import { registerDocumentRoutes } from './routes/documents.routes.js';
import { registerValueRoutes } from './routes/values.routes.js';
import type { FileStorage } from './storage/file-storage.js';

const BYTES_PER_MB = 1024 * 1024;

export interface AppOptions {
  /** Browser origin allowed by CORS. */
  webOrigin: string;
  maxUploadMb: number;
}

export interface AppDeps {
  db: Database;
  storage: FileStorage;
  options?: Partial<AppOptions>;
}

const DEFAULT_OPTIONS: AppOptions = { webOrigin: 'http://localhost:5173', maxUploadMb: 10 };

/** Builds the HTTP app without listening, so tests can call it with `app.inject()`. */
export function buildApp({ db, storage, options }: AppDeps): FastifyInstance {
  const { webOrigin, maxUploadMb } = { ...DEFAULT_OPTIONS, ...options };
  // Default request logging (method, url, status, request id) never includes bodies or files.
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  void app.register(cors, { origin: webOrigin });
  void app.register(multipart, {
    limits: { fileSize: maxUploadMb * BYTES_PER_MB, files: 1, fields: 5 },
  });
  registerErrorHandling(app);

  app.get('/health', async (_request, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { status: 'ok', database: 'up' };
    } catch (error) {
      app.log.error({ err: error }, 'Health check: database unreachable');
      return reply.code(503).send({ status: 'error', database: 'down' });
    }
  });

  const deps = { db, storage };
  registerDocumentRoutes(app, deps);
  registerValueRoutes(app, deps);

  return app;
}
