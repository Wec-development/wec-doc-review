import { errorEnvelopeSchema, retryAcceptedSchema } from '@doc-review/shared';
import { count, eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { extractedValues, extractionJobs } from '../../src/db/schema.js';
import { GAP_REASONS } from '../../src/extraction/validate/verify-fields.js';
import type { AvailableModel } from '../../src/llm/modelCatalog.js';
import { LlmSettingsResolver } from '../../src/llm/settings-resolver.js';
import { connectTestDatabase, resetDatabase, type TestDatabase } from '../../src/test/db.js';
import {
  createTestApp,
  TEST_ENCRYPTION_KEY,
  type TestApp,
  uploadDocument,
} from '../../src/test/http.js';
import {
  buildRecording,
  jsonResponse,
  overrideFields,
  recordedFields,
} from '../../src/test/llm.js';
import { waitFor } from '../../src/test/wait.js';
import { expireLease } from '../../src/test/worker.js';
import type { Worker } from '../../src/worker/worker.js';
import { killWorkerProcesses, startWorkerProcess } from './child-worker.js';
import {
  answerFrom,
  api,
  type Api,
  byField,
  INVOICE_V1,
  INVOICE_V2,
  isRevisedInvoice,
  recordedReplies,
  seed,
  startWorker,
  WAIT_MS,
  waitForVersion,
} from './harness.js';

const E2E_KEY = 'sk-ant-api03-e2e-settings-key-000-E2E1';

/** What list-models returns for the e2e key (the real filter and recommendation still run). */
function extractionInputModels(): AvailableModel[] {
  return ['claude-haiku-5-5', 'claude-sonnet-5-5'].map((id) => ({
    id,
    displayName: null,
    structuredOutputs: true,
    effort: true,
    deprecated: false,
  }));
}

/**
 * The client's acceptance scenarios, end to end: HTTP in, real worker, real Postgres, real PDF
 * parsing, recorded LLM replies. Each test starts from an empty database.
 */

let testDb: TestDatabase;
let testApp: TestApp;
let client: Api;
const workers: Worker[] = [];

beforeAll(() => {
  testDb = connectTestDatabase();
});
afterAll(() => testDb.close());
beforeEach(async () => {
  await resetDatabase(testDb.db);
  testApp = await createTestApp(testDb.db);
  client = api(testApp);
});
afterEach(async () => {
  killWorkerProcesses();
  await Promise.all(workers.splice(0).map((worker) => worker.stop(1000)));
  await testApp.close();
});

/** Starts a background worker that is stopped after the test. */
function run(
  respond: Parameters<typeof startWorker>[2],
  options?: Parameters<typeof startWorker>[3],
) {
  const started = startWorker(testDb, testApp, respond, options);
  workers.push(started.worker);
  return started;
}

async function valuesOf(versionId: string) {
  return testDb.db.select().from(extractedValues).where(eq(extractedValues.versionId, versionId));
}

async function jobsFor(versionId: string) {
  return testDb.db
    .select()
    .from(extractionJobs)
    .where(eq(extractionJobs.versionId, versionId))
    .orderBy(extractionJobs.createdAt);
}

async function duplicateValueCount(): Promise<number> {
  const rows = (
    await testDb.db.execute(
      sql`select 1 from extracted_values group by version_id, field having count(*) > 1`,
    )
  ).rows;
  return rows.length;
}

/** Approves every value of the current version except vendor_name, which is corrected. */
async function reviewInvoice(documentId: string) {
  for (const value of (await client.detail(documentId)).values) {
    const body =
      value.field === 'vendor_name'
        ? { action: 'correct', value: 'Meridian Office Supplies, LLC', note: 'Legal name per W-9' }
        : { action: 'approve' };
    expect((await client.review(value.id, body)).statusCode).toBe(201);
  }
}

describe('acceptance (e2e)', () => {
  it('1. waits for an LLM in Settings, then extracts all seeded documents; income is a gap', async () => {
    // The app as a reviewer first meets it: seeded, no LLM configured yet.
    await testApp.close();
    testApp = await createTestApp(testDb.db, {
      listModels: async () => extractionInputModels(),
    });
    client = api(testApp);
    await seed(testDb);
    const resolver = new LlmSettingsResolver({
      db: testDb.db,
      encryptionKey: TEST_ENCRYPTION_KEY,
      timeoutMs: 5000,
      cacheMs: 0,
    });
    let claimChecks = 0;
    run(answerFrom(recordedReplies()), {
      canClaim: async () => {
        claimChecks += 1;
        return resolver.isConfigured();
      },
    });

    await waitFor(async () => claimChecks >= 6, { description: 'the worker to poll a few times' });
    expect((await client.list()).map((doc) => doc.status)).toEqual(['queued', 'queued', 'queued']);
    expect(await testDb.db.select().from(extractionJobs)).toEqual(
      Array.from({ length: 3 }, () => expect.objectContaining({ status: 'queued', attempts: 0 })),
    );

    const saved = await testApp.app.inject({
      method: 'PUT',
      url: '/settings/llm',
      payload: { provider: 'anthropic', model: 'claude-haiku-5-5', apiKey: E2E_KEY },
    });
    expect(saved.statusCode).toBe(200);

    await waitFor(async () => (await client.list()).every((doc) => doc.status === 'extracted'), {
      timeoutMs: WAIT_MS,
      description: 'all seeded documents to be extracted',
    });

    const documents = await client.list();
    expect(documents.map((doc) => doc.type).sort()).toEqual(['invoice', 'lease', 'market_report']);
    const report = documents.find((doc) => doc.type === 'market_report');
    const income = byField(await client.detail(report?.id ?? '')).get('median_household_income');
    const recordedReason = recordedFields('market-report-excerpt-001').find(
      (f) => f.field === 'median_household_income',
    )?.not_found_reason;
    expect(income).toMatchObject({
      value: null,
      evidence: null,
      gapKind: 'not_found',
      gapReason: recordedReason,
    });
    expect(report?.progress.gaps).toBe(1);
  });

  it('2. invoice v1 reviewed, then v2: exactly 2 pending, 3 carried over, v1 unchanged', async () => {
    run(answerFrom(recordedReplies()));
    const { documentId } = await client.upload(INVOICE_V1);
    await waitForVersion(client, documentId, 1, 'extracted');
    await reviewInvoice(documentId);
    const v1Before = await client.detail(documentId, 1);

    await client.uploadVersion(documentId, INVOICE_V2);
    const v2 = await waitForVersion(client, documentId, 2, 'extracted');

    expect(await client.progress(documentId)).toEqual({
      pending: 2,
      approved: 0,
      corrected: 0,
      carriedOver: 3,
      gaps: 0,
      total: 5,
    });
    const fields = byField(v2);
    expect(fields.get('due_date')).toMatchObject({
      value: '2025-11-13',
      reviewState: 'pending',
      previous: { versionNo: 1, value: '2025-10-14', latestReview: { action: 'approve' } },
    });
    expect(fields.get('total_amount')).toMatchObject({
      value: '$6,126.45',
      reviewState: 'pending',
      previous: { versionNo: 1, value: '$5,230.29', latestReview: { action: 'approve' } },
    });
    expect(fields.get('vendor_name')).toMatchObject({
      reviewState: 'carried_over',
      carriedAction: 'corrected',
      latestReview: { action: 'correct', correctedValue: 'Meridian Office Supplies, LLC' },
    });

    const v1After = await client.detail(documentId, 1);
    expect({ version: v1After.version, values: v1After.values }).toEqual({
      version: v1Before.version,
      values: v1Before.values,
    });
  });

  it('3. a quote the model made up becomes a gap; the other values are unaffected', async () => {
    const fabricated = buildRecording('invoice-001', {
      id: 'msg_rec_invoice_fabricated_e2e',
      editFields: overrideFields({
        total_amount: { evidence: 'Total Amount Due (incl. tax): $5,230.29' },
      }),
    });
    run(answerFrom(recordedReplies({ invoice: fabricated })));
    const { documentId } = await client.upload(INVOICE_V1);

    const detail = await waitForVersion(client, documentId, 1, 'extracted');

    expect(byField(detail).get('total_amount')).toMatchObject({
      value: null,
      evidence: null,
      gapKind: 'evidence_not_verified',
      gapReason: GAP_REASONS.evidenceNotFound,
    });
    expect(detail.values.filter((v) => v.value !== null).map((v) => v.field)).toEqual([
      'invoice_number',
      'issue_date',
      'due_date',
      'vendor_name',
    ]);
  });

  it('4. an LLM error fails the version visibly with its reason, and retry extracts it', async () => {
    const answer = answerFrom(recordedReplies());
    run((call, index) =>
      index === 0
        ? jsonResponse(400, {
            type: 'error',
            error: { type: 'invalid_request_error', message: 'prompt is malformed' },
          })
        : answer(call),
    );
    const { documentId, versionId } = await client.upload(INVOICE_V1);

    const failed = await waitForVersion(client, documentId, 1, 'failed');
    expect(failed.version.error).toMatch(/^Extraction failed: LLM rejected the request \(400\)/);
    expect((await client.list())[0]).toMatchObject({
      status: 'failed',
      error: failed.version.error,
    });
    expect(await jobsFor(versionId)).toEqual([
      expect.objectContaining({
        status: 'failed',
        attempts: 1,
        prompt: expect.stringContaining('<document>'),
      }),
    ]);

    const retried = await client.retry(documentId);
    expect(retried.statusCode).toBe(202);
    expect(retryAcceptedSchema.parse(retried.json())).toEqual({ versionId, status: 'queued' });
    const extracted = await waitForVersion(client, documentId, 1, 'extracted');

    expect(extracted.version.error).toBeNull();
    expect(extracted.values.filter((v) => v.value !== null)).toHaveLength(5);
    expect((await jobsFor(versionId)).map((job) => job.status)).toEqual(['failed', 'done']);
  });

  describe('5. a worker process that dies or is stopped mid-extraction', () => {
    it('SIGKILL: the lease runs out and a second worker completes the job, without duplicates', async () => {
      const { documentId, versionId } = await client.upload(INVOICE_V1);
      const crashing = startWorkerProcess();
      const [job] = await jobsFor(versionId);
      await waitFor(
        async () => (await jobsFor(versionId))[0]?.lockedBy?.includes(`:${crashing.pid}:`) ?? false,
        {
          timeoutMs: WAIT_MS,
          description: 'the worker process to claim the job',
        },
      );
      expect((await client.detail(documentId)).version.status).toBe('extracting');

      await crashing.kill('SIGKILL');
      // The process is gone; its lease would run out on its own. Database time skips the wait.
      await expireLease(testDb.db, job?.id ?? '');
      run(answerFrom(recordedReplies()), { workerId: 'e2e-worker-b' });

      const detail = await waitForVersion(client, documentId, 1, 'extracted');
      expect(detail.values.filter((v) => v.value !== null)).toHaveLength(5);
      expect(await jobsFor(versionId)).toEqual([
        expect.objectContaining({ status: 'done', attempts: 2, lockedBy: 'e2e-worker-b' }),
      ]);
      expect(await valuesOf(versionId)).toHaveLength(5);
      expect(await duplicateValueCount()).toBe(0);
    });

    it('SIGTERM: the job goes back to the queue, never stuck extracting', async () => {
      const { documentId, versionId } = await client.upload(INVOICE_V1);
      const stopping = startWorkerProcess();
      await waitFor(async () => (await jobsFor(versionId))[0]?.status === 'running', {
        timeoutMs: WAIT_MS,
        description: 'the worker process to claim the job',
      });

      expect(await stopping.kill('SIGTERM')).toBe(0);

      expect((await client.detail(documentId)).version.status).toBe('queued');
      expect(await jobsFor(versionId)).toEqual([
        expect.objectContaining({ status: 'queued', lockedBy: null, attempts: 0 }),
      ]);
    });
  });

  it('6. a new version uploaded mid-extraction supersedes the running one', async () => {
    const { worker } = run(answerFrom(recordedReplies()), {
      delayMs: (call) => (isRevisedInvoice(call) ? 1500 : 0),
    });
    const { documentId, versionId: v1Id } = await client.upload(INVOICE_V1);
    await waitForVersion(client, documentId, 1, 'extracted');
    await reviewInvoice(documentId);

    const v2 = await client.uploadVersion(documentId, INVOICE_V2);
    await waitForVersion(client, documentId, 2, 'extracting');
    const v3 = await client.uploadVersion(documentId, INVOICE_V1);
    const v3Detail = await waitForVersion(client, documentId, 3, 'extracted');
    // Stopping waits for in-flight work, so v2's slow extraction has returned after this.
    await worker.stop(WAIT_MS);

    expect((await client.detail(documentId, 2)).version.status).toBe('superseded');
    expect(await jobsFor(v2.versionId)).toEqual([
      expect.objectContaining({ status: 'superseded' }),
    ]);
    expect(await valuesOf(v2.versionId)).toEqual([]);
    expect(v3Detail.version.baselineVersionNo).toBe(1);
    expect(v3Detail.values.every((v) => v.reviewState === 'carried_over')).toBe(true);
    expect(await valuesOf(v3.versionId)).toHaveLength(5);
    expect(await valuesOf(v1Id)).toHaveLength(5);
  });

  it('7. rejects a non-PDF upload with 415 and the standard error envelope', async () => {
    const response = await uploadDocument(testApp.app, {
      type: 'invoice',
      file: {
        contents: Buffer.from('just text'),
        filename: 'notes.txt',
        contentType: 'text/plain',
      },
    });

    expect(response.statusCode).toBe(415);
    expect(errorEnvelopeSchema.parse(response.json()).error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    const [documents] = await testDb.db.select({ n: count() }).from(extractionJobs);
    expect(documents?.n).toBe(0);
  });
});
