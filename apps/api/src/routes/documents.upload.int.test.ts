import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { uploadAcceptedSchema } from '@doc-review/shared';
import { count, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractedValues } from '../db/schema.js';
import { FakeExtractor } from '../extraction/fake-extractor.js';
import { LlmExtractor } from '../extraction/llm-extractor.js';
import { LocalDiskStorage } from '../storage/file-storage.js';
import { connectTestDatabase, resetDatabase, type TestDatabase } from '../test/db.js';
import { jobsOf, makeDocumentWithVersion, makeJob, versionsOf } from '../test/factories.js';
import {
  createTestApp,
  expectError,
  multipart,
  pdfBytes,
  type TestApp,
  uploadDocument,
  uploadVersion,
} from '../test/http.js';
import { sha256Hex } from '../uploads/pdf.js';

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
afterEach(async () => {
  vi.restoreAllMocks();
  await testApp.close();
});

describe('POST /documents', () => {
  it('returns 202 and creates the document, version 1 and one queued job', async () => {
    const contents = pdfBytes('invoice v1');

    const response = await uploadDocument(testApp.app, {
      type: 'invoice',
      title: 'March invoice',
      file: { contents },
    });

    expect(response.statusCode).toBe(202);
    const accepted = uploadAcceptedSchema.parse(response.json());
    expect(accepted).toMatchObject({ versionNo: 1, status: 'queued' });

    const versions = await versionsOf(testDb.db, accepted.documentId);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ id: accepted.versionId, status: 'queued' });
    expect(await jobsOf(testDb.db, accepted.versionId)).toEqual([
      expect.objectContaining({ status: 'queued' }),
    ]);
  });

  it('never extracts inside the request: no extractor or network call, the job is still queued', async () => {
    // No worker is running. Spies on every extractor and on the network catch any inline work.
    const llmExtract = vi.spyOn(LlmExtractor.prototype, 'extract');
    const fakeExtract = vi.spyOn(FakeExtractor.prototype, 'extract');
    const network = vi.spyOn(globalThis, 'fetch');

    const response = await uploadDocument(testApp.app, { type: 'invoice' });

    expect(response.statusCode).toBe(202);
    const accepted = uploadAcceptedSchema.parse(response.json());
    expect(llmExtract).not.toHaveBeenCalled();
    expect(fakeExtract).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
    expect(await versionsOf(testDb.db, accepted.documentId)).toEqual([
      expect.objectContaining({ status: 'queued' }),
    ]);
    expect(await jobsOf(testDb.db, accepted.versionId)).toEqual([
      expect.objectContaining({ status: 'queued' }),
    ]);
    const [values] = await testDb.db
      .select({ n: count() })
      .from(extractedValues)
      .where(eq(extractedValues.versionId, accepted.versionId));
    expect(values?.n).toBe(0);
  });

  it('writes the file under <documentId>/v1-<sha256>.pdf and records the sha256', async () => {
    const contents = pdfBytes('stored bytes');
    const sha256 = sha256Hex(contents);

    const accepted = uploadAcceptedSchema.parse(
      (await uploadDocument(testApp.app, { type: 'lease', file: { contents } })).json(),
    );

    const expectedKey = `${accepted.documentId}/v1-${sha256}.pdf`;
    const [version] = await versionsOf(testDb.db, accepted.documentId);
    expect(version).toMatchObject({ fileSha256: sha256, filePath: expectedKey });
    expect(await testApp.storedFiles()).toEqual([expectedKey]);
    expect(await readFile(path.join(testApp.storageDir, expectedKey))).toEqual(contents);
  });

  it('defaults the title to the file name', async () => {
    const accepted = uploadAcceptedSchema.parse(
      (
        await uploadDocument(testApp.app, {
          type: 'invoice',
          file: { contents: pdfBytes(), filename: 'Meridian invoice.pdf' },
        })
      ).json(),
    );
    const detail = await testApp.app.inject(`/documents/${accepted.documentId}`);
    expect(detail.json().document.title).toBe('Meridian invoice');
  });

  it('rejects a file that is not declared as a PDF with 415', async () => {
    const response = await uploadDocument(testApp.app, {
      type: 'invoice',
      file: { contents: Buffer.from('hello'), contentType: 'text/plain', filename: 'a.txt' },
    });
    expectError(response, 415, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects a file declared as PDF without the %PDF- signature with 415', async () => {
    const response = await uploadDocument(testApp.app, {
      type: 'invoice',
      file: { contents: Buffer.from('<html>not a pdf</html>') },
    });
    expectError(response, 415, 'UNSUPPORTED_MEDIA_TYPE');
    expect(await testApp.storedFiles()).toEqual([]);
  });

  it('rejects a request that is not multipart with 415', async () => {
    const response = await testApp.app.inject({
      method: 'POST',
      url: '/documents',
      payload: { type: 'invoice' },
    });
    expectError(response, 415, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects an unknown document type with 400', async () => {
    const response = await uploadDocument(testApp.app, { type: 'receipt' });
    const error = expectError(response, 400, 'VALIDATION_ERROR');
    expect(error.details).toEqual([expect.objectContaining({ path: 'type' })]);
  });

  it('rejects a form without a file with 400', async () => {
    const response = await testApp.app.inject({
      method: 'POST',
      url: '/documents',
      ...multipart({ type: 'invoice' }),
    });
    expectError(response, 400, 'VALIDATION_ERROR');
  });

  it('rejects a file over the upload limit with 413 and stores nothing', async () => {
    const smallLimitApp = await createTestApp(testDb.db, { options: { maxUploadMb: 0.01 } });
    try {
      const response = await uploadDocument(smallLimitApp.app, {
        type: 'invoice',
        file: { contents: pdfBytes('big', 20 * 1024) },
      });
      expectError(response, 413, 'PAYLOAD_TOO_LARGE');
      expect(await smallLimitApp.storedFiles()).toEqual([]);
    } finally {
      await smallLimitApp.close();
    }
  });

  it('leaves no orphan file and no rows when the transaction fails after the file is written', async () => {
    const failingApp = await createTestApp(testDb.db, {
      storage: (dir) => {
        const disk = new LocalDiskStorage(dir);
        return {
          resolve: (key) => disk.resolve(key),
          remove: (key) => disk.remove(key),
          write: async (key, contents) => {
            await disk.write(key, contents);
            throw new Error('simulated failure after the file was written');
          },
        };
      },
    });
    try {
      const response = await uploadDocument(failingApp.app, { type: 'invoice' });

      const error = expectError(response, 500, 'INTERNAL_ERROR');
      expect(error.message).toBe('Internal server error');
      expect(await failingApp.storedFiles()).toEqual([]);
      const documentList = await failingApp.app.inject('/documents');
      expect(documentList.json()).toEqual({ documents: [] });
    } finally {
      await failingApp.close();
    }
  });
});

