import type {
  DocumentType,
  GapKind,
  JobStatus,
  ReviewAction,
  VersionStatus,
} from '@doc-review/shared';
import { asc, eq } from 'drizzle-orm';
import type { Executor } from '../db/client.js';
import {
  documents,
  documentVersions,
  extractedValues,
  extractionJobs,
  reviews,
} from '../db/schema.js';

/** Small builders for test data, so tests read as scenarios rather than SQL. */

function first<T>(rows: T[], what: string): T {
  const [row] = rows;
  if (!row) {
    throw new Error(`Test factory: inserting ${what} returned no row`);
  }
  return row;
}

export async function makeDocument(
  db: Executor,
  input: { type?: DocumentType; title?: string } = {},
): Promise<string> {
  const row = first(
    await db
      .insert(documents)
      .values({ type: input.type ?? 'invoice', title: input.title ?? 'Test invoice' })
      .returning({ id: documents.id }),
    'a document',
  );
  return row.id;
}

export async function makeVersion(
  db: Executor,
  documentId: string,
  input: { versionNo?: number; status?: VersionStatus; sha256?: string; error?: string } = {},
): Promise<string> {
  const versionNo = input.versionNo ?? 1;
  const row = first(
    await db
      .insert(documentVersions)
      .values({
        documentId,
        versionNo,
        status: input.status ?? 'queued',
        filePath: `${documentId}/v${versionNo}.pdf`,
        fileSha256: input.sha256 ?? null,
        error: input.error ?? null,
      })
      .returning({ id: documentVersions.id }),
    'a version',
  );
  return row.id;
}

/** A document with one version (default: extracted, so its values can be reviewed). */
export async function makeDocumentWithVersion(
  db: Executor,
  input: { type?: DocumentType; title?: string; status?: VersionStatus } = {},
): Promise<{ documentId: string; versionId: string }> {
  const documentId = await makeDocument(db, input);
  const versionId = await makeVersion(db, documentId, { status: input.status ?? 'extracted' });
  return { documentId, versionId };
}

export async function makeJob(
  db: Executor,
  versionId: string,
  status: JobStatus = 'queued',
): Promise<string> {
  const row = first(
    await db
      .insert(extractionJobs)
      .values({ versionId, status })
      .returning({ id: extractionJobs.id }),
    'a job',
  );
  return row.id;
}

export async function makeValue(
  db: Executor,
  versionId: string,
  input: {
    field: string;
    value?: string;
    evidence?: string;
    gapReason?: string;
    gapKind?: GapKind;
    carriedOver?: boolean;
    previousValueId?: string;
  },
): Promise<string> {
  const isGap = input.gapReason !== undefined && input.value === undefined;
  const row = first(
    await db
      .insert(extractedValues)
      .values({
        versionId,
        field: input.field,
        value: isGap ? null : (input.value ?? `${input.field} value`),
        evidence: isGap ? null : (input.evidence ?? `${input.field}: evidence`),
        gapReason: input.gapReason ?? null,
        gapKind: isGap ? (input.gapKind ?? 'not_found') : null,
        carriedOver: input.carriedOver ?? false,
        previousValueId: input.previousValueId ?? null,
      })
      .returning({ id: extractedValues.id }),
    'a value',
  );
  return row.id;
}

/** Appends a review; with `carriedFrom` it is a review carried over from that source review. */
export async function makeReview(
  db: Executor,
  valueId: string,
  input: { action: ReviewAction; correctedValue?: string; note?: string; carriedFrom?: string },
): Promise<string> {
  const row = first(
    await db
      .insert(reviews)
      .values({
        valueId,
        action: input.action,
        correctedValue: input.correctedValue ?? null,
        note: input.note ?? null,
        carriedFromReviewId: input.carriedFrom ?? null,
      })
      .returning({ id: reviews.id }),
    'a review',
  );
  return row.id;
}

export function versionsOf(db: Executor, documentId: string) {
  return db
    .select({
      id: documentVersions.id,
      versionNo: documentVersions.versionNo,
      status: documentVersions.status,
      fileSha256: documentVersions.fileSha256,
      filePath: documentVersions.filePath,
      error: documentVersions.error,
    })
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
    .orderBy(asc(documentVersions.versionNo));
}

export function jobsOf(db: Executor, versionId: string) {
  return db
    .select({ id: extractionJobs.id, status: extractionJobs.status })
    .from(extractionJobs)
    .where(eq(extractionJobs.versionId, versionId))
    .orderBy(asc(extractionJobs.createdAt));
}

export function reviewsOf(db: Executor, valueId: string) {
  return db
    .select({ action: reviews.action, correctedValue: reviews.correctedValue })
    .from(reviews)
    .where(eq(reviews.valueId, valueId))
    .orderBy(asc(reviews.createdAt));
}

export async function valueRow(db: Executor, valueId: string) {
  return first(
    await db
      .select({ value: extractedValues.value, evidence: extractedValues.evidence })
      .from(extractedValues)
      .where(eq(extractedValues.id, valueId)),
    'a value lookup',
  );
}
