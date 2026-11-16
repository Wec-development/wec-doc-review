import { readFileSync } from 'node:fs';
import {
  documentDetailSchema,
  type DocumentDetail,
  extractedValueSchema,
  reviewProgressSchema,
  uploadAcceptedSchema,
} from '@doc-review/shared';
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { documentVersions, extractedValues, reviews } from '../../db/schema.js';
import { LocalDiskStorage } from '../../storage/file-storage.js';
import { connectTestDatabase, resetDatabase, type TestDatabase } from '../../test/db.js';
import { jobsOf, makeJob } from '../../test/factories.js';
import {
  createTestApp,
  expectError,
  type TestApp,
  uploadDocument,
  uploadVersion,
} from '../../test/http.js';
import {
  FIXTURES_DIR,
  promptOf,
  replayFetch,
  respondByDocumentText,
  jsonResponse,
  TEST_API_KEY,
  TEST_MODEL,
} from '../../test/llm.js';
import { createLogger } from '../../worker/logger.js';
import { type JobOutcome } from '../../worker/process-job.js';
import { Worker } from '../../worker/worker.js';
import { LlmExtractor } from '../llm-extractor.js';
import { AnthropicLlmClient } from '../llm/anthropic-client.js';
import { createFileResolver } from '../resolve-file.js';

/**
 * Step 7 end to end: real uploads through the API, the real worker and extraction pipeline
 * (recorded model replies), real reviews through POST /values/:id/review.
 */

const INVOICE_V1 = readFileSync(`${FIXTURES_DIR}documents/invoice-001.pdf`);
const INVOICE_V2 = readFileSync(`${FIXTURES_DIR}documents/invoice-001.v2.pdf`);
const REVISED_MARKER = 'INVOICE (REVISED)';
const VENDOR_CORRECTION = { value: 'Meridian Office Supplies, LLC', note: 'Legal name per W-9' };

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

/** Recorded replies by document text; `failRevised` turns v2 extraction into an auth failure. */
function invoiceExtractor(options: { failRevised?: boolean; delayRevisedMs?: number } = {}) {
  const answer = respondByDocumentText([
    [REVISED_MARKER, 'invoice-001.v2'],
    ['MERIDIAN OFFICE SUPPLIES LLC', 'invoice-001'],
  ]);
  const { fetch } = replayFetch((call) => {
    const revised = promptOf(call).includes(REVISED_MARKER);
    if (revised && options.failRevised) {
      return jsonResponse(401, {
        type: 'error',
        error: { type: 'authentication_error', message: 'no' },
      });
    }
    return answer(call);
  });
  const delayedFetch: typeof globalThis.fetch = async (input, init) => {
    const body = String(init?.body ?? '');
    if (options.delayRevisedMs && body.includes(REVISED_MARKER)) {
      await new Promise((resolve) => setTimeout(resolve, options.delayRevisedMs));
    }
    return fetch(input, init);
  };
  return new LlmExtractor({
    llm: async () =>
      new AnthropicLlmClient({
        apiKey: TEST_API_KEY,
        model: TEST_MODEL,
        timeoutMs: 5000,
        fetch: delayedFetch,
      }),
    resolveFile: createFileResolver(new LocalDiskStorage(testApp.storageDir), FIXTURES_DIR),
    maxDocumentChars: 100_000,
  });
}

function worker(extractor = invoiceExtractor()) {
  return new Worker(
    {
      db: testDb.db,
      extractor,
      logger: createLogger({}, () => undefined),
      workerId: 'worker-carry',
      settings: { leaseSeconds: 30, maxAttempts: 1, backoffBaseMs: 0 },
    },
    { concurrency: 1, pollIntervalMs: 20 },
  );
}

async function drain(w = worker()): Promise<JobOutcome[]> {
  const outcomes: JobOutcome[] = [];
  for (let outcome = await w.runOnce(); outcome !== null; outcome = await w.runOnce()) {
    outcomes.push(outcome);
  }
  return outcomes;
}

async function uploadInvoiceV1(): Promise<string> {
  const response = await uploadDocument(testApp.app, {
    type: 'invoice',
    title: 'Meridian invoice',
    file: { contents: INVOICE_V1, filename: 'invoice-001.pdf' },
  });
  return uploadAcceptedSchema.parse(response.json()).documentId;
}

async function uploadFile(documentId: string, contents: Buffer) {
  const response = await uploadVersion(testApp.app, documentId, { contents });
  expect(response.statusCode).toBe(202);
  return uploadAcceptedSchema.parse(response.json());
}

async function detail(documentId: string, versionNo?: number): Promise<DocumentDetail> {
  const query = versionNo === undefined ? '' : `?version=${versionNo}`;
  return documentDetailSchema.parse(
    (await testApp.app.inject(`/documents/${documentId}${query}`)).json(),
  );
}

