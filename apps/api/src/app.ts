import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { sql } from 'drizzle-orm';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { Database } from './db/client.js';
import { registerErrorHandling } from './http/error-handler.js';
import { registerDocumentRoutes } from './routes/documents.routes.js';
import { registerSettingsRoutes } from './routes/settings.routes.js';
import { registerValueRoutes } from './routes/values.routes.js';
import type { ListModels } from './services/settings.service.js';
import type { FileStorage } from './storage/file-storage.js';

const BYTES_PER_MB = 1024 * 1024;

export interface AppOptions {
  /** Browser origin allowed by CORS. */
  webOrigin: string;
  maxUploadMb: number;
  /** Trust X-Forwarded-For from a reverse proxy (nginx) for the client IP. */
  trustProxy: boolean;
}

export interface AppDeps {
  db: Database;
  storage: FileStorage;
  /** Encrypts stored LLM API keys (src/crypto/encryption-key.ts); never stored in the DB. */
  encryptionKey: Buffer;
  options?: Partial<AppOptions>;
  /** Overrides the provider list-models call (tests replay recorded responses). */
  listModels?: ListModels;
  /** Overrides the logger (tests capture output to prove keys are redacted). */
  logger?: FastifyServerOptions['logger'];
}

/** Anything that may carry an API key is censored before a log line is written. */
export const REDACTED_LOG_PATHS = [
  'apiKey',
  '*.apiKey',
  'body.apiKey',
  'req.body.apiKey',
  'req.headers.authorization',
  'req.headers["x-api-key"]',
];

const DEFAULT_OPTIONS: AppOptions = {
  webOrigin: 'http://localhost:5173',
  maxUploadMb: 10,
  trustProxy: false,
};

/** Builds the HTTP app without listening, so tests can call it with `app.inject()`. */
export function buildApp(deps: AppDeps): FastifyInstance {
  const { db, storage, options } = deps;
  const { webOrigin, maxUploadMb, trustProxy } = { ...DEFAULT_OPTIONS, ...options };
  // Default request logging (method, url, status, request id) never includes bodies or files;
  // redaction is a second guard for anything that might carry an API key.
  const app = Fastify({
    trustProxy,
    logger: deps.logger ?? (process.env.NODE_ENV !== 'test' && { redact: REDACTED_LOG_PATHS }),
  });

  void app.register(cors, { origin: webOrigin, methods: ['GET', 'HEAD', 'POST', 'PUT'] });
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

  const serviceDeps = { db, storage };
  registerDocumentRoutes(app, serviceDeps);
  registerValueRoutes(app, serviceDeps);
  registerSettingsRoutes(app, {
    db,
    encryptionKey: deps.encryptionKey,
    ...(deps.listModels ? { listModels: deps.listModels } : {}),
  });

  return app;
}
