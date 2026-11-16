import { extractionResultSchema } from '@doc-review/shared';
import type { Database } from '../db/client.js';
import { classifyError } from '../extraction/errors.js';
import type { Extractor } from '../extraction/extractor.js';
import {
  type ClaimedJob,
  completeJob,
  failJob,
  findJobStatus,
  releaseJob,
  renewLease,
  scheduleRetry,
} from '../repositories/jobs.repository.js';
import { backoffMs } from './backoff.js';
import type { Logger } from './logger.js';

/**
 * done / retry / failed / superseded: the job reached that state.
 * released: handed back to the queue at shutdown.
 * lease_lost: another worker owns the job now; this run's result was discarded.
 * abandoned: the outcome could not be recorded (e.g. database down); the lease will expire and
 *            the job will be reclaimed.
 */
export type JobOutcome =
  'done' | 'retry' | 'failed' | 'superseded' | 'released' | 'lease_lost' | 'abandoned';

export interface JobSettings {
  leaseSeconds: number;
  maxAttempts: number;
  backoffBaseMs: number;
  /** Heartbeat period; defaults to a third of the lease. */
  heartbeatMs?: number;
  random?: () => number;
}

export interface ProcessDeps {
  db: Database;
  extractor: Extractor;
  logger: Logger;
  workerId: string;
  settings: JobSettings;
}

const SHUTDOWN = new Error('Worker is shutting down');
const LEASE_LOST = new Error('Lease lost to another worker');

/** Keeps the lease alive while the extractor runs; aborts the run if the lease is lost. */
function startHeartbeat(
  deps: ProcessDeps,
  job: ClaimedJob,
  run: AbortController,
  log: Logger,
): () => void {
  const periodMs = deps.settings.heartbeatMs ?? (deps.settings.leaseSeconds * 1000) / 3;
  const timer = setInterval(() => {
    renewLease(deps.db, job.jobId, deps.workerId, deps.settings.leaseSeconds).then(
      (stillOwned) => {
        if (!stillOwned) {
          run.abort(LEASE_LOST);
        }
      },
      (error: unknown) => {
        // The lease may still be valid; if it expires, another worker takes over (fenced).
        log.warn('Heartbeat failed', { err: error });
      },
    );
  }, periodMs);
  return () => clearInterval(timer);
}

/** A fenced write found the job no longer ours: tell "superseded" apart from "lease lost". */
async function lostOwnership(deps: ProcessDeps, job: ClaimedJob): Promise<JobOutcome> {
  const status = await findJobStatus(deps.db, job.jobId);
  return status === 'superseded' ? 'superseded' : 'lease_lost';
}

async function handleFailure(
  deps: ProcessDeps,
  job: ClaimedJob,
  error: unknown,
): Promise<JobOutcome> {
  const { retryable, message } = classifyError(error);
  const { maxAttempts, backoffBaseMs, random } = deps.settings;

  if (retryable && job.attempt < maxAttempts) {
    const delayMs = backoffMs(job.attempt, backoffBaseMs, random);
    const written = await scheduleRetry(deps.db, job, deps.workerId, {
      delayMs,
      error: message,
      versionError: `Attempt ${job.attempt} of ${maxAttempts} failed, retrying: ${message}`,
    });
    return written === 'applied' ? 'retry' : lostOwnership(deps, job);
  }

  const versionError = retryable
    ? `Extraction failed after ${job.attempt} attempts: ${message}`
    : `Extraction failed: ${message}`;
  const written = await failJob(deps.db, job, deps.workerId, { error: message, versionError });
  return written === 'applied' ? 'failed' : lostOwnership(deps, job);
}

async function extractAndComplete(
  deps: ProcessDeps,
  job: ClaimedJob,
  run: AbortController,
): Promise<JobOutcome> {
  try {
    const raw = await deps.extractor.extract({
      versionId: job.versionId,
      documentType: job.documentType,
      filePath: job.filePath,
      signal: run.signal,
    });
    const result = extractionResultSchema.parse(raw);
    const completed = await completeJob(deps.db, job, deps.workerId, result);
    return completed === 'lease_lost' ? lostOwnership(deps, job) : completed;
  } catch (error) {
    if (run.signal.reason === SHUTDOWN) {
      const released = await releaseJob(deps.db, job, deps.workerId);
      return released === 'applied' ? 'released' : lostOwnership(deps, job);
    }
    if (run.signal.reason === LEASE_LOST) {
      return lostOwnership(deps, job);
    }
    return handleFailure(deps, job, error);
  }
}

/**
 * Runs one claimed job to an outcome. Never throws: any failure becomes an outcome and a log
 * line, so one bad job cannot stop the worker.
 */
export async function processJob(
  deps: ProcessDeps,
  job: ClaimedJob,
  shutdown: AbortSignal,
): Promise<JobOutcome> {
  const log = deps.logger.child({
    jobId: job.jobId,
    versionId: job.versionId,
    attempt: job.attempt,
  });
  const startedAt = performance.now();
  const run = new AbortController();
  const onShutdown = () => run.abort(SHUTDOWN);
  shutdown.addEventListener('abort', onShutdown, { once: true });
  if (shutdown.aborted) onShutdown();
  const stopHeartbeat = startHeartbeat(deps, job, run, log);

  if (job.reclaimed) {
    log.warn('Reclaimed a job whose lease had expired');
  }

  let outcome: JobOutcome;
  try {
    if (job.attempt > deps.settings.maxAttempts) {
      // The job kept dying mid-run (crash or lost lease) until it ran out of attempts.
      outcome = await handleFailure(
        deps,
        job,
        new Error(`Gave up after ${deps.settings.maxAttempts} attempts that never finished`),
      );
    } else {
      outcome = await extractAndComplete(deps, job, run);
    }
  } catch (error) {
    log.error('Could not record the job outcome; the lease will expire and it will be retried', {
      err: error,
    });
    outcome = 'abandoned';
  } finally {
    stopHeartbeat();
    shutdown.removeEventListener('abort', onShutdown);
  }

  const durationMs = Math.round(performance.now() - startedAt);
  const level = outcome === 'done' || outcome === 'released' ? 'info' : 'warn';
  log[level]('Job finished', { outcome, durationMs });
  return outcome;
}