function review(valueId: string, body: object) {
  return testApp.app.inject({ method: 'POST', url: `/values/${valueId}/review`, payload: body });
}

/** Approves every value except vendor_name, which is corrected with a note. */
async function reviewAll(documentId: string) {
  for (const value of (await detail(documentId)).values) {
    const body =
      value.field === 'vendor_name'
        ? { action: 'correct', ...VENDOR_CORRECTION }
        : { action: 'approve' };
    expect((await review(value.id, body)).statusCode).toBe(201);
  }
}

const byField = (doc: DocumentDetail) => new Map(doc.values.map((v) => [v.field, v]));

async function versionRows(documentId: string) {
  return testDb.db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
    .orderBy(asc(documentVersions.versionNo));
}

/** Everything stored for a version's values and their reviews, for before/after comparison. */
async function snapshotVersion(versionId: string) {
  const values = await testDb.db
    .select()
    .from(extractedValues)
    .where(eq(extractedValues.versionId, versionId))
    .orderBy(asc(extractedValues.field));
  const valueReviews = values.length
    ? await testDb.db
        .select()
        .from(reviews)
        .where(
          inArray(
            reviews.valueId,
            values.map((v) => v.id),
          ),
        )
        .orderBy(asc(reviews.createdAt))
    : [];
  return { values, reviews: valueReviews };
}

async function carriedReviewCount(versionId: string): Promise<number> {
  const carried = await testDb.db
    .select({ id: reviews.id })
    .from(reviews)
    .innerJoin(extractedValues, eq(extractedValues.id, reviews.valueId))
    .where(and(eq(extractedValues.versionId, versionId), isNotNull(reviews.carriedFromReviewId)));
  return carried.length;
}

describe('carry-over: the brief acceptance test (invoice v1 reviewed, then v2)', () => {
  it('leaves exactly due_date and total_amount pending and carries the other three reviews', async () => {
    const documentId = await uploadInvoiceV1();
    expect(await drain()).toEqual(['done']);
    await reviewAll(documentId);
    const v1Reviewed = byField(await detail(documentId, 1));

    await uploadFile(documentId, INVOICE_V2);
    expect(await drain()).toEqual(['done']);

    const v2 = await detail(documentId);
    const fields = byField(v2);
    expect(v2.version).toMatchObject({ versionNo: 2, status: 'extracted', baselineVersionNo: 1 });

    for (const field of ['due_date', 'total_amount']) {
      expect(fields.get(field)).toMatchObject({
        reviewState: 'pending',
        comparison: 'changed',
        comparisonReason: 'value_differs',
        carriedOver: false,
        latestReview: null,
        previous: {
          versionNo: 1,
          value: v1Reviewed.get(field)?.value,
          latestReview: { action: 'approve' },
        },
      });
    }
    for (const field of ['invoice_number', 'issue_date']) {
      expect(fields.get(field)).toMatchObject({
        reviewState: 'carried_over',
        carriedAction: 'approved',
        comparison: 'unchanged',
        comparisonReason: 'evidence_matches',
        carriedOver: true,
        previous: { versionNo: 1 },
      });
    }
    expect(fields.get('vendor_name')).toMatchObject({
      reviewState: 'carried_over',
      carriedAction: 'corrected',
      comparison: 'unchanged',
      latestReview: {
        action: 'correct',
        correctedValue: VENDOR_CORRECTION.value,
        note: VENDOR_CORRECTION.note,
      },
    });

    const progress = reviewProgressSchema.parse(
      (await testApp.app.inject(`/documents/${documentId}/progress`)).json(),
    );
    expect(progress).toEqual({
      pending: 2,
      approved: 0,
      corrected: 0,
      carriedOver: 3,
      gaps: 0,
      total: 5,
    });
  });
});

