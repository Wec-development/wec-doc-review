import { claimNextJob } from '../repositories/jobs.repository.js';
import type { Logger } from './logger.js';
import { type JobOutcome, type ProcessDeps, processJob } from './process-job.js';

export interface WorkerOptions {
  concurrency: number;
  pollIntervalMs: number;
}

/** Resolves after `ms`, or as soon as `signal` aborts. */
function idle(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}

/**
 * Runs `concurrency` independent slots, each claiming and processing one job at a time and
 * polling when the queue is empty. Postgres (SKIP LOCKED + leases) coordinates slots and
 * workers; there is no shared in-memory state between them.
 */
export class Worker {
  private readonly stopRequested = new AbortController();
  private readonly shutdownInFlight = new AbortController();
  private slots: Promise<void>[] = [];
  private readonly log: Logger;

  constructor(
    private readonly deps: ProcessDeps,
    private readonly options: WorkerOptions,
  ) {
    this.log = deps.logger;
  }

  /** Claims and processes at most one job. Returns null when nothing was claimable. */
  async runOnce(): Promise<JobOutcome | null> {
    const job = await claimNextJob(
      this.deps.db,
      this.deps.workerId,
      this.deps.settings.leaseSeconds,
    );
    if (!job) {
      return null;
    }
    return processJob(this.deps, job, this.shutdownInFlight.signal);
  }

  start(): void {
    this.slots = Array.from({ length: this.options.concurrency }, (_, slot) => this.runSlot(slot));
  }

  /**
   * Stops claiming, waits up to `timeoutMs` for in-flight jobs, then aborts the rest, which
   * release their jobs back to the queue (fenced).
   */
  async stop(timeoutMs: number): Promise<void> {
    this.stopRequested.abort();
    const allSlots = Promise.all(this.slots);
    const finishedInTime = await Promise.race([
      allSlots.then(() => true),
      idle(timeoutMs, new AbortController().signal).then(() => false),
    ]);
    if (!finishedInTime) {
      this.log.warn('Shutdown timeout reached; releasing in-flight jobs', { timeoutMs });
      this.shutdownInFlight.abort();
      await allSlots;
    }
  }

  private async runSlot(slot: number): Promise<void> {
    const stop = this.stopRequested.signal;
    while (!stop.aborted) {
      try {
        const outcome = await this.runOnce();
        if (outcome === null) {
          await idle(this.options.pollIntervalMs, stop);
        }
      } catch (error) {
        // Claiming failed (e.g. the database restarted). Keep the slot alive and try again.
        this.log.error('Claim failed; retrying after the poll interval', { slot, err: error });
        await idle(this.options.pollIntervalMs, stop);
      }
    }
  }
}
