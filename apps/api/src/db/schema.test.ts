import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  connectTestDatabase,
  expectConstraintViolation,
  insertDocumentVersion,
  type TestDatabase,
  withRollback,
} from '../test/db.js';
import { documentVersions, extractedValues, extractionJobs, reviews } from './schema.js';

let testDb: TestDatabase;

beforeAll(() => {
  testDb = connectTestDatabase();
});

afterAll(async () => {
  await testDb.close();
});

describe('extracted_values', () => {
  it('rejects a second value for the same version and field', () =>
    withRollback(testDb.db, async (tx) => {
      const versionId = await insertDocumentVersion(tx);
      const value = { versionId, field: 'total_amount', value: '$10', evidence: 'Total: $10' };
      await tx.insert(extractedValues).values(value);

      await expectConstraintViolation(
        tx,
        (sp) => sp.insert(extractedValues).values(value),
        'extracted_values_version_field_uq',
      );
    }));

  it('rejects a value with neither evidence nor a gap reason', () =>
    withRollback(testDb.db, async (tx) => {
      const versionId = await insertDocumentVersion(tx);

      await expectConstraintViolation(
        tx,
        (sp) =>
          sp
            .insert(extractedValues)
            .values({ versionId, field: 'total_amount', gapKind: 'not_found' }),
        'extracted_values_value_or_gap',
      );
    }));

  it('rejects a value whose evidence is missing', () =>
    withRollback(testDb.db, async (tx) => {
      const versionId = await insertDocumentVersion(tx);

      await expectConstraintViolation(
        tx,
        (sp) => sp.insert(extractedValues).values({ versionId, field: 'due_date', value: 'x' }),
        'extracted_values_value_or_gap',
      );
    }));

  it('accepts a gap: no value, with a reason', () =>
    withRollback(testDb.db, async (tx) => {
      const versionId = await insertDocumentVersion(tx);

      const [gap] = await tx
        .insert(extractedValues)
        .values({
          versionId,
          field: 'median_household_income',
          gapReason: 'Not stated in the document',
          gapKind: 'not_found',
        })
        .returning();

      expect(gap).toMatchObject({ value: null, evidence: null, carriedOver: false });
    }));

  it('rejects a gap without a gap kind', () =>
    withRollback(testDb.db, async (tx) => {
      const versionId = await insertDocumentVersion(tx);

      await expectConstraintViolation(
        tx,
        (sp) =>
          sp.insert(extractedValues).values({ versionId, field: 'due_date', gapReason: 'Absent' }),
        'extracted_values_gap_kind',
      );
    }));

  it('rejects a gap kind on a value', () =>
    withRollback(testDb.db, async (tx) => {
      const versionId = await insertDocumentVersion(tx);

      await expectConstraintViolation(
        tx,
        (sp) =>
          sp.insert(extractedValues).values({
            versionId,
            field: 'due_date',
            value: '2025-01-01',
            evidence: 'Due: 2025-01-01',
            gapKind: 'not_found',
          }),
        'extracted_values_gap_kind',
      );
    }));
});

describe('reviews: carry-over', () => {
  it('carries a source review onto a value at most once', () =>
    withRollback(testDb.db, async (tx) => {
      const versionId = await insertDocumentVersion(tx);
      const [value] = await tx
        .insert(extractedValues)
        .values({ versionId, field: 'due_date', value: 'x', evidence: 'Due: x' })
        .returning({ id: extractedValues.id });
      if (!value) throw new Error('value was not inserted');
      const [source] = await tx
        .insert(reviews)
        .values({ valueId: value.id, action: 'approve' })
        .returning({ id: reviews.id });
      if (!source) throw new Error('review was not inserted');
      const carried = {
        valueId: value.id,
        action: 'approve' as const,
        carriedFromReviewId: source.id,
      };
      await tx.insert(reviews).values(carried);

      await expectConstraintViolation(
        tx,
        (sp) => sp.insert(reviews).values(carried),
        'reviews_carried_once_uq',
      );
    }));
});

describe('extraction_jobs', () => {
  it('rejects a second open job for the same version', () =>
    withRollback(testDb.db, async (tx) => {
      const versionId = await insertDocumentVersion(tx);
      await tx.insert(extractionJobs).values({ versionId });

      await expectConstraintViolation(
        tx,
        (sp) =>
          sp.insert(extractionJobs).values({
            versionId,
            status: 'running',
            lockedBy: 'worker-a',
            lockedUntil: sql`now() + interval '1 minute'`,
          }),
        'extraction_jobs_one_open_per_version',
      );
    }));

  it('rejects a running job without a lease holder and expiry', () =>
    withRollback(testDb.db, async (tx) => {
      const versionId = await insertDocumentVersion(tx);

      await expectConstraintViolation(
        tx,
        (sp) => sp.insert(extractionJobs).values({ versionId, status: 'running' }),
        'extraction_jobs_running_has_lease',
      );
    }));

  it('allows a new job once the previous one is done', () =>
    withRollback(testDb.db, async (tx) => {
      const versionId = await insertDocumentVersion(tx);
      const [first] = await tx
        .insert(extractionJobs)
        .values({ versionId })
        .returning({ id: extractionJobs.id });
      if (!first) throw new Error('first job was not inserted');
      await tx
        .update(extractionJobs)
        .set({ status: 'done' })
        .where(eq(extractionJobs.id, first.id));

      const [second] = await tx.insert(extractionJobs).values({ versionId }).returning();

      expect(second).toMatchObject({ versionId, status: 'queued', attempts: 0 });
    }));
});

describe('reviews', () => {
  it('rejects a correct review without a corrected value', () =>
    withRollback(testDb.db, async (tx) => {
      const versionId = await insertDocumentVersion(tx);
      const [value] = await tx
        .insert(extractedValues)
        .values({ versionId, field: 'due_date', value: '2025-12-01', evidence: 'Due: 2025-12-01' })
        .returning({ id: extractedValues.id });
      if (!value) throw new Error('value was not inserted');

      await expectConstraintViolation(
        tx,
        (sp) => sp.insert(reviews).values({ valueId: value.id, action: 'correct' }),
        'reviews_correct_needs_value',
      );
    }));
});

describe('document_versions', () => {
  it('rejects a duplicate version number for the same document', () =>
    withRollback(testDb.db, async (tx) => {
      const versionId = await insertDocumentVersion(tx);
      const [existing] = await tx
        .select({ documentId: documentVersions.documentId })
        .from(documentVersions)
        .where(eq(documentVersions.id, versionId));
      if (!existing) throw new Error('version was not inserted');

      await expectConstraintViolation(
        tx,
        (sp) =>
          sp
            .insert(documentVersions)
            .values({ documentId: existing.documentId, versionNo: 1, filePath: 'fixtures/x.pdf' }),
        'document_versions_document_version_uq',
      );
    }));
});
