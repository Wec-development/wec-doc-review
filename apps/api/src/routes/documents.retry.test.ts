import { retryAcceptedSchema } from '@doc-review/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDatabase, resetDatabase, type TestDatabase } from '../test/db.js';
import {
  jobsOf,
  makeDocument,
  makeDocumentWithVersion,
  makeJob,
  makeVersion,
  versionsOf,
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

function retry(documentId: string) {
  return testApp.app.inject({ method: 'POST', url: `/documents/${documentId}/retry` });
}

async function makeFailedDocument() {
  const documentId = await makeDocument(testDb.db);
  const versionId = await makeVersion(testDb.db, documentId, {
    status: 'failed',
    error: 'LLM timed out',
  });
  await makeJob(testDb.db, versionId, 'failed');
  return { documentId, versionId };
}

describe('POST /documents/:id/retry', () => {
  it('re-queues a failed current version with a new job', async () => {
    const { documentId, versionId } = await makeFailedDocument();

    const response = await retry(documentId);

    expect(response.statusCode).toBe(202);
    expect(retryAcceptedSchema.parse(response.json())).toEqual({ versionId, status: 'queued' });
    const [version] = await versionsOf(testDb.db, documentId);
    expect(version).toMatchObject({ status: 'queued', error: null });
    expect((await jobsOf(testDb.db, versionId)).map((job) => job.status)).toEqual([
      'failed',
      'queued',
    ]);
  });

  it('never leaves two open jobs: a second retry is rejected with 409', async () => {
    const { documentId, versionId } = await makeFailedDocument();

    const [first, second] = await Promise.all([retry(documentId), retry(documentId)]);

    expect([first?.statusCode, second?.statusCode].sort()).toEqual([202, 409]);
    const openJobs = (await jobsOf(testDb.db, versionId)).filter((job) => job.status === 'queued');
    expect(openJobs).toHaveLength(1);
  });

  it.each(['queued', 'extracting', 'extracted'] as const)(
    'rejects a retry when the current version is %s with 409',
    async (status) => {
      const { documentId } = await makeDocumentWithVersion(testDb.db, { status });
      expectError(await retry(documentId), 409, 'CONFLICT');
    },
  );

  it('rejects a retry when only an older version failed', async () => {
    const { documentId } = await makeFailedDocument();
    await makeVersion(testDb.db, documentId, { versionNo: 2, status: 'extracted' });

    expectError(await retry(documentId), 409, 'CONFLICT');
  });

  it('returns 404 for an unknown document', async () => {
    expectError(await retry('00000000-0000-4000-8000-000000000000'), 404, 'NOT_FOUND');
  });
});