describe('carry-over: rules end to end', () => {
  it('keeps unchanged fields pending when v1 was never reviewed (nothing to carry)', async () => {
    const documentId = await uploadInvoiceV1();
    await drain();
    await uploadFile(documentId, INVOICE_V2);
    await drain();

    const fields = byField(await detail(documentId));
    expect(fields.get('invoice_number')).toMatchObject({
      comparison: 'unchanged',
      reviewState: 'pending',
      carriedOver: false,
      latestReview: null,
      previous: { versionNo: 1, latestReview: null },
    });
    expect(fields.get('total_amount')).toMatchObject({
      comparison: 'changed',
      reviewState: 'pending',
    });
  });

  it('compares with the latest EXTRACTED version, skipping a failed one', async () => {
    const documentId = await uploadInvoiceV1();
    await drain();
    await reviewAll(documentId);

    await uploadFile(documentId, INVOICE_V2);
    expect(await drain(worker(invoiceExtractor({ failRevised: true })))).toEqual(['failed']);
    await uploadFile(documentId, INVOICE_V1); // v3 has v1's content
    expect(await drain()).toEqual(['done']);

    const [v1, v2, v3] = await versionRows(documentId);
    expect([v1?.status, v2?.status, v3?.status]).toEqual(['extracted', 'failed', 'extracted']);
    expect(v3?.baselineVersionId).toBe(v1?.id);
    const v3Detail = await detail(documentId);
    expect(v3Detail.version.baselineVersionNo).toBe(1);
    expect(v3Detail.values.every((v) => v.reviewState === 'carried_over')).toBe(true);
  });

  it('creates no duplicate values or carried reviews when the same version is extracted again', async () => {
    const documentId = await uploadInvoiceV1();
    await drain();
    await reviewAll(documentId);
    const { versionId } = await uploadFile(documentId, INVOICE_V2);
    await drain();
    const before = await snapshotVersion(versionId);

    // A second job for the same version (e.g. a manual retry after a crash after commit).
    await makeJob(testDb.db, versionId);
    expect(await drain()).toEqual(['done']);

    const after = await snapshotVersion(versionId);
    expect(after.values).toHaveLength(5);
    expect(after.reviews).toHaveLength(3);
    expect(after).toEqual(before);
    expect(await carriedReviewCount(versionId)).toBe(3);
  });

  it('leaves v1 values and reviews untouched, and still serves ?version=1', async () => {
    const documentId = await uploadInvoiceV1();
    await drain();
    await reviewAll(documentId);
    const [v1Row] = await versionRows(documentId);
    const v1Before = await snapshotVersion(v1Row?.id ?? '');

    await uploadFile(documentId, INVOICE_V2);
    await drain();

    expect(await snapshotVersion(v1Row?.id ?? '')).toEqual(v1Before);
    const v1 = await detail(documentId, 1);
    expect(v1.version).toMatchObject({ versionNo: 1, baselineVersionNo: null });
    expect(v1.values.map((v) => v.reviewState).sort()).toEqual([
      'approved',
      'approved',
      'approved',
      'approved',
      'corrected',
    ]);
    expect(v1.values.every((v) => v.comparison === 'initial')).toBe(true);
  });

  it('rejects a review of a v1 value once v2 exists (the baseline stays read-only)', async () => {
    const documentId = await uploadInvoiceV1();
    await drain();
    const v1Value = (await detail(documentId)).values[0];
    await uploadFile(documentId, INVOICE_V2);

    expectError(await review(v1Value?.id ?? '', { action: 'approve' }), 409, 'CONFLICT');
  });

  it('lets a reviewer change a carried value; the carried review stays in the history', async () => {
    const documentId = await uploadInvoiceV1();
    await drain();
    await reviewAll(documentId);
    await uploadFile(documentId, INVOICE_V2);
    await drain();
    const carried = byField(await detail(documentId)).get('invoice_number');

    const response = await review(carried?.id ?? '', {
      action: 'correct',
      value: 'INV-2025-0847-A',
    });

    expect(response.statusCode).toBe(201);
    expect(extractedValueSchema.parse(response.json())).toMatchObject({
      reviewState: 'corrected',
      carriedAction: null,
      latestReview: { action: 'correct', correctedValue: 'INV-2025-0847-A' },
    });
    const history = await testDb.db
      .select({ action: reviews.action, carriedFrom: reviews.carriedFromReviewId })
      .from(reviews)
      .where(eq(reviews.valueId, carried?.id ?? ''))
      .orderBy(asc(reviews.createdAt));
    expect(history).toEqual([
      { action: 'approve', carriedFrom: expect.any(String) },
      { action: 'correct', carriedFrom: null },
    ]);
  });

  it('supersedes v2 when v3 arrives mid-extraction: v2 writes nothing, v3 compares with v1', async () => {
    const documentId = await uploadInvoiceV1();
    await drain();
    await reviewAll(documentId);
    const v2 = await uploadFile(documentId, INVOICE_V2);

    const slow = worker(invoiceExtractor({ delayRevisedMs: 400 }));
    const v2Run = slow.runOnce();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const v3 = await uploadFile(documentId, INVOICE_V1);

    expect(await v2Run).toBe('superseded');
    expect(await snapshotVersion(v2.versionId)).toEqual({ values: [], reviews: [] });
    expect(await jobsOf(testDb.db, v2.versionId)).toEqual([
      expect.objectContaining({ status: 'superseded' }),
    ]);

    expect(await drain()).toEqual(['done']);
    const [, v2Row, v3Row] = await versionRows(documentId);
    expect(v2Row?.status).toBe('superseded');
    expect(v3Row).toMatchObject({ id: v3.versionId, status: 'extracted' });
    expect(v3Row?.baselineVersionId).toBe((await versionRows(documentId))[0]?.id);
    expect((await detail(documentId)).values.every((v) => v.reviewState === 'carried_over')).toBe(
      true,
    );
  });
});
