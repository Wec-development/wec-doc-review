import { retryAcceptedSchema } from '@doc-review/shared';
import { count, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { documentVersions, extractedValues, extractionJobs } from '../db/schema.js';
import type { Extractor } from '../extraction/extractor.js';
import { FakeExtractor } from '../extraction/fake-extractor.js';
import {
  claimNextJob,
  completeJob,
  failJob,
  type ClaimedJob,
} from '../repositories/jobs.repository.js';
import { connectTestDatabase, resetDatabase, type TestDatabase } from '../test/db.js';
import { makeDocumentWithVersion, makeJob, makeVersion } from '../test/factories.js';
import { createTestApp, uploadVersion } from '../test/http.js';
import { createLogger } from './logger.js';
import { type JobSettings, processJob } from './process-job.js';
import { Worker } from './worker.js';

let testDb: TestDatabase;

beforeAll(() => {
  testDb = connectTestDatabase();
});
afterAll(() => testDb.close());
beforeEach(() => resetDatabase(testDb.db));

const silentLogger = createLogger({}, () => undefined);
const LEASE_SECONDS = 30;

function makeWorker(
  input: { extractor?: Extractor; workerId?: string; settings?: Partial<JobSettings> } = {},
) {
  return new Worker(
    {
      db: testDb.db,
      extractor: input.extractor ?? new FakeExtractor(),
      logger: silentLogger,
      workerId: input.workerId ?? 'worker-a',
      settings: {
        leaseSeconds: LEASE_SECONDS,
        maxAttempts: 3,
        backoffBaseMs: 0,
        ...input.settings,
      },
    },
    { concurrency: 1, pollIntervalMs: 20 },
  );
}

/** An invoice version waiting for extraction, with its queued job. */
async function queuedInvoice() {
  const { documentId, versionId } = await makeDocumentWithVersion(testDb.db, { status: 'queued' });
  const jobId = await makeJob(testDb.db, versionId);
  return { documentId, versionId, jobId };
}

async function jobRow(jobId: string) {
  const [row] = await testDb.db
    .select({
      status: extractionJobs.status,
      attempts: extractionJobs.attempts,
      lockedBy: extractionJobs.lockedBy,
      lockedUntil: extractionJobs.lockedUntil,
      heartbeatAt: extractionJobs.heartbeatAt,
      startedAt: extractionJobs.startedAt,
      finishedAt: extractionJobs.finishedAt,
      lastError: extractionJobs.lastError,
      prompt: extractionJobs.prompt,
      rawResponse: extractionJobs.rawResponse,
      runAfterInFuture: sql<boolean>`${extractionJobs.runAfter} > now()`,
    })
    .from(extractionJobs)
    .where(eq(extractionJobs.id, jobId));
  if (!row) throw new Error(`job ${jobId} not found`);
  return row;
}

async function versionRow(versionId: string) {
  const [row] = await testDb.db
    .select({ status: documentVersions.status, error: documentVersions.error })
    .from(documentVersions)
    .where(eq(documentVersions.id, versionId));
  if (!row) throw new Error(`version ${versionId} not found`);
  return row;
}

async function valueCount(versionId: string): Promise<number> {
  const [row] = await testDb.db
    .select({ n: count() })
    .from(extractedValues)
    .where(eq(extractedValues.versionId, versionId));
  return row?.n ?? 0;
}

/** Simulates a crashed worker: its lease ran out (database time). */
async function expireLease(jobId: string) {
  await testDb.db.execute(
    sql`update extraction_jobs set locked_until = now() - interval '1 second' where id = ${jobId}`,
  );
}

/** Makes a backed-off job due now. */
async function makeDue(jobId: string) {
  await testDb.db.execute(sql`update extraction_jobs set run_after = now() where id = ${jobId}`);
}

async function waitFor(condition: () => Promise<boolean>, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const isRunning = (jobId: string) => async () => (await jobRow(jobId)).status === 'running';

describe('worker: happy path', () => {
  it('claims a queued job, writes values, and marks job done and version extracted', async () => {
    const { versionId, jobId } = await queuedInvoice();

    expect(await makeWorker().runOnce()).toBe('done');

    expect(await valueCount(versionId)).toBe(5);
    expect(await jobRow(jobId)).toMatchObject({
      status: 'done',
      attempts: 1,
      lockedUntil: null,
      lastError: null,
      prompt: expect.stringContaining('invoice_number'),
      rawResponse: expect.objectContaining({ extractor: 'fake' }),
      finishedAt: expect.any(Date),
    });
    expect(await versionRow(versionId)).toEqual({ status: 'extracted', error: null });
  });

  it('returns null when there is nothing to claim', async () => {
    expect(await makeWorker().runOnce()).toBeNull();
  });
});

describe('worker: claiming', () => {
  it('never gives the same job to two concurrent claimers', async () => {
    const jobIds = await Promise.all(
      Array.from({ length: 10 }, async () => (await queuedInvoice()).jobId),
    );

    const claims = await Promise.all(
      Array.from({ length: 12 }, (_, i) => claimNextJob(testDb.db, `worker-${i}`, LEASE_SECONDS)),
    );

    const claimed = claims.filter((job): job is ClaimedJob => job !== null).map((job) => job.jobId);
    expect(claimed).toHaveLength(10);
    expect(new Set(claimed).size).toBe(10);
    expect(new Set(claimed)).toEqual(new Set(jobIds));
    expect(claims.filter((job) => job === null)).toHaveLength(2);
  });

  it('reclaims a running job whose lease expired, counting a new attempt', async () => {
    const { jobId, versionId } = await queuedInvoice();
    const first = await claimNextJob(testDb.db, 'worker-a', LEASE_SECONDS);
    expect(first).toMatchObject({ jobId, attempt: 1, reclaimed: false });
    expect(await versionRow(versionId)).toMatchObject({ status: 'extracting' });

    expect(await claimNextJob(testDb.db, 'worker-b', LEASE_SECONDS)).toBeNull();
    await expireLease(jobId);
    const second = await claimNextJob(testDb.db, 'worker-b', LEASE_SECONDS);

    expect(second).toMatchObject({ jobId, attempt: 2, reclaimed: true });
    expect(await jobRow(jobId)).toMatchObject({
      status: 'running',
      lockedBy: 'worker-b',
      attempts: 2,
    });
  });

  it('fails a job that keeps losing its worker once attempts are exhausted', async () => {
    const { jobId, versionId } = await queuedInvoice();
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await claimNextJob(testDb.db, `crashing-${attempt}`, LEASE_SECONDS);
      await expireLease(jobId);
    }

    expect(await makeWorker().runOnce()).toBe('failed');

    expect(await jobRow(jobId)).toMatchObject({ status: 'failed', attempts: 4 });
    expect((await versionRow(versionId)).error).toMatch(/Gave up after 3 attempts/);
  });
});

describe('worker: leases and fencing', () => {
  it('keeps a slow job leased with heartbeats past the original lease window', async () => {
    const { jobId } = await queuedInvoice();
    const slowWorker = makeWorker({
      extractor: new FakeExtractor({ delayMs: 2500 }),
      settings: { leaseSeconds: 1, heartbeatMs: 200 },
    });

    const running = slowWorker.runOnce();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const rival = await claimNextJob(testDb.db, 'worker-b', 1);

    expect(rival).toBeNull();
    expect(await running).toBe('done');
    expect(await jobRow(jobId)).toMatchObject({ status: 'done', attempts: 1 });
  });

  it('discards the result of a worker that lost its lease (fenced writes change nothing)', async () => {
    const { jobId, versionId } = await queuedInvoice();
    const zombie = await claimNextJob(testDb.db, 'worker-a', LEASE_SECONDS);
    if (!zombie) throw new Error('expected a claim');
    await expireLease(jobId);
    await claimNextJob(testDb.db, 'worker-b', LEASE_SECONDS);
    const result = await new FakeExtractor().extract({
      ...zombie,
      signal: new AbortController().signal,
    });

    expect(await completeJob(testDb.db, zombie, 'worker-a', result)).toBe('lease_lost');
    expect(await failJob(testDb.db, zombie, 'worker-a', { error: 'x', versionError: 'x' })).toBe(
      'lease_lost',
    );
    expect(await jobRow(jobId)).toMatchObject({ status: 'running', lockedBy: 'worker-b' });
    expect(await valueCount(versionId)).toBe(0);
  });

  it('aborts a running extraction when the heartbeat finds the lease taken', async () => {
    const { jobId, versionId } = await queuedInvoice();
    const job = await claimNextJob(testDb.db, 'worker-a', LEASE_SECONDS);
    if (!job) throw new Error('expected a claim');

    const outcome = processJob(
      {
        db: testDb.db,
        extractor: new FakeExtractor({ delayMs: 5000 }),
        logger: silentLogger,
        workerId: 'worker-a',
        settings: {
          leaseSeconds: LEASE_SECONDS,
          maxAttempts: 3,
          backoffBaseMs: 0,
          heartbeatMs: 50,
        },
      },
      job,
      new AbortController().signal,
    );
    await expireLease(jobId);
    await claimNextJob(testDb.db, 'worker-b', LEASE_SECONDS);

    expect(await outcome).toBe('lease_lost');
    expect(await jobRow(jobId)).toMatchObject({ status: 'running', lockedBy: 'worker-b' });
    expect(await valueCount(versionId)).toBe(0);
  });
});

describe('worker: failures and retries', () => {
  it('re-queues a retryable failure with backoff, then succeeds on a later attempt', async () => {
    const { jobId, versionId } = await queuedInvoice();
    const worker = makeWorker({
      extractor: new FakeExtractor({ failuresBeforeSuccess: 1 }),
      settings: { backoffBaseMs: 60_000 },
    });

    expect(await worker.runOnce()).toBe('retry');
    expect(await jobRow(jobId)).toMatchObject({
      status: 'queued',
      lockedBy: null,
      runAfterInFuture: true,
      lastError: 'Fake extractor: simulated rate limit',
    });
    expect(await versionRow(versionId)).toEqual({
      status: 'queued',
      error: 'Attempt 1 of 3 failed, retrying: Fake extractor: simulated rate limit',
    });
    expect(await worker.runOnce()).toBeNull();

    await makeDue(jobId);
    expect(await worker.runOnce()).toBe('done');
    expect(await jobRow(jobId)).toMatchObject({ status: 'done', attempts: 2 });
    expect(await versionRow(versionId)).toEqual({ status: 'extracted', error: null });
  });

  it('fails job and version after max attempts, and the retry endpoint re-queues it', async () => {
    const { documentId, versionId, jobId } = await queuedInvoice();
    const failing = makeWorker({ extractor: new FakeExtractor({ behavior: 'retryable' }) });

    const outcomes = [await failing.runOnce(), await failing.runOnce(), await failing.runOnce()];

    expect(outcomes).toEqual(['retry', 'retry', 'failed']);
    expect(await jobRow(jobId)).toMatchObject({ status: 'failed', attempts: 3 });
    expect(await versionRow(versionId)).toEqual({
      status: 'failed',
      error: 'Extraction failed after 3 attempts: Fake extractor: simulated timeout',
    });

    const testApp = await createTestApp(testDb.db);
    try {
      const response = await testApp.app.inject({
        method: 'POST',
        url: `/documents/${documentId}/retry`,
      });
      expect(response.statusCode).toBe(202);
      expect(retryAcceptedSchema.parse(response.json()).versionId).toBe(versionId);
    } finally {
      await testApp.close();
    }

    expect(await makeWorker().runOnce()).toBe('done');
    expect(await versionRow(versionId)).toEqual({ status: 'extracted', error: null });
  });

  it('fails a permanent error immediately, without retrying', async () => {
    const { jobId, versionId } = await queuedInvoice();
    const worker = makeWorker({ extractor: new FakeExtractor({ behavior: 'permanent' }) });

    expect(await worker.runOnce()).toBe('failed');
    expect(await worker.runOnce()).toBeNull();
    expect(await jobRow(jobId)).toMatchObject({ status: 'failed', attempts: 1 });
    expect(await versionRow(versionId)).toEqual({
      status: 'failed',
      error: 'Extraction failed: Fake extractor: simulated unreadable PDF',
    });
  });

  it('fails permanently when the extractor returns output that breaks the contract', async () => {
    const { versionId } = await queuedInvoice();
    const broken: Extractor = {
      extract: async () => ({
        fields: [{ field: 'due_date', value: '2025-01-01', evidence: null, gapReason: null }],
        prompt: 'p',
        promptVersion: null,
        model: null,
        rawResponse: {},
        usage: null,
        durationMs: null,
        parsedText: null,
      }),
    };

    expect(await makeWorker({ extractor: broken }).runOnce()).toBe('failed');
    expect((await versionRow(versionId)).error).toMatch(/invalid output/);
    expect(await valueCount(versionId)).toBe(0);
  });

  it('keeps running after a job throws something unexpected', async () => {
    const bad = await queuedInvoice();
    const good = await queuedInvoice();
    const fake = new FakeExtractor();
    const extractor: Extractor = {
      extract: (input) =>
        input.versionId === bad.versionId
          ? Promise.reject(new TypeError('cannot read properties of undefined'))
          : fake.extract(input),
    };
    const worker = makeWorker({ extractor, settings: { maxAttempts: 1 } });

    worker.start();
    await waitFor(async () => (await jobRow(good.jobId)).status === 'done');
    await worker.stop(1000);

    expect(await jobRow(bad.jobId)).toMatchObject({ status: 'failed' });
    expect(await valueCount(good.versionId)).toBe(5);
  });
});

describe('worker: supersede and idempotency', () => {
  it('supersedes a job when a new version is uploaded mid-extraction; no values for the old one', async () => {
    const { documentId, versionId, jobId } = await queuedInvoice();
    const running = makeWorker({ extractor: new FakeExtractor({ delayMs: 400 }) }).runOnce();
    await waitFor(isRunning(jobId));

    const testApp = await createTestApp(testDb.db);
    try {
      expect((await uploadVersion(testApp.app, documentId)).statusCode).toBe(202);
    } finally {
      await testApp.close();
    }

    expect(await running).toBe('superseded');
    expect(await valueCount(versionId)).toBe(0);
    expect(await jobRow(jobId)).toMatchObject({ status: 'superseded' });
    expect(await versionRow(versionId)).toMatchObject({ status: 'superseded' });
  });

  it('re-checks for a newer version before writing results', async () => {
    const { documentId, versionId, jobId } = await queuedInvoice();
    const running = makeWorker({ extractor: new FakeExtractor({ delayMs: 300 }) }).runOnce();
    await waitFor(isRunning(jobId));
    // A newer version that did not go through the upload service (so nothing was superseded).
    await makeVersion(testDb.db, documentId, { versionNo: 2, status: 'queued' });

    expect(await running).toBe('superseded');
    expect(await jobRow(jobId)).toMatchObject({
      status: 'superseded',
      finishedAt: expect.any(Date),
    });
    expect(await versionRow(versionId)).toMatchObject({ status: 'superseded' });
    expect(await valueCount(versionId)).toBe(0);
  });

  it('never duplicates values when the same version is extracted twice', async () => {
    const { versionId } = await queuedInvoice();
    const worker = makeWorker();
    expect(await worker.runOnce()).toBe('done');
    expect(await valueCount(versionId)).toBe(5);

    // A second run for the same version (e.g. a manual retry after a crash).
    await testDb.db
      .update(documentVersions)
      .set({ status: 'queued' })
      .where(eq(documentVersions.id, versionId));
    await makeJob(testDb.db, versionId);
    expect(await worker.runOnce()).toBe('done');

    expect(await valueCount(versionId)).toBe(5);
  });
});

describe('worker: shutdown', () => {
  it('releases an in-flight job back to the queue when stopping times out', async () => {
    const { jobId, versionId } = await queuedInvoice();
    const worker = makeWorker({ extractor: new FakeExtractor({ delayMs: 10_000 }) });

    worker.start();
    await waitFor(isRunning(jobId));
    await worker.stop(100);

    expect(await jobRow(jobId)).toMatchObject({
      status: 'queued',
      lockedBy: null,
      lockedUntil: null,
      attempts: 0,
    });
    expect(await versionRow(versionId)).toMatchObject({ status: 'queued' });
  });

  it('lets an in-flight job finish when it completes within the timeout', async () => {
    const { jobId } = await queuedInvoice();
    const worker = makeWorker({ extractor: new FakeExtractor({ delayMs: 200 }) });

    worker.start();
    await waitFor(isRunning(jobId));
    await worker.stop(5000);

    expect(await jobRow(jobId)).toMatchObject({ status: 'done' });
  });
});
