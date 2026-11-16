import { extractedValueSchema } from '@doc-review/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDatabase, resetDatabase, type TestDatabase } from '../test/db.js';
import {
  makeDocument,
  makeDocumentWithVersion,
  makeValue,
  makeVersion,
  reviewsOf,
  valueRow,
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

function review(valueId: string, body: unknown) {
  return testApp.app.inject({
    method: 'POST',
    url: `/values/${valueId}/review`,
    payload: body as object,
  });
}

async function makeExtractedValue(input: { gapReason?: string } = {}) {
  const { versionId } = await makeDocumentWithVersion(testDb.db, { status: 'extracted' });
  return makeValue(testDb.db, versionId, {
    field: 'due_date',
    ...(input.gapReason ? { gapReason: input.gapReason } : { value: '2025-12-01' }),
  });
}

describe('POST /values/:id/review', () => {
  it('approves a value: 201, a new review row, and the value marked approved', async () => {
    const valueId = await makeExtractedValue();

    const response = await review(valueId, { action: 'approve' });

    expect(response.statusCode).toBe(201);
    const value = extractedValueSchema.parse(response.json());
    expect(value).toMatchObject({
      id: valueId,
      reviewState: 'approved',
      latestReview: { action: 'approve', correctedValue: null, reviewer: 'reviewer' },
    });
    expect(await reviewsOf(testDb.db, valueId)).toEqual([
      { action: 'approve', correctedValue: null },
    ]);
  });

  it('corrects a value beside the original, which is never modified', async () => {
    const valueId = await makeExtractedValue();
    const before = await valueRow(testDb.db, valueId);

    const response = await review(valueId, {
      action: 'correct',
      value: '  2025-12-15  ',
      note: 'Due date was revised',
    });

    expect(response.statusCode).toBe(201);
    expect(extractedValueSchema.parse(response.json())).toMatchObject({
      value: '2025-12-01',
      reviewState: 'corrected',
      latestReview: {
        action: 'correct',
        correctedValue: '2025-12-15',
        note: 'Due date was revised',
      },
    });
    expect(await valueRow(testDb.db, valueId)).toEqual(before);
  });

  it('keeps every review and lets the latest one win', async () => {
    const valueId = await makeExtractedValue();
    await review(valueId, { action: 'correct', value: 'first' });

    const response = await review(valueId, { action: 'approve' });

    expect(response.json()).toMatchObject({ reviewState: 'approved' });
    expect((await reviewsOf(testDb.db, valueId)).map((r) => r.action)).toEqual([
      'correct',
      'approve',
    ]);
  });

  it('approves a gap to confirm it', async () => {
    const valueId = await makeExtractedValue({ gapReason: 'Not in the document' });

    const response = await review(valueId, { action: 'approve' });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ value: null, reviewState: 'approved' });
  });

  it('corrects a gap to supply the missing value', async () => {
    const valueId = await makeExtractedValue({ gapReason: 'Not in the document' });

    const response = await review(valueId, { action: 'correct', value: '$4,200' });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      value: null,
      gapReason: 'Not in the document',
      reviewState: 'corrected',
      latestReview: { correctedValue: '$4,200' },
    });
  });

  it('rejects a correction without a value with 400', async () => {
    const valueId = await makeExtractedValue();
    expectError(
      await review(valueId, { action: 'correct', value: '   ' }),
      400,
      'VALIDATION_ERROR',
    );
    expectError(await review(valueId, { action: 'correct' }), 400, 'VALIDATION_ERROR');
    expect(await reviewsOf(testDb.db, valueId)).toEqual([]);
  });

  it('rejects an unknown action and a note over 1000 characters with 400', async () => {
    const valueId = await makeExtractedValue();
    expectError(await review(valueId, { action: 'delete' }), 400, 'VALIDATION_ERROR');
    expectError(
      await review(valueId, { action: 'correct', value: 'x', note: 'n'.repeat(1001) }),
      400,
      'VALIDATION_ERROR',
    );
  });

  it('rejects a review of a value on an older version with 409', async () => {
    const documentId = await makeDocument(testDb.db);
    const v1 = await makeVersion(testDb.db, documentId, { versionNo: 1, status: 'extracted' });
    const oldValue = await makeValue(testDb.db, v1, { field: 'due_date' });
    await makeVersion(testDb.db, documentId, { versionNo: 2, status: 'extracted' });

    expectError(await review(oldValue, { action: 'approve' }), 409, 'CONFLICT');
    expect(await reviewsOf(testDb.db, oldValue)).toEqual([]);
  });

  it('rejects a review while the version is not extracted with 409', async () => {
    const { versionId } = await makeDocumentWithVersion(testDb.db, { status: 'extracting' });
    const valueId = await makeValue(testDb.db, versionId, { field: 'due_date' });

    expectError(await review(valueId, { action: 'approve' }), 409, 'CONFLICT');
  });

  it('returns 404 for an unknown value', async () => {
    expectError(
      await review('00000000-0000-4000-8000-000000000000', { action: 'approve' }),
      404,
      'NOT_FOUND',
    );
  });
});
