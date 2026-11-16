import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { loadConfig } from '../config.js';
import { createDb } from '../db.js';
import { createDatabase } from '../db/client.js';
import { createExtractor } from '../extraction/create-extractor.js';
import { countExpiredLeases } from '../repositories/jobs.repository.js';
import { createLogger } from './logger.js';
import { Worker } from './worker.js';

const config = loadConfig();
const workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
const logger = createLogger({ service: 'worker', workerId });
const pool = createDb(config.DATABASE_URL, (error) =>
  logger.warn('Postgres idle client error', { err: error }),
);
const db = createDatabase(pool);

let worker: Worker;
try {
  worker = new Worker(
    {
      db,
      extractor: createExtractor(config),
      logger,
      workerId,
      settings: {
        leaseSeconds: config.JOB_LEASE_SECONDS,
        maxAttempts: config.JOB_MAX_ATTEMPTS,
        backoffBaseMs: config.JOB_BACKOFF_BASE_MS,
      },
    },
    { concurrency: config.WORKER_CONCURRENCY, pollIntervalMs: config.WORKER_POLL_INTERVAL_MS },
  );
  const expiredLeases = await countExpiredLeases(db);
  logger.info('Worker starting', {
    extractor: config.EXTRACTOR,
    concurrency: config.WORKER_CONCURRENCY,
    leaseSeconds: config.JOB_LEASE_SECONDS,
    maxAttempts: config.JOB_MAX_ATTEMPTS,
    expiredLeasesToRecover: expiredLeases,
  });
  worker.start();
} catch (error) {
  logger.error('Worker failed to start', { err: error });
  await pool.end();
  process.exit(1);
}

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Shutting down', { signal, timeoutMs: config.WORKER_SHUTDOWN_TIMEOUT_MS });
  await worker.stop(config.WORKER_SHUTDOWN_TIMEOUT_MS);
  await pool.end();
  logger.info('Worker stopped');
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
