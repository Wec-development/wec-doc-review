import { retryAcceptedSchema, uploadAcceptedSchema } from '@doc-review/shared';
import { count, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { extractedValues, extractionJobs } from '../db/schema.js';
import { FakeExtractor } from '../extraction/fake-extractor.js';
import { claimNextJob } from '../repositories/jobs.repository.js';
import { connectTestDatabase, resetDatabase, type TestDatabase } from '../test/db.js';
import { jobsOf, makeDocument, makeJob, makeVersion, versionsOf } from '../test/factories.js';
import {
  createTestApp,
  pdfBytes,
  type TestApp,
  uploadDocument,
  uploadVersion,
} from '../test/http.js';
import { waitFor } from '../test/wait.js';
import { drain, expireLease, makeTestWorker } from '../test/worker.js';

/**
 * Crash recovery and concurrency through the real API and the real worker: whatever order
 * requests and workers interleave in, each version ends with exactly one value per field and
 * at most one open job.
 */

let testDb: TestDatabase;
let testApp: TestApp;

beforeAll(() => {
  testDb = connectTestDatabase();
});
afterAll(() => testDb.close());
beforeEach(async () => {
  await resetDatabase(testDb.db);
  testApp = await createTestApp(testDb.db);
});
afterEach(() => testApp.close());

const FIELDS_PER_INVOICE = 5;

async function valueCount(versionId: string): Promise<number> {
  const [row] = await testDb.db
    .select({ n: count() })
    .from(extractedValues)
    .where(eq(extractedValues.versionId, versionId));
  return row?.n ?? 0;
}

/** Every (version, field) that has more than one value. Must always be empty. */
async function duplicateValues() {
  return (
    await testDb.db.execute<{ version_id: string; field: string; n: number }>(
      sql`select version_id, field, count(*)::int as n from extracted_values
          group by version_id, field having count(*) > 1`,
    )
  ).rows;
}

async function openJobCount(versionIds: string[]): Promise<number> {
  const [row] = await testDb.db
    .select({ n: count() })
    .from(extractionJobs)
    .where(
      sql`${inArray(extractionJobs.versionId, versionIds)} and ${extractionJobs.status} in ('queued', 'running')`,
    );
  return row?.n ?? 0;
}

async function uploadInvoice(): Promise<{ documentId: string; versionId: string }> {
  const response = await uploadDocument(testApp.app, { type: 'invoice' });
  expect(response.statusCode).toBe(202);
  return uploadAcceptedSchema.parse(response.json());
}

describe('crash recovery (R2)', () => {
  it('lets a second worker finish a job whose worker died mid-extraction', async () => {
    const { documentId, versionId } = await uploadInvoice();
    const [job] = await jobsOf(testDb.db, versionId);
    if (!job) throw new Error('expected a queued job');

    // Worker A claims the job and dies: no heartbeat, no result, its lease simply runs out.
    expect(await claimNextJob(testDb.db, 'worker-a', 30)).toMatchObject({ jobId: job.id });
    expect(await versionsOf(testDb.db, documentId)).toEqual([
      expect.objectContaining({ status: 'extracting' }),
    ]);
    const workerB = makeTestWorker(testDb.db, { workerId: 'worker-b' });
    expect(await workerB.runOnce()).toBeNull();
    await expireLease(testDb.db, job.id);

    expect(await workerB.runOnce()).toBe('done');

    const [finished] = await testDb.db
      .select({
        status: extractionJobs.status,
        attempts: extractionJobs.attempts,
        lockedBy: extractionJobs.lockedBy,
        lockedUntil: extractionJobs.lockedUntil,
      })
      .from(extractionJobs)
      .where(eq(extractionJobs.id, job.id));
    // Worker B finished it (locked_by records who), and the lease is released.
    expect(finished).toEqual({
      status: 'done',
      attempts: 2,
      lockedBy: 'worker-b',
      lockedUntil: null,
    });
    expect(await versionsOf(testDb.db, documentId)).toEqual([
      expect.objectContaining({ status: 'extracted', error: null }),
    ]);
    expect(await valueCount(versionId)).toBe(FIELDS_PER_INVOICE);
    expect(await duplicateValues()).toEqual([]);
  });

  it('never leaves a version extracting: a stopped worker hands its job back and another completes it', async () => {
    const { documentId, versionId } = await uploadInvoice();
    const stopping = makeTestWorker(testDb.db, {
      workerId: 'worker-a',
      extractor: new FakeExtractor({ delayMs: 10_000 }),
    });
    stopping.start();
    await waitFor(
      async () => (await versionsOf(testDb.db, documentId))[0]?.status === 'extracting',
      { description: 'worker A to start extracting' },
    );

    await stopping.stop(50);

    expect(await versionsOf(testDb.db, documentId)).toEqual([
      expect.objectContaining({ status: 'queued' }),
    ]);
    expect(await drain(makeTestWorker(testDb.db, { workerId: 'worker-b' }))).toEqual(['done']);
    expect(await valueCount(versionId)).toBe(FIELDS_PER_INVOICE);
  });
});

describe('no duplicates under concurrency (R3)', () => {
  it('two concurrent retries of a failed version leave one job and one value per field', async () => {
    const documentId = await makeDocument(testDb.db);
    const versionId = await makeVersion(testDb.db, documentId, {
      status: 'failed',
      error: 'LLM timed out',
    });
    await makeJob(testDb.db, versionId, 'failed');
    const retry = () =>
      testApp.app.inject({ method: 'POST', url: `/documents/${documentId}/retry` });

    const responses = await Promise.all([retry(), retry()]);

    expect(responses.map((r) => r.statusCode).sort()).toEqual([202, 409]);
    const accepted = responses.find((r) => r.statusCode === 202);
    expect(retryAcceptedSchema.parse(accepted?.json()).versionId).toBe(versionId);
    expect(await openJobCount([versionId])).toBe(1);

    expect(await drain(makeTestWorker(testDb.db))).toEqual(['done']);

    expect((await jobsOf(testDb.db, versionId)).map((job) => job.status)).toEqual([
      'failed',
      'done',
    ]);
    expect(await valueCount(versionId)).toBe(FIELDS_PER_INVOICE);
    expect(await duplicateValues()).toEqual([]);
  });

  it('two concurrent new versions: one value per field per version, only the newest extracted', async () => {
    const { documentId, versionId: v1 } = await uploadInvoice();
    expect(await drain(makeTestWorker(testDb.db))).toEqual(['done']);

    const uploads = await Promise.all([
      uploadVersion(testApp.app, documentId, { contents: pdfBytes('revision a') }),
      uploadVersion(testApp.app, documentId, { contents: pdfBytes('revision b') }),
    ]);
    expect(uploads.map((r) => r.statusCode)).toEqual([202, 202]);
    const versionIds = (await versionsOf(testDb.db, documentId)).map((v) => v.id);
    expect(await openJobCount(versionIds)).toBe(1);

    expect(await drain(makeTestWorker(testDb.db))).toEqual(['done']);

    const versions = await versionsOf(testDb.db, documentId);
    expect(versions.map((v) => [v.versionNo, v.status])).toEqual([
      [1, 'extracted'],
      [2, 'superseded'],
      [3, 'extracted'],
    ]);
    expect(await valueCount(v1)).toBe(FIELDS_PER_INVOICE);
    expect(await valueCount(versions[1]?.id ?? '')).toBe(0);
    expect(await valueCount(versions[2]?.id ?? '')).toBe(FIELDS_PER_INVOICE);
    expect(await openJobCount(versionIds)).toBe(0);
    expect(await duplicateValues()).toEqual([]);
  });
});
