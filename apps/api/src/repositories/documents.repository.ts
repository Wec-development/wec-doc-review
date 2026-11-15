import {
  type DocumentType,
  IN_FLIGHT_VERSION_STATUSES,
  OPEN_JOB_STATUSES,
  type VersionStatus,
} from '@doc-review/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Executor } from '../db/client.js';
import { documents, documentVersions, extractionJobs } from '../db/schema.js';

export interface DocumentRow {
  id: string;
  type: DocumentType;
  title: string;
  createdAt: Date;
}

export interface VersionRow {
  id: string;
  versionNo: number;
  status: VersionStatus;
  error: string | null;
  fileSha256: string | null;
  createdAt: Date;
}

const documentColumns = {
  id: documents.id,
  type: documents.type,
  title: documents.title,
  createdAt: documents.createdAt,
};

const versionColumns = {
  id: documentVersions.id,
  versionNo: documentVersions.versionNo,
  status: documentVersions.status,
  error: documentVersions.error,
  fileSha256: documentVersions.fileSha256,
  createdAt: documentVersions.createdAt,
};

function requireRow<T>(row: T | undefined, what: string): T {
  if (!row) {
    throw new Error(`${what} returned no row`);
  }
  return row;
}

export async function insertDocument(
  db: Executor,
  input: { type: DocumentType; title: string },
): Promise<DocumentRow> {
  const [row] = await db.insert(documents).values(input).returning(documentColumns);
  return requireRow(row, 'Inserting a document');
}

export async function findDocument(db: Executor, id: string): Promise<DocumentRow | undefined> {
  const [row] = await db.select(documentColumns).from(documents).where(eq(documents.id, id));
  return row;
}

/**
 * Locks the document row for the rest of the transaction. `update` serialises version uploads
 * and retries (race-free version_no allocation); `share` lets reviews run in parallel while
 * blocking a new version from landing mid-review.
 */
export async function lockDocument(
  db: Executor,
  id: string,
  mode: 'update' | 'share',
): Promise<DocumentRow | undefined> {
  const [row] = await db
    .select(documentColumns)
    .from(documents)
    .where(eq(documents.id, id))
    .for(mode);
  return row;
}

export async function findLatestVersion(
  db: Executor,
  documentId: string,
): Promise<VersionRow | undefined> {
  const [row] = await db
    .select(versionColumns)
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
    .orderBy(desc(documentVersions.versionNo))
    .limit(1);
  return row;
}

export async function listVersions(db: Executor, documentId: string): Promise<VersionRow[]> {
  return db
    .select(versionColumns)
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
    .orderBy(documentVersions.versionNo);
}

export async function insertVersion(
  db: Executor,
  input: { documentId: string; versionNo: number; filePath: string; fileSha256: string },
): Promise<VersionRow> {
  const [row] = await db.insert(documentVersions).values(input).returning(versionColumns);
  return requireRow(row, 'Inserting a version');
}

export async function insertQueuedJob(db: Executor, versionId: string): Promise<void> {
  await db.insert(extractionJobs).values({ versionId });
}

/**
 * Cancels in-flight work on a document's existing versions: open jobs become `superseded`, and
 * versions still queued or extracting become `superseded` so none stays in flight forever.
 * Their rows, values and reviews are kept.
 */
export async function supersedeInFlightWork(db: Executor, documentId: string): Promise<void> {
  const versionIds = db
    .select({ id: documentVersions.id })
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId));

  await db
    .update(extractionJobs)
    .set({ status: 'superseded', lockedUntil: null })
    .where(
      and(
        inArray(extractionJobs.versionId, versionIds),
        inArray(extractionJobs.status, [...OPEN_JOB_STATUSES]),
      ),
    );

  await db
    .update(documentVersions)
    .set({ status: 'superseded' })
    .where(
      and(
        eq(documentVersions.documentId, documentId),
        inArray(documentVersions.status, [...IN_FLIGHT_VERSION_STATUSES]),
      ),
    );
}

export async function requeueVersion(db: Executor, versionId: string): Promise<void> {
  await db
    .update(documentVersions)
    .set({ status: 'queued', error: null })
    .where(eq(documentVersions.id, versionId));
}