describe('POST /documents/:id/versions', () => {
  async function uploadFirstVersion(): Promise<{ documentId: string; versionId: string }> {
    const response = await uploadDocument(testApp.app, {
      type: 'invoice',
      file: { contents: pdfBytes('v1') },
    });
    return uploadAcceptedSchema.parse(response.json());
  }

  it('creates version 2 with a queued job and supersedes the open job of version 1', async () => {
    const v1 = await uploadFirstVersion();

    const response = await uploadVersion(testApp.app, v1.documentId, { contents: pdfBytes('v2') });

    expect(response.statusCode).toBe(202);
    const v2 = uploadAcceptedSchema.parse(response.json());
    expect(v2).toMatchObject({ documentId: v1.documentId, versionNo: 2, status: 'queued' });
    expect(await jobsOf(testDb.db, v1.versionId)).toEqual([
      expect.objectContaining({ status: 'superseded' }),
    ]);
    expect(await jobsOf(testDb.db, v2.versionId)).toEqual([
      expect.objectContaining({ status: 'queued' }),
    ]);
    const versions = await versionsOf(testDb.db, v1.documentId);
    expect(versions.map((v) => [v.versionNo, v.status])).toEqual([
      [1, 'superseded'],
      [2, 'queued'],
    ]);
  });

  it('keeps an already extracted older version and its finished job untouched', async () => {
    const { documentId, versionId } = await makeDocumentWithVersion(testDb.db);
    await makeJob(testDb.db, versionId, 'done');

    await uploadVersion(testApp.app, documentId);

    expect(await jobsOf(testDb.db, versionId)).toEqual([
      expect.objectContaining({ status: 'done' }),
    ]);
    const [v1] = await versionsOf(testDb.db, documentId);
    expect(v1?.status).toBe('extracted');
  });

  it('rejects a file identical to the current version with 409 and creates nothing', async () => {
    const contents = pdfBytes('same bytes');
    const v1 = uploadAcceptedSchema.parse(
      (await uploadDocument(testApp.app, { type: 'invoice', file: { contents } })).json(),
    );

    const response = await uploadVersion(testApp.app, v1.documentId, { contents });

    expectError(response, 409, 'CONFLICT');
    expect(await versionsOf(testDb.db, v1.documentId)).toHaveLength(1);
    expect(await testApp.storedFiles()).toHaveLength(1);
    expect(await jobsOf(testDb.db, v1.versionId)).toEqual([
      expect.objectContaining({ status: 'queued' }),
    ]);
  });

  it('returns 404 for an unknown document', async () => {
    const response = await uploadVersion(testApp.app, '00000000-0000-4000-8000-000000000000');
    expectError(response, 404, 'NOT_FOUND');
    expect(await testApp.storedFiles()).toEqual([]);
  });

  it('returns 400 for a malformed document id', async () => {
    expectError(await uploadVersion(testApp.app, 'not-a-uuid'), 400, 'VALIDATION_ERROR');
  });

  it('gives two concurrent uploads versions 2 and 3, never the same number', async () => {
    // A slow disk widens the window between reading the latest version_no and inserting the new
    // one, so without the document row lock both uploads would pick version 2 and collide.
    const slowApp = await createTestApp(testDb.db, {
      storage: (dir) => {
        const disk = new LocalDiskStorage(dir);
        return {
          resolve: (key) => disk.resolve(key),
          remove: (key) => disk.remove(key),
          write: async (key, contents) => {
            await new Promise((resolve) => setTimeout(resolve, 100));
            await disk.write(key, contents);
          },
        };
      },
    });
    const v1 = uploadAcceptedSchema.parse(
      (
        await uploadDocument(slowApp.app, { type: 'invoice', file: { contents: pdfBytes('v1') } })
      ).json(),
    );

    const responses = await Promise.all([
      uploadVersion(slowApp.app, v1.documentId, { contents: pdfBytes('concurrent a') }),
      uploadVersion(slowApp.app, v1.documentId, { contents: pdfBytes('concurrent b') }),
    ]);
    await slowApp.close();

    expect(responses.map((r) => r.statusCode)).toEqual([202, 202]);
    const versionNos = responses.map((r) => uploadAcceptedSchema.parse(r.json()).versionNo);
    expect(versionNos.sort()).toEqual([2, 3]);

    const versions = await versionsOf(testDb.db, v1.documentId);
    expect(versions.map((v) => [v.versionNo, v.status])).toEqual([
      [1, 'superseded'],
      [2, 'superseded'],
      [3, 'queued'],
    ]);
    const openJobs = (await Promise.all(versions.map((v) => jobsOf(testDb.db, v.id))))
      .flat()
      .filter((job) => job.status === 'queued' || job.status === 'running');
    expect(openJobs).toHaveLength(1);
  });
});
