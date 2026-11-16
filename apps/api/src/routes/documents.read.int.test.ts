import { documentDetailSchema, documentListSchema, reviewProgressSchema } from '@doc-review/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDatabase, resetDatabase, type TestDatabase } from '../test/db.js';
import {
  makeDocument,
  makeDocumentWithVersion,
  makeReview,
  makeValue,
  makeVersion,
} from '../test/factories.js';
import { createTestApp, expectError, type TestApp } from '../test/http.js';

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

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

/**
 * An invoice re-extracted into version 2 with one value in every state:
 * pending, approved, corrected, carried over, and a (pending) gap.
 */
async function makeReviewedInvoice() {
  const documentId = await makeDocument(testDb.db, { title: 'Meridian invoice' });
  const v1 = await makeVersion(testDb.db, documentId, { versionNo: 1, status: 'extracted' });
  const oldTotal = await makeValue(testDb.db, v1, { field: 'total_amount', value: '$100.00' });
  await makeReview(testDb.db, oldTotal, { action: 'approve' });
  const oldVendor = await makeValue(testDb.db, v1, { field: 'vendor_name' });
  const vendorApproval = await makeReview(testDb.db, oldVendor, { action: 'approve' });

  const v2 = await makeVersion(testDb.db, documentId, { versionNo: 2, status: 'extracted' });
  const ids = {
    total: await makeValue(testDb.db, v2, {
      field: 'total_amount',
      value: '$120.00',
      previousValueId: oldTotal,
    }),
    vendor: await makeValue(testDb.db, v2, {
      field: 'vendor_name',
      carriedOver: true,
      previousValueId: oldVendor,
    }),
    dueDate: await makeValue(testDb.db, v2, { field: 'due_date' }),
    issueDate: await makeValue(testDb.db, v2, { field: 'issue_date' }),
    invoiceNumber: await makeValue(testDb.db, v2, {
      field: 'invoice_number',
      gapReason: 'Not stated in the document',
    }),
  };
  // Carried over: the v1 approval copied onto v2 with its provenance.
  await makeReview(testDb.db, ids.vendor, { action: 'approve', carriedFrom: vendorApproval });
  await makeReview(testDb.db, ids.dueDate, { action: 'approve' });
  await makeReview(testDb.db, ids.issueDate, { action: 'correct', correctedValue: '2025-03-02' });
  return { documentId, ids };
}

describe('GET /documents', () => {
  it('lists each document with its current version, status and progress', async () => {
    const { documentId } = await makeReviewedInvoice();

    const response = await testApp.app.inject('/documents');

    expect(response.statusCode).toBe(200);
    const { documents } = documentListSchema.parse(response.json());
    expect(documents).toEqual([
      expect.objectContaining({
        id: documentId,
        title: 'Meridian invoice',
        currentVersionNo: 2,
        status: 'extracted',
        progress: { pending: 2, approved: 1, corrected: 1, carriedOver: 1, gaps: 1, total: 5 },
      }),
    ]);
  });

  it('orders documents by most recent activity, including reviews', async () => {
    const older = await makeDocumentWithVersion(testDb.db, { title: 'older' });
    const newer = await makeDocumentWithVersion(testDb.db, { title: 'newer' });
    const titles = async () =>
      documentListSchema
        .parse((await testApp.app.inject('/documents')).json())
        .documents.map((d) => d.title);
    expect(await titles()).toEqual(['newer', 'older']);

    const value = await makeValue(testDb.db, older.versionId, { field: 'total_amount' });
    await makeReview(testDb.db, value, { action: 'approve' });

    expect(await titles()).toEqual(['older', 'newer']);
    expect(newer.documentId).not.toBe(older.documentId);
  });

  it('includes the error of the current version, e.g. why extraction failed', async () => {
    const documentId = await makeDocument(testDb.db);
    await makeVersion(testDb.db, documentId, {
      status: 'failed',
      error: 'Extraction failed: timeout',
    });

    const { documents } = documentListSchema.parse((await testApp.app.inject('/documents')).json());

    expect(documents[0]).toMatchObject({ status: 'failed', error: 'Extraction failed: timeout' });
  });

  it('returns zero progress for a document whose version has no values yet', async () => {
    await makeDocumentWithVersion(testDb.db, { status: 'queued' });
    const { documents } = documentListSchema.parse((await testApp.app.inject('/documents')).json());
    expect(documents[0]?.progress).toEqual({
      pending: 0,
      approved: 0,
      corrected: 0,
      carriedOver: 0,
      gaps: 0,
      total: 0,
    });
  });
});

