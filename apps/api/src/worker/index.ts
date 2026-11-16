import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { loadConfig } from '../config.js';
import { resolveEncryptionKey } from '../crypto/encryption-key.js';
import { createDb } from '../db.js';
import { createDatabase } from '../db/client.js';
import { createExtractor } from '../extraction/create-extractor.js';
import { LlmSettingsResolver } from '../llm/settings-resolver.js';
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

/** Logs once when extraction pauses (no LLM configured) and once when it resumes. */
function logPauseChanges(canClaim: () => Promise<boolean>): () => Promise<boolean> {
  let paused: boolean | null = null;
  return async () => {
    const allowed = await canClaim();
    if (paused !== !allowed) {
      paused = !allowed;
      if (paused) logger.warn('Extraction paused — configure an LLM in Settings');
      else if (config.EXTRACTOR === 'llm') logger.info('LLM configured; extraction running');
    }
    return allowed;
  };
}

let worker: Worker;
try {
  // Fails fast if the key that decrypts the stored API key is unavailable.
  const encryptionKey = resolveEncryptionKey({
    envKey: config.APP_ENCRYPTION_KEY,
    secretsDir: config.SECRETS_DIR,
  });
  const settings = new LlmSettingsResolver({
    db,
    encryptionKey,
    timeoutMs: config.LLM_TIMEOUT_MS,
  });
  const { extractor, canClaim } = createExtractor(config, settings);
  worker = new Worker(
    {
      db,
      extractor,
      logger,
      workerId,
      settings: {
        leaseSeconds: config.JOB_LEASE_SECONDS,
        maxAttempts: config.JOB_MAX_ATTEMPTS,
        backoffBaseMs: config.JOB_BACKOFF_BASE_MS,
      },
    },
    {
      concurrency: config.WORKER_CONCURRENCY,
      pollIntervalMs: config.WORKER_POLL_INTERVAL_MS,
      canClaim: logPauseChanges(canClaim),
    },
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
