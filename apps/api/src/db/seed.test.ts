import { fileURLToPath } from 'node:url';
import { OPEN_JOB_STATUSES } from '@doc-review/shared';
import { count, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectTestDatabase, type TestDatabase, withRollback } from '../test/db.js';
import type { Transaction } from './client.js';
import { documents, documentVersions, extractionJobs } from './schema.js';
import {
  type FixtureManifest,
  fixtureManifestSchema,
  readFixtureManifest,
  seedFixtures,
} from './seed.js';

const fixturesDir = fileURLToPath(new URL('../../../../fixtures', import.meta.url));

let testDb: TestDatabase;
let manifest: FixtureManifest;

beforeAll(async () => {
  testDb = connectTestDatabase();
  manifest = await readFixtureManifest(fixturesDir);
});

afterAll(async () => {
  await testDb.close();
});

/** Empties the tables inside the test transaction; the rollback restores the developer's data. */
async function emptyTables(tx: Transaction): Promise<void> {
  await tx.execute(
    sql`truncate table reviews, extracted_values, extraction_jobs, document_versions, documents`,
  );
}

async function countRows(tx: Transaction) {
  const [documentCount] = await tx.select({ n: count() }).from(documents);
  const [versionCount] = await tx.select({ n: count() }).from(documentVersions);
  const [openJobCount] = await tx
    .select({ n: count() })
    .from(extractionJobs)
    .where(inArray(extractionJobs.status, [...OPEN_JOB_STATUSES]));
  return { documents: documentCount?.n, versions: versionCount?.n, openJobs: openJobCount?.n };
}

describe('seedFixtures', () => {
  it('leaves exactly 3 documents, 3 versions and 3 open jobs when run twice', () =>
    withRollback(testDb.db, async (tx) => {
      await emptyTables(tx);

      const first = await seedFixtures(tx, manifest);
      const second = await seedFixtures(tx, manifest);

      expect(first.inserted).toHaveLength(3);
      expect(second).toEqual({ inserted: [], skipped: first.inserted });
      expect(await countRows(tx)).toEqual({ documents: 3, versions: 3, openJobs: 3 });
    }));

  it('seeds only version 1 of each document, queued, with its fixture file path', () =>
    withRollback(testDb.db, async (tx) => {
      await emptyTables(tx);

      await seedFixtures(tx, manifest);

      const versions = await tx
        .select({
          versionNo: documentVersions.versionNo,
          status: documentVersions.status,
          filePath: documentVersions.filePath,
        })
        .from(documentVersions);
      expect(versions.map((v) => v.versionNo)).toEqual([1, 1, 1]);
      expect(versions.every((v) => v.status === 'queued')).toBe(true);
      expect(versions.map((v) => v.filePath).sort()).toEqual([
        'fixtures/documents/invoice-001.pdf',
        'fixtures/documents/lease-excerpt-001.pdf',
        'fixtures/documents/market-report-excerpt-001.pdf',
      ]);
    }));
});

describe('fixtureManifestSchema', () => {
  const validDocument = {
    id: 'doc-test',
    type: 'invoice',
    title: 'Test invoice',
    versions: [{ version: 1, file: 'documents/test.pdf' }],
  };

  it('rejects a document type the app does not support', () => {
    const result = fixtureManifestSchema.safeParse([{ ...validDocument, type: 'receipt' }]);
    expect(result.success).toBe(false);
  });

  it('rejects a document without a version 1 to seed', () => {
    const result = fixtureManifestSchema.safeParse([
      { ...validDocument, versions: [{ version: 2, file: 'documents/test.v2.pdf' }] },
    ]);
    expect(result.success).toBe(false);
  });
});
