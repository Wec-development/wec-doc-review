import { sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import type { Extractor } from '../extraction/extractor.js';
import { FakeExtractor } from '../extraction/fake-extractor.js';
import { createLogger } from '../worker/logger.js';
import type { JobOutcome, JobSettings } from '../worker/process-job.js';
import { Worker } from '../worker/worker.js';

export const silentLogger = createLogger({}, () => undefined);

/** A real Worker against the test database, with no backoff and a quiet logger. */
export function makeTestWorker(
  db: Database,
  input: { extractor?: Extractor; workerId?: string; settings?: Partial<JobSettings> } = {},
): Worker {
  return new Worker(
    {
      db,
      extractor: input.extractor ?? new FakeExtractor(),
      logger: silentLogger,
      workerId: input.workerId ?? 'worker-test',
      settings: { leaseSeconds: 30, maxAttempts: 3, backoffBaseMs: 0, ...input.settings },
    },
    { concurrency: 1, pollIntervalMs: 20 },
  );
}

/** Runs the worker until the queue is empty and returns every outcome, in order. */
export async function drain(worker: Worker, maxJobs = 20): Promise<JobOutcome[]> {
  const outcomes: JobOutcome[] = [];
  for (let outcome = await worker.runOnce(); outcome !== null; outcome = await worker.runOnce()) {
    outcomes.push(outcome);
    if (outcomes.length > maxJobs) throw new Error(`Queue did not drain after ${maxJobs} jobs`);
  }
  return outcomes;
}

/**
 * Simulates a crashed worker whose lease ran out, using database time (the same clock the
 * claim query uses), so the test never sleeps through a real lease.
 */
export async function expireLease(db: Database, jobId: string): Promise<void> {
  await db.execute(
    sql`update extraction_jobs set locked_until = now() - interval '1 second' where id = ${jobId}`,
  );
}