describe('GET /documents/:id', () => {
  it('returns the parsed text of the selected version only', async () => {
    const documentId = await makeDocument(testDb.db);
    await makeVersion(testDb.db, documentId, {
      versionNo: 1,
      status: 'extracted',
      parsedText: 'v1 text',
    });
    await makeVersion(testDb.db, documentId, {
      versionNo: 2,
      status: 'extracted',
      parsedText: 'v2 text',
    });

    const current = documentDetailSchema.parse(
      (await testApp.app.inject(`/documents/${documentId}`)).json(),
    );
    const older = documentDetailSchema.parse(
      (await testApp.app.inject(`/documents/${documentId}?version=1`)).json(),
    );

    expect(current.version.parsedText).toBe('v2 text');
    expect(older.version.parsedText).toBe('v1 text');
    expect(JSON.stringify(current.versions)).not.toContain('v1 text');
  });

  it('returns the current version with values in field-definition order', async () => {
    const { documentId } = await makeReviewedInvoice();

    const response = await testApp.app.inject(`/documents/${documentId}`);

    expect(response.statusCode).toBe(200);
    const detail = documentDetailSchema.parse(response.json());
    expect(detail.document).toMatchObject({ id: documentId, currentVersionNo: 2 });
    expect(detail.version).toMatchObject({ versionNo: 2, status: 'extracted', error: null });
    expect(detail.versions.map((v) => v.versionNo)).toEqual([1, 2]);
    expect(detail.values.map((v) => v.field)).toEqual([
      'invoice_number',
      'issue_date',
      'due_date',
      'vendor_name',
      'total_amount',
    ]);
  });

  it('describes each value with its review state, latest review and previous value', async () => {
    const { documentId } = await makeReviewedInvoice();
    const detail = documentDetailSchema.parse(
      (await testApp.app.inject(`/documents/${documentId}`)).json(),
    );
    const byField = new Map(detail.values.map((v) => [v.field, v]));

    expect(byField.get('invoice_number')).toMatchObject({
      value: null,
      gapReason: 'Not stated in the document',
      reviewState: 'pending',
      latestReview: null,
    });
    expect(byField.get('issue_date')).toMatchObject({
      reviewState: 'corrected',
      latestReview: { action: 'correct', correctedValue: '2025-03-02' },
    });
    expect(byField.get('vendor_name')).toMatchObject({ reviewState: 'carried_over' });
    expect(byField.get('total_amount')).toMatchObject({
      value: '$120.00',
      reviewState: 'pending',
      previous: { value: '$100.00', latestReview: { action: 'approve' } },
    });
  });

  it('selects an older version with ?version=N', async () => {
    const { documentId } = await makeReviewedInvoice();

    const detail = documentDetailSchema.parse(
      (await testApp.app.inject(`/documents/${documentId}?version=1`)).json(),
    );

    expect(detail.version.versionNo).toBe(1);
    expect(detail.document.currentVersionNo).toBe(2);
    expect(detail.values).toEqual([
      expect.objectContaining({ field: 'vendor_name', reviewState: 'approved' }),
      expect.objectContaining({ field: 'total_amount', value: '$100.00', reviewState: 'approved' }),
    ]);
  });

  it('returns 404 for an unknown document', async () => {
    expectError(await testApp.app.inject(`/documents/${UNKNOWN_ID}`), 404, 'NOT_FOUND');
  });

  it('returns 404 for an unknown version', async () => {
    const { documentId } = await makeDocumentWithVersion(testDb.db);
    expectError(await testApp.app.inject(`/documents/${documentId}?version=7`), 404, 'NOT_FOUND');
  });

  it('returns 400 for an invalid version parameter', async () => {
    const { documentId } = await makeDocumentWithVersion(testDb.db);
    expectError(
      await testApp.app.inject(`/documents/${documentId}?version=zero`),
      400,
      'VALIDATION_ERROR',
    );
  });
});

describe('GET /documents/:id/progress', () => {
  it('counts pending, approved, corrected, carried over and gaps for the current version', async () => {
    const { documentId } = await makeReviewedInvoice();

    const response = await testApp.app.inject(`/documents/${documentId}/progress`);

    expect(response.statusCode).toBe(200);
    expect(reviewProgressSchema.parse(response.json())).toEqual({
      pending: 2,
      approved: 1,
      corrected: 1,
      carriedOver: 1,
      gaps: 1,
      total: 5,
    });
  });

  it('counts the latest review only', async () => {
    const { documentId, versionId } = await makeDocumentWithVersion(testDb.db);
    const value = await makeValue(testDb.db, versionId, { field: 'total_amount' });
    await makeReview(testDb.db, value, { action: 'approve' });
    await makeReview(testDb.db, value, { action: 'correct', correctedValue: '$1.00' });

    const progress = (await testApp.app.inject(`/documents/${documentId}/progress`)).json();
    expect(progress).toMatchObject({ approved: 0, corrected: 1, total: 1 });
  });

  it('selects an older version with ?version=N', async () => {
    const { documentId } = await makeReviewedInvoice();
    const progress = (
      await testApp.app.inject(`/documents/${documentId}/progress?version=1`)
    ).json();
    expect(progress).toEqual({
      pending: 0,
      approved: 2,
      corrected: 0,
      carriedOver: 0,
      gaps: 0,
      total: 2,
    });
  });

  it('returns 404 for an unknown document', async () => {
    expectError(await testApp.app.inject(`/documents/${UNKNOWN_ID}/progress`), 404, 'NOT_FOUND');
  });
});
